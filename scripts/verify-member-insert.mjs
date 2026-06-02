/**
 * Verify member insert against live Supabase.
 * Usage: node scripts/verify-member-insert.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim()))
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const payload = {
  full_name: 'Verify Script User',
  phone: '09129999999',
  membership_type: 'monthly',
  total_sessions: 12,
  used_sessions: 0,
  start_date: '2026-05-30',
  end_date: '2026-06-30',
  notes: 'verify script',
  email: '',
  gender: 'male',
  coach_id: null,
  is_active: true,
};

console.log('Testing column existence...');
const colCheck = await supabase.from('members').select('total_sessions, used_sessions').limit(1);
console.log('Column check:', colCheck.error?.message || 'OK');

console.log('\nTesting anon insert (expect RLS error if not logged in)...');
const insert = await supabase.from('members').insert([payload]).select();
console.log(JSON.stringify({ data: insert.data, error: insert.error }, null, 2));

if (insert.error?.code === 'PGRST204') {
  console.log('\n>>> FIX: Run supabase/migrations/20260530140000_member_insert_fix.sql in Supabase SQL Editor');
}
if (insert.error?.code === '42501') {
  console.log('\n>>> FIX: RLS policy — run the same SQL file, then test while logged in via the app');
}
