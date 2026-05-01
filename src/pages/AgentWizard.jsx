import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import {
  ArrowLeft, ArrowRight, Bot, BookOpen, Brain, Settings2,
  Sparkles, Save, Plus, X, Upload, Send,
  UserCheck, HelpCircle, Plane, ShieldCheck, Car, PiggyBank,
  CheckCircle2, Loader2, Lock, Check, ChevronDown,
  Globe, FileText, MessageSquare, FileUp, Trash2,
} from 'lucide-react'

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'lead-qualifier',        template_id: 'chatgpt-task', icon: UserCheck,  color: '#6b7fff', name: 'Agente Calificador de Leads',      desc: 'Califica leads con IA — responde preguntas y deriva cuando corresponde.' },
  { id: 'faq',                   template_id: 'chatgpt-task', icon: HelpCircle, color: '#34d399', name: 'Agente de Preguntas Frecuentes',   desc: 'Responde automáticamente preguntas comunes usando IA y tu base de conocimiento.' },
  { id: 'travel',                template_id: 'chatgpt-task', icon: Plane,      color: '#f59e0b', name: 'Agente para Agencias de Viajes',  desc: 'Asiste y califica leads para agencias de viajes con IA.' },
  { id: 'broker',                template_id: 'chatgpt-task', icon: ShieldCheck,color: '#a78bfa', name: 'Agente para Brokers de Salud',    desc: 'Califica leads para brokers de obras sociales y prepagas.' },
  { id: 'concesionaria-directa', template_id: 'chatgpt-task', icon: Car,        color: '#f97316', name: 'Agente para Concesionarias',      desc: 'Califica leads para concesionarias — test drive listo.' },
  { id: 'concesionaria-plan',    template_id: 'chatgpt-task', icon: PiggyBank,  color: '#ec4899', name: 'Agente para Plan Ahorro',         desc: 'Precalifica consultas de plan ahorro vehicular.' },
]

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, icon: BookOpen,  label: 'Datos básicos'       },
  { n: 2, icon: Brain,     label: 'Base de conocimiento' },
  { n: 3, icon: Settings2, label: 'Datos técnicos'      },
  { n: 4, icon: Sparkles,  label: 'Generar'             },
  { n: 5, icon: Bot,       label: 'Instrucciones'       },
]

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Field({ label, required, description, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/70 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {description && <p className="text-xs text-white/35 mb-2 leading-relaxed">{description}</p>}
      {children}
    </div>
  )
}

const inputCls  = 'w-full bg-[#1a1a2e] text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20'
const selectCls = inputCls + ' cursor-pointer'

// ── ChipSelect (multi-select con dropdown) ────────────────────────────────────

function ChipSelect({ label, options, selected, onToggle, defaultLabel, warning }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isAllSelected = selected.includes('__all__')
  const selectedOptions = isAllSelected ? [] : options.filter(o => selected.includes(o.id))

  return (
    <Field label={label}>
      <div ref={ref} className="relative">
        {/* Chips container — clickeable para abrir */}
        <div
          onClick={() => setOpen(v => !v)}
          className="flex flex-wrap items-center gap-1.5 min-h-[42px] px-2.5 py-2 rounded-xl border border-white/10 bg-[#1a1a2e] cursor-pointer hover:border-white/20 transition-colors"
        >
          {isAllSelected && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/12 text-xs text-white/70">
              <Lock size={11} className="text-white/40 shrink-0" />
              {defaultLabel}
            </span>
          )}
          {selectedOptions.map(o => (
            <span key={o.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-aria-500/20 border border-aria-500/30 text-xs text-aria-300">
              {o.label}
              <button type="button" onClick={e => { e.stopPropagation(); onToggle(o.id) }}
                className="text-aria-400 hover:text-white ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
          <ChevronDown size={14} className={`ml-auto text-white/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>

        {/* Warning */}
        {warning && (
          <div className="flex items-center gap-1.5 mt-1.5 px-1 text-xs text-amber-400/80">
            <span className="flex-1">{warning}</span>
            <Lock size={11} className="shrink-0" />
          </div>
        )}

        {/* Dropdown */}
        {open && (
          <div className="absolute z-30 top-full mt-1 w-full bg-[#1a1a2e] border border-white/15 rounded-xl shadow-2xl overflow-hidden">
            {/* Opción "en general" (con candado) */}
            <button type="button"
              onClick={() => { onToggle('__all__'); setOpen(false) }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-white/5 transition-colors text-sm text-left">
              <Lock size={13} className="text-white/35 shrink-0" />
              <span className={`flex-1 ${isAllSelected ? 'text-white' : 'text-white/60'}`}>{defaultLabel}</span>
              {isAllSelected && <Check size={13} className="text-aria-400 shrink-0" />}
            </button>

            {options.length > 0 && <div className="h-px bg-white/8 mx-3" />}

            {options.map(o => (
              <button key={o.id} type="button"
                onClick={() => onToggle(o.id)}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-white/5 transition-colors text-sm text-left">
                <span className={`flex-1 ${selected.includes(o.id) ? 'text-white' : 'text-white/60'}`}>{o.label}</span>
                {selected.includes(o.id) && <Check size={13} className="text-aria-400 shrink-0" />}
              </button>
            ))}

            {options.length === 0 && (
              <p className="px-3.5 py-3 text-xs text-white/30">No hay canales activos</p>
            )}
          </div>
        )}
      </div>
    </Field>
  )
}

// ── Template selector ─────────────────────────────────────────────────────────

function TemplateSelector({ onSelect }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
      {TEMPLATES.map(t => {
        const Icon = t.icon
        return (
          <button key={t.id} onClick={() => onSelect(t)}
            className="flex items-start gap-3 p-4 rounded-xl border border-white/8 bg-white/2 hover:border-white/20 hover:bg-white/5 transition-all text-left group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: t.color + '20', border: `1px solid ${t.color}40` }}>
              <Icon size={18} style={{ color: t.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white leading-tight">{t.name}</p>
              <p className="text-xs text-white/40 mt-1 leading-relaxed">{t.desc}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Step bar ──────────────────────────────────────────────────────────────────

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const done   = current > s.n
        const active = current === s.n
        const Icon   = s.icon
        return (
          <div key={s.n} className="flex items-center flex-1 min-w-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
              ${active ? 'bg-aria-500/20 text-aria-400 border border-aria-500/30' :
                done   ? 'text-white/50' : 'text-white/20'}`}>
              {done
                ? <CheckCircle2 size={13} className="text-aria-400 shrink-0" />
                : <Icon size={13} className="shrink-0" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.n}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${done ? 'bg-aria-500/40' : 'bg-white/8'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Datos básicos ─────────────────────────────────────────────────────

function Step1({ form, onChange, onNext, creating }) {
  return (
    <form onSubmit={e => { e.preventDefault(); onNext() }} className="space-y-5">
      <Field label="Nombre del agente" required description="Como se va a identificar el agente en una conversación">
        <input name="name" value={form.name} onChange={onChange}
          placeholder="Ej: Aurelia" className={inputCls} required />
      </Field>
      <Field label="Tono del agente">
        <select name="tone" value={form.tone} onChange={onChange} className={selectCls}>
          <option>Empático</option>
          <option>Profesional</option>
          <option>Informal</option>
          <option>Técnico</option>
        </select>
      </Field>
      <Field label="Idioma">
        <input value="Español" readOnly className={inputCls + ' opacity-50 cursor-not-allowed'} />
      </Field>
      <Field label="Nacionalidad">
        <input name="nationality" value={form.nationality} onChange={onChange}
          placeholder="Ej: Argentina" className={inputCls} />
      </Field>
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={!form.name.trim() || creating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {creating ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          {creating ? 'Creando borrador...' : 'Siguiente'}
        </button>
      </div>
    </form>
  )
}

// ── Step 2: Base de conocimiento ──────────────────────────────────────────────

const KB_TABS = [
  { id: 'url',  icon: Globe,         label: 'Sitios web'   },
  { id: 'faq',  icon: MessageSquare, label: 'FAQs'         },
  { id: 'text', icon: FileText,      label: 'Texto libre'  },
  { id: 'file', icon: FileUp,        label: 'Archivos'     },
]

function KbTabBtn({ id, icon: Icon, label, active, onClick }) {
  return (
    <button type="button" onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap
        ${active ? 'bg-aria-500/20 text-aria-300 border border-aria-500/30' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
      <Icon size={14} />{label}
    </button>
  )
}

const STATUS_LABELS = { '-1': 'pendiente', 100: 'en cola', 200: 'indexando', 300: 'indexado', 400: 'error' }
const STATUS_COLORS = { '-1': 'text-white/30', 100: 'text-yellow-400', 200: 'text-blue-400', 300: 'text-green-400', 400: 'text-red-400' }

function KbItemRow({ item, onDelete, deleting }) {
  const icons = { url: Globe, faq: MessageSquare, text: FileText, pdf: FileUp, docx: FileUp }
  const Icon = icons[item.type] || FileText
  const id = item._id || item.id
  const statusKey = String(item.status ?? '-1')
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white/4 border border-white/8 group">
      <Icon size={14} className="text-white/30 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/80 font-medium truncate">{item.name || `(${item.type})`}</p>
        {item.source && <p className="text-[11px] text-white/35 mt-0.5 truncate">{item.source}</p>}
        <p className={`text-[10px] mt-0.5 ${STATUS_COLORS[statusKey] || 'text-white/30'}`}>
          {STATUS_LABELS[statusKey] || statusKey}
        </p>
      </div>
      <button type="button" onClick={() => onDelete(id)} disabled={deleting === id}
        className="text-white/20 hover:text-red-400 transition-colors shrink-0 mt-0.5">
        {deleting === id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </div>
  )
}

function Step2({ botId, projectId, namespaceId, form, onChange, onBack, onNext }) {
  const fileRef    = useRef()
  const [tab,      setTab]      = useState('url')
  const [kbItems,  setKbItems]  = useState([])
  const [fileList, setFileList] = useState([])
  const [nsId,     setNsId]     = useState(namespaceId || null)
  const [loading,  setLoading]  = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error,    setError]    = useState('')
  const [drag,     setDrag]     = useState(false)

  const [urlInput,  setUrlInput]  = useState('')
  const [scraping,  setScraping]  = useState(false)
  const [faqQ,      setFaqQ]      = useState('')
  const [faqA,      setFaqA]      = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textBody,  setTextBody]  = useState('')

  async function refresh(id) {
    const ns = id || nsId
    if (!projectId || !ns) return
    const data = await api.getKbContents(projectId, ns).catch(() => null)
    setKbItems(Array.isArray(data?.kbs) ? data.kbs : [])
    if (botId) {
      const files = await api.getAgentFiles(botId).catch(() => [])
      setFileList(Array.isArray(files) ? files : [])
    }
  }

  // Cuando llega el namespaceId desde el padre, actualizar nsId y cargar
  useEffect(() => {
    if (namespaceId) {
      setNsId(namespaceId)
      refresh(namespaceId)
    } else if (botId && projectId) {
      api.ensureKbNamespace(botId, projectId)
        .then(({ namespaceId: id }) => { setNsId(id); refresh(id) })
        .catch(() => {})
    }
  }, [namespaceId]) // eslint-disable-line

  async function addUrl() {
    if (!urlInput.trim() || !nsId) return
    setScraping(true); setError('')
    try {
      const url = urlInput.trim().startsWith('http') ? urlInput.trim() : `https://${urlInput.trim()}`
      await api.createKbContent(projectId, { type: 'url', name: url, source: url, content: '', namespace: nsId })
      setUrlInput('')
      await refresh()
    } catch (e) { setError(e.message) }
    setScraping(false)
  }

  async function addFaq() {
    if (!faqQ.trim() || !faqA.trim() || !nsId) return
    setLoading(true); setError('')
    try {
      await api.createKbContent(projectId, { type: 'faq', name: faqQ.trim(), content: `${faqQ.trim()}\n${faqA.trim()}`, namespace: nsId })
      setFaqQ(''); setFaqA('')
      await refresh()
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  async function addText() {
    if (!textBody.trim() || !nsId) return
    setLoading(true); setError('')
    try {
      await api.createKbContent(projectId, { type: 'text', name: textTitle.trim() || 'Texto', content: textBody.trim(), namespace: nsId })
      setTextTitle(''); setTextBody('')
      await refresh()
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  async function uploadFile(files) {
    if (!botId) { setError('Completá el paso 1 primero'); return }
    if (fileList.length >= 3) { setError('Máximo 3 archivos'); return }
    setLoading(true); setError('')
    try {
      const formData = new FormData()
      Array.from(files).slice(0, 3 - fileList.length).forEach(f => formData.append('file', f))
      const token = localStorage.getItem('aria_token') || ''
      const res = await fetch(`/api/agents/${botId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Error subiendo archivo') }
      await refresh()
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  async function deleteItem(contentId) {
    setDeleting(contentId)
    try { await api.deleteKbContent(projectId, contentId); await refresh() }
    catch (e) { setError(e.message) }
    setDeleting(null)
  }

  async function deleteFile(fileId) {
    setDeleting('f_' + fileId)
    try { await api.deleteAgentFile(botId, fileId); await refresh() }
    catch (e) { setError(e.message) }
    setDeleting(null)
  }

  return (
    <div className="space-y-5">
      {/* Company info (usada en generate-instructions) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre de la empresa">
          <input name="company_name" value={form.company_name} onChange={onChange}
            placeholder={form.agentName || 'Ej: Mi Empresa S.A.'} className={inputCls} />
        </Field>
        <Field label="Descripción de la empresa">
          <textarea name="company_description" value={form.company_description} onChange={onChange}
            placeholder="Describe tu empresa y lo que hace" rows={2}
            className={inputCls + ' resize-none'} />
        </Field>
      </div>

      {/* KB */}
      <div>
        <p className="text-sm font-medium text-white/70 mb-1">Base de conocimiento del agente</p>
        <p className="text-xs text-white/35 mb-3">
          Esta información es exclusiva de <strong className="text-white/50">este agente</strong>.
          El LLM la usará para responder preguntas. Cada agente tiene su propia KB.
        </p>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {KB_TABS.map(t => (
            <KbTabBtn key={t.id} {...t} active={tab === t.id} onClick={setTab} />
          ))}
        </div>

        {error && <p className="text-xs text-red-400 mb-3 px-1">{error}</p>}

        {/* URL tab */}
        {tab === 'url' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">Pegá una URL y ARIA va a scrapear su contenido.</p>
            <div className="flex gap-2">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUrl()}
                placeholder="https://miempresa.com/sobre-nosotros"
                className={inputCls + ' flex-1'} disabled={scraping} />
              <button type="button" onClick={addUrl} disabled={scraping || !urlInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {scraping ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {scraping ? 'Scraping...' : 'Agregar'}
              </button>
            </div>
          </div>
        )}

        {/* FAQ tab */}
        {tab === 'faq' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">Escribí preguntas y respuestas específicas de tu negocio.</p>
            <Field label="Pregunta">
              <input value={faqQ} onChange={e => setFaqQ(e.target.value)}
                placeholder="¿Cuál es el horario de atención?" className={inputCls} />
            </Field>
            <Field label="Respuesta">
              <textarea value={faqA} onChange={e => setFaqA(e.target.value)}
                placeholder="Atendemos de lunes a viernes de 9 a 18hs."
                rows={3} className={inputCls + ' resize-none'} />
            </Field>
            <button type="button" onClick={addFaq} disabled={loading || !faqQ.trim() || !faqA.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Agregar FAQ
            </button>
          </div>
        )}

        {/* Text tab */}
        {tab === 'text' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">Escribí cualquier información textual que el agente deba conocer.</p>
            <Field label="Título (opcional)">
              <input value={textTitle} onChange={e => setTextTitle(e.target.value)}
                placeholder="Ej: Precios actualizados" className={inputCls} />
            </Field>
            <Field label="Contenido">
              <textarea value={textBody} onChange={e => setTextBody(e.target.value)}
                placeholder="Plan básico: $5.000/mes&#10;Plan pro: $12.000/mes&#10;..." rows={5}
                className={inputCls + ' resize-none'} />
            </Field>
            <button type="button" onClick={addText} disabled={loading || !textBody.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Agregar texto
            </button>
          </div>
        )}

        {/* File tab */}
        {tab === 'file' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              Subí documentos. Los .txt/.md/.json/.html se leen y el agente los puede usar.
              Los PDF/doc quedan guardados como referencia.
            </p>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files) }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
                ${drag ? 'border-aria-500 bg-aria-500/10' : 'border-white/10 hover:border-white/20'}`}>
              <input ref={fileRef} type="file" multiple className="hidden"
                accept=".pdf,.doc,.docx,.pptx,.txt,.md,.json,.html"
                onChange={e => uploadFile(e.target.files)} />
              {loading
                ? <Loader2 size={20} className="mx-auto mb-2 text-aria-400 animate-spin" />
                : <Upload size={20} className="mx-auto mb-2 text-white/30" />}
              <p className="text-xs text-white/40">Clic para seleccionar o arrastrá archivos aquí</p>
            </div>
            {fileList.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-white/40 font-medium">{fileList.length} archivo{fileList.length !== 1 ? 's' : ''} guardado{fileList.length !== 1 ? 's' : ''}:</p>
                {fileList.map(f => {
                  const ext = f.filename.split('.').pop().toLowerCase()
                  const readable = ['txt','md','json','html'].includes(ext)
                  return (
                    <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                      <FileUp size={13} className="text-white/30 shrink-0" />
                      <span className="text-xs text-white/70 flex-1 truncate">{f.filename}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${readable ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-white/30'}`}>
                        {readable ? 'leíble' : 'referencia'}
                      </span>
                      <button type="button" onClick={() => deleteFile(f.id)} disabled={deleting === 'f_' + f.id}
                        className="text-white/20 hover:text-red-400 transition-colors shrink-0">
                        {deleting === 'f_' + f.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* KB items list (URLs, FAQs, texto, archivos leíbles) */}
        {kbItems.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-white/40 font-medium">
              {kbItems.length} {kbItems.length === 1 ? 'elemento' : 'elementos'} en la base de conocimiento
            </p>
            {kbItems.map(item => (
              <KbItemRow key={item._id || item.id} item={item} onDelete={deleteItem} deleting={deleting} />
            ))}
          </div>
        )}

        {kbItems.length === 0 && fileList.length === 0 && (
          <div className="mt-4 py-6 text-center">
            <p className="text-xs text-white/25">Aún no hay contenido en la base de conocimiento.</p>
            <p className="text-[11px] text-white/20 mt-1">Podés continuar y agregar más tarde desde el perfil del agente.</p>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft size={15} /> Atrás
        </button>
        <button type="button" onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors">
          <ArrowRight size={15} /> Siguiente
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Datos técnicos ────────────────────────────────────────────────────

function SliderField({ label, name, value, onChange, min = 0, max = 2, step = 0.1, description }) {
  return (
    <Field label={`${label}: ${Number(value).toFixed(1)}`} description={description}>
      <input type="range" name={name} min={min} max={max} step={step} value={value} onChange={onChange}
        className="w-full accent-aria-500 h-1.5 rounded-full cursor-pointer" />
      <div className="flex justify-between text-[10px] text-white/25 mt-0.5 px-0.5">
        <span>{min}</span><span>{max}</span>
      </div>
    </Field>
  )
}

function Step3({ form, onChange, onBack, onNext, channels, agents }) {
  const channelOptions = (channels || []).map(c => ({ id: c.id, label: c.instance_name || c.session_name }))
  const agentOptions   = (agents  || []).map(a => {
    const u = a.id_user || a
    return { id: a._id, label: u.firstname ? `${u.firstname} ${u.lastname || ''}`.trim() : u.email }
  })

  const toggleChannel = (id) => {
    let sel = form.channels.includes('__all__') ? [] : [...form.channels]
    if (id === '__all__') { sel = ['__all__'] }
    else {
      sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
      if (!sel.length) sel = ['__all__']
    }
    onChange({ target: { name: 'channels', value: sel } })
  }

  const toggleAgent = (id) => {
    let sel = form.derivation_users.includes('__all__') ? [] : [...form.derivation_users]
    if (id === '__all__') { sel = ['__all__'] }
    else {
      sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
      if (!sel.length) sel = ['__all__']
    }
    onChange({ target: { name: 'derivation_users', value: sel } })
  }

  return (
    <div className="space-y-5">
      <SliderField label="Creatividad (temperatura)" name="temperature" value={form.temperature}
        onChange={onChange} min={0} max={2} step={0.1}
        description="Más alto = más creativo; más bajo = más predecible." />

      <SliderField label="Foco (top_p)" name="top_p" value={form.top_p}
        onChange={onChange} min={0} max={1} step={0.05}
        description="Más alto = más variedad de respuestas; más bajo = más consistente." />

      <ChipSelect
        label="Canales"
        options={channelOptions}
        selected={form.channels}
        onToggle={toggleChannel}
        defaultLabel="Canales en general"
        warning={channelOptions.length > 0 ? 'Hay canales siendo atendidos por otros agentes' : null}
      />

      <Field label="Derivación"
        description="Determina cuándo el agente debe derivar a un asesor humano.">
        <textarea name="derivation_notes" value={form.derivation_notes} onChange={onChange}
          placeholder="Ej: Derivar si el lead solicita hablar con una persona o si tiene presupuesto confirmado." rows={2}
          className={inputCls + ' resize-none'} />
      </Field>

      <ChipSelect
        label="Seleccione usuarios para derivar:"
        options={agentOptions}
        selected={form.derivation_users}
        onToggle={toggleAgent}
        defaultLabel="Tomar por usuarios"
        warning={null}
      />

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft size={15} /> Atrás
        </button>
        <button type="button" onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors">
          <Sparkles size={15} /> Crear agente
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Loader ────────────────────────────────────────────────────────────

function Step4({ progress }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-aria-600 flex items-center justify-center">
        <Sparkles size={28} className="text-white animate-pulse" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold mb-1">Creando tu agente...</p>
        <p className="text-xs text-white/40">Este proceso puede llevar unos segundos</p>
      </div>
      <div className="w-64 space-y-3">
        {['Generar instrucciones', 'Configurar agente en Tiledesk', 'Listo'].map((label, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
              ${progress > i ? 'bg-aria-500' : progress === i ? 'bg-aria-500/40 animate-pulse' : 'bg-white/10'}`}>
              {progress > i
                ? <CheckCircle2 size={12} className="text-white" />
                : progress === i ? <Loader2 size={12} className="text-white animate-spin" /> : null}
            </div>
            <span className={`text-sm ${progress >= i ? 'text-white' : 'text-white/30'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Playground (Tiledesk real) ────────────────────────────────────────────────

function Playground({ botId, projectId }) {
  const [msgs,      setMsgs]      = useState([])
  const [text,      setText]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [initing,   setIniting]   = useState(false)
  const bottomRef = useRef()
  const sessionRef = useRef(false) // true = sesión ya iniciada

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // Iniciar sesión automáticamente cuando el playground tiene botId
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
    if (!text.trim() || loading || initing || !botId || !projectId) return
    const userText = text.trim()
    setMsgs(h => [...h, { role: 'user', content: userText }])
    setText('')
    setLoading(true)
    try {
      const res = await api.testChat(botId, { projectId, text: userText })
      const reply = res.reply || '(sin respuesta — el bot puede estar procesando, intentá de nuevo)'
      setMsgs(h => [...h, { role: 'assistant', content: reply }])
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
          <p className="text-xs font-semibold text-white">Probá tu Agente</p>
          <p className="text-[11px] text-white/35 mt-0.5">
            {botId ? 'Chat en tiempo real con el bot en Tiledesk' : 'Guardá el agente primero para probarlo'}
          </p>
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
            {botId ? 'El agente está listo. Escribí un mensaje.' : 'El playground estará disponible luego de guardar el agente.'}
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
              <span className="text-[10px] text-white/30">El agente está pensando...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 p-3 border-t border-white/8">
        <input value={text} onChange={e => setText(e.target.value)}
          placeholder={botId ? 'Escribí un mensaje...' : 'Guardá el agente primero'}
          disabled={!botId || initing}
          className="flex-1 bg-white/5 text-white text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-aria-500 placeholder:text-white/20 transition-colors disabled:opacity-40" />
        <button type="submit" disabled={!text.trim() || loading || initing || !botId}
          className="p-2 rounded-lg bg-aria-500 hover:bg-aria-600 disabled:opacity-40 transition-colors">
          <Send size={13} className="text-white" />
        </button>
      </form>
    </div>
  )
}

// ── Step 5: Instrucciones + playground ───────────────────────────────────────

function Step5({ instructions, onChange, onBack, onSave, saving, botId, projectId, setAsDefault, onSetAsDefault }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 400 }}>
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium text-white/70 mb-0.5">Instrucciones Generadas</p>
            <p className="text-xs text-white/35">Podés editar antes de guardar</p>
          </div>
          <textarea value={instructions} onChange={e => onChange(e.target.value)}
            className="flex-1 bg-[#1a1a2e] text-white text-xs px-3.5 py-3 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors resize-none leading-relaxed"
            style={{ minHeight: 340 }} />
        </div>
        <Playground botId={botId} projectId={projectId} />
      </div>

      {/* Activar en WhatsApp */}
      <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/4 border border-white/8 cursor-pointer hover:bg-white/6 transition-colors select-none">
        <div onClick={onSetAsDefault}
          className={`w-9 h-5 rounded-full transition-colors flex items-center ${setAsDefault ? 'bg-aria-500' : 'bg-white/15'}`}>
          <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mx-0.5 ${setAsDefault ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
        <div>
          <p className="text-sm text-white font-medium">Activar como bot predeterminado en WhatsApp</p>
          <p className="text-xs text-white/40">Las conversaciones entrantes usarán este agente automáticamente</p>
        </div>
      </label>

      <div className="flex justify-between pt-1">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft size={15} /> Atrás
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgentWizard() {
  const navigate    = useNavigate()
  const { project } = useAuth()
  const projectId   = project?._id || project?.id

  const [template,     setTemplate]     = useState(null)
  const [step,         setStep]         = useState(0)
  const [draftBotId,      setDraftBotId]      = useState(null)
  const [kbNamespaceId,   setKbNamespaceId]   = useState(null)
  const [creating,        setCreating]        = useState(false)
  const [genProgress,  setGenProgress]  = useState(0)
  const [instructions, setInstructions] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [error,        setError]        = useState(null)

  const [form, setForm] = useState({
    name: '', tone: 'Empático', nationality: 'Argentina', active: true,
    company_name: '', company_description: '', websites: [''], files: [],
    temperature: 1.0, top_p: 1.0,
    channels: ['__all__'], derivation_notes: '', derivation_users: ['__all__'],
  })

  const { data: channels } = useApi(() => api.getWahaSessions(), [])
  const { data: agentList } = useApi(() => api.getAgents(projectId), [projectId])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  // Al pasar al paso 2, pre-llenar company_name con el nombre del agente si está vacío
  function goToStep2() {
    setForm(f => ({ ...f, company_name: f.company_name || f.name }))
    setStep(2)
  }

  async function handleStep1Next() {
    if (!draftBotId) {
      setCreating(true)
      setError(null)
      try {
        const { botId, kbNamespaceId: nsId } = await api.createAgentDraft({
          projectId,
          name: form.name,
          description: '',
          language: 'es',
          welcome_msg: '',
          template_id: template?.template_id || template?.id,
        })
        setDraftBotId(botId)
        setKbNamespaceId(nsId || null)
      } catch (e) {
        setError('Error creando el borrador: ' + e.message)
        setCreating(false)
        return
      }
      setCreating(false)
    }
    goToStep2()
  }

  async function handleStep3Next() {
    setStep(4)
    setGenProgress(0)
    setError(null)
    try {
      setGenProgress(1)
      const { instructions: ins } = await api.generateInstructions({
        agent_name:          form.name,
        tone:                form.tone,
        nationality:         form.nationality,
        company_name:        form.company_name || form.name,
        company_description: form.company_description,
        websites:            form.websites,
        temperature:         form.temperature,
        derivation_notes:    form.derivation_notes,
        bot_id:              draftBotId,  // para incluir KB en las instrucciones generadas
      })
      setInstructions(ins)
      setGenProgress(2)
      if (draftBotId && template?.id) {
        try {
          await api.saveAgentInstructions(draftBotId, {
            instructions: ins,
            projectId,
            template_id: template.id,
          })
        } catch {
          // No bloquear si falla la inyección; el usuario puede guardar igualmente
        }
      }
      setGenProgress(3)
      await new Promise(r => setTimeout(r, 500))
      setStep(5)
    } catch (e) {
      setError('Error generando instrucciones: ' + e.message)
      setStep(3)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.finalizeAgent(draftBotId, {
        projectId,
        name:         form.name,
        description:  form.company_name ? `Agente para ${form.company_name}` : '',
        welcome_msg:  '',
        instructions,
        template_id:  template?.template_id || template?.id,
        active:       form.active,
        tone:         form.tone,
        nationality:  form.nationality,
        company_name: form.company_name || form.name,
      })
      if (setAsDefault) {
        await api.setActiveBotId(draftBotId)
      }
      navigate('/agents')
    } catch (e) {
      setError('Error guardando: ' + e.message)
    }
    setSaving(false)
  }

  function goBack() {
    if (step === 0) navigate('/agents')
    else if (step === 1) setStep(0)
    else setStep(s => s - 1)
  }

  const tpl = template ? TEMPLATES.find(t => t.id === template.id) || template : null
  const TplIcon = tpl?.icon

  return (
    <div className="min-h-screen bg-[#0d0d1a] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={goBack}
              className="w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-colors">
              <ArrowLeft size={15} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Crear Nuevo Agente</h1>
              <p className="text-xs text-white/40">
                {step === 0 ? 'Selecciona el tipo de agente que deseas configurar' : `Paso ${step} de 5`}
              </p>
            </div>
          </div>

          {tpl && step > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/3 border border-white/8 mb-6">
              <div className="flex items-center gap-2.5">
                {TplIcon && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: tpl.color + '20' }}>
                    <TplIcon size={14} style={{ color: tpl.color }} />
                  </div>
                )}
                <span className="text-sm font-medium text-white">{tpl.name}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-white/50">Predefinir como agente activo</span>
                <div onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer
                    ${form.active ? 'bg-aria-500' : 'bg-white/15'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                    ${form.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>
          )}

          {step > 0 && step <= 5 && <StepBar current={step} />}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        <div className="bg-[#13132a] rounded-2xl border border-white/8 p-6">
          {step === 0 && <TemplateSelector onSelect={t => { setTemplate(t); setStep(1) }} />}

          {step === 1 && (
            <>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                  <BookOpen size={16} className="text-white/60" />
                </div>
                <h2 className="text-base font-semibold text-white">Datos básicos</h2>
              </div>
              <Step1 form={form} onChange={handleChange} onNext={handleStep1Next} creating={creating} />
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                  <Brain size={16} className="text-white/60" />
                </div>
                <h2 className="text-base font-semibold text-white">Base de conocimiento</h2>
              </div>
              <Step2 botId={draftBotId} projectId={projectId} namespaceId={kbNamespaceId}
                form={{ ...form, agentName: form.name }} onChange={handleChange}
                onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                  <Settings2 size={16} className="text-white/60" />
                </div>
                <h2 className="text-base font-semibold text-white">Datos Técnicos</h2>
              </div>
              <Step3 form={form} onChange={handleChange}
                onBack={() => setStep(2)} onNext={handleStep3Next}
                channels={Array.isArray(channels) ? channels : []}
                agents={Array.isArray(agentList) ? agentList : []} />
            </>
          )}

          {step === 4 && <Step4 progress={genProgress} />}

          {step === 5 && (
            <Step5 instructions={instructions} onChange={setInstructions}
              onBack={() => setStep(3)} onSave={handleSave} saving={saving}
              botId={draftBotId} projectId={projectId}
              setAsDefault={setAsDefault} onSetAsDefault={() => setSetAsDefault(v => !v)} />
          )}
        </div>
      </div>
    </div>
  )
}
