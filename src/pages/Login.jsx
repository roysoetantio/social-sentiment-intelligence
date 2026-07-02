import React, { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Microsoft logo (4-square) — inline so it works offline / under strict CSP
const MicrosoftIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
)

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const signInWithMicrosoft = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email openid profile',
        redirectTo: window.location.origin,
      },
    })
    // On success the browser redirects to Microsoft; reaching here means it failed.
    if (error) {
      setLoading(false)
      setError(error.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas-soft dark:bg-surface-dark px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/assets/uemedgenta-logo.png"
            alt="UEM Edgenta"
            className="h-9 w-auto object-contain mb-4"
          />
          <h1 className="text-lg font-semibold text-ink dark:text-on-dark tracking-tight">
            Social Sentiment Intelligence
          </h1>
          <p className="text-sm text-muted dark:text-on-dark-soft mt-1">
            Sign in with your Edgenta account
          </p>
        </div>

        <div className="rounded-xl border border-hairline-strong dark:border-white/8 bg-canvas dark:bg-surface-dark-elevated p-6">
          <button
            type="button"
            onClick={signInWithMicrosoft}
            disabled={loading}
            className="w-full h-11 flex items-center justify-center gap-2.5 rounded-md border border-hairline-strong dark:border-white/8 bg-canvas dark:bg-surface-dark text-sm font-medium text-ink dark:text-on-dark hover:bg-surface-strong dark:hover:bg-white/8 disabled:opacity-60 transition-colors"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <MicrosoftIcon size={18} />
            )}
            Sign in with Microsoft
          </button>

          {error && (
            <div className="flex items-start gap-2 mt-4 text-xs text-[#E97132]">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-[0.6875rem] leading-relaxed text-muted dark:text-on-dark-soft mt-4 text-center">
            Access is restricted to approved users. If you can't sign in, contact your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
