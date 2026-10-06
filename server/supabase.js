const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey
)

module.exports = supabase
