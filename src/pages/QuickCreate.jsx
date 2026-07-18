import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Sparkles, ArrowLeft, CheckCircle, Copy, Send, Bot, Plug } from 'lucide-react'

// ── Script conversacional de ARIA ─────────────────────────────────────────────
const SCRIPT = [
  {
    key: 'intro',
    aria: `¡Hola! Soy ARIA y voy a ayudarte a crear un asistente virtual para tu negocio.\n\nUn buen agente no es solo responder preguntas — empatiza, guía y resuelve. Juntos vamos a diseñarlo.\n\n¿Empezamos?`,
    type: 'confirm',
    confirmLabel: 'Sí, vamos',
  },
  {
    key: 'company',
    aria: '¿Cómo se llama tu empresa o marca?',
    type: 'text',
    placeholder: 'Ej: Saludok, TurneroApp, La Boutique...',
  },
  {
    key: 'industry',
    aria: ({ company }) => `Perfecto. ¿A qué se dedica ${company}? Contame brevemente — qué ofrecen, a quién le venden.`,
    type: 'text',
    placeholder: 'Ej: Somos una prepaga de salud para pymes en Argentina...',
  },
  {
    key: 'queries',
    aria: 'Genial. ¿Qué consultas llegan más seguido? Las 3 primeras preguntas que hace un cliente nuevo.',
    type: 'text',
    placeholder: 'Ej: Coberturas, turnos, aranceles, horarios, precios...',
  },
  {
    key: 'agentName',
    aria: '¿Cómo querés que se llame el asistente? (si no tenés nombre, lo inventamos)',
    type: 'text',
    placeholder: 'Ej: Luana, Max, Asistente Saludok...',
  },
  {
    key: 'tone',
    aria: ({ agentName }) => `¿Con qué tono debería hablar ${agentName || 'el asistente'}? Por ejemplo: muy formal, amigable y cercano, técnico y preciso, cálido como atención al cliente...`,
    type: 'text',
    placeholder: 'Ej: Amigable, cálido, sin tecnicismos...',
  },
  {
    key: 'handoff',
    aria: '¿Hay situaciones donde necesitás que un humano tome la conversación? ¿Cuándo?',
    type: 'text',
    placeholder: 'Ej: Cuando el cliente lo pide, cuando hay un reclamo, cuando no puede resolver...',
  },
  {
    key: 'restrictions',
    aria: '¿Hay algo que el asistente NO debería responder, prometer o hacer?',
    type: 'text',
    placeholder: 'Ej: No dar precios, no prometer turnos, no hablar de la competencia...',
  },
  {
    key: 'integrations',
    aria: ({ agentName, company }) =>
      `Una cosa más: ¿${agentName || 'el asistente'} necesita consultar información en tiempo real?\n\nPor ejemplo: ver stock en Google Sheets, consultar precios de una API, leer turnos disponibles de un sistema externo, acceder a un CRM...\n\nO no necesita nada externo y responde solo con lo que sabe.`,
    type: 'choice',
    choices: [
      { value: 'none',   label: 'No, solo responde con su conocimiento' },
      { value: 'sheets', label: 'Sí — Google Sheets' },
      { value: 'api',    label: 'Sí — API / Endpoint propio' },
      { value: 'other',  label: 'Sí — otra cosa' },
    ],
  },
  {
    key: 'integrationDetail',
    aria: ({ integrations }) => {
      if (integrations === 'none') return null // se saltea
      if (integrations === 'sheets') return '¿Qué datos tiene que consultar del Sheet? ¿Precios, stock, horarios, turnos? Describí qué columnas tiene la planilla.'
      if (integrations === 'api') return '¿Cuál es la URL base de tu API y qué datos devuelve? (después te pido la API key si la necesita)'
      return '¿Qué sistema externo y qué datos necesita consultar?'
    },
    type: 'text',
    skip: ({ integrations }) => integrations === 'none',
    placeholder: 'Ej: Columnas: Producto, Precio, Stock. Filtramos por nombre de producto...',
  },
  {
    key: 'apiKey',
    aria: ({ integrations }) => {
      if (integrations === 'sheets') return '¿Tenés la API Key de Google? (necesito una Service Account Key o una API Key con acceso al sheet)\n\nSi no la tenés ahora, podés saltear y la configuramos después en Dify.'
      if (integrations === 'api') return '¿Tu API necesita autenticación? Si tiene API key, bearer token o similar, pegalo acá. Si no tiene auth, escribí "sin auth".'
      return '¿Necesita alguna credencial para conectarse? Pegala acá o escribí "no" si no aplica.'
    },
    type: 'text',
    skip: ({ integrations }) => integrations === 'none',
    placeholder: 'Ej: Bearer eyJ... / sk-... / sin auth',
    sensitive: true,
  },
  {
    key: 'integrationUrl',
    aria: ({ integrations }) => {
      if (integrations === 'sheets') return '¿Cuál es el ID de tu Google Sheet? (está en la URL: docs.google.com/spreadsheets/d/**ID**/edit)'
      if (integrations === 'api') return '¿Cuál es la URL exacta del endpoint que tiene que consultar?'
      return null
    },
    type: 'text',
    skip: ({ integrations }) => integrations === 'none' || integrations === 'other',
    placeholder: 'Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
  },
  {
    key: 'confirm',
    aria: (answers) => {
      const hasInteg = answers.integrations !== 'none'
      const integLabel = { sheets: 'Google Sheets', api: 'API externa', other: 'sistema externo', none: '' }[answers.integrations] || ''
      return `Perfecto, tengo todo. Esto es lo que voy a crear:\n\n🏢 Empresa: ${answers.company}\n🤖 Nombre: ${answers.agentName || '(auto)'}\n🎯 Tono: ${answers.tone}\n📋 Foco: ${answers.queries}${hasInteg ? `\n🔌 Integración: ${integLabel}` : ''}\n\n${hasInteg ? 'Voy a generar un workflow completo con nodos de IA + conexión externa.' : 'Voy a generar el agente con instrucciones optimizadas.'}\n\n¿Arrancamos?`
    },
    type: 'confirm',
    confirmLabel: 'Crear agente',
  },
]

const STEPS = [
  'Analizando el perfil del agente',
  'Generando instrucciones con IA',
  'Diseñando el workflow',
  'Creando app en Dify',
  'Configurando integraciones',
  'Activando agente',
]

// ── Componentes de mensaje ────────────────────────────────────────────────────

function AriaMessage({ text }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5"
        style={{ background: 'linear-gradient(135deg,#6b7fff,#a78bfa)' }}>
        <Bot size={14} className="text-white" />
      </div>
      <div className="max-w-sm bg-white/6 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}

function UserMessage({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-sm px-4 py-3 rounded-2xl rounded-tr-sm text-sm text-white/90 leading-relaxed"
        style={{ background: 'linear-gradient(135deg,#6b7fff30,#a78bfa30)', border: '1px solid #6b7fff25' }}>
        {text}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function QuickCreate() {
  const navigate  = useNavigate()
  const [messages, setMessages] = useState([])
  const [answers,  setAnswers]  = useState({})
  const [step,     setStep]     = useState(0)
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [genStep,  setGenStep]  = useState(-1)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)
  const [copied,   setCopied]   = useState(false)
  const bottomRef = useRef()
  const inputRef  = useRef()

  // Primer mensaje al montar
  useEffect(() => {
    const first = SCRIPT[0]
    setMessages([{ type: 'aria', text: typeof first.aria === 'function' ? first.aria({}) : first.aria }])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, genStep])

  function getScript(idx) { return SCRIPT[idx] }

  function advanceScript(key, userAnswer, displayText) {
    const newAnswers = { ...answers, [key]: userAnswer }
    setAnswers(newAnswers)

    // Buscar el siguiente step no salteable
    let nextIdx = step + 1
    while (nextIdx < SCRIPT.length) {
      const s = SCRIPT[nextIdx]
      if (!s.skip || !s.skip(newAnswers)) break
      nextIdx++
    }

    if (nextIdx >= SCRIPT.length) return

    const next = SCRIPT[nextIdx]
    const ariaText = typeof next.aria === 'function' ? next.aria(newAnswers) : next.aria
    if (!ariaText) { setStep(nextIdx); return } // nodo sin texto → saltar

    setTimeout(() => {
      setMessages(prev => [...prev, { type: 'aria', text: ariaText }])
      setStep(nextIdx)
      if (next.type === 'text') setTimeout(() => inputRef.current?.focus(), 100)
    }, 350)
  }

  function handleChoice(choice) {
    const current = getScript(step)
    setMessages(prev => [...prev, { type: 'user', text: choice.label }])
    advanceScript(current.key, choice.value, choice.label)
  }

  function handleConfirm() {
    const current = getScript(step)
    setMessages(prev => [...prev, { type: 'user', text: current.confirmLabel || 'Sí' }])
    if (current.key === 'confirm') {
      generateAgent()
    } else {
      advanceScript(current.key, 'sí', current.confirmLabel)
    }
  }

  function handleSend() {
    const val = input.trim()
    if (!val || loading) return
    setInput('')
    const current = getScript(step)
    const display = current.sensitive ? '••••••••' : val
    setMessages(prev => [...prev, { type: 'user', text: display }])
    advanceScript(current.key, val, display)
  }

  async function generateAgent() {
    setLoading(true)
    setGenStep(0)
    setError(null)

    const DELAYS = [2000, 5000, 3000, 2500, 2000, 1500]
    let idx = 0
    const advance = () => { idx++; if (idx < STEPS.length) { setGenStep(idx); setTimeout(advance, DELAYS[idx]) } }
    setTimeout(advance, DELAYS[0])

    try {
      const data = await api.quickCreateAgent({
        name:        answers.agentName,
        company:     answers.company,
        description: [
          `Empresa: ${answers.company}`,
          `Industria: ${answers.industry}`,
          `Consultas frecuentes: ${answers.queries}`,
          `Derivación a humano: ${answers.handoff}`,
          `Restricciones: ${answers.restrictions}`,
        ].join('\n'),
        tone:              answers.tone,
        integrations:      answers.integrations,
        integrationDetail: answers.integrationDetail,
        apiKey:            answers.apiKey,
        integrationUrl:    answers.integrationUrl,
      })
      setGenStep(STEPS.length)
      setResult(data)
    } catch (e) {
      setError(e.message || 'Error al crear el agente')
      setGenStep(-1)
      setLoading(false)
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(result.apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const current = getScript(step)
  const progress = Math.round((step / (SCRIPT.length - 1)) * 100)

  return (
    <div className="h-screen bg-[#0a0a14] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/6 shrink-0">
        <button onClick={() => navigate('/agents')}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={15} /> Agentes
        </button>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-aria-400" />
          <span className="text-sm font-medium text-white">Crear agente con IA</span>
        </div>
        {!loading && !result && step > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-24 h-1 bg-white/8 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#6b7fff,#a78bfa)' }} />
            </div>
            <span className="text-xs text-white/25">{progress}%</span>
          </div>
        )}
      </div>

      {/* Mensajes */}
      {!result && (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-lg mx-auto flex flex-col gap-3.5">
            {messages.map((m, i) => (
              m.type === 'aria'
                ? <AriaMessage key={i} text={m.text} />
                : <UserMessage key={i} text={m.text} />
            ))}

            {/* Loading de generación */}
            {loading && (
              <div className="mt-2 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="relative w-6 h-6">
                    <div className="absolute inset-0 rounded-full border-2 border-t-aria-400 animate-spin" />
                  </div>
                  <span className="text-sm text-white/60">Generando tu agente...</span>
                </div>
                {STEPS.map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 transition-all duration-500 ${i <= genStep ? 'opacity-100' : 'opacity-20'}`}>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      i < genStep ? 'bg-green-500/20' : i === genStep ? 'bg-aria-500/20' : 'bg-white/5'}`}>
                      {i < genStep
                        ? <CheckCircle size={10} className="text-green-400" />
                        : <div className={`w-1 h-1 rounded-full ${i === genStep ? 'bg-aria-400 animate-pulse' : 'bg-white/15'}`} />}
                    </div>
                    <span className={`text-xs ${i === genStep ? 'text-white' : i < genStep ? 'text-white/40' : 'text-white/15'}`}>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-lg mx-auto flex flex-col gap-4">
            <div className="text-center py-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/15 border border-green-500/20 mb-3">
                <CheckCircle size={26} className="text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">¡Agente creado!</h2>
              <p className="text-sm text-white/40">
                <span className="text-white/70 font-medium">{result.agentName}</span> está configurado y activo.
                {result.hasWorkflow && <span className="ml-1 text-aria-400">Con workflow de integración.</span>}
              </p>
            </div>

            <div className="bg-white/3 border border-white/8 rounded-xl p-4">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Instrucciones generadas</p>
              <p className="text-xs text-white/55 leading-relaxed whitespace-pre-wrap">{result.systemPrompt}</p>
            </div>

            {result.hasWorkflow && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-aria-500/10 border border-aria-500/20">
                <Plug size={14} className="text-aria-400 shrink-0" />
                <p className="text-xs text-aria-300">Se generó un workflow con nodo de integración externa. Configurá las credenciales en Dify si es necesario.</p>
              </div>
            )}

            <div className="bg-white/3 border border-white/8 rounded-xl p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">API Key Dify</p>
                <p className="text-xs text-white/50 font-mono truncate">{result.apiKey}</p>
              </div>
              <button onClick={copyKey}
                className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 hover:text-white transition-colors">
                <Copy size={11} />{copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => navigate('/agents')}
                className="flex-1 py-3 rounded-xl text-sm text-white/60 bg-white/5 hover:bg-white/8 transition-colors">
                Ver agentes
              </button>
              <button onClick={() => window.location.reload()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#6b7fff,#a78bfa)' }}>
                Crear otro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      {!loading && !result && (
        <div className="shrink-0 border-t border-white/6 px-6 py-4">
          <div className="max-w-lg mx-auto">
            {current?.type === 'confirm' && (
              <button onClick={handleConfirm}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg,#6b7fff,#a78bfa)' }}>
                {current.confirmLabel || 'Continuar'}
              </button>
            )}

            {current?.type === 'choice' && (
              <div className="flex flex-col gap-2">
                {current.choices.map(c => (
                  <button key={c.value} onClick={() => handleChoice(c)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-sm text-white/70 hover:text-white hover:bg-white/8 hover:border-white/15 transition-all">
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {current?.type === 'text' && (
              <div className="flex items-center gap-2">
                <input ref={inputRef} type={current.sensitive ? 'password' : 'text'}
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder={current.placeholder || 'Escribí tu respuesta...'}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-aria-500 transition-colors" />
                <button onClick={handleSend} disabled={!input.trim()}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: input.trim() ? 'linear-gradient(135deg,#6b7fff,#a78bfa)' : '#ffffff08' }}>
                  <Send size={16} className="text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
