import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { configureSupabase } from '../lib/supabaseClient'

export default function LoginPage() {
  const { signIn, signUp, configured } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [cfgUrl, setCfgUrl] = useState('')
  const [cfgKey, setCfgKey] = useState('')
  const [cfgMsg, setCfgMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res =
        mode === 'login'
          ? await signIn(email, password)
          : await signUp(email, password, { firstName, lastName })
      if (res.error) {
        setError(res.error)
      } else if (mode === 'register') {
        // Con confirmación desactivada, el usuario ya queda autenticado
        // (App detecta la sesión y pasa al dashboard). Solo avisamos si
        // el proyecto aún exige confirmación de correo.
        if ('needsConfirmation' in res && res.needsConfirmation) {
          setError(
            'Cuenta creada. Revisa tu correo para confirmar si es necesario, luego inicia sesión.',
          )
        }
      }
    } catch (err) {
      console.error('Auth error:', err)
      setError(
        `Error al conectarse con Supabase. Revisa tus credenciales en .env y que el esquema esté creado. (${errMessage(err)})`,
      )
    } finally {
      setBusy(false)
    }
  }

  function errMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message
    return String(err)
  }

  function applyConfig() {
    if (!cfgUrl.trim() || !cfgKey.trim()) {
      setCfgMsg('Ingresa la URL y la anon key.')
      return
    }
    configureSupabase(cfgUrl.trim().replace(/\/+$/, ''), cfgKey.trim())
    setCfgMsg('Guardado. Vuelve a intentar iniciar sesión.')
    setShowConfig(false)
    window.location.reload()
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-logo">⛁</div>
          <div>
            <div className="login-title">Ledger</div>
            <div className="page-sub" style={{ marginTop: 0 }}>
              Control de cuentas de trading
            </div>
          </div>
        </div>

        {!configured ? (
          <div className="config-note">
            <strong>Falta configurar Supabase.</strong>
            <br />
            En el archivo <code>.env</code> deben estar{' '}
            <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
            <div style={{ marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => setShowConfig((s) => !s)}>
                {showConfig ? 'Ocultar' : 'Configurar ahora'}
              </button>
            </div>
            {showConfig ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <input
                  className="input"
                  placeholder="https://xxx.supabase.co"
                  value={cfgUrl}
                  onChange={(e) => setCfgUrl(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="anon key"
                  value={cfgKey}
                  onChange={(e) => setCfgKey(e.target.value)}
                />
                <button className="btn primary sm" onClick={applyConfig}>
                  Guardar
                </button>
                {cfgMsg ? <small>{cfgMsg}</small> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <div className="auth-error">{error}</div> : null}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' ? (
            <div className="form-grid">
              <div className="field">
                <span className="field-label">Nombre</span>
                <input
                  className="input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Nombre"
                  autoComplete="given-name"
                />
              </div>
              <div className="field">
                <span className="field-label">Apellido</span>
                <input
                  className="input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Apellido"
                  autoComplete="family-name"
                />
              </div>
            </div>
          ) : null}

          <div className="field">
            <span className="field-label">Correo electrónico</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <span className="field-label">Contraseña</span>
            <input
              className="input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
            />
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy
              ? 'Procesando…'
              : mode === 'login'
                ? 'Iniciar sesión'
                : 'Crear cuenta'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              ¿No tienes cuenta?{' '}
              <span className="auth-link" onClick={() => { setMode('register'); setError(null) }}>
                Regístrate
              </span>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{' '}
              <span className="auth-link" onClick={() => { setMode('login'); setError(null) }}>
                Inicia sesión
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
