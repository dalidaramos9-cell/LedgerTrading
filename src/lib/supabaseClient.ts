import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Configuración de Supabase desde el entorno (.env). El proveedor de auth
// guarda la sesión en localStorage bajo una clave derivada del "project ref"
// de la URL. Por eso es fundamental que SOLO EXISTA UN ÚNICO cliente durante
// toda la vida de la app: si se crean clientes distintos (uno del .env y otro
// de localStorage, o varios al recargar), la sesión que guarda uno no la
// encuentra el otro, y el logout falla con "Session not found", además de
// provocar refrescos de token duplicados.
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(envUrl && envKey && envUrl !== 'https://XXXX.supabase.co')

// Cliente Supabase único. Valores por defecto con auth persistente.
function buildClient(u: string, k: string): SupabaseClient {
  return createClient(u, k, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

// Determina las credenciales a usar:
// 1) Las del .env si están configuradas (caso normal ya en funcionamiento).
// 2) En su defecto, las guardadas en runtime en la primera configuración manual
//    que completa el usuario en la pantalla de login («Configurar ahora»).
function resolveCredentials(): { url: string; key: string } {
  if (envUrl && envKey && envUrl !== 'https://XXXX.supabase.co') {
    return { url: envUrl, key: envKey }
  }
  try {
    const savedStr = localStorage.getItem('ledger.supabase')
    if (savedStr) {
      const saved = JSON.parse(savedStr) as { url: string; key: string }
      if (saved.url && saved.key) return { url: saved.url, key: saved.key }
    }
  } catch {
    /* localStorage no disponible */
  }
  return { url: '', key: '' }
}

// Único cliente: se crea UNA sola vez y no se vuelve a instanciar en este módulo.
export let supabase: SupabaseClient

const { url, key } = resolveCredentials()
supabase = buildClient(url, key)

export function configureSupabase(nextUrl: string, nextKey: string): SupabaseClient {
  // Guarda las credenciales proporcionadas en runtime para usarlas como fallback
  // si el .env no está configurado en futuras cargas. En entornos ya configurados
  // (.env) este call solo persiste las credenciales sin duplicar clientes.
  if (nextUrl && nextKey) {
    try {
      localStorage.setItem('ledger.supabase', JSON.stringify({ url: nextUrl, key: nextKey }))
    } catch {
      /* ignorar */
    }
    if (!supabaseConfigured) {
      supabase = buildClient(nextUrl.trim().replace(/\/+$/, ''), nextKey)
    }
  }
  return supabase
}
