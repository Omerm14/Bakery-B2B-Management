import { useState, useEffect } from 'react'
import { X, Download, Share } from 'lucide-react'

const DISMISS_KEY = 'floory_portal_install_dismissed_at'
const DISMISS_DAYS = 14

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isInAppBrowser() {
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua)
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const days = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24)
  return days < DISMISS_DAYS
}

// Renders nothing once installed or recently dismissed; otherwise picks the
// right variant for the current browser: a real install button (Android/
// Chrome, via beforeinstallprompt), a Share-sheet hint (iOS Safari has no
// programmatic install API), or an "open in Safari/Chrome" nudge (in-app
// browsers like WhatsApp/Instagram block installability entirely).
export default function InstallPrompt() {
  const [dismissed, setDismissed] = useState(recentlyDismissed)
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  if (dismissed || isStandalone()) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  let content = null

  if (isInAppBrowser()) {
    content = (
      <span>לחוויה הטובה ביותר, פתחו את הקישור ב־Safari או Chrome</span>
    )
  } else if (deferredPrompt) {
    content = (
      <>
        <Download size={16} />
        <span>התקינו את פלורי במסך הבית</span>
      </>
    )
  } else if (isIOS()) {
    content = (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        להתקנה: הקישו <Share size={14} /> ואז "הוסף למסך הבית"
      </span>
    )
  } else {
    return null
  }

  async function handleClick() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 50,
        maxWidth: 900,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 12,
        background: 'var(--color-surface, #1a1a1a)',
        color: 'var(--color-text, #fff)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <button
        className={deferredPrompt ? 'btn btn-primary btn-sm' : ''}
        onClick={deferredPrompt ? handleClick : undefined}
        style={deferredPrompt ? { display: 'flex', alignItems: 'center', gap: 6 } : { background: 'none', border: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6, cursor: 'default', padding: 0 }}
      >
        {content}
      </button>
      <button onClick={dismiss} className="btn btn-ghost btn-sm" aria-label="סגור" style={{ padding: 4 }}>
        <X size={16} />
      </button>
    </div>
  )
}
