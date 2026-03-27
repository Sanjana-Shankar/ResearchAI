import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const FEATURES = [
  { icon: '🔬', title: 'Research Mode', desc: 'Analyze papers, surface novel topics, and generate structured research proposals with timelines.' },
  { icon: '🚀', title: 'Product Dev Mode', desc: 'From idea to MVP — market analysis, competitor research, feature roadmaps, and tech stack recommendations.' },
  { icon: '🎯', title: 'Role-Tailored Output', desc: 'Outputs adapt to your role: PM, SWE, Marketing, or Researcher — so every insight is relevant.' },
]

export default function LandingPage() {
  const { loginWithRedirect, isAuthenticated, isLoading, user } = useAuth0()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      console.log('✅ Sign in successful:', user?.email, user)
      navigate('/select', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate, user])

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] rounded-full bg-purple-600/10 blur-[100px]" />
      </div>
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-sm font-bold">R</div>
          <span className="font-semibold text-white tracking-tight">ResearchAI</span>
        </div>
        {isAuthenticated && user ? (
          <button onClick={() => navigate('/select')} className="flex items-center gap-2.5 glass rounded-full px-3 py-1.5 hover:bg-white/10 transition-colors">
            {user.picture
              ? <img src={user.picture} alt={user.name ?? 'User'} className="w-7 h-7 rounded-full ring-1 ring-white/20" />
              : <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold">{user.email?.[0]?.toUpperCase() ?? 'U'}</div>
            }
            <span className="text-slate-300 text-sm hidden sm:block">{user.name ?? user.email}</span>
          </button>
        ) : (
          <button onClick={() => loginWithRedirect()} className="text-sm text-slate-300 hover:text-white transition-colors">Sign in</button>
        )}
      </nav>
      <main className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-32 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-slate-300 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Autonomous research & product intelligence
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight tracking-tight mb-6">
          Turn ideas into <span className="text-gradient">structured plans</span><br />in minutes
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mb-10 leading-relaxed">
          ResearchAI is your autonomous agent for deep academic research and product development.
        </p>
        <button onClick={() => loginWithRedirect()} disabled={isLoading}
          className="group inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-8 py-4 rounded-xl transition-all duration-200 glow-indigo hover:scale-105">
          {isLoading
            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <>Get started free <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg></>
          }
        </button>
        <p className="text-slate-500 text-xs mt-4">Sign in with your email — no credit card required</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-20 w-full text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 hover:bg-white/[0.07] transition-colors">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="relative z-10 text-center pb-8 text-slate-600 text-xs">
        © {new Date().getFullYear()} ResearchAI. Built for researchers and builders.
      </footer>
    </div>
  )
}
