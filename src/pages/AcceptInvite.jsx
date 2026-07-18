import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, Check, Eye, EyeOff } from 'lucide-react'

const ARIA_API = '/api'

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('invite')

  const [invite,    setInvite]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [name,      setName]      = useState('')
  const [password,  setPassword]  = useState('')
  const [showPwd,   setShowPwd]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    if (!token) { setError('Link inválido.'); setLoading(false); return }
    fetch(`${ARIA_API}/auth/invite/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setInvite(d)
        setLoading(false)
      })
      .catch(() => { setError('No se pudo verificar el link.'); setLoading(false) })
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || password.length < 6) return
    setSaving(true)
    try {
      const res = await fetch(`${ARIA_API}/auth/register-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al crear la cuenta'); setSaving(false); return }
      // Guardar token y redirigir
      localStorage.setItem('aria_token', data.token)
      setDone(true)
      setTimeout(() => { window.location.href = '/' }, 1500)
    } catch { setError('Error de conexión'); setSaving(false) }
  }

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-3 outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20'

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Check className="w-7 h-7 text-emerald-400" />
        </div>
        <p className="text-white font-semibold">¡Cuenta creada!</p>
        <p className="text-white/40 text-sm">Entrando a ARIA…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">ARIA</h1>
          <p className="text-white/40 text-sm mt-1">Plataforma de ventas con IA</p>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-8">
          {error ? (
            <div className="text-center space-y-4">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={() => navigate('/login')} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                Ir al login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-white">Crear tu cuenta</h2>
                <p className="text-white/40 text-sm mt-1">
                  Fuiste invitado a <span className="text-white/70">{invite?.workspace_name || 'ARIA'}</span>
                  {invite?.email && <> como <span className="text-white/70">{invite.email}</span></>}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Tu nombre</label>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Juan García" required
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres" required minLength={6}
                      className={`${inputCls} pr-10`}
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                      {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving || !name.trim() || password.length < 6}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <><Loader2 size={16} className="animate-spin"/>Creando cuenta…</> : 'Crear cuenta y entrar'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
