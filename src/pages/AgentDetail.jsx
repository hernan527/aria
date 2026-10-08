import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { Spinner } from '../components/ui/Spinner'
import {
  ArrowLeft, Save, Send, Loader2, X, Upload,
  FileText, Settings2, Paperclip, Lock, Check, ChevronDown, User,
  Globe, MessageSquare, Trash2, Plus, Brain, Sparkles,
  File, FileCode, Sheet, Plug,
} from 'lucide-react'

const inputCls = 'w-full bg-[#1a1a2e] text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20'

const TONE_EXAMPLES = {
  Empático:    'Entiendo lo que me contás, vamos a resolverlo juntos 💛',
  Profesional: 'Buenas tardes. Le confirmo que el producto está disponible.',
  Informal:    'Dale, tranquilo que ya te ayudo con eso 👍',
  Técnico:     'Confirmado: stock disponible, envío en 48hs.',
}

// ── ChipSelect ────────────────────────────────────────────────────────────────

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

// ── Playground ────────────────────────────────────────────────────────────────

function Playground({ botId, projectId }) {
  const [msgs,    setMsgs]    = useState([])
  const [text,    setText]    = useState('')
  const [loading, setLoading] = useState(false)
  const [initing, setIniting] = useState(false)
  const bottomRef  = useRef()
  const sessionRef = useRef(false)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  useEffect(() => {
    if (!botId || sessionRef.current) return
    initSession()
  }, [botId]) // eslint-disable-line

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
          <p className="text-[11px] text-white/35 mt-0.5">Chat en tiempo real (Dify)</p>
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

function TabInstrucciones({ meta, botId, projectId, botName, onSaved }) {
  const [tone,               setTone]              = useState(meta?.tone || 'Empático')
  const [nationality,        setNationality]        = useState(meta?.nationality || 'Argentina')
  const [companyName,        setCompanyName]        = useState(meta?.company_name || '')
  const [companyDescription, setCompanyDescription] = useState(meta?.company_description || '')
  const [derivationNotes,    setDerivationNotes]    = useState(meta?.derivation_notes || '')
  const [derivationMode,     setDerivationMode]     = useState(meta?.derivation_mode || 'nunca')
  const [scoreThreshold,     setScoreThreshold]     = useState(meta?.derivation_score_threshold ?? 70)
  const [goals,              setGoals]              = useState(() => { try { return JSON.parse(meta?.goals || '[]') } catch { return [] } })
  const [goalCriteria,       setGoalCriteria]       = useState(meta?.goal_success_criteria || '')
  const [behaviorNotes,      setBehaviorNotes]      = useState(meta?.behavior_notes || '')
  const [instructions,       setInstructions]       = useState(meta?.instructions || '')
  const [regenerating,       setRegenerating]       = useState(false)
  const [saving,             setSaving]             = useState(false)
  const [msg,                setMsg]                = useState('')
  const [showAdvanced,       setShowAdvanced]       = useState(false)

  const GOAL_OPTIONS = [
    { id: 'vender',             label: 'Vender y recomendar',    hint: 'Ayuda a elegir productos y convierte consultas en ventas.' },
    { id: 'resolver_consultas', label: 'Resolver consultas',     hint: 'Responde preguntas frecuentes y acompaña a tus clientes.' },
    { id: 'gestionar_reclamos', label: 'Gestionar reclamos',     hint: 'Contiene, registra el problema y resuelve o escala a tiempo.' },
    { id: 'recolectar_datos',   label: 'Recolectar datos',       hint: 'Pide nombre, zona y datos clave, de a uno y sin interrogar.' },
    { id: 'personalizado',      label: 'Personalizado',          hint: 'Definí qué lograr y cuándo lo das por cumplido.' },
  ]

  function toggleGoal(id) {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  const DERIVATION_OPTIONS = [
    { id: 'nunca',             label: 'Nunca', hint: 'El agente resuelve solo, no deriva.' },
    { id: 'si_lo_pide',        label: 'Si lo pide', hint: 'Deriva si el cliente pide hablar con una persona.' },
    { id: 'si_no_segura',      label: 'Si no está seguro', hint: 'Deriva si no puede responder con confianza.' },
    { id: 'objetivo_cumplido', label: 'Cuando esté listo (score de Lucas)', hint: 'Deriva automáticamente cuando Lucas califica al lead por arriba del umbral.' },
    { id: 'personalizado',     label: 'Personalizado', hint: 'Definís vos el criterio en texto libre.' },
  ]

  const missingVars = !companyDescription || (derivationMode === 'personalizado' && !derivationNotes)

  const derivationInstructionText = () => {
    const opt = DERIVATION_OPTIONS.find(o => o.id === derivationMode)
    if (derivationMode === 'personalizado') return derivationNotes
    if (derivationMode === 'objetivo_cumplido') return `${opt.hint} (umbral: ${scoreThreshold} pts)`
    return opt?.hint || ''
  }

  async function regenerate() {
    setRegenerating(true); setMsg('')
    try {
      const { instructions: ins } = await api.generateInstructions({
        agent_name:          botName || companyName,
        tone,
        nationality,
        company_name:        companyName,
        company_description: companyDescription,
        derivation_notes:    derivationInstructionText(),
        goals, goal_success_criteria: goalCriteria, behavior_notes: behaviorNotes,
        bot_id:              botId,
        template_id:         meta?.template_id,
      })
      setInstructions(ins)
      setMsg('Instrucciones regeneradas. Guardá para aplicar.')
    } catch (e) { setMsg('Error: ' + e.message) }
    setRegenerating(false)
  }

  async function save() {
    setSaving(true); setMsg('')
    try {
      await api.saveAgentInstructions(botId, {
        instructions,
        projectId,
        template_id:         meta?.template_id,
        tone,
        nationality,
        company_name:        companyName,
        company_description: companyDescription,
        derivation_notes:    derivationNotes,
        derivation_mode:     derivationMode,
        derivation_score_threshold: derivationMode === 'objetivo_cumplido' ? Number(scoreThreshold) : undefined,
        goals, goal_success_criteria: goalCriteria, behavior_notes: behaviorNotes,
      })
      onSaved()
      setMsg('Guardado y aplicado en Dify ✓')
    } catch (e) { setMsg('Error: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {missingVars && (
        <div className="px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300">
          Completá los campos vacíos y regenerá las instrucciones para que queden guardadas como referencia.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-white/40 mb-1.5">Tono</p>
          <select value={tone} onChange={e => setTone(e.target.value)} className={inputCls}>
            <option>Empático</option>
            <option>Profesional</option>
            <option>Informal</option>
            <option>Técnico</option>
          </select>
          <p className="text-[11px] text-white/25 mt-1 italic">"{TONE_EXAMPLES[tone] || TONE_EXAMPLES.Empático}"</p>
        </div>
        <div>
          <p className="text-xs text-white/40 mb-1.5">Nacionalidad</p>
          <input value={nationality} onChange={e => setNationality(e.target.value)}
            placeholder="Argentina" className={inputCls} />
        </div>
      </div>

      <div>
        <p className="text-xs text-white/40 mb-1.5">Empresa</p>
        <input value={companyName} onChange={e => setCompanyName(e.target.value)}
          placeholder="Nombre de la empresa" className={inputCls} />
      </div>

      <div>
        <p className="text-xs text-white/40 mb-1.5">
          Descripción de la empresa
          {!companyDescription && <span className="ml-1 text-yellow-400">← completar</span>}
        </p>
        <textarea value={companyDescription} onChange={e => setCompanyDescription(e.target.value)}
          placeholder="Qué hace la empresa, a quién atiende, propuesta de valor, zona de operación..." rows={3}
          className={inputCls + ' resize-none ' + (!companyDescription ? 'border-yellow-500/30' : '')} />
      </div>

      <div>
        <p className="text-xs text-white/40 mb-1.5">¿En qué querés que te ayude? (Objetivo)</p>
        <div className="grid grid-cols-2 gap-1.5">
          {GOAL_OPTIONS.map(opt => (
            <label key={opt.id}
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                goals.includes(opt.id) ? 'border-aria-500/50 bg-aria-500/10' : 'border-white/8 hover:border-white/20'
              }`}>
              <input type="checkbox" className="mt-0.5" checked={goals.includes(opt.id)} onChange={() => toggleGoal(opt.id)} />
              <div>
                <p className="text-xs font-medium text-white/80">{opt.label}</p>
                <p className="text-[11px] text-white/35">{opt.hint}</p>
              </div>
            </label>
          ))}
        </div>
        {goals.includes('personalizado') && (
          <textarea value={goalCriteria} onChange={e => setGoalCriteria(e.target.value)}
            placeholder="Qué lograr y cuándo lo das por cumplido..." rows={2}
            className={inputCls + ' resize-none mt-2'} />
        )}
      </div>

      <div>
        <p className="text-xs text-white/40 mb-1.5">Cómo se debe comportar</p>
        <textarea value={behaviorNotes} onChange={e => setBehaviorNotes(e.target.value)}
          placeholder="Reglas y límites claros: no des precios, no prometas descuentos, no hables de la competencia..." rows={2}
          className={inputCls + ' resize-none'} />
      </div>

      <div>
        <p className="text-xs text-white/40 mb-1.5">¿Cuándo debe derivar a un humano?</p>
        <div className="space-y-1.5">
          {DERIVATION_OPTIONS.map(opt => (
            <label key={opt.id}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                derivationMode === opt.id ? 'border-aria-500/50 bg-aria-500/10' : 'border-white/8 hover:border-white/20'
              }`}>
              <input type="radio" name="derivation_mode" className="mt-0.5" checked={derivationMode === opt.id}
                onChange={() => setDerivationMode(opt.id)} />
              <div>
                <p className="text-xs font-medium text-white/80">{opt.label}</p>
                <p className="text-[11px] text-white/35">{opt.hint}</p>
              </div>
            </label>
          ))}
        </div>

        {derivationMode === 'objetivo_cumplido' && (
          <div className="mt-2">
            <p className="text-xs text-white/40 mb-1.5">Score mínimo para derivar (Lucas, 0-100)</p>
            <input type="number" min={0} max={100} value={scoreThreshold}
              onChange={e => setScoreThreshold(e.target.value)} className={inputCls} />
          </div>
        )}

        {derivationMode === 'personalizado' && (
          <textarea value={derivationNotes} onChange={e => setDerivationNotes(e.target.value)}
            placeholder="Cuándo derivar a un asesor humano: si pide hablar con alguien, si no califica, si hay duda sobre elegibilidad..." rows={2}
            className={inputCls + ' resize-none mt-2'} />
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={regenerate} disabled={regenerating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-aria-500/40 text-aria-300 text-sm hover:bg-aria-500/10 transition-colors disabled:opacity-50">
          {regenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {regenerating ? 'Generando...' : 'Regenerar instrucciones'}
        </button>
      </div>

      <div className="border-t border-white/6 pt-4">
        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
          <ChevronDown size={13} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          Avanzado: editar el prompt final a mano
        </button>
        {showAdvanced && (
          <div className="mt-2">
            <p className="text-[11px] text-white/25 mb-1.5">
              Esto reemplaza Objetivo + Tono + Comportamiento: el agente usa exactamente este texto.
            </p>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="w-full bg-[#1a1a2e] text-white text-xs px-3.5 py-3 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors resize-none leading-relaxed"
              style={{ minHeight: 280 }}
              placeholder="Las instrucciones aparecen acá después de regenerar..."
            />
          </div>
        )}
      </div>

      {msg && <p className={`text-xs px-1 ${msg.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Guardando...' : 'Guardar y aplicar'}
        </button>
      </div>
    </div>
  )
}

// ── Tab: Configuración ────────────────────────────────────────────────────────

function TabConfiguracion({ meta, botId, projectId, channels, agents, onSaved }) {
  const parse = (v, def) => { try { return JSON.parse(v) } catch { return def } }

  const [temperature, setTemperature] = useState(meta?.temperature ?? 0.7)
  const [topP,        setTopP]        = useState(meta?.top_p ?? 1.0)
  const [selChannels, setSelChannels] = useState(parse(meta?.channels, ['__all__']))
  const [selUsers,    setSelUsers]    = useState(parse(meta?.derivation_users, ['__all__']))
  const [saving,      setSaving]      = useState(false)

  const channelOptions = (channels || []).map(c => ({ id: c.id, label: c.instance_name || c.session_name }))
  const agentOptions   = (agents  || []).map(a => ({ id: a.id, label: a.name || a.email }))

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

// ── Tab: Seguimientos ─────────────────────────────────────────────────────────

const CADENCE_PRESETS = {
  none:        { label: 'Sin seguimiento', hint: 'Si no responden, el agente espera.', intervals: [] },
  suave:       { label: 'Suave',            hint: 'Un toque a las 4 h y otro al día siguiente.', intervals: [4, 24] },
  persistente: { label: 'Persistente',      hint: 'A las 2 h, 8 h y 24 h.', intervals: [2, 8, 24] },
  custom:      { label: 'Personalizado',    hint: 'Armá vos los intervalos (horas desde el último mensaje del lead).', intervals: null },
}

function TabSeguimientos({ meta, botId, onSaved }) {
  const [cadence,    setCadence]    = useState(meta?.followup_cadence || 'none')
  const [intervals,  setIntervals]  = useState(() => {
    try { return JSON.parse(meta?.followup_intervals || '[]').join(', ') } catch { return '' }
  })
  const [hoursStart, setHoursStart] = useState(meta?.followup_hours_start || '08:00')
  const [hoursEnd,   setHoursEnd]   = useState(meta?.followup_hours_end   || '20:00')
  const [saving,     setSaving]     = useState(false)

  async function save() {
    setSaving(true)
    try {
      const resolvedIntervals = cadence === 'custom'
        ? intervals.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0)
        : (CADENCE_PRESETS[cadence]?.intervals || [])
      await api.saveAgentConfig(botId, {
        followup_cadence: cadence,
        followup_intervals: resolvedIntervals,
        followup_hours_start: hoursStart,
        followup_hours_end: hoursEnd,
      })
      onSaved()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-white/50 mb-1.5">Seguimientos sin insistir de más</p>
        <p className="text-[11px] text-white/30 mb-3">
          Si el lead no responde, el agente puede reintentar con un mensaje de reengagement generado por IA.
        </p>
        <div className="space-y-1.5">
          {Object.entries(CADENCE_PRESETS).map(([id, p]) => (
            <label key={id}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                cadence === id ? 'border-aria-500/50 bg-aria-500/10' : 'border-white/8 hover:border-white/20'
              }`}>
              <input type="radio" name="followup_cadence" className="mt-0.5" checked={cadence === id}
                onChange={() => setCadence(id)} />
              <div>
                <p className="text-xs font-medium text-white/80">{p.label}</p>
                <p className="text-[11px] text-white/35">{p.hint}</p>
              </div>
            </label>
          ))}
        </div>

        {cadence === 'custom' && (
          <div className="mt-2">
            <p className="text-xs text-white/40 mb-1.5">Horas desde el último mensaje (separadas por coma)</p>
            <input value={intervals} onChange={e => setIntervals(e.target.value)}
              placeholder="ej: 3, 12, 48" className={inputCls} />
          </div>
        )}
      </div>

      {cadence !== 'none' && (
        <div>
          <p className="text-xs font-medium text-white/50 mb-1.5">Horario de seguimientos</p>
          <p className="text-[11px] text-white/30 mb-2">Fuera de este horario no insiste. Retoma cuando abre.</p>
          <div className="flex items-center gap-3">
            <input type="time" value={hoursStart} onChange={e => setHoursStart(e.target.value)} className={inputCls} />
            <span className="text-xs text-white/30">a</span>
            <input type="time" value={hoursEnd} onChange={e => setHoursEnd(e.target.value)} className={inputCls} />
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Guardar
        </button>
      </div>
    </div>
  )
}

// ── Tab: Integraciones ────────────────────────────────────────────────────────

function TabIntegraciones({ meta, botId, onSaved }) {
  const [available,    setAvailable]    = useState([])
  const [selected,     setSelected]     = useState(() => { try { return JSON.parse(meta?.extra_builtin_tools || '[]') } catch { return [] } })
  const [savingBuiltin, setSavingBuiltin] = useState(false)
  const [customTools,  setCustomTools]  = useState([])
  const [showAdd,      setShowAdd]      = useState(false)
  const [form,         setForm]         = useState({ name: '', description: '', url: '', method: 'GET', params: [] })
  const [adding,       setAdding]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    api.getAvailableTools().then(setAvailable).catch(() => {})
    api.getAgentCustomTools(botId).then(setCustomTools).catch(() => {})
  }, [botId])

  function toggleBuiltin(key) {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function saveBuiltin() {
    setSavingBuiltin(true)
    try {
      await api.saveAgentConfig(botId, { extra_builtin_tools: selected })
      onSaved()
    } catch (e) { alert(e.message) }
    setSavingBuiltin(false)
  }

  function addParam() {
    setForm(f => ({ ...f, params: [...f.params, { name: '', type: 'string', description: '' }] }))
  }
  function updateParam(i, field, value) {
    setForm(f => ({ ...f, params: f.params.map((p, idx) => idx === i ? { ...p, [field]: value } : p) }))
  }
  function removeParam(i) {
    setForm(f => ({ ...f, params: f.params.filter((_, idx) => idx !== i) }))
  }

  async function submitCustomTool() {
    if (!form.name.trim() || !form.url.trim()) { setError('Nombre y URL son obligatorios'); return }
    setAdding(true); setError('')
    try {
      await api.addAgentCustomTool(botId, form)
      const list = await api.getAgentCustomTools(botId)
      setCustomTools(list)
      setForm({ name: '', description: '', url: '', method: 'GET', params: [] })
      setShowAdd(false)
      onSaved()
    } catch (e) { setError(e.message) }
    setAdding(false)
  }

  async function removeCustomTool(id) {
    try {
      await api.deleteAgentCustomTool(botId, id)
      setCustomTools(prev => prev.filter(t => t.id !== id))
      onSaved()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-white/50 mb-1.5">Herramientas de Dify</p>
        <p className="text-[11px] text-white/30 mb-3">
          El agente puede usarlas solo, a mitad de charla, cuando lo necesite (buscar algo, calcular, saber la hora).
        </p>
        <div className="space-y-1.5">
          {available.map(t => (
            <label key={t.key}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                selected.includes(t.key) ? 'border-aria-500/50 bg-aria-500/10' : 'border-white/8 hover:border-white/20'
              }`}>
              <input type="checkbox" className="mt-0.5" checked={selected.includes(t.key)} onChange={() => toggleBuiltin(t.key)} />
              <div>
                <p className="text-xs font-medium text-white/80">{t.label}</p>
                <p className="text-[11px] text-white/35">{t.description}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end mt-2">
          <button onClick={saveBuiltin} disabled={savingBuiltin}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-xs font-medium transition-colors disabled:opacity-50">
            {savingBuiltin ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>
      </div>

      <div className="border-t border-white/6 pt-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-medium text-white/50">Tus propias integraciones</p>
            <p className="text-[11px] text-white/30">Conectá un endpoint propio (Excel/Sheets vía API, tu CRM, lo que sea).</p>
          </div>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-[11px] transition-colors">
            <Plus size={12} /> Agregar
          </button>
        </div>

        {customTools.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {customTools.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-white/8 bg-white/2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/80 truncate">{t.name}</p>
                  <p className="text-[11px] text-white/35 truncate">{t.method} {t.url}</p>
                </div>
                <button onClick={() => removeCustomTool(t.id)} className="shrink-0 text-white/30 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <div className="p-3 rounded-xl border border-white/10 bg-white/3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre (ej: Consultar precios)" className={inputCls} />
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://tu-api.com/precios" className={inputCls} />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Cuándo usarla: ej. cuando el cliente pregunte el precio de un producto" rows={2}
              className={inputCls + ' resize-none'} />

            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Parámetros que el agente puede mandar</p>
              {form.params.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 mb-1.5">
                  <input value={p.name} onChange={e => updateParam(i, 'name', e.target.value)} placeholder="nombre"
                    className={inputCls + ' flex-1'} />
                  <input value={p.description} onChange={e => updateParam(i, 'description', e.target.value)} placeholder="descripción"
                    className={inputCls + ' flex-1'} />
                  <button onClick={() => removeParam(i)} className="text-white/30 hover:text-red-400"><X size={14} /></button>
                </div>
              ))}
              <button onClick={addParam} className="text-[11px] text-aria-400 hover:text-aria-300">+ agregar parámetro</button>
            </div>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white">Cancelar</button>
              <button onClick={submitCustomTool} disabled={adding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aria-500 hover:bg-aria-600 text-white text-xs disabled:opacity-50">
                {adding ? <Loader2 size={12} className="animate-spin" /> : null} Conectar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Adjuntos (PRO) ───────────────────────────────────────────────────────

const FILE_TYPES = [
  { ext: '.pdf',  label: 'PDF',   icon: FileText,  color: '#f87171' },
  { ext: '.docx', label: 'Word',  icon: FileText,  color: '#60a5fa' },
  { ext: '.xlsx', label: 'Excel', icon: Sheet,     color: '#34d399' },
  { ext: '.pptx', label: 'PPT',   icon: FileText,  color: '#fb923c' },
  { ext: '.txt',  label: 'TXT',   icon: FileCode,  color: '#a78bfa' },
  { ext: '.csv',  label: 'CSV',   icon: FileCode,  color: '#facc15' },
  { ext: '.md',   label: 'MD',    icon: FileCode,  color: '#38bdf8' },
  { ext: '.html', label: 'HTML',  icon: Globe,     color: '#fb7185' },
]
const ALLOWED_EXTS = FILE_TYPES.map(t => t.ext)
const ALLOWED_MIME = '.pdf,.doc,.docx,.pptx,.txt,.md,.json,.html,.csv,.xlsx'

function fileTypeInfo(filename) {
  const ext = '.' + (filename || '').split('.').pop().toLowerCase()
  return FILE_TYPES.find(t => t.ext === ext) || { ext, label: ext.replace('.', '').toUpperCase(), icon: File, color: '#94a3b8' }
}

function formatSize(b) {
  if (!b) return '—'
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(b / 1024)} KB`
}

function TabAdjuntos({ botId, refreshKey }) {
  const fileRef   = useRef()
  const [drag,    setDrag]    = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [pending, setPending] = useState([])
  const [errors,  setErrors]  = useState([])

  const { data: files, refetch } = useApi(() => api.getAgentFiles(botId), [botId, refreshKey])
  const fileList = Array.isArray(files) ? files : []

  function addPending(newFiles) {
    const valid = []
    const errs  = []
    Array.from(newFiles).forEach(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      if (!ALLOWED_EXTS.includes(ext)) {
        errs.push(`${f.name}: formato no admitido`)
        return
      }
      if (f.size > 10 * 1024 * 1024) {
        errs.push(`${f.name}: excede el límite de 10 MB`)
        return
      }
      valid.push(f)
    })
    setErrors(errs)
    setPending(prev => {
      const combined = [...prev, ...valid]
      const remaining = 10 - fileList.length
      return combined.slice(0, remaining)
    })
  }

  async function upload() {
    if (!pending.length) return
    setSaving(true); setErrors([])
    try {
      for (const f of pending) {
        const form = new FormData()
        form.append('file', f)
        await fetch(`/api/agents/${botId}/files`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('aria_token')}` },
          body: form,
        })
      }
      setPending([])
      refetch?.()
    } catch (e) {
      setErrors([e.message])
    }
    setSaving(false)
  }

  async function deleteFile(fileId) {
    try { await api.deleteAgentFile(botId, fileId); refetch?.() } catch {}
  }

  const canAddMore = fileList.length + pending.length < 10

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-white">Archivos del agente</p>
        <p className="text-xs text-white/40 mt-0.5">
          Los archivos se indexan en Dify Knowledge Base para búsqueda semántica (RAG).
        </p>
      </div>

      {/* Tipos soportados */}
      <div className="flex flex-wrap gap-1.5">
        {FILE_TYPES.map(t => {
          const Icon = t.icon
          return (
            <span key={t.ext} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
              style={{ background: t.color + '15', color: t.color, border: `1px solid ${t.color}30` }}>
              <Icon size={10} />{t.label}
            </span>
          )
        })}
      </div>

      {/* Drop zone */}
      {canAddMore && (
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); addPending(e.dataTransfer.files) }}
          onClick={() => fileRef.current?.click()}
          className={`relative rounded-2xl p-8 text-center cursor-pointer transition-all overflow-hidden
            ${drag
              ? 'border-2 border-aria-400 bg-aria-500/10'
              : 'border-2 border-dashed border-white/10 hover:border-white/20 bg-white/2 hover:bg-white/4'
            }`}>
          {/* Background glow on drag */}
          {drag && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, #6b7fff18 0%, transparent 70%)' }} />
          )}
          <input ref={fileRef} type="file" multiple className="hidden"
            accept={ALLOWED_MIME}
            onChange={e => addPending(e.target.files)} />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all
              ${drag ? 'bg-aria-500/20 border border-aria-500/30' : 'bg-white/5 border border-white/8'}`}>
              <Upload size={22} className={drag ? 'text-aria-400' : 'text-white/30'} />
            </div>
            <div>
              <p className="text-sm font-medium text-white/70">
                {drag ? 'Suelta los archivos acá' : 'Arrastrá los archivos o hacé clic'}
              </p>
              <p className="text-xs text-white/35 mt-1">
                PDF, Word, Excel, PowerPoint, TXT, CSV, MD, HTML · hasta 10 MB c/u
              </p>
            </div>
            {!drag && (
              <span className="px-4 py-1.5 rounded-full bg-white/8 border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/12 transition-colors">
                Seleccionar archivos
              </span>
            )}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400 px-1">{e}</p>
          ))}
        </div>
      )}

      {/* Archivos pendientes */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-white/50">
              {pending.length} archivo{pending.length !== 1 ? 's' : ''} listo{pending.length !== 1 ? 's' : ''} para subir
            </p>
            <button onClick={() => setPending([])} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
              Limpiar
            </button>
          </div>
          <div className="space-y-1.5">
            {pending.map((f, i) => {
              const info = fileTypeInfo(f.name)
              const Icon = info.icon
              return (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors"
                  style={{ background: info.color + '08', borderColor: info.color + '25' }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: info.color + '15' }}>
                    <Icon size={14} style={{ color: info.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate font-medium">{f.name}</p>
                    <p className="text-[10px] text-white/35">{formatSize(f.size)}</p>
                  </div>
                  <button onClick={() => setPending(p => p.filter((_, idx) => idx !== i))}
                    className="text-white/25 hover:text-red-400 transition-colors shrink-0">
                    <X size={13} />
                  </button>
                </div>
              )
            })}
          </div>
          <button onClick={upload} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={saving ? { background: '#6b7fff40', color: '#fff' } : { background: 'linear-gradient(135deg,#6b7fff,#a78bfa)', color: '#fff' }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {saving ? 'Subiendo a Dify KB...' : `Subir ${pending.length} archivo${pending.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Archivos subidos */}
      {fileList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-white/50">
              {fileList.length} archivo{fileList.length !== 1 ? 's' : ''} indexado{fileList.length !== 1 ? 's' : ''}
            </p>
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <Check size={10} /> Dify KB
            </span>
          </div>
          <div className="space-y-1.5">
            {fileList.map(f => {
              const info = fileTypeInfo(f.filename)
              const Icon = info.icon
              return (
                <div key={f.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/3 border border-white/8 group">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: info.color + '15' }}>
                    <Icon size={14} style={{ color: info.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/75 truncate font-medium">{f.filename}</p>
                    <p className="text-[10px] text-white/35">{formatSize(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-green-400/60 font-medium hidden group-hover:inline">indexado</span>
                    <button onClick={() => deleteFile(f.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {fileList.length === 0 && pending.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-12 h-12 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
            <Paperclip size={20} className="text-white/20" />
          </div>
          <p className="text-xs text-white/30 text-center">
            Sin archivos. Subí documentos para que el agente los use como base de conocimiento.
          </p>
        </div>
      )}

      {!canAddMore && (
        <p className="text-xs text-white/30 text-center">Límite de 10 archivos alcanzado.</p>
      )}
    </div>
  )
}

// ── Tab: Base de Conocimiento (Dify KB) ──────────────────────────────────────

function TabKB({ botId, projectId }) {
  const [kbItems, setKbItems] = useState([])
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

  async function loadKb() {
    if (!botId) return
    setLoading(true)
    const items = await api.getAgentKb(botId).catch(() => [])
    setKbItems(Array.isArray(items) ? items : [])
    setLoading(false)
  }

  useEffect(() => { loadKb() }, [botId]) // eslint-disable-line

  async function add(payload) {
    setSaving(true); setError('')
    try {
      await api.addAgentKbItem(botId, payload)
      await loadKb()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  async function del(id) {
    setDeleting(id)
    try { await api.deleteAgentKbItem(botId, id); await loadKb() }
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
        <p className="text-sm font-semibold text-white">Base de Conocimiento</p>
        <p className="text-xs text-white/35 mt-0.5">
          El contenido se indexa en Dify Knowledge Base (RAG con Qdrant). El agente lo usa automáticamente al responder.
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
          <p className="text-xs text-white/40">Pegá una URL — se scrapea y guarda en Dify KB para búsqueda semántica.</p>
          <div className="flex gap-2">
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && urlInput.trim()) { add({ type: 'url', title: urlInput.trim(), url: urlInput.trim() }); setUrlInput('') } }}
              placeholder="https://miempresa.com/pagina" className={inputCls2 + ' flex-1'} />
            <button type="button" disabled={saving || !urlInput.trim()}
              onClick={() => { add({ type: 'url', title: urlInput.trim(), url: urlInput.trim() }); setUrlInput('') }}
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
            onClick={() => { add({ type: 'faq', title: faqQ.trim(), content: faqA.trim() }); setFaqQ(''); setFaqA('') }}
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
            onClick={() => { add({ type: 'text', title: textTitle.trim() || 'Texto', content: textBody.trim() }); setTextTitle(''); setTextBody('') }}
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/40 font-medium">{kbItems.length} elemento{kbItems.length !== 1 ? 's' : ''}</p>
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <Check size={10} /> indexado en Dify
            </span>
          </div>
          {kbItems.map(item => {
            const icons = { url: Globe, faq: MessageSquare, text: FileText, pdf: Paperclip, docx: Paperclip }
            const Icon = icons[item.type] || FileText
            const id = item.id
            return (
              <div key={id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white/4 border border-white/8">
                <Icon size={14} className="text-white/30 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/80 font-medium truncate">{item.title || `(${item.type})`}</p>
                  {item.preview && <p className="text-[10px] text-white/30 mt-0.5 line-clamp-1">{item.preview}</p>}
                  <p className="text-[10px] mt-0.5 text-green-400/70">Dify KB · {item.chars} chars</p>
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
  { id: 'seguimientos',  label: 'Seguimientos',   icon: Send },
  { id: 'integraciones', label: 'Integraciones',  icon: Plug },
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

  const { data: metadata } = useApi(() => api.getAgentMetadata(), [refreshKey])
  const { data: channels } = useApi(() => api.getWahaSessions(),  [])
  const { data: members }  = useApi(() => api.getWorkspaceMembers(), [])

  const meta = Array.isArray(metadata) ? metadata.find(m => m.bot_id === botId) : null
  const agentName = meta?.name || meta?.company_name || botId

  if (!meta) {
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
          <h1 className="text-sm font-semibold text-white truncate">{agentName}</h1>
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
              botName={agentName}
              onSaved={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'configuracion' && (
            <TabConfiguracion
              meta={meta} botId={botId} projectId={projectId}
              channels={Array.isArray(channels) ? channels : []}
              agents={Array.isArray(members) ? members : []}
              onSaved={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'seguimientos' && (
            <TabSeguimientos
              meta={meta} botId={botId}
              onSaved={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'integraciones' && (
            <TabIntegraciones
              meta={meta} botId={botId}
              onSaved={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'kb' && (
            <TabKB botId={botId} projectId={projectId} />
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
