import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Shown inline (per locked day-cell) or as a full-page state (when every
// visible day is locked) once a customer is past the edit cutoff. Contact
// info is sourced from the org's own support-contact columns (migration
// 055), not hardcoded, so it can change without a redeploy.
export default function CutoffBlockedNotice({ compact }) {
  const [contact, setContact] = useState(null)

  useEffect(() => {
    supabase.rpc('get_own_organization_support_contact').then(({ data }) => setContact(data?.[0] || null))
  }, [])

  const name = contact?.support_contact_name || 'הצוות'
  const waLink = contact?.support_contact_whatsapp_link

  if (compact) {
    return (
      <span style={{ fontSize: 11, color: 'var(--t3)' }} title={`מועד השינוי חלף — יש לפנות ל${name}`}>
        🔒
      </span>
    )
  }

  return (
    <div className="alert alert-warn" style={{ direction: 'rtl' }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>מועד השינוי חלף</div>
        <div style={{ fontSize: 13 }}>
          לא ניתן לבצע שינוי בשעה זו. יש לפנות ל{name} {contact?.support_contact_phone ? `בטלפון ${contact.support_contact_phone}` : ''}
          {waLink && (
            <>
              {' '}או{' '}
              <a href={waLink} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>בקבוצת הוואטסאפ</a>
            </>
          )}
          .
        </div>
      </div>
    </div>
  )
}
