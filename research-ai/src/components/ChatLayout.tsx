import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, type FormEvent } from 'react'
import ContextPanel from './ContextPanel'

export type ChatMode = 'research' | 'product'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatLayoutProps {
  mode: ChatMode
}

const CONFIG = {
  research: {
    label: 'Research Mode',
    icon: '🔬',
    accent: 'indigo',
    orb1: 'bg-indigo-600/20',
    orb2: 'bg-purple-600/15',
    glow: 'shadow-indigo-500/20',
    inputRing: 'focus-within:ring-indigo-500/40',
    sendBtn: 'bg-indigo-600 hover:bg-indigo-500',
    userBubble: 'bg-indigo-600/20 border-indigo-500/20',
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    botGradient: 'from-indigo-500 to-purple-500',
    placeholder: 'e.g. I need a novel research topic in neurally inspired computing...',
    suggestions: [
      'Analyze limitations in transformer-based NLP models',
      'Suggest novel topics in neuromorphic computing',
      'Outline a research study on federated learning privacy',
      'Find recent papers on diffusion models for protein folding',
    ],
  },
  product: {
    label: 'Product Dev Mode',
    icon: '🚀',
    accent: 'emerald',
    orb1: 'bg-emerald-600/15',
    orb2: 'bg-teal-600/10',
    glow: 'shadow-emerald-500/20',
    inputRing: 'focus-within:ring-emerald-500/40',
    sendBtn: 'bg-emerald-600 hover:bg-emerald-500',
    userBubble: 'bg-emerald-600/20 border-emerald-500/20',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    botGradient: 'from-emerald-500 to-teal-500',
    placeholder: 'e.g. I want to build a product that helps farmers with agricultural management...',
    suggestions: [
      'Build a product for agricultural management for farmers',
      'Create an app that connects freelancers with local businesses',
      'Design a mental wellness platform for college students',
      'Build a real-time inventory system for small restaurants',
    ],
  },
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ msg, config }: { msg: Message; config: typeof CONFIG['research'] }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs shrink-0 mt-1">
          👤
        </div>
      ) : (
        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${config.botGradient} flex items-center justify-center text-xs shrink-0 mt-1`}>
          {config.icon}
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed border whitespace-pre-wrap ${
          isUser
            ? `${config.userBubble} text-slate-100`
            : 'bg-white/5 border-white/10 text-slate-200'
        }`}
      >
        {msg.content}
      </div>
    </div>
  )
}

export default function ChatLayout({ mode }: ChatLayoutProps) {
  const { user, logout } = useAuth0()
  const navigate = useNavigate()
  const config = CONFIG[mode]

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll chat area to bottom — never touches the page scroll
  useEffect(() => {
    if (messages.length === 0) return
    const el = chatAreaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  const sendMessage = async (text: string, useContext = false, sources: string[] = [], channelIds: string[] = [], folderIds: string[] = []) => {
    if (!text.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setStreaming(true)

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, mode, useContext, sources, channelIds, folderIds }),
      })

      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + delta,
                }
                return updated
              })
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '⚠️ Something went wrong. Make sure the API server is running and your OpenAI key is set.',
        }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col relative">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full ${config.orb1} blur-[120px]`} />
        <div className={`absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full ${config.orb2} blur-[120px]`} />
      </div>

      {/* Nav — always visible at top */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 flex-none overflow-visible">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/select')}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            aria-label="Back"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-xs font-bold">
              R
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">ResearchAI</span>
          </div>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${config.badge}`}>
            {config.icon} {config.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ContextPanel
            mode={mode}
            accentBtn={config.sendBtn}
            onSuggest={(idea, sources, channelIds, folderIds) => {
              const parts = []
              if (sources.includes('slack')) parts.push('Slack discussions')
              if (sources.includes('drive')) parts.push('Google Drive documents')
              const sourceLabel = parts.join(' and ')
              const prompt = idea
                ? `${idea} — use my ${sourceLabel} as context.`
                : mode === 'research'
                ? `Suggest 3 novel research directions based on my ${sourceLabel}.`
                : `Suggest 3 product ideas based on recurring themes in my ${sourceLabel}.`
              sendMessage(prompt, true, sources, channelIds, folderIds)
            }}
          />
          {user?.picture ? (
            <img src={user.picture} alt={user.name ?? 'User'} className="w-7 h-7 rounded-full ring-1 ring-white/10" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
          )}
          <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Chat area — this is the ONLY thing that scrolls */}
      <div ref={chatAreaRef} className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-12 pb-6">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${config.botGradient} flex items-center justify-center text-3xl mb-5 shadow-lg ${config.glow}`}>
                {config.icon}
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">{config.label}</h2>
              <p className="text-slate-400 text-sm max-w-md mb-8">
                {mode === 'research'
                  ? 'Describe your research area or paste a paper abstract to get started.'
                  : 'Describe your product idea and your role to get a tailored execution plan.'}
              </p>
              {/* Suggestion chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {config.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="glass rounded-xl px-4 py-3 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-all border-transparent hover:border-white/10 border"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} config={config} />
          ))}

          {streaming && messages[messages.length - 1]?.content === '' && (
            <div className="flex gap-3">
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${config.botGradient} flex items-center justify-center text-xs shrink-0 mt-1`}>
                {config.icon}
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}

          <div />
        </div>
      </div>

      {/* Input bar */}
      <div className="relative z-10 px-4 pb-6 pt-2 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className={`glass rounded-2xl ring-1 ring-white/10 ${config.inputRing} focus-within:ring-2 transition-all`}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              rows={1}
              className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none max-h-40 overflow-y-auto"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <span className="text-xs text-slate-600">Shift+Enter for new line</span>
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                className={`${config.sendBtn} disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5`}
              >
                {streaming ? (
                  <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
