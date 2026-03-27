import { useAuth0 } from '@auth0/auth0-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Mode = 'research' | 'product' | null

const MODES = [
  {
    id: 'research' as const,
    icon: '🔬',
    label: 'Research Mode',
    tagline: 'Academic & scientific exploration',
    description:
      'Analyze papers, identify research gaps, generate novel study topics, and produce structured research proposals with experiment timelines.',
    bullets: [
      'Scan papers for limitations & future work',
      'Surface novel, publishable research topics',
      'Auto-search relevant recent literature',
      'Generate full research outlines & timelines',
    ],
    gradient: 'from-indigo-600 to-purple-600',
    glow: 'glow-indigo',
    border: 'hover:border-indigo-500/50',
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  },
  {
    id: 'product' as const,
    icon: '🚀',
    label: 'Product Dev Mode',
    tagline: 'From idea to execution plan',
    description:
      'Transform a product idea into a full execution plan — market analysis, competitor landscape, MVP roadmap, and tech stack recommendations tailored to your role.',
    bullets: [
      'Market study & competitor analysis',
      'MVP plan → full-scale roadmap',
      'Role-tailored output (PM, SWE, Marketing)',
      'Ideal tech stack recommendations',
    ],
    gradient: 'from-emerald-600 to-teal-600',
    glow: 'glow-emerald',
    border: 'hover:border-emerald-500/50',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  },
]

export default function SelectModePage() {
  const { user, logout } = useAuth0()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Mode>(null)

  useEffect(() => {
    if (user) {
      console.log('✅ Sign in successful:', user.email, user)
    }
  }, [user])

  const handleContinue = () => {
    if (selected) navigate(`/${selected}`)
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[400px] h-[400px] rounded-full bg-emerald-600/10 blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-sm font-bold">
            R
          </div>
          <span className="font-semibold text-white tracking-tight">ResearchAI</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            {user?.picture ? (
              <img src={user.picture} alt={user.name ?? 'User'} className="w-7 h-7 rounded-full ring-1 ring-white/10" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <span className="text-slate-300 text-sm hidden sm:block">{user?.email}</span>
          </div>
          <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-24">
        {/* Welcome */}
        <div className="text-center mb-14">
          <p className="text-slate-400 text-sm mb-2">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            What are you working on{' '}
            <span className="text-gradient">today?</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto">
            Choose a mode to get started. Each mode tailors the agent's workflow, outputs, and depth of analysis to your specific goal.
          </p>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {MODES.map((mode) => {
            const isSelected = selected === mode.id
            return (
              <button
                key={mode.id}
                onClick={() => setSelected(mode.id)}
                className={`
                  relative text-left glass rounded-2xl p-7 border transition-all duration-200 cursor-pointer
                  ${mode.border}
                  ${isSelected
                    ? `border-white/20 ${mode.glow} scale-[1.01]`
                    : 'border-transparent hover:bg-white/[0.06]'
                  }
                `}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <div className={`absolute top-4 right-4 w-5 h-5 rounded-full bg-gradient-to-br ${mode.gradient} flex items-center justify-center`}>
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                )}

                <div className="text-3xl mb-4">{mode.icon}</div>

                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-white">{mode.label}</h2>
                </div>

                <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border mb-4 ${mode.badge}`}>
                  {mode.tagline}
                </span>

                <p className="text-slate-400 text-sm leading-relaxed mb-5">{mode.description}</p>

                <ul className="space-y-2">
                  {mode.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-slate-300">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {b}
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!selected}
            className={`
              inline-flex items-center gap-2 font-semibold px-10 py-4 rounded-xl transition-all duration-200
              ${selected
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-105 active:scale-100 glow-indigo'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }
            `}
          >
            {selected ? `Continue with ${selected === 'research' ? 'Research' : 'Product Dev'} Mode` : 'Select a mode to continue'}
            {selected && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
