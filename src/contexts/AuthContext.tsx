import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

interface SignUpResult {
  error: string | null
  needsConfirmation: boolean
}

interface AuthCtx {
  user: User | null
  initializing: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    nameData?: { firstName: string; lastName: string },
  ) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const configured = supabaseConfigured

  useEffect(() => {
    let mounted = true

    // Si no hay configuración de Supabase, no intentamos contactar el servidor:
    // salimos del "cargando" al instante y mostramos la pantalla de login
    // con el aviso de configuración (evita quedarse en blanco / loading infinito).
    if (!configured) {
      setInitializing(false)
      return
    }

    const sessionPromise = supabase.auth.getSession()
    // Timeout: si Supabase no responde en 4s, no nos quedamos colgados en el
    // loading infinito (que en modo claro se ve como pantalla en blanco).
    const timeout = new Promise<{ data: { session: null } }>((resolve) => {
      setTimeout(() => resolve({ data: { session: null } }), 4000)
    })
    Promise.race([sessionPromise, timeout])
      .then(({ data }) => {
        if (!mounted) return
        setUser(data.session?.user ?? null)
        setInitializing(false)
      })
      .catch(() => {
        if (mounted) {
          setUser(null)
          setInitializing(false)
        }
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        setInitializing(false)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    // Timeout: si el servidor de Supabase tarda o se queda colgado (red lenta,
    // DNS, proxy o una sesión en mal estado), no dejamos el botón en
    // "Procesando…" para siempre. Mostramos un mensaje claro y controlable.
    const result = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      8000,
    )
    if (result === null) {
      return {
        error:
          'El servidor tarda demasiado en responder. Revisa tu conexión a internet y vuelve a intentarlo.',
      }
    }
    const { error } = result
    return { error: error ? errorMessage(error.message) : null }
  }, [])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      nameData?: { firstName: string; lastName: string },
    ) => {
      const firstName = nameData?.firstName?.trim() ?? ''
      const lastName = nameData?.lastName?.trim() ?? ''
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`.trim(),
          },
        },
      })
      // Si el proyecto no exige confirmación de correo, Supabase devuelve
      // la sesión: dejamos al usuario autenticado de inmediato.
      if (data?.session?.user) {
        setUser(data.session.user)
        setInitializing(false)
      }
      return {
        error: error ? errorMessage(error.message) : null,
        needsConfirmation: !data?.session,
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    // Cerrar sesión debe ser rápido y fiable. Aunque el servidor esté lento o caído,
    // limpiamos la sesión local de inmediato para que la app no se quede colgada
    // ni reutilice una sesión "zombie" la próxima vez (comportamiento que aparece
    // tras un periodo sin usar la app, con tokens que ya no se validan bien).
    try {
      await withTimeout(supabase.auth.signOut(), 4000)
    } catch {
      /* El servidor no respondió: igualmente cerramos sesión localmente. */
    }
    // Limpia la sesión guardada por Supabase en el almacenamiento del navegador,
    // para que al recargar no se recupere una sesión antigua/expirada.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k))
    } catch {
      /* ignorar: algunos navegadores restringen el acceso a localStorage */
    }
    setUser(null)
    setInitializing(false)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, initializing, configured, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function errorMessage(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese correo.'
  if (/Password should be/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/rate limited/i.test(msg)) return 'Demasiados intentos. Espera un momento.'
  return msg
}

// Cierra una promesa de Supabase (auth) con un límite de tiempo. Si no se
// resuelve/rechaza dentro de `ms`, devuelve `null` para que la UI nunca se
// quede colgada en "Procesando…" o en un cierre de sesión infinito.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T | null>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
