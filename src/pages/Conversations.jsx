import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import {
  Send, Search, MessageSquare, Check, CheckCheck, Clock,
  Smartphone, Image, FileText, Mic, Video, Paperclip,
  Calendar, Sparkles, StopCircle, X, User, GitMerge,
  CheckSquare, ChevronRight, Edit2, Save, Loader2, Plus,
  CheckCircle2, Circle, Star, Archive,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeStr(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const diff = Math.floor((now - d) / 86400000)
  if (diff < 7) return d.toLocaleDateString('es', { weekday: 'short' })
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })
}

function dateLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hoy'
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 1) return 'Ayer'
  if (diff < 7) return d.toLocaleDateString('es', { weekday: 'long' })
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

function sessionShort(session, phone) {
  if (phone) return phone.replace(/@.*/, '').replace(/^549?/, '').slice(-8)
  return session?.replace(/^aria_/, '').split('_')[0] || session || '?'
}

function msgPreview(msg) {
  if (!msg) return ''
  if (msg.type === 'image') return '📷 Imagen'
  if (msg.type === 'video') return '🎥 Video'
  if (msg.type === 'audio' || msg.type === 'ptt') return '🎤 Audio'
  if (msg.type === 'document') return '📄 Documento'
  return msg.body || msg.caption || ''
}

function chatPhone(chatId) {
  return (chatId || '').replace(/@.*/, '').replace(/^549?(\d+)$/, '549$1')
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40 }) {
  const c = (name || '?')[0].toUpperCase()
  const palette = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899']
  const bg = palette[c.charCodeAt(0) % palette.length]
  return (
    <div style={{ backgroundColor: bg + '22', border: `1.5px solid ${bg}44`, width: size, height: size, minWidth: size, color: bg }}
      className="rounded-full flex items-center justify-center font-semibold text-sm shrink-0">
      {c}
    </div>
  )
}

function AckIcon({ ack }) {
  if (ack >= 3) return <CheckCheck size={12} className="text-sky-500 shrink-0" />
  if (ack >= 2) return <CheckCheck size={12} className="text-gray-400 shrink-0" />
  if (ack >= 1) return <Check size={12} className="text-gray-400 shrink-0" />
  return <Clock size={11} className="text-gray-300 shrink-0" />
}

function MediaIcon({ type }) {
  const cls = "shrink-0 text-gray-400"
  if (type === 'image')    return <Image size={13} className={cls} />
  if (type === 'video')    return <Video size={13} className={cls} />
  if (type === 'audio' || type === 'ptt') return <Mic size={13} className={cls} />
  if (type === 'document') return <FileText size={13} className={cls} />
  return null
}

// ── ChatList ──────────────────────────────────────────────────────────────────
function InboxSection({ session, chats, selected, onSelect, collapsed, onToggle }) {
  const label    = session.instance_name || sessionShort(session.session_name, session.phone_number)
  const phone    = session.phone_number ? session.phone_number.replace(/@.*/, '') : null
  const working  = session.status === 'WORKING'
  const totalUnread = chats.reduce((s, c) => s + (c.unreadCount || 0), 0)

  return (
    <div className="border-b border-gray-100">
      {/* Header de bandeja */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${working ? 'bg-green-400' : 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-gray-700 truncate block">{label}</span>
          {phone && <span className="text-[10px] text-gray-400">{phone}</span>}
          {!working && <span className="text-[10px] text-gray-400">Desconectada</span>}
        </div>
        {totalUnread > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
        <ChevronRight size={13} className={`text-gray-300 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>

      {/* Conversaciones */}
      {!collapsed && chats.map(chat => {
        const isActive = selected && chat.id === selected.id && chat._session === selected._session
        const name  = chat.name || chat.id?.replace(/@.*/, '') || '?'
        const last  = chat.lastMessage
        const unread = chat.unreadCount || 0
        return (
          <button key={`${chat._session}:${chat.id}`} onClick={() => onSelect(chat)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left border-t border-gray-50 ${isActive ? 'bg-indigo-50' : 'hover:bg-gray-50/80'}`}>
            <Avatar name={name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1 mb-0.5">
                <span className={`text-[13px] font-semibold truncate ${isActive ? 'text-indigo-700' : 'text-gray-800'}`}>{name}</span>
                <span className={`text-[10px] shrink-0 ${unread > 0 ? 'text-indigo-500 font-semibold' : 'text-gray-400'}`}>{timeStr(last?.timestamp)}</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  {last?.fromMe && <AckIcon ack={last.ack} />}
                  {last?.type && last.type !== 'chat' && <MediaIcon type={last.type} />}
                  <span className="text-[11.5px] text-gray-400 truncate">{msgPreview(last)}</span>
                </div>
                {unread > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}

      {!collapsed && chats.length === 0 && (
        <p className="text-[11px] text-gray-300 px-4 py-3">{working ? 'Sin conversaciones' : 'Conectá el número para ver mensajes'}</p>
      )}
    </div>
  )
}

function ChatList({ chats, selected, onSelect, loading, sessions }) {
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState({})

  const toggle = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  const filtered = useMemo(() =>
    chats.filter(c => (c.name || c.id || '').toLowerCase().includes(q.toLowerCase()))
  , [chats, q])

  const bySessions = useMemo(() =>
    sessions.map(s => ({
      ...s,
      chats: filtered.filter(c => c._session === s.session_name),
    }))
  , [sessions, filtered])

  return (
    <div className="flex flex-col w-[280px] shrink-0 border-r border-gray-200 h-full bg-white">
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 shrink-0 border-b border-gray-200">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Inbox</p>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar conversaciones..."
            className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder-gray-400 min-w-0" />
          {q && <button onClick={() => setQ('')} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && chats.length === 0 && [...Array(3)].map((_, i) => (
          <div key={i} className="px-3 py-2.5 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
            <div className="flex items-center gap-2 mt-2">
              <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5"><div className="h-3 bg-gray-100 rounded w-3/4" /><div className="h-2.5 bg-gray-50 rounded w-1/2" /></div>
            </div>
          </div>
        ))}

        {!loading && sessions.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-10">Sin sesiones conectadas</p>
        )}

        {bySessions.map(s => (
          <InboxSection
            key={s.session_name}
            session={s}
            chats={s.chats}
            selected={selected}
            onSelect={onSelect}
            collapsed={!!collapsed[s.session_name]}
            onToggle={() => toggle(s.session_name)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Schedule Modal ────────────────────────────────────────────────────────────
function ScheduleModal({ chatId, session, onClose, onScheduled }) {
  const [text, setText]   = useState('')
  const [dt, setDt]       = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!text.trim() || !dt) return
    setSaving(true)
    try {
      await api.createScheduledMessage({ chatId, session, text: text.trim(), sendAt: dt })
      onScheduled?.()
      onClose()
    } catch {}
    setSaving(false)
  }

  // default datetime = now + 1h
  useEffect(() => {
    const d = new Date(Date.now() + 3600000)
    d.setSeconds(0, 0)
    setDt(d.toISOString().slice(0, 16))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Programar envío</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Mensaje…" rows={3}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-300 resize-none mb-3 placeholder-gray-400" />
        <input type="datetime-local" value={dt} onChange={e => setDt(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 mb-4" />
        <button onClick={handleSave} disabled={!text.trim() || !dt || saving}
          className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
          Programar
        </button>
      </div>
    </div>
  )
}

// ── MessageThread ─────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isMe = msg.fromMe
  const text = msg.body || msg.caption || ''
  const time = msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''
  const isMedia = msg.type && msg.type !== 'chat'
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[68%] rounded-2xl px-3 pt-2 pb-1.5 text-[13.5px] leading-relaxed break-words shadow-sm ${
        isMe ? 'bg-indigo-500 text-white rounded-br-[4px]' : 'bg-white text-gray-800 rounded-bl-[4px] border border-gray-100'}`}>
        {isMedia && (
          <div className={`flex items-center gap-1.5 mb-1 text-[12px] ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
            <MediaIcon type={msg.type} /><span className="italic">{msgPreview(msg)}</span>
          </div>
        )}
        {text && <span>{text}</span>}
        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>{time}</span>
          {isMe && <AckIcon ack={msg.ack} />}
        </div>
      </div>
    </div>
  )
}

function DateSep({ label }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="bg-gray-100 text-gray-400 text-[11px] px-3 py-0.5 rounded-full">{label}</span>
    </div>
  )
}

function MessageThread({ chat, messages, onSend, sending, starred, onToggleStar, aiActive, onToggleAi, onArchive }) {
  const [text, setText]           = useState('')
  const [recording, setRecording] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const bottomRef  = useRef(null)
  const mediaRef   = useRef(null)
  const chunksRef  = useRef([])
  const fileRef    = useRef(null)
  const name = chat.name || chat.id?.replace(/@.*/, '') || '?'

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  function handleSend(e) {
    e?.preventDefault()
    if (!text.trim() || sending) return
    onSend(text.trim())
    setText('')
  }

  // Adjuntar archivo
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await toBase64(file)
      await api.sendWahaFile(chat.id, chat._session, data, file.type, file.name)
    } catch (err) { alert('Error al enviar archivo: ' + err.message) }
    e.target.value = ''
  }

  // Grabar audio
  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1]
            await api.sendWahaVoice(chat.id, chat._session, base64)
          } catch (err) { alert('Error al enviar audio: ' + err.message) }
        }
        reader.readAsDataURL(blob)
      }
      mr.start()
      setRecording(true)
    } catch { alert('No se pudo acceder al micrófono') }
  }

  // Sugerencia IA
  async function handleAiSuggest() {
    setAiLoading(true)
    try {
      const res = await api.aiSuggest(messages, name)
      if (res.error === 'no_key') {
        alert('Configurá ANTHROPIC_API_KEY en el stack para usar sugerencias IA')
      } else if (res.suggestion) {
        setText(res.suggestion)
      }
    } catch {}
    setAiLoading(false)
  }

  const chronological = useMemo(() => [...messages].reverse(), [messages])
  const withSeps = useMemo(() => {
    const result = []
    let last = null
    for (const msg of chronological) {
      const lbl = dateLabel(msg.timestamp)
      if (lbl !== last) { result.push({ type: 'sep', label: lbl, id: `sep-${msg.timestamp}` }); last = lbl }
      result.push({ type: 'msg', msg, id: msg.id })
    }
    return result
  }, [chronological])

  return (
    <div className="flex flex-col flex-1 h-full min-w-0 bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <Avatar name={name} size={38} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-gray-800 leading-tight">{name}</p>
          <p className="text-[11px] text-gray-400 truncate">{chat.id}</p>
        </div>

        {/* Bandeja */}
        {chat._session && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 shrink-0">
            <Smartphone size={11} className="text-gray-400" />
            <span className="text-[11px] text-gray-500 font-medium">{sessionShort(chat._session, chat._phone)}</span>
          </div>
        )}

        {/* AI toggle */}
        <button
          onClick={onToggleAi}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 transition-colors ${aiActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${aiActive ? 'bg-indigo-500' : 'bg-gray-300'}`} />
          {aiActive ? 'IA Activa' : 'IA Inactiva'}
        </button>

        {/* Estrella */}
        <button
          onClick={onToggleStar}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          title={starred ? 'Quitar de importantes' : 'Marcar como importante'}
        >
          <Star size={15} className={starred ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
        </button>

        {/* Archivar */}
        <button
          onClick={onArchive}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          title="Archivar conversación"
        >
          <Archive size={15} className="text-gray-300 hover:text-gray-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-0.5">
        {messages.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">Sin mensajes</div>}
        {withSeps.map(item => item.type === 'sep'
          ? <DateSep key={item.id} label={item.label} />
          : <MessageBubble key={item.id} msg={item.msg} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-3 border-t border-gray-200 bg-white shrink-0">
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile}
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" />

        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => fileRef.current?.click()} title="Adjuntar archivo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors">
            <Paperclip size={16} />
          </button>
          <button onClick={toggleRecording} title={recording ? 'Detener grabación' : 'Grabar audio'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${recording ? 'text-red-500 bg-red-50 animate-pulse' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'}`}>
            {recording ? <StopCircle size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={() => setShowSchedule(true)} title="Programar envío"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors">
            <Calendar size={16} />
          </button>
          <button onClick={handleAiSuggest} disabled={aiLoading} title="Sugerir con IA"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-40">
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </button>
          {recording && <span className="text-[11px] text-red-400 font-medium ml-1">Grabando…</span>}
        </div>

        {/* Text + send */}
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(e) }}
            placeholder="Escribí un mensaje…"
            className="flex-1 bg-gray-100 border border-transparent rounded-2xl px-4 py-2.5 text-[13.5px] text-gray-800 outline-none focus:border-indigo-300 focus:bg-white placeholder-gray-400 transition-colors" />
          <button type="submit" disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-30 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0 shadow-sm">
            <Send size={15} className="text-white ml-0.5" />
          </button>
        </form>
      </div>

      {showSchedule && <ScheduleModal chatId={chat.id} session={chat._session} onClose={() => setShowSchedule(false)} />}
    </div>
  )
}

// ── Right Panel ───────────────────────────────────────────────────────────────
const PANEL_TABS = [
  { id: 'contact',       label: 'Contacto',      icon: User },
  { id: 'oportunidades', label: 'Oportunidades', icon: GitMerge },
  { id: 'tareas',        label: 'Tareas',        icon: CheckSquare },
]

function ContactTab({ chat, projectId }) {
  const phone = chatPhone(chat.id)
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    setContact(null); setLoading(true); setEditing(false)
    api.getContacts(projectId, { phone, limit: 1 })
      .then(d => {
        const list = Array.isArray(d) ? d : (d?.leads || [])
        const c = list[0] || null
        setContact(c)
        if (c) setForm({ fullname: c.fullname || '', email: c.email || '', phone: c.phone || phone, company: c.company || '', note: c.note || '' })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [chat.id, projectId])

  async function handleSave() {
    setSaving(true)
    try {
      if (contact) {
        await api.updateContact(projectId, contact._id, form)
        setContact(c => ({ ...c, ...form }))
      } else {
        const created = await api.createContact(projectId, { ...form, phone: form.phone || phone })
        setContact(created)
      }
      setEditing(false)
    } catch (e) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-20"><Loader2 size={18} className="animate-spin text-gray-300" /></div>

  const F = ({ label, field, type = 'text' }) => (
    <div>
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {editing
        ? <input type={type} value={form[field] || ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 outline-none focus:border-indigo-300" />
        : <p className="text-[13px] text-gray-700">{(contact && contact[field]) || <span className="text-gray-300 italic">—</span>}</p>
      }
    </div>
  )

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={contact?.fullname || chat.name || phone} size={36} />
          <div>
            <p className="text-[13px] font-semibold text-gray-800">{contact?.fullname || chat.name || phone}</p>
            <p className="text-[11px] text-gray-400">{phone}</p>
          </div>
        </div>
        <button onClick={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
          className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${editing ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : editing ? <Save size={12} /> : <Edit2 size={12} />}
          {editing ? 'Guardar' : 'Editar'}
        </button>
      </div>
      <div className="space-y-3 border-t border-gray-100 pt-3">
        <F label="Nombre" field="fullname" />
        <F label="Email" field="email" type="email" />
        <F label="Teléfono" field="phone" />
        <F label="Empresa" field="company" />
        <F label="Nota" field="note" />
      </div>
      {editing && (
        <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
          Cancelar
        </button>
      )}
      {!contact && !editing && (
        <button onClick={() => setEditing(true)}
          className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-[12px] text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
          + Crear contacto
        </button>
      )}
    </div>
  )
}

function OportunidadesTab({ chat, projectId }) {
  const phone = chatPhone(chat.id)
  const [contact, setContact]   = useState(null)
  const [funnels, setFunnels]   = useState([])
  const [stages, setStages]     = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getContacts(projectId, { phone, limit: 1 }).then(d => (Array.isArray(d) ? d : d?.leads || [])[0] || null),
      api.getFunnels(),
      api.getFunnelStages(),
    ]).then(([c, f, s]) => {
      setContact(c)
      setFunnels(Array.isArray(f) ? f : [])
      setStages(Array.isArray(s) ? s : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [chat.id, projectId])

  if (loading) return <div className="flex items-center justify-center h-20"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
  if (!contact) return <p className="p-4 text-[12px] text-gray-400 text-center">Creá el contacto primero para ver oportunidades</p>

  const contactStages = stages.filter(s => s.lead_id === contact._id)

  if (contactStages.length === 0) return (
    <div className="p-4 text-center">
      <GitMerge size={24} className="text-gray-200 mx-auto mb-2" />
      <p className="text-[12px] text-gray-400">Sin oportunidades registradas</p>
      <p className="text-[11px] text-gray-300 mt-0.5">Agregá este contacto desde Embudos</p>
    </div>
  )

  return (
    <div className="p-4 space-y-2">
      {contactStages.map(cs => {
        const funnel = funnels.find(f => {
          const stgs = typeof f.stages === 'string' ? JSON.parse(f.stages) : f.stages
          return stgs?.some(st => st.id === cs.stage || st.label === cs.stage)
        })
        const stageList = funnel ? (typeof funnel.stages === 'string' ? JSON.parse(funnel.stages) : funnel.stages) : []
        const stageInfo = stageList.find(st => st.id === cs.stage || st.label === cs.stage)
        return (
          <div key={cs.lead_id + cs.stage} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stageInfo?.color || '#6366f1' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-gray-700 truncate">{funnel?.name || 'Embudo'}</p>
              <p className="text-[11px] text-gray-400">{stageInfo?.label || cs.stage}</p>
            </div>
            <ChevronRight size={13} className="text-gray-300 shrink-0" />
          </div>
        )
      })}
    </div>
  )
}

const PRIORITY_MINI = {
  low:    { label: 'Baja',    dot: '#9ca3af' },
  normal: { label: 'Normal',  dot: '#3b82f6' },
  high:   { label: 'Alta',    dot: '#f97316' },
  urgent: { label: 'Urgente', dot: '#ef4444' },
}

function TareasTab({ chat, projectId }) {
  const phone = chatPhone(chat.id)
  const [contact,  setContact]  = useState(null)
  const [tasks,    setTasks]    = useState([])
  const [agents,   setAgents]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ title: '', priority: 'normal', assignee_id: '', assignee_name: '', due_date: '' })
  const [saving, setSaving]     = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [contacts, members] = await Promise.all([
        api.getContacts(projectId, { phone, limit: 1 }),
        api.getWorkspaceMembers().catch(() => []),
      ])
      const c = (Array.isArray(contacts) ? contacts : contacts?.leads || [])[0] || null
      setContact(c)
      setAgents(Array.isArray(members) ? members.map(m => ({ _id: m.id, firstname: m.name || m.email, lastname: '', email: m.email })) : [])
      if (c) {
        const t = await api.getTasks({ lead_id: c._id })
        setTasks(Array.isArray(t) ? t : [])
      }
    } catch {}
    setLoading(false)
  }, [chat.id, projectId])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleToggle(task) {
    const updated = await api.updateTask(task.id, { status: task.status === 'done' ? 'pending' : 'done' })
    setTasks(ts => ts.map(t => t.id === task.id ? updated : t))
  }

  async function handleCreate() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api.createTask({
        ...form,
        lead_id:   contact?._id || null,
        lead_name: contact?.fullname || chat.name || phone,
        due_date:  form.due_date ? Math.floor(new Date(form.due_date).getTime() / 1000) : null,
      })
      setForm({ title: '', priority: 'normal', assignee_id: '', assignee_name: '', due_date: '' })
      setShowForm(false)
      await loadAll()
    } catch {}
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-20"><Loader2 size={16} className="animate-spin text-gray-300" /></div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !showForm && (
          <div className="p-4 text-center">
            <CheckSquare size={22} className="text-gray-200 mx-auto mb-1.5" />
            <p className="text-[12px] text-gray-400">Sin tareas para este contacto</p>
          </div>
        )}
        {tasks.map(task => {
          const p = PRIORITY_MINI[task.priority] || PRIORITY_MINI.normal
          const done = task.status === 'done'
          return (
            <div key={task.id} className={`flex items-start gap-2 px-4 py-3 border-b border-gray-100 ${done ? 'opacity-50' : ''}`}>
              <button onClick={() => handleToggle(task)} className="mt-0.5 shrink-0">
                {done
                  ? <CheckCircle2 size={15} className="text-indigo-400" />
                  : <Circle size={15} className="text-gray-300 hover:text-indigo-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-[12.5px] font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.title}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.dot }} />{p.label}
                  </span>
                  {task.assignee_name && <span className="text-[10px] text-gray-400">· {task.assignee_name}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick add */}
      {showForm ? (
        <div className="p-3 border-t border-gray-100 space-y-2">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Título de la tarea…" autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12.5px] text-gray-700 outline-none focus:border-indigo-300 placeholder-gray-300" />
          <div className="flex gap-2">
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-xl px-2 py-1.5 text-[11px] text-gray-600 outline-none focus:border-indigo-300 bg-white">
              {Object.entries(PRIORITY_MINI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={form.assignee_id} onChange={e => {
              const ag = agents.find(a => a._id === e.target.value)
              setForm(f => ({ ...f, assignee_id: e.target.value, assignee_name: ag ? (`${ag.firstname || ''} ${ag.lastname || ''}`.trim() || ag.email) : '' }))
            }} className="flex-1 border border-gray-200 rounded-xl px-2 py-1.5 text-[11px] text-gray-600 outline-none focus:border-indigo-300 bg-white">
              <option value="">Sin asignar</option>
              {agents.map(a => <option key={a._id} value={a._id}>{`${a.firstname || ''} ${a.lastname || ''}`.trim() || a.email}</option>)}
            </select>
          </div>
          <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-[11px] text-gray-600 outline-none focus:border-indigo-300" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-1.5 rounded-xl border border-gray-200 text-[12px] text-gray-400 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={!form.title.trim() || saving}
              className="flex-1 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-medium disabled:opacity-40 flex items-center justify-center gap-1">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-gray-100">
          <button onClick={() => setShowForm(true)}
            className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-[12px] text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-1">
            <Plus size={13} /> Nueva tarea
          </button>
        </div>
      )}
    </div>
  )
}

function RightPanel({ chat }) {
  const { project } = useAuth()
  const projectId = project?._id || project?.id
  const [tab, setTab] = useState('contact')

  useEffect(() => { setTab('contact') }, [chat?.id])

  if (!chat) return null

  return (
    <div className="flex flex-col w-[260px] shrink-0 border-l border-gray-200 h-full bg-white">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 shrink-0">
        {PANEL_TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-b-2 ${
                tab === t.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'contact'       && <ContactTab chat={chat} projectId={projectId} />}
        {tab === 'oportunidades' && <OportunidadesTab chat={chat} projectId={projectId} />}
        {tab === 'tareas'        && <TareasTab chat={chat} projectId={projectId} />}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Conversations() {
  const [chats,    setChats]    = useState([])
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [starred,  setStarred]  = useState(new Set())  // Set of `${session}:${id}`
  const [aiActive, setAiActive] = useState(new Set())  // Set of `${session}:${id}`

  const chatKey = (c) => c ? `${c._session}:${c.id}` : null

  const loadChats = useCallback(async () => {
    try {
      const [sessionRows, chatsData] = await Promise.all([
        api.getWahaSessions().catch(() => []),
        api.getWahaChats().catch(() => []),
      ])
      setChats(chatsData || [])
      setSessions(sessionRows || [])
    } catch {}
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async () => {
    if (!selected?.id) return
    try { setMessages(await api.getWahaMessages(selected.id, selected._session) || []) } catch {}
  }, [selected?.id, selected?._session])

  useEffect(() => { loadChats(); const t = setInterval(loadChats, 5000); return () => clearInterval(t) }, [loadChats])

  useEffect(() => {
    if (!selected) return
    setMessages([])
    loadMessages()
    api.markChatRead(selected.id, selected._session).catch(() => {})
    const t = setInterval(loadMessages, 3000)
    return () => clearInterval(t)
  }, [selected?.id, selected?._session, loadMessages])

  async function handleSend(text) {
    setSending(true)
    try { await api.sendWahaMessage(selected.id, text, selected._session); await loadMessages() } catch {}
    setSending(false)
  }

  function handleToggleStar() {
    const k = chatKey(selected)
    if (!k) return
    setStarred(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s })
  }

  function handleToggleAi() {
    const k = chatKey(selected)
    if (!k) return
    setAiActive(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s })
  }

  function handleArchive() {
    if (!selected) return
    setChats(prev => prev.filter(c => !(c.id === selected.id && c._session === selected._session)))
    setSelected(null)
  }

  if (!loading && sessions.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6 bg-gray-50">
      <div className="w-14 h-14 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
        <MessageSquare size={26} className="text-indigo-400" />
      </div>
      <div>
        <p className="text-gray-700 font-semibold text-sm">Sin conversaciones</p>
        <p className="text-gray-400 text-xs mt-1">Conectá un número en Configuración → Canales</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden">
      <ChatList chats={chats} sessions={sessions} selected={selected}
        onSelect={chat => {
          setSelected(chat)
          setChats(prev => prev.map(c => c.id === chat.id && c._session === chat._session ? { ...c, unreadCount: 0 } : c))
        }}
        loading={loading} />

      {selected
        ? <MessageThread
            chat={selected}
            messages={messages}
            onSend={handleSend}
            sending={sending}
            starred={starred.has(chatKey(selected))}
            onToggleStar={handleToggleStar}
            aiActive={aiActive.has(chatKey(selected))}
            onToggleAi={handleToggleAi}
            onArchive={handleArchive}
          />
        : <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50">
            <MessageSquare size={32} className="text-gray-200" />
            <p className="text-gray-400 text-sm">Seleccioná una conversación</p>
          </div>
      }

      <RightPanel chat={selected} />
    </div>
  )
}
