import { useEffect, useRef } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'

export default function CallbackPage() {
  const { isAuthenticated, isLoading, error, handleRedirectCallback } = useAuth0()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('code') && params.has('state')) {
      if (handled.current) return
      handled.current = true
      handleRedirectCallback()
        .then((result) => navigate(result?.appState?.returnTo ?? '/select', { replace: true }))
        .catch((e) => { console.error('Callback error:', e); navigate('/', { replace: true }) })
    } else if (!isLoading) {
      navigate(isAuthenticated ? '/select' : '/', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="glass rounded-2xl p-8 max-w-md text-center">
        <p className="text-red-400 font-medium">Authentication error</p>
        <p className="text-slate-400 text-sm mt-2">{error.message}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-xs text-indigo-400 hover:text-indigo-300">Back to home</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Completing sign in...</p>
      </div>
    </div>
  )
}
