const TOKEN_KEY = 'aria_token'
const USER_KEY  = 'aria_user'
const PROJ_KEY  = 'aria_project'

export const auth = {
  getToken:  () => localStorage.getItem(TOKEN_KEY) || '',
  setToken:  (t) => localStorage.setItem(TOKEN_KEY, t),
  removeToken: () => localStorage.removeItem(TOKEN_KEY),

  getUser:  () => { try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null } },
  setUser:  (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),

  getProject:  () => { try { return JSON.parse(localStorage.getItem(PROJ_KEY)) } catch { return null } },
  setProject:  (p) => localStorage.setItem(PROJ_KEY, JSON.stringify(p)),

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(PROJ_KEY)
  },

  isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),
}
