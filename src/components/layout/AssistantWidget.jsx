import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

export function AssistantWidget() {
  const [open, setOpen]       = useState(false)
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(false)
  const [log, setLog]         = useState([])
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log, loading])

  async function handleSend(e) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || loading) return
    setText('')
    setLog(l => [...l, { role: 'user', text: value }])
    setLoading(true)
    try {
      const res = await api.sendAssistantCommand(value)
      setLog(l => [...l, { role: 'assistant', text: res.message || (res.ok ? 'Listo.' : 'No pude procesarlo.') }])
    } catch (err) {
      setLog(l => [...l, { role: 'assistant', text: 'Hubo un error: ' + err.message }])
    }
    setLoading(false)
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-80 max-h-[28rem] flex flex-col bg-surface-50 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-gradient-to-br from-aria-600/20 to-transparent shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={15} className="text-aria-300 shrink-0" />
              <p className="text-sm font-semibold text-white/90 truncate">Decime qué necesitás que haga</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/70 shrink-0"><X size={15} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {log.length === 0 && (
              <p className="text-[12px] text-white/30 leading-relaxed">
                Ej: "a Pepito mandarle un WhatsApp el 6/12 avisándole que ya puede cambiarse de obra social"
              </p>
            )}
            {log.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === 'user'
                  ? 'self-end bg-gradient-to-br from-aria-500 to-aria-700 text-white'
                  : 'self-start bg-surface-200 text-white/85'}`}>
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="self-start flex items-center gap-1.5 text-white/30 text-[12px]">
                <Loader2 size={12} className="animate-spin" /> Pensando…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="p-2.5 border-t border-white/5 flex items-end gap-2 shrink-0">
            <input
              value={text} onChange={e => setText(e.target.value)}
              placeholder="Escribí tu pedido…" autoFocus
              className="flex-1 bg-surface-200 border border-transparent rounded-xl px-3 py-2 text-[12.5px] text-white/90 outline-none focus:border-aria-500/40 placeholder-white/25"
            />
            <button type="submit" disabled={!text.trim() || loading}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-aria-500 to-aria-700 disabled:opacity-30 flex items-center justify-center shrink-0 transition-all hover:brightness-110">
              <Send size={13} className="text-white" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-aria-500 to-aria-700 shadow-xl shadow-aria-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        title="Asistente"
      >
        {open ? <X size={18} className="text-white" /> : <Sparkles size={20} className="text-white" />}
      </button>
    </>
  )
}
