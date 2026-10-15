const fs = require('fs')
const path = require('path')

const checkpointFile = path.resolve(process.env.MAMI_IMPORT_CHECKPOINT_FILE || path.join(__dirname, '..', 'uploads', 'mami_import_checkpoint.json'))
const intervalMs = Math.max(1000, Number(process.env.MAMI_IMPORT_WATCH_INTERVAL_MS || 10000))
let previousState = ''
let timer

function reportProgress() {
  try {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
    const manifest = checkpoint.categoryManifest || []
    const completedCategories = manifest.filter((route) => checkpoint.categories?.[route]?.status === 'complete').length
    const productStatuses = Object.values(checkpoint.items || {}).reduce((counts, item) => {
      const status = item.status || 'pending'
      counts[status] = (counts[status] || 0) + 1
      return counts
    }, {})
    const state = JSON.stringify({
      phase: checkpoint.phase,
      categories: `${completedCategories}/${manifest.length}`,
      percent: manifest.length ? Math.floor((completedCategories / manifest.length) * 100) : 0,
      productsCaptured: Object.keys(checkpoint.items || {}).length,
      productStatuses,
      coverageIssues: checkpoint.coverageIssues || [],
    })

    if (state !== previousState) {
      console.log(`${new Date().toLocaleTimeString()} ${state}`)
      previousState = state
    }

    if (checkpoint.phase === 'completed') {
      clearInterval(timer)
      process.exit(0)
    }
  } catch (error) {
    console.error(`No se pudo leer el checkpoint: ${error.message}`)
  }
}

reportProgress()
timer = setInterval(reportProgress, intervalMs)