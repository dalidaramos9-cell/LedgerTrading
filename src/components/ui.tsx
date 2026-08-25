import { useEffect, type ReactNode } from 'react'

// ---- Botones ----
export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className,
  title,
  sm,
}: {
  children: ReactNode
  onClick?: (e?: React.MouseEvent) => void
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  title?: string
  sm?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn ${variant} ${sm ? 'sm' : ''} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

// ---- Campos de formulario ----
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export const inputCls = 'input'

// ---- Modal ----
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// ---- Confirmación ----
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
          <div className="confirm-actions">
            <Button variant="subtle" onClick={onCancel}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Barra de progreso ----
export function ProgressBar({
  value,
  tone = 'auto',
  height,
}: {
  value: number
  tone?: 'auto' | 'warning' | 'danger' | 'success'
  height?: number
}) {
  const clamped = Math.max(0, Math.min(value, 100))
  const effectiveTone =
    tone === 'auto'
      ? clamped >= 80
        ? 'danger'
        : clamped >= 60
          ? 'warning'
          : 'success'
      : tone
  return (
    <div className="progress-track" style={{ height }}>
      <div
        className={`progress-fill ${effectiveTone}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ---- Tarjeta de estadística ----
export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'pos' | 'neg' | 'neutral'
}) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`}>
        {value}
      </span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  )
}

// ---- Badge de estado ----
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

// ---- Empty state ----
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <strong>{title}</strong>
      {children ? <p className="empty-sub">{children}</p> : null}
    </div>
  )
}
