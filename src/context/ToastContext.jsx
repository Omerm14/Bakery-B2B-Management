import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((message, { type = 'info', duration } = {}) => {
    const id = ++idRef.current
    const d = duration ?? (type === 'error' ? 6000 : 3500)
    setToasts(prev => [...prev, { id, type, message }])
    if (d > 0) setTimeout(() => dismiss(id), d)
    return id
  }, [dismiss])

  const api = useMemo(() => ({
    toasts,
    show: push,
    success: (msg, opts) => push(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => push(msg, { ...opts, type: 'error' }),
    warning: (msg, opts) => push(msg, { ...opts, type: 'warning' }),
    info: (msg, opts) => push(msg, { ...opts, type: 'info' }),
    dismiss,
  }), [toasts, push, dismiss])

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>
}

export function useToast() {
  return useContext(ToastContext)
}
