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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
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
    await supabase.auth.signOut()
    setUser(null)
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

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
