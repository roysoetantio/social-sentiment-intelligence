import React, { useState } from 'react'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import LoginDotGrid from '../components/auth/LoginDotGrid'

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
    <div className="min-h-screen w-full bg-canvas p-0 dark:bg-surface-dark sm:p-4">
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden rounded-none border-0 bg-white px-6 py-12 dark:bg-surface-dark sm:min-h-[calc(100vh-2rem)] sm:rounded-[28px] sm:border sm:border-hairline-strong sm:dark:border-white/10">
        {/* interactive dotted background — fills the whole container */}
        <LoginDotGrid />

        {/* centered content — white container over the dotted background */}
        <div className="relative z-10 flex flex-col items-stretch gap-12 rounded-3xl border border-hairline-strong bg-white px-6 py-12 shadow-sm dark:border-white/10 dark:bg-surface-dark-elevated sm:px-12 sm:py-14 lg:flex-row lg:items-stretch lg:gap-20">
          {/* brand block — logo pinned top, headline pinned bottom */}
          <div className="flex flex-col items-start justify-between gap-10 text-left lg:gap-0">
            <img
              src="/assets/uemedgenta-logo.png"
              alt="UEM Edgenta"
              className="h-12 w-auto object-contain dark:hidden"
            />
            <img
              src="/assets/uemedgenta-logo-white.png"
              alt="UEM Edgenta"
              className="hidden h-12 w-auto object-contain dark:block"
            />
            <h2 className="whitespace-nowrap text-2xl font-semibold leading-[1.2] tracking-tight text-ink lg:whitespace-normal">
              Social Sentiment <br className="hidden lg:block" />Intelligence
            </h2>
          </div>

          {/* vertical divider */}
          <div className="hidden w-px self-stretch bg-hairline dark:bg-white/10 lg:block" />

          {/* sign-in card */}
          <div className="w-full max-w-sm" style={{ animation: 'login-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">Welcome.</span> Sign in to UEM Edgenta workspace to continue.
            </p>

            <div className="mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={signInWithMicrosoft}
                disabled={loading}
                className="group h-12 w-full gap-3 rounded-[8px] border-hairline-strong bg-canvas text-[0.9rem] font-medium text-ink shadow-sm transition-colors hover:bg-surface-strong disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark-elevated dark:hover:bg-white/8"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <MicrosoftIcon size={18} />
                )}
                {loading ? 'Redirecting…' : 'Continue with Microsoft'}
              </Button>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#E97132]/20 bg-[#E97132]/5 px-3 py-2.5 text-xs text-[#E97132]">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-2 text-[0.6875rem] text-muted">
              <ShieldCheck size={13} className="flex-shrink-0" />
              <span>Secured by Microsoft Entra ID single sign-on.</span>
            </div>

            <div className="mt-8 border-t border-hairline pt-5">
              <p className="text-[0.6875rem] leading-relaxed text-muted">
                Access is restricted to approved users. If you can't sign in, contact your administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
