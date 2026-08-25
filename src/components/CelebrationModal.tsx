import { Button } from './ui'
import { money } from '../lib/fmt'

export default function CelebrationModal({
  data,
  onClose,
}: {
  data: {
    title: string
    message: string
    nextLabel: string | null
    balance: number | null
    target: number | null
  }
  onClose: () => void
}) {
  return (
    <div className="celebration-overlay">
      <div className="celebration-card">
        <div className="celebration-emoji">🎉</div>
        <h2 style={{ marginBottom: 10 }}>{data.title}</h2>
        <p className="muted" style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
          {data.message}
        </p>
        {data.balance !== null ? (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="stage-stat-row">
              <span>Balance actual</span>
              <strong style={{ color: 'var(--green)' }}>{money(data.balance)}</strong>
            </div>
            {data.target !== null && data.nextLabel ? (
              <div className="stage-stat-row" style={{ marginTop: 6 }}>
                <span>Objetivo «{data.nextLabel}»</span>
                <strong>{money(data.target)}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        <Button variant="primary" onClick={onClose}>
          ¡A por la siguiente!
        </Button>
      </div>
    </div>
  )
}
