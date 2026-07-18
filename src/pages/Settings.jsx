import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import {
  User, Mail, Phone, Globe, MapPin, Building2, Hash, Flag,
  LogOut, Save, MessageSquare, Bot, CreditCard, Users,
  Check, Plus, X, Upload, FileText, Trash2, ChevronRight,
  Zap, Shield, Star, RefreshCw, Wifi, WifiOff, QrCode,
  Settings2, Key, Link, Unlink, UserPlus, Crown, ChevronDown,
  Copy, CheckCircle, Loader2, ExternalLink,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function ls(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

// ── Tab nav ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'cuenta',    label: 'Cuenta',      icon: User },
  { id: 'canales',   label: 'Canales',     icon: MessageSquare },
  // ## { id: 'copilot',   label: 'Copilot IA',  icon: Bot }, // oculto — era Tiledesk KB, reemplazado por sugerencia IA integrada en Conversaciones
  { id: 'plan',      label: 'Plan',        icon: CreditCard },
  { id: 'vendedores',label: 'Vendedores',  icon: Users },
]

// ── Cuenta ────────────────────────────────────────────────────────────────────

function TabCuenta() {
  const [form, setForm] = useState(() => ls('aria_settings_cuenta', {
    logo: '', nombre: '', email: '', telefono: '',
    sitio: '', direccion: '', ciudad: '', cp: '', pais: '',
  }))
  const [saved, setSaved] = useState(false)
  const logoRef = useRef(null)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, logo: ev.target.result }))
    reader.readAsDataURL(file)
  }

  const handleSave = (e) => {
    e.preventDefault()
    lsSet('aria_settings_cuenta', form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Información de tu cuenta</h2>
        <p className="text-xs text-white/40 mt-0.5">Gestiona la información y configuración de tu cuenta</p>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-5">
        <div
          onClick={() => logoRef.current?.click()}
          className="w-20 h-20 rounded-2xl bg-surface-50 border-2 border-dashed border-white/15 flex items-center justify-center cursor-pointer hover:border-aria-500/50 transition-colors overflow-hidden shrink-0"
        >
          {form.logo
            ? <img src={form.logo} alt="logo" className="w-full h-full object-cover" />
            : <Building2 className="w-8 h-8 text-white/20" />}
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
        <div>
          <p className="text-sm font-medium text-white mb-1">Logo de la empresa</p>
          <button type="button" onClick={() => logoRef.current?.click()}
            className="text-xs text-aria-400 hover:text-aria-300 transition-colors">
            Cambiar imagen
          </button>
          <p className="text-xs text-white/30 mt-0.5">PNG, JPG hasta 2MB</p>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre de la empresa" icon={Building2} name="nombre" value={form.nombre} onChange={handleChange} placeholder="Mi Empresa S.A." span2 />
        <Field label="Email de contacto"    icon={Mail}      name="email"  value={form.email}  onChange={handleChange} placeholder="contacto@empresa.com" type="email" />
        <Field label="Teléfono"             icon={Phone}     name="telefono" value={form.telefono} onChange={handleChange} placeholder="+54 9 11 1234 5678" />
        <Field label="Sitio web"            icon={Globe}     name="sitio"  value={form.sitio}  onChange={handleChange} placeholder="https://miempresa.com" span2 />
        <Field label="Dirección"            icon={MapPin}    name="direccion" value={form.direccion} onChange={handleChange} placeholder="Av. Corrientes 1234" span2 />
        <Field label="Ciudad"               icon={MapPin}    name="ciudad" value={form.ciudad} onChange={handleChange} placeholder="Buenos Aires" />
        <Field label="Código postal"        icon={Hash}      name="cp"     value={form.cp}     onChange={handleChange} placeholder="C1043" />
        <Field label="País"                 icon={Flag}      name="pais"   value={form.pais}   onChange={handleChange} placeholder="Argentina" span2 />
      </div>

      <SaveBtn saved={saved} />
    </form>
  )
}

function Field({ label, icon: Icon, name, value, onChange, placeholder, type = 'text', span2 }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-white/50 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
        <input name={name} type={type} value={value} onChange={onChange} placeholder={placeholder}
          className="w-full bg-surface-50 text-white text-sm pl-9 pr-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20" />
      </div>
    </div>
  )
}

function SaveBtn({ saved }) {
  return (
    <button type="submit"
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors">
      {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {saved ? 'Guardado' : 'Guardar cambios'}
    </button>
  )
}

// ── Canales ───────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'waha',      label: 'WAHA',         color: '#22c55e', desc: 'WhatsApp HTTP API — self-hosted' },
  { id: 'evolution', label: 'EvolutionGo', color: '#6366f1', desc: 'EvolutionGo — self-hosted' },
  { id: 'uzapi',     label: 'UZAPI',         color: '#f59e0b', desc: 'UZapi — cloud o self-hosted' },
]

function statusBadge(status) {
  const s = (status || '').toUpperCase()
  if (['WORKING','CONNECTED','open'].includes(s))
    return <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full"><Wifi size={9}/>Conectado</span>
  if (['SCAN_QR_CODE','STARTING','connecting','created'].includes(s))
    return <span className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/15 px-2 py-0.5 rounded-full"><QrCode size={9}/>Esperando QR</span>
  return <span className="flex items-center gap-1 text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full"><WifiOff size={9}/>{status || 'Desconectado'}</span>
}

function QRModal({ instance, onClose, onRestart }) {
  const [qr, setQr]           = useState(null)
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)

  const fetchQR = useCallback(async () => {
    try {
      const d = await api.getInstanceQR(instance.id)
      setQr(d.qrcode)
      setStatus(d.status || '')
    } catch {}
    setLoading(false)
  }, [instance.id])

  useEffect(() => {
    fetchQR()
    const t = setInterval(fetchQR, 5000)
    return () => clearInterval(t)
  }, [fetchQR])

  const connected    = ['WORKING','CONNECTED','open'].includes((status||'').toUpperCase())
  const disconnected = (status||'').toLowerCase() === 'disconnected'

  async function handleRestart() {
    setRestarting(true)
    setStatus('')
    setQr(null)
    setLoading(true)
    try {
      await api.restartChannelInstance(instance.id)
      onRestart?.()
      // Esperar 2s y volver a pedir QR
      await new Promise(r => setTimeout(r, 2000))
      await fetchQR()
    } catch (e) {
      alert(e.message)
    }
    setRestarting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">Conectar WhatsApp</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-white/40"><X size={15}/></button>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          {connected ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="text-green-400" size={28} />
              </div>
              <p className="text-sm text-green-400 font-semibold">¡Conectado!</p>
              <p className="text-xs text-white/40 text-center">WhatsApp conectado correctamente. Ya podés recibir mensajes.</p>
            </div>
          ) : disconnected ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                <WifiOff className="text-red-400" size={24} />
              </div>
              <p className="text-sm text-white/70 font-medium">Sesión no encontrada en WAHA</p>
              <p className="text-xs text-white/40">La sesión fue eliminada o WAHA se reinició.<br/>Reconectá para crear una nueva sesión.</p>
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {restarting ? <><Loader2 size={14} className="animate-spin" />Reconectando…</> : <><RefreshCw size={14}/>Reconectar</>}
              </button>
            </div>
          ) : loading || restarting ? (
            <div className="py-8 flex flex-col items-center gap-2">
              <RefreshCw size={24} className="text-white/20 animate-spin" />
              <p className="text-xs text-white/30">{restarting ? 'Iniciando sesión…' : 'Generando QR…'}</p>
            </div>
          ) : qr ? (
            <>
              <p className="text-xs text-white/50 text-center">Escaneá el código con WhatsApp</p>
              <img src={qr} alt="QR Code" className="w-52 h-52 rounded-xl border border-white/10" />
              <p className="text-[11px] text-white/30 flex items-center gap-1">
                <RefreshCw size={9} className="animate-spin" />Actualizando cada 5s…
              </p>
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-xs text-white/40">Iniciando sesión, aguardá un momento…</p>
              <button onClick={fetchQR} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
                Reintentar
              </button>
            </div>
          )}
        </div>
        <div className="px-5 pb-4 flex justify-center">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-white/40 hover:text-white/60 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function NewInstanceModal({ onSave, onClose }) {
  const [name,     setName]     = useState('')
  const [provider, setProvider] = useState('waha')
  const [saving,   setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await onSave({ instance_name: name.trim(), provider })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-96 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">Nueva conexión WhatsApp</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-white/40"><X size={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1 block">Nombre de la conexión</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Ventas, Soporte, Principal…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1 block">Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => setProvider(p.id)}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    provider === p.id
                      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/25 mt-1">{PROVIDERS.find(p => p.id === provider)?.desc}</p>
          </div>
        </div>
        <div className="px-5 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-white/40 hover:text-white/60 transition-colors">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
          >
            {saving ? 'Creando…' : 'Crear y conectar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HubSpotSection() {
  const [cfg,     setCfg]     = useState(null)
  const [key,     setKey]     = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    api.getHubspotConfig().then(setCfg).catch(() => {})
  }, [])

  async function handleSave() {
    if (!key.trim()) return
    setSaving(true)
    try {
      await api.saveHubspotConfig(key.trim())
      setCfg({ configured: true, api_key: `${key.slice(0, 16)}...` })
      setKey('')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const r = await api.syncHubspot()
      setSyncMsg(`Sincronizando ${r.queued} contactos en background…`)
    } catch (e) { setSyncMsg(e.message) }
    setSyncing(false)
  }

  return (
    <div className="p-4 rounded-xl border border-white/8 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
          <Key size={11}/>HubSpot CRM
        </p>
        {cfg?.configured && (
          <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400"/> Conectado
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/30">
        Los contactos nuevos de WhatsApp se sincronizan automáticamente a HubSpot. Se crea un Deal en la etapa "Cita programada".
      </p>

      {cfg?.configured && (
        <p className="text-[11px] text-white/40">API key: <span className="text-white/60">{cfg.api_key}</span></p>
      )}

      <div>
        <label className="text-[11px] text-white/40 mb-1 block">
          {cfg?.configured ? 'Nueva API key (Private App token)' : 'API key (Private App token)'}
        </label>
        <input
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="pat-na1-..."
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 placeholder-white/20"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !key.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
        >
          {saved ? <Check size={12}/> : saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
          {saved ? 'Guardado' : 'Guardar'}
        </button>
        {cfg?.configured && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 hover:bg-white/12 text-white/60 hover:text-white text-xs rounded-lg transition-colors"
          >
            {syncing ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
            Sincronizar todos
          </button>
        )}
      </div>
      {syncMsg && <p className="text-[11px] text-white/40">{syncMsg}</p>}
    </div>
  )
}

function TabCanales() {
  const [settings,   setSettings]   = useState({})
  const [instances,  setInstances]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [showNew,    setShowNew]    = useState(false)
  const [showQR,     setShowQR]     = useState(null)  // instance object
  const [activeTab,  setActiveTab]  = useState('instances')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, i] = await Promise.all([api.getChannelSettings(), api.getChannelInstances()])
      setSettings(s || {})
      setInstances(i || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSaveSettings(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.saveChannelSettings(settings)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  async function handleCreateInstance(payload) {
    try {
      const inst = await api.createChannelInstance(payload)
      setInstances(prev => [inst, ...prev])
      setShowNew(false)
      setShowQR(inst)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta conexión?')) return
    await api.deleteChannelInstance(id)
    setInstances(prev => prev.filter(i => i.id !== id))
  }

  async function handleLogout(id) {
    await api.logoutChannelInstance(id)
    load()
  }

  const field = (key) => ({
    value: settings[key] || '',
    onChange: (e) => setSettings(s => ({ ...s, [key]: e.target.value })),
  })

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Canales de WhatsApp</h2>
          <p className="text-xs text-white/40 mt-0.5">Conectá números de WhatsApp vía WAHA, Evolution API o UZAPI</p>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white/3 p-1 rounded-xl border border-white/8 w-fit">
        {[{id:'instances',label:'Conexiones'},{id:'credentials',label:'Credenciales'}].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab===t.id ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/60'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONEXIONES ─────────────────────────────────────────────────────── */}
      {activeTab === 'instances' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/40">{instances.length} conexión{instances.length !== 1 ? 'es' : ''} configurada{instances.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors"
            >
              <Plus size={12} />Nueva conexión
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw size={18} className="text-white/20 animate-spin" />
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/10 rounded-xl gap-3">
              <MessageSquare size={28} className="text-white/15" />
              <p className="text-sm text-white/30">Sin conexiones aún</p>
              <button onClick={() => setShowNew(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                <Plus size={11} />Crear primera conexión
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {instances.map(inst => {
                const prov = PROVIDERS.find(p => p.id === inst.provider)
                return (
                  <div key={inst.id} className="flex items-center gap-3 p-4 rounded-xl border border-white/8 bg-white/3 hover:border-white/12 transition-colors">
                    {/* Provider dot */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ backgroundColor: (prov?.color || '#6366f1') + '20', border: `1px solid ${prov?.color || '#6366f1'}40`, color: prov?.color || '#6366f1' }}>
                      {inst.instance_name?.[0]?.toUpperCase() || 'W'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{inst.instance_name}</p>
                        <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded capitalize">{inst.provider}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {statusBadge(inst.status)}
                        {inst.phone_number && <span className="text-[10px] text-white/30">{inst.phone_number}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setShowQR(inst)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
                        title="Ver QR / reconectar"
                      >
                        <QrCode size={14} />
                      </button>
                      <button
                        onClick={() => handleLogout(inst.id)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-yellow-400 transition-colors"
                        title="Desconectar"
                      >
                        <Unlink size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(inst.id)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-white/20 hover:text-red-400 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Webhook info */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/2">
            <p className="text-xs font-semibold text-white/50 mb-2 flex items-center gap-1.5"><Link size={11}/>Webhook para WAHA</p>
            <p className="text-[11px] text-white/30 mb-2">Configurá esta URL en WAHA como webhook global para recibir mensajes:</p>
            <code className="text-[11px] text-indigo-300 bg-indigo-500/10 px-3 py-2 rounded-lg block break-all">
              {window.location.origin}/webhook/waha
            </code>
            <p className="text-[11px] text-white/20 mt-2">Event filter: <code className="text-white/30">message</code></p>
          </div>
        </div>
      )}

      {/* ── CREDENCIALES ───────────────────────────────────────────────────── */}
      {activeTab === 'credentials' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* WAHA */}
          <div className="p-4 rounded-xl border border-white/8 space-y-3">
            <p className="text-xs font-semibold text-green-400 flex items-center gap-1.5"><Key size={11}/>WAHA</p>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">URL base</label>
              <input {...field('waha_url')} placeholder="http://waha:3000" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">API Key</label>
              <input {...field('waha_key')} type="password" placeholder="tu-api-key" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
          </div>

          {/* Evolution */}
          <div className="p-4 rounded-xl border border-white/8 space-y-3">
            <p className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5"><Key size={11}/>EvolutionGo</p>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">URL base</label>
              <input {...field('evo_url')} placeholder="http://evolution:8080" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">API Key</label>
              <input {...field('evo_key')} type="password" placeholder="tu-api-key" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
          </div>

          {/* UZAPI */}
          <div className="p-4 rounded-xl border border-white/8 space-y-3">
            <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5"><Key size={11}/>UZAPI</p>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">URL base</label>
              <input {...field('uzapi_url')} placeholder="http://uzapi:3000" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">Admin Token</label>
              <input {...field('uzapi_token')} type="password" placeholder="admin-token" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
          </div>

          {/* Chatwoot */}
          <div className="p-4 rounded-xl border border-white/8 space-y-3">
            <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5"><Key size={11}/>Chatwoot</p>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">URL base</label>
              <input {...field('cw_url')} placeholder="https://multichat.tudominio.com" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">API Token</label>
              <input {...field('cw_token')} type="password" placeholder="api_access_token" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">Account ID</label>
              <input {...field('cw_account_id')} placeholder="2" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
          </div>

          {/* kanbancw */}
          <div className="p-4 rounded-xl border border-white/8 space-y-3">
            <div>
              <p className="text-xs font-semibold text-purple-400 flex items-center gap-1.5"><Link size={11}/>kanbancw (CRM)</p>
              <p className="text-[11px] text-white/30 mt-0.5">URL de tu instancia de kanbancw — se embeberá en Conversaciones</p>
            </div>
            <div>
              <label className="text-[11px] text-white/40 mb-1 block">URL de kanbancw</label>
              <input {...field('kanban_url')} placeholder="https://kanban.tudominio.com" className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder-white/20" />
            </div>
          </div>

          {/* HubSpot */}
          <HubSpotSection />

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saved ? <Check size={15}/> : <Save size={15}/>}
            {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar credenciales'}
          </button>
        </form>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showNew && <NewInstanceModal onSave={handleCreateInstance} onClose={() => setShowNew(false)} />}
      {showQR  && <QRModal instance={showQR} onClose={() => { setShowQR(null); load() }} onRestart={load} />}
    </div>
  )
}

// ── Copilot ───────────────────────────────────────────────────────────────────

function TabCopilot() {
  const { project } = useAuth()
  const projectId   = project?._id || project?.id

  const [namespace,  setNamespace]  = useState(null)
  const [faqs,       setFaqs]       = useState([])   // contenidos type:faq de la KB
  const [empresa,    setEmpresa]    = useState('')
  const [empresaId,  setEmpresaId]  = useState(null) // _id del content type:text de empresa
  const [newQ,       setNewQ]       = useState('')
  const [newA,       setNewA]       = useState('')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [addingFaq,  setAddingFaq]  = useState(false)
  const [error,      setError]      = useState(null)

  // Cargar namespace default + contenidos
  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.getKbNamespaces(projectId)
      .then(list => {
        const ns = Array.isArray(list) ? (list.find(n => n.default) || list[0]) : null
        setNamespace(ns)
        if (!ns) { setLoading(false); return }
        return api.getKbContents(projectId, ns.id)
          .then(res => {
            const items = res?.kbs || []
            setFaqs(items.filter(i => i.type === 'faq'))
            const emp = items.find(i => i.type === 'text' && i.name === '__empresa__')
            if (emp) { setEmpresa(emp.content || ''); setEmpresaId(emp._id) }
          })
      })
      .catch(() => setError('No se pudo conectar a la base de conocimiento'))
      .finally(() => setLoading(false))
  }, [projectId])

  async function saveEmpresa() {
    if (!namespace) return
    setSaving(true)
    try {
      if (empresaId) {
        await api.deleteKbContent(projectId, empresaId)
      }
      const res = await api.createKbContent(projectId, {
        name: '__empresa__', type: 'text',
        source: '__empresa__', content: empresa,
        namespace: namespace.id,
      })
      setEmpresaId(res?.value?._id || res?._id || null)
    } catch { setError('Error guardando empresa') }
    setSaving(false)
  }

  async function addFaq() {
    if (!newQ.trim() || !newA.trim() || !namespace) return
    setAddingFaq(true)
    try {
      const res = await api.createKbContent(projectId, {
        name: newQ.trim(),
        type: 'faq',
        source: newQ.trim(),
        content: `${newQ.trim()}\n${newA.trim()}`,
        namespace: namespace.id,
      })
      const created = res?.value || res
      if (created?._id) setFaqs(f => [...f, created])
      setNewQ(''); setNewA('')
    } catch { setError('Error agregando FAQ') }
    setAddingFaq(false)
  }

  async function deleteFaq(id) {
    try {
      await api.deleteKbContent(projectId, id)
      setFaqs(f => f.filter(i => i._id !== id))
    } catch { setError('Error eliminando FAQ') }
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-white/30" /></div>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Base de conocimiento — Copilot</h2>
        <p className="text-xs text-white/40 mt-0.5">
          {namespace
            ? <>KB: <span className="text-white/60">{namespace.name}</span> · Los agentes IA y el Copilot usan esta información para responder.</>
            : 'Sin Knowledge Base configurada en Tiledesk'}
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
      )}

      {/* Features */}
      <div className="p-4 rounded-xl border border-aria-500/20 bg-aria-500/5 space-y-2">
        <p className="text-xs font-semibold text-aria-300 mb-3">Cómo funciona</p>
        {[
          'Los agentes IA consultan esta KB para responder preguntas específicas de tu negocio.',
          'El Copilot sugiere respuestas basadas en las FAQs cuando un agente humano atiende.',
          'El contexto de empresa se inyecta automáticamente en cada conversación.',
        ].map((t, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-4 h-4 rounded-full bg-aria-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-2.5 h-2.5 text-aria-300" />
            </div>
            <p className="text-xs text-white/60">{t}</p>
          </div>
        ))}
      </div>

      {/* Descripción de empresa */}
      <div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">Contexto de la empresa</label>
        <p className="text-[11px] text-white/30 mb-2">Describe tu empresa, productos y servicios. Este texto se sube a la KB de Tiledesk.</p>
        <textarea
          value={empresa} onChange={e => setEmpresa(e.target.value)} rows={4}
          placeholder="Describe tu empresa, productos, horarios, políticas..."
          className="w-full bg-surface-50 text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button onClick={saveEmpresa} disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-aria-500 hover:bg-aria-600 text-white transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Guardar contexto
          </button>
        </div>
      </div>

      {/* FAQs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-medium text-white/50">Preguntas frecuentes</p>
            <p className="text-[11px] text-white/25 mt-0.5">{faqs.length} preguntas indexadas en la KB</p>
          </div>
        </div>

        {/* Nueva FAQ */}
        <div className="p-3 rounded-xl border border-white/8 bg-surface-50 space-y-2 mb-3">
          <p className="text-[10px] font-semibold text-aria-400 uppercase tracking-wider">Nueva pregunta</p>
          <input
            value={newQ} onChange={e => setNewQ(e.target.value)}
            placeholder="¿Cuál es el horario de atención?"
            className="w-full bg-surface text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20"
          />
          <textarea
            value={newA} onChange={e => setNewA(e.target.value)} rows={2}
            placeholder="Lunes a viernes de 9 a 18hs."
            className="w-full bg-surface text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20 resize-none"
          />
          <div className="flex justify-end">
            <button onClick={addFaq} disabled={addingFaq || !newQ.trim() || !newA.trim()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/70 hover:text-white transition-colors disabled:opacity-40">
              {addingFaq ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Agregar a la KB
            </button>
          </div>
        </div>

        {/* Lista FAQs */}
        {faqs.length === 0 ? (
          <p className="text-xs text-white/25 text-center py-4">Sin preguntas frecuentes. Agregá la primera arriba.</p>
        ) : (
          <div className="space-y-2">
            {faqs.map(faq => {
              const [q, ...rest] = (faq.content || faq.source || '').split('\n')
              const a = rest.join('\n')
              return (
                <div key={faq._id} className="p-3 rounded-xl border border-white/8 bg-surface-50 space-y-1">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">{q || faq.name}</p>
                      {a && <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{a}</p>}
                    </div>
                    <button onClick={() => deleteFaq(faq._id)}
                      className="text-white/20 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {faq.status === 300 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/70">
                      <span className="w-1 h-1 rounded-full bg-emerald-400" /> Indexado
                    </span>
                  )}
                  {faq.status === 100 || faq.status === 200 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/70">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Procesando...
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Plan ──────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter', name: 'Starter', price: 59, desc: 'Perfecto para pequeños negocios',
    features: ['1.500 mensajes de AI', '1 Agente AI', '1 Número de WhatsApp', 'Hasta 2 usuarios', '1 Embudo de ventas', 'Autoservicio'],
  },
  {
    id: 'growth', name: 'Growth', price: 199, desc: 'Para equipos en crecimiento', current: true,
    features: ['4.000 mensajes de AI', 'Agentes ilimitados', '3 Números de WhatsApp', 'Hasta 10 usuarios', 'Embudos ilimitados', 'Smart tags', 'Copilot comercial', 'Soporte prioritario'],
  },
  {
    id: 'pro', name: 'Pro', price: 299, desc: 'Solución empresarial completa',
    features: ['10.000 mensajes de AI', 'Agentes ilimitados', '10 Números de WhatsApp', 'Usuarios ilimitados', 'Embudos ilimitados', 'Smart tags', 'Copilot comercial', 'Soporte prioritario'],
  },
]

const MODELS = {
  openai:    ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-opus-4-7'],
  dify:      [],
}

const COSTS = {
  'gpt-4o-mini':              { in: 0.15,  out: 0.60  },
  'gpt-4o':                   { in: 2.50,  out: 10.0  },
  'gpt-4-turbo':              { in: 10.0,  out: 30.0  },
  'gpt-3.5-turbo':            { in: 0.50,  out: 1.50  },
  'claude-haiku-4-5-20251001':{ in: 0.80,  out: 4.0   },
  'claude-sonnet-4-5':        { in: 3.0,   out: 15.0  },
  'claude-opus-4-7':          { in: 15.0,  out: 75.0  },
}

function TabPlan() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const current = PLANS.find(p => p.current)

  // LLM config
  const [llmCfg,    setLlmCfg]    = useState(null)
  const [provider,  setProvider]  = useState('openai')
  const [apiKey,    setApiKey]    = useState('')
  const [model,     setModel]     = useState('gpt-4o-mini')
  const [savingLlm, setSavingLlm] = useState(false)
  const [llmSaved,  setLlmSaved]  = useState(false)

  // Usage
  const [usage,   setUsage]   = useState(null)
  const [dateFrom,setDateFrom]= useState('')
  const [dateTo,  setDateTo]  = useState('')
  const [loadingU,setLoadingU]= useState(false)

  useEffect(() => {
    api.getLlmConfig().then(c => {
      setLlmCfg(c)
      setProvider(c.provider || 'openai')
      setModel(c.model || 'gpt-4o-mini')
    }).catch(() => {})
    loadUsage()
  }, []) // eslint-disable-line

  async function loadUsage(from, to) {
    setLoadingU(true)
    const params = {}
    if (from) params.from = from
    if (to)   params.to   = to
    const data = await api.getLlmUsage(params).catch(() => null)
    setUsage(data)
    setLoadingU(false)
  }

  async function saveLlm() {
    setSavingLlm(true)
    try {
      await api.saveLlmConfig({ provider, api_key: apiKey, model: provider === 'dify' ? 'dify' : model })
      setLlmSaved(true); setApiKey('')
      setTimeout(() => setLlmSaved(false), 2000)
    } catch {}
    setSavingLlm(false)
  }

  const inputCls2 = 'w-full bg-[#1a1a2e] text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20'

  return (
    <div className="max-w-2xl space-y-8">

      {/* ## Config IA — oculto (modelo SaaS: el proveedor lo gestiona el owner a nivel infra, sin config por workspace)
      {isOwner && (
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Configuración de IA</p>
          <div className="p-5 rounded-2xl border border-white/8 bg-white/2 space-y-4">
            {llmCfg?.configured && (
              <div className="flex items-center gap-2 text-xs text-green-400 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                API key configurada ({llmCfg.api_key}) · modelo: {llmCfg.model}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/50 mb-1.5">Proveedor</p>
                <select value={provider} onChange={e => { setProvider(e.target.value); setModel(MODELS[e.target.value]?.[0] || '') }}
                  className={inputCls2}>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="dify">Dify (self-hosted)</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-1.5">Modelo</p>
                {provider === 'dify' ? (
                  <div className={`${inputCls2} text-white/30 cursor-not-allowed`}>Configurado en Dify</div>
                ) : (
                  <select value={model} onChange={e => setModel(e.target.value)} className={inputCls2}>
                    {(MODELS[provider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">
                {provider === 'dify' ? 'API Key de la app de Dify' : `API Key ${llmCfg?.configured ? '(dejá vacío para no cambiar)' : ''}`}
              </p>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={provider === 'dify' ? 'app-...' : llmCfg?.configured ? llmCfg.api_key : 'sk-...'} type="password"
                className={inputCls2} />
            </div>
            <div className="flex justify-end">
              <button onClick={saveLlm} disabled={savingLlm}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {savingLlm ? <Loader2 size={14} className="animate-spin" /> : llmSaved ? '✓ Guardado' : <Save size={14} />}
                {llmSaved ? '' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      ## */}

      {/* Uso de tokens */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Consumo de tokens IA</p>
        {/* Filtro fechas */}
        <div className="flex gap-2 mb-4 items-end">
          <div className="flex-1">
            <p className="text-xs text-white/40 mb-1">Desde</p>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className={inputCls2} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-white/40 mb-1">Hasta</p>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className={inputCls2} />
          </div>
          <button onClick={() => loadUsage(dateFrom || undefined, dateTo || undefined)}
            disabled={loadingU}
            className="px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white text-sm transition-colors disabled:opacity-50 whitespace-nowrap">
            {loadingU ? <Loader2 size={14} className="animate-spin" /> : 'Filtrar'}
          </button>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); loadUsage() }}
              className="px-3 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white text-xs transition-colors">
              ✕
            </button>
          )}
        </div>

        {!usage && <div className="py-4 text-center text-xs text-white/30">Cargando...</div>}
        {usage && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Tokens entrada',   value: (usage.total?.total_input  || 0).toLocaleString() },
                { label: 'Tokens salida',    value: (usage.total?.total_output || 0).toLocaleString() },
                { label: 'Llamadas totales', value: (usage.total?.total_calls  || 0).toLocaleString() },
              ].map(s => (
                <div key={s.label} className="px-4 py-3 rounded-xl bg-white/4 border border-white/8 text-center">
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {usage.byEndpoint?.length > 0 && (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="grid grid-cols-4 px-4 py-2 bg-white/4 text-[11px] font-medium text-white/40">
                  <span>Función</span><span className="text-right">Llamadas</span>
                  <span className="text-right">Entrada</span><span className="text-right">Salida</span>
                </div>
                {usage.byEndpoint.map((e, i) => (
                  <div key={i} className="grid grid-cols-4 px-4 py-2.5 border-t border-white/6 text-xs">
                    <span className="text-white/70">{e.endpoint}</span>
                    <span className="text-right text-white/50">{e.calls}</span>
                    <span className="text-right text-white/50">{e.input_tokens.toLocaleString()}</span>
                    <span className="text-right text-white/50">{e.output_tokens.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {usage.total?.total_calls === 0 && (
              <p className="text-xs text-white/25 text-center py-2">Sin llamadas registradas en ese período.</p>
            )}
          </div>
        )}
      </div>

      {/* Planes */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Planes Disponibles</p>
        <div className="grid grid-cols-3 gap-3">
          {PLANS.map(plan => (
            <div key={plan.id}
              className={`relative flex flex-col p-4 rounded-2xl border transition-colors ${plan.current ? 'border-aria-500/50 bg-aria-500/10' : 'border-white/8 bg-surface-50 hover:border-white/15'}`}>
              {plan.current && (
                <div className="absolute -top-px left-1/2 -translate-x-1/2">
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 bg-aria-500 text-white rounded-b-lg">Plan Actual</span>
                </div>
              )}
              <p className="text-xs text-white/40 mt-2 mb-0.5">{plan.desc}</p>
              <p className="text-lg font-bold text-white">{plan.name}</p>
              <p className="text-2xl font-bold text-white mb-3">${plan.price}<span className="text-xs font-normal text-white/40">/mes</span></p>
              <ul className="space-y-1.5 flex-1 mb-4">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-white/60">
                    <Check className="w-3 h-3 text-aria-400 shrink-0 mt-0.5" />{f}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${plan.current ? 'bg-aria-500/20 text-aria-300 cursor-default' : 'bg-aria-500 hover:bg-aria-600 text-white'}`}
                disabled={plan.current}
              >
                {plan.current ? 'Activar plan' : 'Suscribirse'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Vendedores ────────────────────────────────────────────────────────────────

const MODULES = [
  { group: 'Comunicación', items: [
    { key: 'conversaciones', label: 'Conversaciones', desc: 'Acceder y gestionar conversaciones' },
  ]},
  { group: 'CRM y Ventas', items: [
    { key: 'analiticas',  label: 'Analíticas',   desc: 'Ver reportes y métricas del sistema' },
    { key: 'contactos',   label: 'Contactos',    desc: 'Gestionar base de contactos y clientes' },
    { key: 'dashboard',   label: 'Dashboard',    desc: 'Ver panel principal y resumen' },
    { key: 'embudos',     label: 'Embudos',      desc: 'Gestionar pipelines y oportunidades' },
    { key: 'tareas',      label: 'Tareas',       desc: 'Crear y gestionar tareas' },
  ]},
  { group: 'Configuración', items: [
    { key: 'agentes',       label: 'Agentes',       desc: 'Gestionar agentes de IA y configuraciones' },
    { key: 'configuracion', label: 'Configuración', desc: 'Acceder a configuración del sistema' },
  ]},
]

const ALL_KEYS = MODULES.flatMap(g => g.items.map(i => i.key))

const DEFAULT_PERMS = {
  vendedor: { conversaciones: true, analiticas: false, contactos: true, dashboard: false, embudos: true, tareas: true, agentes: false, configuracion: false },
  admin:    Object.fromEntries(ALL_KEYS.map(k => [k, true])),
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${checked ? 'bg-aria-500' : 'bg-white/15'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

function InviteModal({ onClose, onDone }) {
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [rol, setRol]       = useState('vendedor')
  const [perms, setPerms]   = useState({ ...DEFAULT_PERMS.vendedor })
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(null)

  function handleRolChange(r) {
    setRol(r)
    setPerms({ ...DEFAULT_PERMS[r] })
  }

  function togglePerm(k) { setPerms(p => ({ ...p, [k]: !p[k] })) }

  const activeCount = Object.values(perms).filter(Boolean).length

  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.inviteMember({ email: email.trim() || null, name: name.trim(), role: rol, permissions: perms })
      setDone(res)
      onDone?.()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(done.invite_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isAdmin = rol === 'admin'

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-50 border border-white/10 rounded-2xl shadow-2xl p-8 w-[420px] flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-emerald-400" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold">Invitación creada</p>
          <p className="text-white/50 text-xs mt-1">
            {done.email_sent
              ? `Email enviado a ${done.email}`
              : done.email
                ? `No se pudo enviar el email — copiá el link y mandáselo a ${done.email}`
                : 'Copiá y compartí este link con el vendedor'}
          </p>
        </div>
        {done.invite_url && (
          <div className="w-full space-y-2">
            <div className="w-full bg-surface rounded-xl border border-white/10 px-3 py-2 flex items-center gap-2">
              <span className="flex-1 text-xs text-white/60 truncate">{done.invite_url}</span>
              <button type="button" onClick={handleCopy} className="shrink-0 p-1 hover:bg-white/5 rounded-lg">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-aria-400" />}
              </button>
            </div>
            <p className="text-[11px] text-white/30 text-center">El vendedor debe abrirlo en una ventana sin iniciar sesión</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-aria-500 hover:bg-aria-600 text-white text-sm font-medium transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? '¡Copiado!' : 'Copiar enlace'}
        </button>
        <button onClick={onClose} className="text-sm text-white/40 hover:text-white/60 transition-colors">Cerrar</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-50 border border-white/10 rounded-2xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-white">Invitar Nuevo Vendedor</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"><X className="w-4 h-4 text-white/40" /></button>
          </div>
          <p className="text-xs text-white/40">El vendedor recibirá un enlace para establecer su contraseña y acceder a la plataforma.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Email <span className="text-white/25 font-normal">(opcional)</span>
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vendedor@empresa.com"
              className="w-full bg-surface rounded-xl border border-white/10 text-white text-sm px-3.5 py-2.5 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20" />
            <p className="text-[11px] text-white/25 mt-1">Sin SMTP configurado: generamos el link y lo copiás vos.</p>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Nombre Completo</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Juan Pérez"
              className="w-full bg-surface rounded-xl border border-white/10 text-white text-sm px-3.5 py-2.5 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20" />
          </div>

          {/* Rol */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Rol</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'vendedor', label: 'Vendedor',      desc: 'Acceso estándar a la plataforma' },
                { id: 'admin',    label: 'Administrador', desc: 'Puede gestionar vendedores y configuración' },
              ].map(r => (
                <button key={r.id} type="button" onClick={() => handleRolChange(r.id)}
                  className={`text-left px-3.5 py-3 rounded-xl border transition-colors ${rol === r.id ? 'border-aria-500 bg-aria-500/10' : 'border-white/10 bg-surface hover:border-white/20'}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {r.id === 'admin' ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <User className="w-3.5 h-3.5 text-aria-400" />}
                    <span className="text-sm font-medium text-white">{r.label}</span>
                  </div>
                  <p className="text-[11px] text-white/40 leading-tight">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Permisos */}
          <div className="bg-surface rounded-xl border border-white/8 overflow-hidden">
            {/* Permisos header */}
            <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-white">Permisos del usuario</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-aria-500/20 text-aria-300 border border-aria-500/30 font-medium">personalizable</span>
                </div>
                <p className="text-[11px] text-white/40">
                  {isAdmin
                    ? 'Configura los permisos específicos para este Administrador. Puedes personalizar el acceso a cada módulo.'
                    : 'Configura los permisos específicos para este Vendedor. Puedes personalizar el acceso a cada módulo.'}
                </p>
              </div>
            </div>

            {/* Módulos header */}
            <div className="px-4 py-3 border-b border-white/8">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-xs font-semibold text-white/70">Permisos de módulos</p>
                <span className="text-[11px] font-semibold text-aria-400">{activeCount} de {ALL_KEYS.length} módulos</span>
              </div>
              <p className="text-[11px] text-white/35">Controla el acceso del vendedor a cada módulo del sistema.</p>
            </div>

            {/* Module groups */}
            {MODULES.map(group => (
              <div key={group.group}>
                <p className="px-4 py-2 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/5">{group.group}</p>
                {group.items.map((mod, i) => (
                  <div key={mod.key} className={`flex items-center justify-between px-4 py-3 ${i < group.items.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-sm text-white font-medium">{mod.label}</p>
                      <p className="text-[11px] text-white/35">{mod.desc}</p>
                    </div>
                    <Toggle checked={!!perms[mod.key]} onChange={() => togglePerm(mod.key)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" form="invite-form" disabled={saving}
            onClick={handleSubmit}
            className="flex items-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Enviar Invitación
          </button>
        </div>
      </div>
    </div>
  )
}

function TeamModal({ members, onClose, onDone }) {
  const [tab, setTab]           = useState('info')
  const [name, setName]         = useState('')
  const [desc, setDesc]         = useState('')
  const [leaderId, setLeaderId] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving]     = useState(false)

  const leaderName = members.find(m => m.id === leaderId)?.name || ''

  function toggleMember(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.createTeam({ name: name.trim(), description: desc, leader_id: leaderId || null, leader_name: leaderName || null, member_ids: [...selected] })
      onDone?.()
      onClose()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-50 border border-white/10 rounded-2xl shadow-2xl w-[460px] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-white">Crear Nuevo Equipo</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"><X className="w-4 h-4 text-white/40" /></button>
          </div>
          <p className="text-xs text-white/40">Define la información del equipo y selecciona los miembros.</p>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {[{ id: 'info', label: 'Información básica' }, { id: 'members', label: 'Miembros' }].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-aria-500/20 text-aria-300' : 'text-white/40 hover:text-white'}`}>
              {t.label}
              {t.id === 'members' && selected.size > 0 && (
                <span className="ml-1.5 text-[10px] bg-aria-500 text-white rounded-full px-1.5 py-0.5">{selected.size}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'info' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Nombre del equipo <span className="text-red-400">*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Equipo Ventas Norte"
                  className="w-full bg-surface rounded-xl border border-white/10 text-white text-sm px-3.5 py-2.5 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Descripción</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Describe el objetivo del equipo..."
                  className="w-full bg-surface rounded-xl border border-white/10 text-white text-sm px-3.5 py-2.5 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Líder del Equipo <span className="text-white/30">(opcional)</span></label>
                <div className="relative">
                  <select value={leaderId} onChange={e => setLeaderId(e.target.value)}
                    className="w-full appearance-none bg-surface rounded-xl border border-white/10 text-white text-sm px-3.5 py-2.5 outline-none focus:border-aria-500 transition-colors pr-9">
                    <option value="">Sin Líder</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {members.length === 0 && <p className="text-white/30 text-sm text-center py-8">No hay miembros en el workspace</p>}
              {members.map(m => {
                const isSel = selected.has(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleMember(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${isSel ? 'bg-aria-500/15' : 'hover:bg-white/5'}`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aria-400 to-aria-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {(m.name || m.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{m.name || '—'}</p>
                      <p className="text-[11px] text-white/40 truncate">{m.email}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSel ? 'border-aria-500 bg-aria-500' : 'border-white/20'}`}>
                      {isSel && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={saving || !name.trim()}
            className="flex items-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Crear Equipo
          </button>
        </div>
      </div>
    </div>
  )
}

function TabVendedores() {
  const [subTab, setSubTab]     = useState('vendedores')
  const [showInvite, setInvite] = useState(false)
  const [showTeam, setTeam]     = useState(false)
  const [members, setMembers]   = useState([])
  const [teams, setTeams]       = useState([])
  const [loadingM, setLoadingM] = useState(true)
  const [loadingT, setLoadingT] = useState(true)

  async function loadMembers() {
    try { setMembers(await api.getWorkspaceMembers()) } catch {}
    setLoadingM(false)
  }
  async function loadTeams() {
    try { setTeams(await api.getTeams()) } catch {}
    setLoadingT(false)
  }

  useEffect(() => { loadMembers(); loadTeams() }, [])

  async function handleDeleteTeam(id) {
    if (!confirm('¿Eliminar este equipo?')) return
    try { await api.deleteTeam(id); loadTeams() } catch (err) { alert(err.message) }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Gestión de Vendedores</h2>
          <p className="text-xs text-white/40 mt-0.5">Administra los miembros y equipos de tu organización</p>
        </div>
        {subTab === 'vendedores'
          ? <button onClick={() => setInvite(true)} className="flex items-center gap-2 btn-primary">
              <UserPlus className="w-4 h-4" /> Invitar Nuevo Vendedor
            </button>
          : <button onClick={() => setTeam(true)} className="flex items-center gap-2 btn-primary">
              <Plus className="w-4 h-4" /> Nuevo equipo
            </button>
        }
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-surface p-1 rounded-xl border border-white/8 w-fit">
        {[{ id: 'vendedores', label: 'Vendedores' }, { id: 'equipos', label: 'Equipos de Ventas' }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${subTab === t.id ? 'bg-aria-500 text-white' : 'text-white/40 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Vendedores */}
      {subTab === 'vendedores' && (
        <div className="card overflow-hidden p-0">
          {loadingM ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-white/30" /></div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/30">No hay vendedores aún</p>
              <button onClick={() => setInvite(true)} className="flex items-center gap-1.5 text-xs text-aria-400 hover:text-aria-300 transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Invitar vendedor
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Vendedor','Email','Rol','Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aria-400 to-aria-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(m.name || m.email)[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-white">{m.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${m.role === 'owner' || m.role === 'admin' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-aria-500/15 text-aria-300 border-aria-500/25'}`}>
                        {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Administrador' : 'Vendedor'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Activo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Equipos */}
      {subTab === 'equipos' && (
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Equipos de Ventas</p>
              <p className="text-xs text-white/40">Administra los equipos de tu organización</p>
            </div>
          </div>
          {loadingT ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-white/30" /></div>
          ) : teams.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/30">No hay equipos de venta configurados</p>
              <button onClick={() => setTeam(true)} className="flex items-center gap-1.5 text-xs text-aria-400 hover:text-aria-300 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Crear equipo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map(t => (
                <div key={t.id} className="card-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-aria-500/15 border border-aria-500/25 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-aria-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/40">{t.members?.length || 0} miembros</span>
                    </div>
                    {t.description && <p className="text-xs text-white/40 truncate">{t.description}</p>}
                    {t.leader_name && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span className="text-[11px] text-amber-300/70">{t.leader_name}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleDeleteTeam(t.id)} className="p-1.5 hover:bg-white/5 rounded-lg text-white/20 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setInvite(false)} onDone={loadMembers} />}
      {showTeam   && <TeamModal members={members} onClose={() => setTeam(false)} onDone={loadTeams} />}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, project, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'cuenta')

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setActiveTab(t)
  }, [searchParams])

  return (
    <div className="flex h-full">
      {/* Left nav */}
      <div className="w-48 shrink-0 border-r border-white/5 p-4 flex flex-col gap-1">
        <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest px-3 mb-2">Configuración</p>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${
              activeTab === id ? 'bg-aria-500/15 text-aria-300' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}>
            <Icon size={16} className="shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'cuenta'     && <TabCuenta />}
        {activeTab === 'canales'    && <TabCanales />}
        {/* ## {activeTab === 'copilot' && <TabCopilot />} */}
        {activeTab === 'plan'       && <TabPlan />}
        {activeTab === 'vendedores' && <TabVendedores />}
      </div>
    </div>
  )
}
