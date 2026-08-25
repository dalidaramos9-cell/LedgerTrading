import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey && url !== 'https://XXXX.supabase.co')

// Cliente Supabase. Acepta argumentos override para permitir "conexión manual"
// aunque no estén en el .env (útil en configuración inicial).
export let supabase: SupabaseClient

function buildClient(u?: string, k?: string): SupabaseClient {
  return createClient(u ?? '', k ?? '', {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

supabase = buildClient(url, anonKey)

export function configureSupabase(nextUrl: string, nextKey: string): SupabaseClient {
  // Permite reiniciar el cliente si el usuario configura credenciales en runtime.
  if (nextUrl && nextKey) {
    localStorage.setItem('ledger.supabase', JSON.stringify({ url: nextUrl, key: nextKey }))
    supabase = createClient(nextUrl, nextKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return supabase
}

// Toma las credenciales guardadas en runtime si existen y hay sesión que recuperar.
try {
  const savedStr = localStorage.getItem('ledger.supabase')
  if (savedStr) {
    const saved = JSON.parse(savedStr) as { url: string; key: string }
    if (saved.url && saved.key) {
      supabase = createClient(saved.url, saved.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    }
  }
} catch {
  /* ignorar */
}
