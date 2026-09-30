const supabase = require('../supabase')

function normalize(s) {
  if (!s) return ''
  try {
    return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  } catch {
    return String(s).toLowerCase().trim()
  }
}

async function run() {
  console.log('Fetching products...')
  const { data: products, error } = await supabase.from('products').select('id, name, image, offers(*)')
  if (error) {
    console.error('Error fetching products:', error)
    process.exit(1)
  }

  const groups = {}
  for (const p of products || []) {
    const key = normalize(p.name || `${p.id}`)
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  }

  for (const group of Object.values(groups)) {
    if (group.length < 2) continue
    console.log(`Found duplicate group (${group.length}):`, group.map(g => `${g.id}:${g.name}`))

    const primary = group.find(g => (g.offers || []).length > 0) || group.find(g => g.image) || group[0]

    for (const other of group) {
      if (other.id === primary.id) continue

      // move offers to primary
      try {
        const { data: moved, error: moveErr } = await supabase
          .from('offers')
          .update({ product_id: primary.id })
          .eq('product_id', other.id)
        if (moveErr) console.error('Error moving offers from', other.id, moveErr)
        else if ((moved || []).length) console.log(`Moved ${moved.length} offers from ${other.id} -> ${primary.id}`)
      } catch (e) {
        console.error('Exception moving offers', e)
      }

      // if primary missing image but other has it, update primary
      if ((!primary.image || primary.image === '') && other.image) {
        const { data: updated, error: updErr } = await supabase.from('products').update({ image: other.image }).eq('id', primary.id).select().single()
        if (updErr) console.error('Error updating primary image', updErr)
        else {
          primary.image = updated.image
          console.log(`Updated primary ${primary.id} image from ${other.id}`)
        }
      }

      // delete the other product row
      const { error: delErr } = await supabase.from('products').delete().eq('id', other.id)
      if (delErr) console.error('Error deleting product', other.id, delErr)
      else console.log(`Deleted duplicate product ${other.id}`)
    }
  }

  console.log('Deduplication complete.')
  process.exit(0)
}

run().catch((e) => {
  console.error('Script error', e)
  process.exit(1)
})
