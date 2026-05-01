import { createContext, useContext, useState, useEffect } from 'react'
import { auth } from '../lib/auth'
import { api }  from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(auth.getUser)
  const [project, setProject] = useState(auth.getProject)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (auth.isAuthenticated()) {
      api.getMe()
        .then((me) => {
          setUser(me)
          auth.setUser(me)
          if (me.projectId && !auth.getProject()) {
            const proj = { _id: me.projectId }
            auth.setProject(proj)
            setProject(proj)
          }
        })
        .catch(() => auth.logout())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const _applySession = (res) => {
    auth.setToken(res.token)
    auth.setUser(res.user)
    setUser(res.user)
    if (res.user.projectId) {
      const proj = { _id: res.user.projectId }
      auth.setProject(proj)
      setProject(proj)
    }
  }

  const login = async (email, password) => {
    const res = await api.login(email, password)
    if (!res.token) throw new Error('No se recibió token del servidor')
    _applySession(res)
  }

  const register = async (email, password, name) => {
    const res = await api.register(email, password, name)
    if (!res.token) throw new Error('No se recibió token del servidor')
    _applySession(res)
  }

  const logout = () => {
    auth.logout()
    setUser(null)
    setProject(null)
  }

  return (
    <AuthContext.Provider value={{ user, project, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
