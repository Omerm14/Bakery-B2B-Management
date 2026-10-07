import { ArrowUp, ArrowDown, ArrowLeftRight, Trash2 } from 'lucide-react'
import { useTranslation } from '../../context/LanguageContext'

// Quantity cell for one audit event, by action: new (green ↑), update
// (green ↑ / red ↓ by direction), move (neutral ⇄), delete (red 🗑, old → 0).
export function AuditQuantity({ row }) {
  const { t } = useTranslation()
  const style = (color) => ({ color, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 })

  if (row.action === 'delete') {
    return <span dir="ltr" style={style('var(--red)')}><Trash2 size={12} />{t('settings.auditAction.delete')}: {Number(row.old_quantity)}</span>
  }
  if (row.action === 'move') {
    return <span dir="ltr" style={style('var(--t2)')}><ArrowLeftRight size={12} />{t('settings.auditAction.move')}: {Number(row.new_quantity)}</span>
  }
  const isNew = row.old_quantity == null
  const up = isNew || Number(row.new_quantity) > Number(row.old_quantity)
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span dir="ltr" style={style(up ? 'var(--green)' : 'var(--red)')}>
      <Icon size={12} />
      {isNew ? `${t('header.notificationsNewItem')}: ${Number(row.new_quantity)}` : `${Number(row.old_quantity)} → ${Number(row.new_quantity)}`}
    </span>
  )
}
