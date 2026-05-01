import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Sparkles, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]           = useState('login') // 'login' | 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name)
      }
      navigate('/')
    } catch (err) {
      setError(err.message === 'UNAUTHORIZED' ? 'Email o contraseña incorrectos' : err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t) => { setTab(t); setError('') }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-aria-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-aria-500 to-aria-700 flex items-center justify-center shadow-2xl shadow-aria-500/30">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">ARIA</h1>
            <p className="text-sm text-white/40 mt-1">Tu plataforma de conversiones con IA</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-50 rounded-xl p-1 mb-4 border border-white/8">
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'login' ? 'bg-aria-500 text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => switchTab('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === 'register' ? 'bg-aria-500 text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
          {tab === 'register' && (
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full bg-surface text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoFocus
              className="w-full bg-surface text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-surface text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 outline-none focus:border-aria-500 transition-colors placeholder:text-white/20 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {tab === 'register' && (
              <p className="text-[11px] text-white/25 mt-1.5">Mínimo 8 caracteres</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2 py-3 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading
              ? (tab === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...')
              : (tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta')
            }
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-6">ARIA v1.0</p>
      </div>
    </div>
  )
}
