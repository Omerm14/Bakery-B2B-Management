import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { TRANSLATIONS } from '../lib/translations'

const LanguageContext = createContext(null)

// Scoped to the staff app only (see App.jsx) -- sets <html dir/lang> while
// mounted and restores Hebrew/RTL on unmount, so the customer portal and
// pre-auth pages are never affected by a staff member's language choice.
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('floory_lang') || 'he')

  useEffect(() => {
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl'
    document.documentElement.lang = lang
    localStorage.setItem('floory_lang', lang)
    return () => {
      document.documentElement.dir = 'rtl'
      document.documentElement.lang = 'he'
    }
  }, [lang])

  const toggleLang = useCallback(() => setLang(l => (l === 'he' ? 'en' : 'he')), [])

  const t = useCallback((key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.he[key] ?? key, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider')
  return ctx
}
