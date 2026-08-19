const { createClient } = require('@supabase/supabase-js')

const supabaseUrl =
  'https://yiepogjxhzpuveimrnte.supabase.co'

const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZXBvZ2p4aHpwdXZlaW1ybnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNDI5NDksImV4cCI6MjA5NDgxODk0OX0.ppd929X-2H2rp0pPGZJ_XDXyE9Vt1gN2Gbpt8zvu-yY'

const supabase = createClient(
  supabaseUrl,
  supabaseKey
)

module.exports = supabase
