import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { useLocation } from 'react-router-dom'

export const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const [unread, setUnread]     = useState(0)
  const [toasts, setToasts]     = useState([])
  const esRef                   = useRef(null)
  const toastId                 = useRef(0)
  const location                = useLocation()

  // Auto-clear badge cuando el usuario está en /conversations
  useEffect(() => {
    if (location.pathname === '/conversations') setUnread(0)
  }, [location.pathname])

  const addToast = useCallback((msg) => {
    const id = ++toastId.current
    setToasts(prev => [...prev.slice(-4), { id, ...msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const clearUnread = useCallback(() => setUnread(0), [])

  useEffect(() => {
    const token = localStorage.getItem('aria_token')
    if (!token) return

    function connect() {
      const es = new EventSource(`/api/events?token=${token}`)
      esRef.current = es

      es.addEventListener('new-message', (e) => {
        try {
          const data = JSON.parse(e.data)
          setUnread(n => n + 1)
          addToast({
            from: data.name || data.from || 'WhatsApp',
            text: data.text || 'Nuevo mensaje',
          })
        } catch {}
      })

      es.onerror = () => {
        es.close()
        setTimeout(connect, 5000)
      }
    }

    connect()
    return () => esRef.current?.close()
  }, [addToast])

  return (
    <NotificationsContext.Provider value={{ unread, clearUnread, toasts }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
