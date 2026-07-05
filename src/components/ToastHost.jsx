import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }

export default function ToastHost() {
  const toast = useToast()
  if (!toast.toasts.length) return null

  return (
    <div className="toast-stack no-print">
      {toast.toasts.map(t => {
        const Icon = ICONS[t.type] || Info
        return (
          <div key={t.id} role="status" className={`toast toast-${t.type}`}>
            <Icon size={16} className="toast-icon" aria-hidden="true" />
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => toast.dismiss(t.id)} aria-label="סגור">
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
