import { createClient } from '@supabase/supabase-js'

// ⚠️ DEV-ONLY AUTH BYPASS (temporary).
// When VITE_DEV_NO_AUTH=true and a dev service key is provided, the client uses
// the service-role key so data loads without a real Microsoft login (bypasses RLS).
// This is LOCAL ONLY — VITE_DEV_NO_AUTH must never be set in production.
const DEV_NO_AUTH = import.meta.env.VITE_DEV_NO_AUTH === 'true'
const DEV_SERVICE_KEY = import.meta.env.VITE_DEV_SERVICE_KEY

const key = DEV_NO_AUTH && DEV_SERVICE_KEY
  ? DEV_SERVICE_KEY
  : import.meta.env.VITE_SUPABASE_ANON_KEY

if (DEV_NO_AUTH) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] DEV_NO_AUTH is ON — auth gate bypassed, using elevated key. Do not ship.')
}

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, key)
