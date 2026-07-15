import { useState, useEffect, useCallback } from 'react'

const KEY = 'floory_audit_show_autosync'
const EVENT = 'floory:autosync-pref-changed'

// Single hide/show-auto-sync preference shared by the Audit Log's eye toggle
// and the notification bell, so toggling it in one place affects both without
// either needing to know about the other. localStorage alone isn't reactive
// within the same tab (the 'storage' event only fires in OTHER tabs), so a
// custom window event notifies every mounted consumer — the header stays
// mounted across navigation, so this is what makes toggling on the Audit Log
// page immediately affect the always-visible bell.
export function useAutoSyncPref() {
  const [showAutoSync, setShowAutoSyncState] = useState(() => localStorage.getItem(KEY) === '1')

  useEffect(() => {
    const onChange = () => setShowAutoSyncState(localStorage.getItem(KEY) === '1')
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  // Accepts either a plain boolean or a React-style updater function (the
  // Audit Log page calls this as setShowAutoSync(v => !v)) — a function is
  // always truthy, so treating it as the value directly would silently pin
  // this to "on" forever after the first toggle.
  const setShowAutoSync = useCallback(updater => {
    const current = localStorage.getItem(KEY) === '1'
    const next = typeof updater === 'function' ? updater(current) : updater
    localStorage.setItem(KEY, next ? '1' : '0')
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [showAutoSync, setShowAutoSync]
}
