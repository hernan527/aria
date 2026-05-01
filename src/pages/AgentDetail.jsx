import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { Spinner } from '../components/ui/Spinner'
import {
  ArrowLeft, Save, Send, Loader2, X, Upload,
  FileText, Settings2, Paperclip, Lock, Check, ChevronDown, User,
  Globe, MessageSquare, Trash2, Plus, Brain,
} from 'lucide-react'

const inputCls  = 'w-full bg-[#1a1a2e] text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20'

// ── ChipSelect (reutilizado del wizard) ───────────────────────────────────────

function ChipSelect({ label, options, selected, onToggle, defaultLabel, userIcons }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isAll   = selected.includes('__all__')
  const selOpts = isAll ? [] : options.filter(o => selected.includes(o.id))

  return (
    <div>
      {label && <p className="text-xs font-medium text-white/50 mb-1.5">{label}</p>}
      <div ref={ref} className="relative">
        <div onClick={() => setOpen(v => !v)}
          className="flex flex-wrap items-center gap-1.5 min-h-[42px] px-2.5 py-2 rounded-xl border border-white/10 bg-[#1a1a2e] cursor-pointer hover:border-white/20 transition-colors">
          {isAll && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/12 text-xs text-white/70">
              <Lock size={11} className="text-white/40 shrink-0" />{defaultLabel}
            </span>
          )}
          {selOpts.map(o => (
            <span key={o.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-aria-500/20 border border-aria-500/30 text-xs text-aria-300">
              {userIcons && <User size={10} className="shrink-0" />}
              {o.label}
              <button type="button" onClick={e => { e.stopPropagation(); onToggle(o.id) }}
                className="text-aria-400 hover:text-white ml-0.5"><X size={10} /></button>
            </span>
          ))}
          <ChevronDown size={14} className={`ml-auto text-white/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        {open && (
          <div className="absolute z-30 top-full mt-1 w-full bg-[#1a1a2e] border border-white/15 rounded-xl shadow-2xl overflow-hidden">
            <button type="button" onClick={() => { onToggle('__all__'); setOpen(false) }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-white/5 text-sm text-left">
              <Lock size={13} className="text-white/35 shrink-0" />
              <span className={`flex-1 ${isAll ? 'text-white' : 'text-white/60'}`}>{defaultLabel}</span>
              {isAll && <Check size={13} className="text-aria-400 shrink-0" />}
            </button>
            {options.length > 0 && <div className="h-px bg-white/8 mx-3" />}
            {options.map(o => (
              <button key={o.id} type="button" onClick={() => onToggle(o.id)}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-white/5 text-sm text-left">
                {userIcons && <User size={13} className="text-white/35 shrink-0" />}
                <span className={`flex-1 ${selected.includes(o.id) ? 'text-white' : 'text-white/60'}`}>{o.label}</span>
                {selected.includes(o.id) && <Check size={13} className="text-aria-400 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Playground (Tiledesk real) ────────────────────────────────────────────────

function Playground({ botId, projectId }) {
  const [msgs,    setMsgs]    = useState([])
  const [text,    setText]    = useState('')
  const [loading, setLoading] = useState(false)
  const [initing, setIniting] = useState(false)
  const bottomRef  = useRef()
  const sessionRef = useRef(false)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  useEffect(() => {
    if (!botId || !projectId || sessionRef.current) return
    initSession()
  }, [botId, projectId]) // eslint-disable-line

  async function initSession() {
    sessionRef.current = true
    setIniting(true)
    try {
      const res = await api.testChat(botId, { projectId, reset: true })
      if (res.welcome) setMsgs([{ role: 'assistant', content: res.welcome }])
    } catch {
      setMsgs([{ role: 'assistant', content: '(Error al iniciar la sesión con el bot)' }])
    }
    setIniting(false)
  }

  async function send(e) {
    e.preventDefault()
    if (!text.trim() || loading || initing) return
    const userText = text.trim()
    setMsgs(h => [...h, { role: 'user', content: userText }])
    setText('')
    setLoading(true)
    try {
      const res = await api.testChat(botId, { projectId, text: userText })
      setMsgs(h => [...h, { role: 'assistant', content: res.reply || '(sin respuesta — intentá de nuevo)' }])
    } catch {
      setMsgs(h => [...h, { role: 'assistant', content: 'Error al conectar con el bot.' }])
    }
    setLoading(false)
  }

  async function reset() {
    sessionRef.current = false
    setMsgs([])
    setText('')
    await initSession()
  }

  return (
    <div className="flex flex-col h-full bg-[#12121e] rounded-xl border border-white/8">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white">Probá el Agente</p>
          <p className="text-[11px] text-white/35 mt-0.5">Chat en tiempo real con Tiledesk</p>
        </div>
        {msgs.length > 0 && !initing && (
          <button onClick={reset} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
            Nueva conv.
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {initing && (
          <div className="flex justify-start mt-4">
            <div className="px-3 py-2 rounded-xl bg-white/8 flex items-center gap-1.5">
              <Loader2 size={12} className="text-white/40 animate-spin" />
              <span className="text-[10px] text-white/30">Iniciando conversación...</span>
            </div>
          </div>
        )}
        {!initing && msgs.length === 0 && (
          <p className="text-xs text-white/20 text-center mt-8 px-4">
            El agente está listo. Escribí un mensaje.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed
              ${m.role === 'user' ? 'bg-aria-500 text-white' : 'bg-white/8 text-white/80'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl bg-white/8 flex items-center gap-1.5">
              <Loader2 size={12} className="text-white/40 animate-spin" />
              <span className="text-[10px] text-white/30">pensando...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 p-3 border-t border-white/8">
        <input value={text} onChange={e => setText(e.target.value)}
          placeholder="Escribí un mensaje..."
          disabled={initing}
          className="flex-1 bg-white/5 text-white text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-aria-500 placeholder:text-white/20 transition-colors disabled:opacity-40" />
        <button type="submit" disabled={!text.trim() || loading || initing}
          className="p-2 rounded-lg bg-aria-500 hover:bg-aria-600 disabled:opacity-40 transition-colors">
          <Send size={13} className="text-white" />
        </button>
      </form>
    </div>
  )
}

// ── Tab: Instrucciones ────────────────────────────────────────────────────────

function TabInstrucciones({ meta, botId, projectId, onSaved }) {
  const [instructions, setInstructions] = useState(meta?.instructions || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.saveAgentInstructions(botId, {
        instructions,
        projectId,
        template_id: meta?.template_id,
      })
      onSaved()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <p className="text-xs text-white/40 leading-relaxed">
          Puedes editar las instrucciones temporalmente para probar
        </p>
      </div>
      <textarea
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        className="flex-1 bg-[#1a1a2e] text-white text-xs px-3.5 py-3 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors resize-none leading-relaxed"
        style={{ minHeight: 300 }}
        placeholder="Instrucciones del agente..."
      />
      <div className="flex justify-between">
        <span />
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Guardar
        </button>
      </div>
    </div>
  )
}

// ── Tab: Configuración ────────────────────────────────────────────────────────

function TabConfiguracion({ meta, botId, projectId, channels, agents, onSaved }) {
  const parse = (v, def) => { try { return JSON.parse(v) } catch { return def } }

  const [temperature, setTemperature]     = useState(meta?.temperature ?? 1.0)
  const [topP,        setTopP]            = useState(meta?.top_p ?? 1.0)
  const [selChannels, setSelChannels]     = useState(parse(meta?.channels, ['__all__']))
  const [selUsers,    setSelUsers]        = useState(parse(meta?.derivation_users, ['__all__']))
  const [saving,      setSaving]          = useState(false)

  const channelOptions = (channels || []).map(c => ({ id: c.id, label: c.instance_name || c.session_name }))
  const agentOptions   = (agents  || []).map(a => ({
    id: a._id,
    label: a.firstname ? `${a.firstname} ${a.lastname || ''}`.trim() : a.email,
  }))

  function toggleChannel(id) {
    setSelChannels(prev => {
      if (id === '__all__') return ['__all__']
      const next = prev.includes('__all__') ? [] : [...prev]
      const updated = next.includes(id) ? next.filter(x => x !== id) : [...next, id]
      return updated.length ? updated : ['__all__']
    })
  }

  function toggleUser(id) {
    setSelUsers(prev => {
      if (id === '__all__') return ['__all__']
      const next = prev.includes('__all__') ? [] : [...prev]
      const updated = next.includes(id) ? next.filter(x => x !== id) : [...next, id]
      return updated.length ? updated : ['__all__']
    })
  }

  async function save() {
    setSaving(true)
    try {
      await api.saveAgentConfig(botId, {
        temperature, top_p: topP,
        channels: selChannels, derivation_users: selUsers,
        projectId, template_id: meta?.template_id,
      })
      onSaved()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">
          Creatividad (temperatura): {Number(temperature).toFixed(1)}
        </label>
        <p className="text-[11px] text-white/30 mb-2 leading-relaxed">
          Controla que tan imaginativas son las respuestas. Más alto = más creativo; más bajo = más predecible.
        </p>
        <input type="range" min={0} max={2} step={0.1} value={temperature}
          onChange={e => setTemperature(parseFloat(e.target.value))}
          className="w-full accent-aria-500 h-1.5 rounded-full cursor-pointer" />
        <div className="flex justify-between text-[10px] text-white/25 mt-0.5 px-0.5"><span>0</span><span>2</span></div>
      </div>

      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">
          Foco (top_p): {Number(topP).toFixed(2)}
        </label>
        <p className="text-[11px] text-white/30 mb-2 leading-relaxed">
          Determina cuántas respuestas potenciales considera el agente. Más alto = más variedad; más bajo = más consistente.
        </p>
        <input type="range" min={0} max={1} step={0.05} value={topP}
          onChange={e => setTopP(parseFloat(e.target.value))}
          className="w-full accent-aria-500 h-1.5 rounded-full cursor-pointer" />
        <div className="flex justify-between text-[10px] text-white/25 mt-0.5 px-0.5"><span>0</span><span>1</span></div>
      </div>

      <ChipSelect label="Canal" options={channelOptions} selected={selChannels}
        onToggle={toggleChannel} defaultLabel="Canales en general" />

      <ChipSelect label="Selección de usuarios para derivar" options={agentOptions}
        selected={selUsers} onToggle={toggleUser} defaultLabel="Tomar por usuarios" userIcons />

      <div className="flex justify-between pt-2">
        <span />
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Guardar
        </button>
      </div>
    </div>
  )
}

// ── Tab: Adjuntos ─────────────────────────────────────────────────────────────

function TabAdjuntos({ botId, refreshKey }) {
  const fileRef  = useRef()
  const [drag,   setDrag]    = useState(false)
  const [saving, setSaving]  = useState(false)
  const [pending, setPending] = useState([])  // archivos pendientes a subir

  const { data: files, refetch } = useApi(() => api.getAgentFiles(botId), [botId, refreshKey])
  const fileList = Array.isArray(files) ? files : []

  async function upload() {
    if (!pending.length) return
    setSaving(true)
    try {
      const form = new FormData()
      pending.forEach(f => form.append('file', f))
      await fetch(`/api/agents/${botId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('aria_token')}` },
        body: form,
      })
      setPending([])
      refetch?.()
    } catch {}
    setSaving(false)
  }

  async function deleteFile(fileId) {
    try { await api.deleteAgentFile(botId, fileId); refetch?.() } catch {}
  }

  const addPending = (newFiles) => {
    const allowed = ['.pdf','.doc','.docx','.pptx','.txt','.md','.json','.html']
    const valid = Array.from(newFiles).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      return allowed.includes(ext)
    })
    setPending(prev => [...prev, ...valid].slice(0, Math.max(0, 3 - fileList.length)))
  }

  const formatSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${Math.round(b/1024)} KB`

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-white/70 mb-0.5">Archivos (máx. 3 archivos, 5 MB c/u)</p>
        <p className="text-xs text-white/35">Tipos de archivos: .pdf, .doc, .docx, .pptx, .txt, .md, .json, .html</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addPending(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${drag ? 'border-aria-500 bg-aria-500/10' : 'border-white/10 hover:border-white/20'}`}>
        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.doc,.docx,.pptx,.txt,.md,.json,.html"
          onChange={e => addPending(e.target.files)} />
        <Upload size={22} className="mx-auto mb-2 text-white/30" />
        <p className="text-xs text-white/40">Haz clic para seleccionar archivos o arrastra y suelta aquí</p>
      </div>

      {/* Archivos pendientes */}
      {pending.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-white/40 mb-1">Pendientes de subir:</p>
          {pending.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-aria-500/10 border border-aria-500/20 text-xs text-white/70">
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-white/30 ml-2 shrink-0">{formatSize(f.size)}</span>
              <button onClick={() => setPending(p => p.filter((_, idx) => idx !== i))}
                className="text-white/30 hover:text-red-400 ml-2"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Archivos subidos */}
      {fileList.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-white/40 mb-1">Archivos subidos:</p>
          {fileList.map(f => (
            <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/4 border border-white/8 text-xs text-white/70">
              <FileText size={13} className="text-white/30 shrink-0 mr-2" />
              <span className="truncate flex-1">{f.filename}</span>
              <span className="text-white/30 ml-2 shrink-0">{formatSize(f.size)}</span>
              <button onClick={() => deleteFile(f.id)}
                className="text-white/30 hover:text-red-400 ml-2"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <span />
        <button onClick={upload} disabled={saving || !pending.length}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Guardar archivos
        </button>
      </div>
    </div>
  )
}

// ── Tab: Base de Conocimiento (Tiledesk native KB) ───────────────────────────

const KB_ST_LABEL = { '-1': 'pendiente', 100: 'en cola', 200: 'indexando', 300: 'indexado', 400: 'error' }
const KB_ST_COLOR = { '-1': 'text-white/30', 100: 'text-yellow-400', 200: 'text-blue-400', 300: 'text-green-400', 400: 'text-red-400' }

function TabKB({ botId, projectId, namespaceId }) {
  const [kbItems, setKbItems] = useState([])
  const [nsId,    setNsId]    = useState(namespaceId || null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [deleting,setDeleting]= useState(null)
  const [error,   setError]   = useState('')
  const [subTab,  setSubTab]  = useState('url')

  const [urlInput, setUrlInput] = useState('')
  const [faqQ, setFaqQ] = useState('')
  const [faqA, setFaqA] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textBody, setTextBody] = useState('')

  async function loadKb(ns) {
    const id = ns || nsId
    if (!projectId || !id) return
    setLoading(true)
    const data = await api.getKbContents(projectId, id).catch(() => null)
    setKbItems(Array.isArray(data?.kbs) ? data.kbs : [])
    setLoading(false)
  }

  useEffect(() => {
    if (namespaceId) {
      setNsId(namespaceId)
      loadKb(namespaceId)
    } else if (botId && projectId) {
      // Bot antiguo sin namespace → crear uno automáticamente
      api.ensureKbNamespace(botId, projectId)
        .then(({ namespaceId: id }) => { setNsId(id); loadKb(id) })
        .catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [namespaceId]) // eslint-disable-line

  async function add(payload) {
    if (!nsId) return
    setSaving(true); setError('')
    try {
      await api.createKbContent(projectId, { ...payload, namespace: nsId })
      await loadKb()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  async function del(id) {
    setDeleting(id)
    try { await api.deleteKbContent(projectId, id); await loadKb() }
    catch (e) { setError(e.message) }
    setDeleting(null)
  }

  const SUB_TABS = [
    { id: 'url',  icon: Globe,         label: 'Sitio web' },
    { id: 'faq',  icon: MessageSquare, label: 'FAQ'       },
    { id: 'text', icon: FileText,      label: 'Texto'     },
  ]

  const inputCls2 = 'w-full bg-[#1a1a2e] text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20'

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-white/70">Base de Conocimiento (Tiledesk)</p>
        <p className="text-xs text-white/35 mt-0.5">
          El contenido se guarda en el KB nativo de Tiledesk y es indexado automáticamente.
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SUB_TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} type="button" onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap
                ${subTab === t.id ? 'bg-aria-500/20 text-aria-300 border border-aria-500/30' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs text-red-400 px-1">{error}</p>}

      {subTab === 'url' && (
        <div className="space-y-2">
          <p className="text-xs text-white/40">Pegá una URL — Tiledesk la va a scrapear e indexar automáticamente.</p>
          <div className="flex gap-2">
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { add({ type: 'url', name: urlInput, source: urlInput, content: '' }); setUrlInput('') } }}
              placeholder="https://miempresa.com/pagina" className={inputCls2 + ' flex-1'} />
            <button type="button" disabled={saving || !urlInput.trim()}
              onClick={() => { add({ type: 'url', name: urlInput.trim(), source: urlInput.trim(), content: '' }); setUrlInput('') }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar
            </button>
          </div>
        </div>
      )}

      {subTab === 'faq' && (
        <div className="space-y-3">
          <input value={faqQ} onChange={e => setFaqQ(e.target.value)} placeholder="Pregunta" className={inputCls2} />
          <textarea value={faqA} onChange={e => setFaqA(e.target.value)} placeholder="Respuesta" rows={3}
            className={inputCls2 + ' resize-none'} />
          <button type="button" disabled={saving || !faqQ.trim() || !faqA.trim()}
            onClick={() => { add({ type: 'faq', name: faqQ.trim(), content: `${faqQ.trim()}\n${faqA.trim()}` }); setFaqQ(''); setFaqA('') }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar FAQ
          </button>
        </div>
      )}

      {subTab === 'text' && (
        <div className="space-y-3">
          <input value={textTitle} onChange={e => setTextTitle(e.target.value)} placeholder="Título (opcional)" className={inputCls2} />
          <textarea value={textBody} onChange={e => setTextBody(e.target.value)}
            placeholder="Información que el agente debe conocer..." rows={5}
            className={inputCls2 + ' resize-none'} />
          <button type="button" disabled={saving || !textBody.trim()}
            onClick={() => { add({ type: 'text', name: textTitle.trim() || 'Texto', content: textBody.trim() }); setTextTitle(''); setTextBody('') }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar texto
          </button>
        </div>
      )}

      {loading && <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-white/30" /></div>}
      {!loading && kbItems.length === 0 && (
        <p className="text-xs text-white/25 text-center py-4">KB vacía. Agregá contenido arriba.</p>
      )}
      {!loading && kbItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/40 font-medium">{kbItems.length} elemento{kbItems.length !== 1 ? 's' : ''}</p>
          {kbItems.map(item => {
            const icons = { url: Globe, faq: MessageSquare, text: FileText, pdf: Paperclip, docx: Paperclip }
            const Icon = icons[item.type] || FileText
            const id = item._id || item.id
            const sk = String(item.status ?? '-1')
            return (
              <div key={id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white/4 border border-white/8">
                <Icon size={14} className="text-white/30 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/80 font-medium truncate">{item.name || `(${item.type})`}</p>
                  {item.source && <p className="text-[11px] text-white/35 mt-0.5 truncate">{item.source}</p>}
                  <p className={`text-[10px] mt-0.5 ${KB_ST_COLOR[sk] || 'text-white/30'}`}>
                    {KB_ST_LABEL[sk] || sk}
                  </p>
                </div>
                <button onClick={() => del(id)} disabled={deleting === id}
                  className="text-white/20 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                  {deleting === id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'instrucciones', label: 'Instrucciones', icon: FileText },
  { id: 'configuracion', label: 'Configuración',  icon: Settings2 },
  { id: 'kb',            label: 'Conocimiento',   icon: Brain },
  { id: 'adjuntos',      label: 'Archivos',        icon: Paperclip },
]

export default function AgentDetail() {
  const navigate    = useNavigate()
  const { botId }   = useParams()
  const location    = useLocation()
  const { project } = useAuth()
  const projectId   = project?._id || project?.id

  const initialTab = location.state?.tab || 'instrucciones'
  const [tab,        setTab]        = useState(initialTab)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: metadata }  = useApi(() => api.getAgentMetadata(),         [refreshKey])
  const { data: channels  } = useApi(() => api.getWahaSessions(),           [])
  const { data: agentList } = useApi(() => api.getAgents(projectId),        [projectId])
  const { data: bots      } = useApi(() => api.getBots(projectId),          [projectId])

  const meta = Array.isArray(metadata) ? metadata.find(m => m.bot_id === botId) : null
  const bot  = Array.isArray(bots)     ? bots.find(b => b._id === botId)        : null

  const instructions = meta?.instructions || ''

  if (!bot && !meta) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0d0d1a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
        <button onClick={() => navigate('/agents')}
          className="w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-colors">
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">{bot?.name || meta?.company_name || botId}</h1>
          <p className="text-xs text-white/35">{meta?.tone || 'Agente IA'}{meta?.nationality ? ` · ${meta.nationality}` : ''}</p>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}>
                <Icon size={13} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Body: split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: tabs content */}
        <div className="flex-1 overflow-y-auto p-6 min-w-0">
          {tab === 'instrucciones' && (
            <TabInstrucciones
              meta={meta} botId={botId} projectId={projectId}
              onSaved={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'configuracion' && (
            <TabConfiguracion
              meta={meta} botId={botId} projectId={projectId}
              channels={Array.isArray(channels) ? channels : []}
              agents={Array.isArray(agentList) ? agentList : []}
              onSaved={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'kb' && (
            <TabKB botId={botId} projectId={projectId} namespaceId={meta?.kb_namespace_id} />
          )}
          {tab === 'adjuntos' && (
            <TabAdjuntos botId={botId} refreshKey={refreshKey} />
          )}
        </div>

        {/* Right: playground siempre visible */}
        <div className="w-[380px] shrink-0 border-l border-white/8 p-4 hidden lg:flex flex-col">
          <Playground botId={botId} projectId={projectId} />
        </div>
      </div>
    </div>
  )
}
