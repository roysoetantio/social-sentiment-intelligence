import React, { createContext, useContext, useCallback, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'theme'
const getSystemPref = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

const applyClass = (theme) => {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  // Clear the inline bg set by the pre-paint script so CSS tokens take over.
  root.style.backgroundColor = ''
}

export function ThemeProvider({ children }) {
  // `override` is the user's explicit choice (persisted); null means "follow system".
  const [override, setOverride] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === 'dark' || stored === 'light' ? stored : null
    } catch {
      return null
    }
  })
  const [systemTheme, setSystemTheme] = useState(getSystemPref)

  const theme = override ?? systemTheme

  // Keep following the OS while the user hasn't set an explicit override.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    applyClass(theme)
  }, [theme])

  const setTheme = useCallback((next) => {
    setOverride(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', setTheme, toggleTheme, isSystem: override === null }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
