import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Item { id: string; name: string }

interface ContextPanelProps {
  mode: 'research' | 'product'
  onSuggest: (idea: string, sources: string[], channelIds: string[], folderIds: string[]) => void
  accentBtn: string
}

export default function ContextPanel({ mode, onSuggest, accentBtn }: ContextPanelProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // source toggles
  const [slackOn, setSlackOn] = useState(false)
  const [driveOn, setDriveOn] = useState(false)

  // lists
  const [channels, setChannels] = useState<Item[]>([])
  const [folders, setFolders] = useState<Item[]>([])
  const [loadingCh, setLoadingCh] = useState(false)
  const [loadingFo, setLoadingFo] = useState(false)

  // selections
  const [selChannels, setSelChannels] = useState<Set<string>>(new Set())
  const [selFolders, setSelFolders] = useState<Set<string>>(new Set())

  // panel position (anchored to button)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
  }, [open])

  // close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // fetch channels when Slack toggled on
  useEffect(() => {
    if (!slackOn || channels.length > 0) return
    setLoadingCh(true)
    fetch('/api/context/slack/channels')
      .then(r => r.json())
      .then(d => setChannels(d.channels || []))
      .catch(() => setChannels([]))
      .finally(() => setLoadingCh(false))
  }, [slackOn])

  // fetch folders when Drive toggled on
  useEffect(() => {
    if (!driveOn || folders.length > 0) return
    setLoadingFo(true)
    fetch('/api/context/drive/folders')
      .then(r => r.json())
      .then(d => setFolders(d.folders || []))
      .catch(() => setFolders([]))
      .finally(() => setLoadingFo(false))
  }, [driveOn])

  const toggleSel = (set: Set<string>, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  const canGenerate = (slackOn && selChannels.size > 0) || (driveOn && selFolders.size > 0)
  const label = mode === 'research' ? '3 research directions' : '3 product ideas'

  const handleGenerate = () => {
    if (!canGenerate) return
    const sources = [...(slackOn ? ['slack'] : []), ...(driveOn ? ['drive'] : [])]
    onSuggest('', sources, Array.from(selChannels), Array.from(selFolders))
    setOpen(false)
  }

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
      className="w-80 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-4 space-y-3"
    >
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Context sources</p>

      {/* ── Slack toggle ── */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setSlackOn(v => !v)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            slackOn ? 'bg-indigo-600/25' : 'bg-white/5 hover:bg-white/10'
          }`}
        >
          <span className="text-base">💬</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200">Slack</p>
            <p className="text-xs text-slate-500">Messages &amp; threads</p>
          </div>
          <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
            slackOn ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
          }`} />
        </button>

        {slackOn && (
          <div className="border-t border-white/10 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
            {loadingCh && <p className="text-xs text-slate-500 py-1">Loading channels…</p>}
            {!loadingCh && channels.length === 0 && (
              <p className="text-xs text-slate-500 py-1">No channels found — check connector</p>
            )}
            {channels.map(ch => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setSelChannels(s => toggleSel(s, ch.id))}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                  selChannels.has(ch.id)
                    ? 'bg-indigo-600/40 text-indigo-100 font-medium'
                    : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
                }`}
              >
                {selChannels.has(ch.id) ? '✓ ' : ''}# {ch.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Drive toggle ── */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setDriveOn(v => !v)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            driveOn ? 'bg-emerald-600/25' : 'bg-white/5 hover:bg-white/10'
          }`}
        >
          <span className="text-base">📁</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200">Google Drive</p>
            <p className="text-xs text-slate-500">Docs, PDFs, papers</p>
          </div>
          <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
            driveOn ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'
          }`} />
        </button>

        {driveOn && (
          <div className="border-t border-white/10 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
            {loadingFo && <p className="text-xs text-slate-500 py-1">Loading folders…</p>}
            {!loadingFo && folders.length === 0 && (
              <p className="text-xs text-slate-500 py-1">No folders found — check connector</p>
            )}
            {folders.map(fo => (
              <button
                key={fo.id}
                type="button"
                onClick={() => setSelFolders(s => toggleSel(s, fo.id))}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                  selFolders.has(fo.id)
                    ? 'bg-emerald-600/40 text-emerald-100 font-medium'
                    : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
                }`}
              >
                {selFolders.has(fo.id) ? '✓ ' : ''}📂 {fo.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <hr className="border-white/10" />

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`w-full ${accentBtn} disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold py-2.5 rounded-xl transition-all`}
      >
        ✨ Generate {label}
      </button>

      {!canGenerate && (slackOn || driveOn) && (
        <p className="text-xs text-slate-600 text-center">
          Select at least one {slackOn && !driveOn ? 'channel' : driveOn && !slackOn ? 'folder' : 'channel or folder'} above
        </p>
      )}
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl border transition-all ${
          slackOn || driveOn
            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/30'
            : 'bg-white/8 border-white/20 text-slate-300 hover:bg-white/12 hover:text-white hover:border-white/30'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h7" />
        </svg>
        Context
        {(slackOn || driveOn) && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
      </button>
      {panel}
    </>
  )
}
