import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'theme'
const getSystemPref = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

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

  // Track the last pointer position so the reveal circle originates from the
  // exact spot the user clicked (top-bar button or the More-page switch).
  const pointerRef = useRef(null)
  useEffect(() => {
    const onDown = (e) => { pointerRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [])

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
    // Apply the DOM change synchronously so the View Transition snapshots the
    // new theme; flushSync forces React to commit before the "after" snapshot.
    const commit = () => {
      flushSync(() => setOverride(next))
      applyClass(next ?? getSystemPref())
    }
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}

    if (!document.startViewTransition || prefersReducedMotion()) {
      commit()
      return
    }

    // Origin = last click point, else viewport centre (e.g. keyboard toggle).
    const { x, y } = pointerRef.current || { x: innerWidth / 2, y: innerHeight / 2 }
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

    const transition = document.startViewTransition(commit)
    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 2500,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      )
    }).catch(() => {})
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
