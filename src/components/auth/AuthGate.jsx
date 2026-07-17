import React from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Login from '../../pages/Login'

function FullScreen({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas-soft px-4">
      {children}
    </div>
  )
}

export default function AuthGate({ children }) {
  const { status, user, signOut } = useAuth()

  if (status === 'loading') {
    return (
      <FullScreen>
        <Loader2 size={22} className="animate-spin text-[#2940BE]" />
      </FullScreen>
    )
  }

  if (status === 'login') {
    return <Login />
  }

  if (status === 'denied') {
    return (
      <FullScreen>
        <div className="w-full max-w-sm text-center">
          <ShieldAlert size={32} className="mx-auto mb-3 text-[#E97132]" />
          <h1 className="text-base font-semibold text-ink mb-1">Access not granted</h1>
          <p className="text-sm text-muted mb-1">
            <span className="font-medium text-ink">{user?.email}</span> isn't on the approved list.
          </p>
          <p className="text-sm text-muted">
            Contact your administrator to request access.
          </p>
          <button
            onClick={signOut}
            className="mt-5 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium text-body hover:border-ink/30 transition-colors"
          >
            Sign out
          </button>
        </div>
      </FullScreen>
    )
  }

  return children
}
