import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export type ChatMode = 'research' | 'product'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  fileName?: string
}

const CONFIG = {
  research: {
    label: 'Research Mode', icon: '🔬',
    orb1: 'bg-indigo-600/20', orb2: 'bg-purple-600/15',
    sendBtn: 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900',
    userBubble: 'bg-indigo-600/20 border-indigo-500/20',
    botGradient: 'from-indigo-500 to-purple-500',
    inputRing: 'focus-within:ring-indigo-500/50',
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    placeholder: 'Describe your research area, paste an abstract, or ask a question...',
    suggestions: [
      'Analyze limitations in transformer-based NLP models',
      'Suggest novel topics in neuromorphic computing',
      'Outline a research study on federated learning privacy',
      'Find recent papers on diffusion models for protein folding',
    ],
  },
  product: {
    label: 'Product Dev Mode', icon: '🚀',
    orb1: 'bg-emerald-600/15', orb2: 'bg-teal-600/10',
    sendBtn: 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900',
    userBubble: 'bg-emerald-600/20 border-emerald-500/20',
    botGradient: 'from-emerald-500 to-teal-500',
    inputRing: 'focus-within:ring-emerald-500/50',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    placeholder: 'Describe your product idea, your role, and your timeline...',
    suggestions: [
      'Build a product for agricultural management for farmers',
      'Create an app connecting freelancers with local businesses',
      'Design a mental wellness platform for college students',
      'Build a real-time inventory system for small restaurants',
    ],
  },
}

function uid() { return Math.random().toString(36).slice(2) }

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-slate-500 animate-bounce"
          style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.9s' }} />
      ))}
    </div>
  )
}

function UserAvatar({ user }: { user: { picture?: string; email?: string } | undefined }) {
  if (user?.picture) return <img src={user.picture} alt="You" className="w-7 h-7 rounded-full ring-1 ring-white/10 shrink-0" />
  return (
    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold shrink-0">
      {user?.email?.[0]?.toUpperCase() ?? 'U'}
    </div>
  )
}

function BotAvatar({ config }: { config: typeof CONFIG['research'] }) {
  return (
    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${config.botGradient} flex items-center justify-center text-sm shrink-0`}>
      {config.icon}
    </div>
  )
}

export default function ChatLayout({ mode }: { mode: ChatMode }) {
  const { user, logout } = useAuth0()
  const navigate = useNavigate()
  const config = CONFIG[mode]

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [input])

  const appendDelta = useCallback((delta: string) => {
    setMessages((prev) => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: last.content + delta }
      }
      return updated
    })
  }, [])

  const sendMessage = useCallback(async (text: string, file?: File | null) => {
    if ((!text.trim() && !file) || streaming) return

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text.trim() || (file ? `Uploaded file: ${file.name}` : ''),
      fileName: file?.name,
    }

    const history = messagesRef.current
      .filter((m) => !m.fileName) // don't re-send file messages as plain text
      .map(({ role, content }) => ({ role, content }))

    setMessages((prev) => [...prev, userMsg, { id: uid(), role: 'assistant', content: '' }])
    setInput('')
    setPendingFile(null)
    setStreaming(true)

    try {
      let res: Response

      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('data', JSON.stringify({
          messages: [...history, { role: 'user', content: text.trim() || '' }],
          mode,
        }))
        res = await fetch('/api/chat/file', { method: 'POST', body: formData })
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...history, { role: 'user', content: text.trim() }],
            mode,
          }),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          let parsed: Record<string, unknown>
          try { parsed = JSON.parse(data) } catch { continue }
          if (parsed.error) throw new Error(parsed.error as string)
          const delta = (parsed as { choices?: { delta?: { content?: string } }[] })
            .choices?.[0]?.delta?.content ?? ''
          if (delta) appendDelta(delta)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `⚠️ ${msg}\n\nMake sure the backend is running (\`python app.py\` in \`backend/\`) and your \`OPENAI_API_KEY\` is set in \`.env\`.`,
        }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }, [streaming, mode, appendDelta])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input, pendingFile)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input, pendingFile) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setPendingFile(f)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setPendingFile(f)
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col relative overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}>

      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full ${config.orb1} blur-[120px]`} />
        <div className={`absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full ${config.orb2} blur-[120px]`} />
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-indigo-500/50 rounded-none">
          <div className="text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-white font-semibold">Drop your file here</p>
            <p className="text-slate-400 text-sm mt-1">PDF, TXT, MD, CSV, JSON, or code files</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-5 py-3.5 border-b border-white/5 shrink-0 bg-slate-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/select')} aria-label="Back"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-xs font-bold">R</div>
            <span className="font-semibold text-white text-sm">ResearchAI</span>
          </div>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${config.badge}`}>
            {config.icon} {config.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar user={user ?? undefined} />
          <span className="text-slate-400 text-xs hidden sm:block">{user?.email}</span>
          <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Sign out</button>
        </div>
      </nav>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-10 pb-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${config.botGradient} flex items-center justify-center text-2xl mb-4 shadow-lg`}>
                {config.icon}
              </div>
              <h2 className="text-xl font-bold text-white mb-1">{config.label}</h2>
              <p className="text-slate-400 text-sm max-w-sm mb-6">
                {mode === 'research'
                  ? 'Describe your research area, paste a paper abstract, or upload a PDF to get started.'
                  : 'Describe your product idea and your role to get a tailored execution plan.'}
              </p>
              <p className="text-slate-600 text-xs mb-3">Try a suggestion</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {config.suggestions.map((s) => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="glass rounded-xl px-4 py-3 text-left text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-all border-transparent hover:border-white/10 border">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'user'
                ? <UserAvatar user={user ?? undefined} />
                : <BotAvatar config={config} />
              }
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm border ${
                msg.role === 'user'
                  ? `${config.userBubble} text-slate-100`
                  : 'bg-white/[0.04] border-white/10 text-slate-200'
              }`}>
                {/* File badge */}
                {msg.fileName && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400 bg-white/5 rounded-lg px-2.5 py-1.5 w-fit">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    {msg.fileName}
                  </div>
                )}
                {msg.role === 'user'
                  ? <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  : msg.content === ''
                    ? <TypingDots />
                    : <div className="prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                }
              </div>
            </div>
          ))}

          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      {/* Input area */}
      <div className="relative z-10 px-4 pb-5 pt-2 shrink-0 bg-slate-950/80 backdrop-blur-sm border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          {/* Pending file pill */}
          {pendingFile && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {pendingFile.name}
                <button onClick={() => setPendingFile(null)} className="ml-1 text-slate-500 hover:text-slate-300">✕</button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className={`glass rounded-2xl ring-1 ring-white/10 ${config.inputRing} focus-within:ring-2 transition-all`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={config.placeholder}
                rows={1}
                disabled={streaming}
                className="w-full bg-transparent px-4 pt-3.5 pb-1 text-sm text-slate-100 placeholder-slate-600 resize-none outline-none overflow-hidden disabled:opacity-60"
              />
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="flex items-center gap-2">
                  {/* File upload button */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all" title="Attach file (PDF, TXT, MD, CSV, JSON, code)">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  </button>
                  <span className="text-xs text-slate-600">Shift+Enter for new line</span>
                </div>
                <button type="submit" disabled={(!input.trim() && !pendingFile) || streaming}
                  className={`${config.sendBtn} disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5`}>
                  {streaming
                    ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                  }
                  {streaming ? 'Thinking...' : 'Send'}
                </button>
              </div>
            </div>
          </form>
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".pdf,.txt,.md,.csv,.json,.py,.js,.ts,.jsx,.tsx"
            onChange={handleFileChange} />
        </div>
      </div>
    </div>
  )
}
