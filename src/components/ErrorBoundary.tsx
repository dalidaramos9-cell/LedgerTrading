import { Component, type ReactNode } from 'react'

// Atrapa errores de render para que la app nunca quede en "blanco":
// muestra el mensaje del error en pantalla para poder diagnosticarlo.
interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('ErrorBoundary capturó un error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100%',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'var(--bg)',
            color: 'var(--text)',
            fontFamily: 'var(--font)',
          }}
        >
          <div style={{ maxWidth: 520, textAlign: 'left' }}>
            <h2 style={{ marginBottom: 8 }}>Ocurrió un error al cargar Ledger</h2>
            <p style={{ margin: '0 0 12px', color: 'var(--red)' }}>
              {this.state.error.message || String(this.state.error)}
            </p>
            <pre
              style={{
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.stack}
            </pre>
            <button
              className="btn primary"
              style={{ marginTop: 12 }}
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
