// Todas las llamadas van al backend de ARIA — Tiledesk es invisible al frontend.
// El proxy del server reescribe /api/tiledesk → "" antes de llegar a Tiledesk.
// Tiledesk interno NO usa prefijo /api: las rutas son /{projectId}/leads, etc.
const ARIA_API = '/api'

function getToken() {
  return localStorage.getItem('aria_token') || ''
}

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

async function request(path, opts = {}) {
  const res = await fetch(`${ARIA_API}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) {
    let msg = `Error ${res.status}`
    try { const b = await res.json(); msg = b.error || b.message || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

// ── ARIA auth ─────────────────────────────────────────────────────────────────
export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (email, password, name) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),

  getMe: () => request('/auth/me'),

  // ── Tiledesk (proxied — /api/tiledesk/{path} → /{path} en Tiledesk) ─────────
  getProjects: () => request('/tiledesk/projects'),

  getRequests: (projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/tiledesk/${projectId}/requests?${qs}`)
  },

  getContactRequests: (projectId, contactId) =>
    request(`/tiledesk/${projectId}/requests?lead_id=${contactId}&limit=20`),

  getMessageStats: (projectId, start, end) => {
    const qs = new URLSearchParams({ start, end }).toString()
    return request(`/tiledesk/${projectId}/analytics/messages/count?${qs}`)
  },

  getAgents: (projectId) => request(`/tiledesk/${projectId}/project_users`),
  getBots:   (projectId) => request(`/tiledesk/${projectId}/bots`),

  // ── Conversaciones ────────────────────────────────────────────────────────
  getConversations: (projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/tiledesk/${projectId}/requests?${qs}`)
  },

  getMessages: (projectId, requestId) =>
    request(`/tiledesk/${projectId}/requests/${requestId}/messages`),

  sendMessage: (projectId, requestId, text) =>
    request(`/tiledesk/${projectId}/requests/${requestId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, type: 'text' }),
    }),

  closeConversation: (projectId, requestId) =>
    request(`/tiledesk/${projectId}/requests/${requestId}/close`, { method: 'PUT' }),

  reopenConversation: (projectId, requestId) =>
    request(`/tiledesk/${projectId}/requests/${requestId}/reopen`, { method: 'PUT' }),

  // ── Contactos (Tiledesk los llama "leads") ────────────────────────────────
  // Schema real:
  //   top-level: fullname, email, phone, company, note, streetAddress, city, region, zipcode, country, tags[]
  //   attributes: objeto libre — solo para datos del widget (browser, sourcePage, etc.)
  getContacts: (projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/tiledesk/${projectId}/leads?${qs}`)
  },

  getContactById: (projectId, contactId) =>
    request(`/tiledesk/${projectId}/leads/${contactId}`),

  // POST solo acepta fullname, email, attributes (phone/company/etc. solo via PUT)
  // Por eso hacemos POST + PUT encadenado si hay campos extra
  createContact: async (projectId, { fullname, email, phone, company, note, streetAddress, tags, attributes }) => {
    const created = await request(`/tiledesk/${projectId}/leads`, {
      method: 'POST',
      body: JSON.stringify({ fullname, email, attributes: attributes || {} }),
    })
    const extras = {}
    if (phone)         extras.phone         = phone
    if (company)       extras.company       = company
    if (note)          extras.note          = note
    if (streetAddress) extras.streetAddress = streetAddress
    if (tags?.length)  extras.tags          = tags
    if (Object.keys(extras).length > 0) {
      return request(`/tiledesk/${projectId}/leads/${created._id}`, {
        method: 'PUT',
        body: JSON.stringify(extras),
      })
    }
    return created
  },

  // PUT acepta todos los campos top-level
  updateContact: (projectId, contactId, payload) =>
    request(`/tiledesk/${projectId}/leads/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Soft-delete (status=DELETED). Para borrado físico usar /physical (requiere owner).
  deleteContact: (projectId, contactId) =>
    request(`/tiledesk/${projectId}/leads/${contactId}`, { method: 'DELETE' }),

  // ── Labels / Tags (almacenados en ARIA, aplicados a contactos via tags de Tiledesk) ──
  getLabels: (_projectId) => request('/labels'),

  createLabel: (_projectId, labelData) =>
    request('/labels', { method: 'POST', body: JSON.stringify(labelData) }),

  updateLabel: (_projectId, labelId, labelData) =>
    request(`/labels/${labelId}`, { method: 'PUT', body: JSON.stringify(labelData) }),

  deleteLabel: (_projectId, labelId) =>
    request(`/labels/${labelId}`, { method: 'DELETE' }),

  // ── Funnels (pipelines) ───────────────────────────────────────────────────
  getFunnels: () => request('/funnels'),
  createFunnel: (payload) =>
    request('/funnels', { method: 'POST', body: JSON.stringify(payload) }),
  updateFunnel: (id, payload) =>
    request(`/funnels/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFunnel: (id) =>
    request(`/funnels/${id}`, { method: 'DELETE' }),

  // ── Funnel stages ─────────────────────────────────────────────────────────
  getFunnelStages: () => request('/funnel/stages'),
  setFunnelStage: (leadId, stage, lead_status) =>
    request(`/funnel/stages/${leadId}`, { method: 'PUT', body: JSON.stringify({ stage, lead_status }) }),
  deleteFunnelStage: (leadId) =>
    request(`/funnel/stages/${leadId}`, { method: 'DELETE' }),

  // ── Canales ────────────────────────────────────────────────────────────────
  getChannelSettings: () => request('/channels/settings'),
  saveChannelSettings: (payload) =>
    request('/channels/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getChannelInstances: () => request('/channels/instances'),
  createChannelInstance: (payload) =>
    request('/channels/instances', { method: 'POST', body: JSON.stringify(payload) }),
  getInstanceQR: (id) => request(`/channels/instances/${id}/qr`),
  deleteChannelInstance: (id) =>
    request(`/channels/instances/${id}`, { method: 'DELETE' }),
  logoutChannelInstance: (id) =>
    request(`/channels/instances/${id}/logout`, { method: 'POST' }),
  restartChannelInstance: (id) =>
    request(`/channels/instances/${id}/restart`, { method: 'POST' }),

  // ── Bots / Agentes IA ──────────────────────────────────────────────────────
  createBot: (projectId, payload) =>
    request(`/tiledesk/${projectId}/bots`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBot: (projectId, botId, payload) =>
    request(`/tiledesk/${projectId}/bots/${botId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteBot: (projectId, botId) =>
    request(`/tiledesk/${projectId}/bots/${botId}`, {
      method: 'DELETE',
    }),

  // ── Agent Wizard ──────────────────────────────────────────────────────────
  createAgentDraft: (payload) =>
    request('/agents/create-draft', { method: 'POST', body: JSON.stringify(payload) }),

  generateInstructions: (payload) =>
    request('/agents/generate-instructions', { method: 'POST', body: JSON.stringify(payload) }),

  playgroundChat: (payload) =>
    request('/agents/playground', { method: 'POST', body: JSON.stringify(payload) }),

  testChat: (botId, payload) =>
    request(`/agents/${botId}/test-chat`, { method: 'POST', body: JSON.stringify(payload) }),

  finalizeAgent: (botId, payload) =>
    request(`/agents/${botId}/finalize`, { method: 'PUT', body: JSON.stringify(payload) }),

  getAgentMetadata: () => request('/agents/metadata'),
  ensureKbNamespace: (botId, projectId) =>
    request(`/agents/${botId}/ensure-kb-namespace`, { method: 'POST', body: JSON.stringify({ projectId }) }),

  saveAgentInstructions: (botId, payload) =>
    request(`/agents/${botId}/instructions`, { method: 'PUT', body: JSON.stringify(payload) }),
  saveAgentConfig: (botId, payload) =>
    request(`/agents/${botId}/config`, { method: 'PUT', body: JSON.stringify(payload) }),
  setAgentActive: (botId, active) =>
    request(`/agents/${botId}/active`, { method: 'PUT', body: JSON.stringify({ active }) }),
  getAgentFiles: (botId) => request(`/agents/${botId}/files`),
  deleteAgentFile: (botId, fileId) =>
    request(`/agents/${botId}/files/${fileId}`, { method: 'DELETE' }),

  // KB por agente
  getAgentKb: (botId) => request(`/agents/${botId}/kb`),
  addAgentKbItem: (botId, payload) =>
    request(`/agents/${botId}/kb`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteAgentKbItem: (botId, itemId) =>
    request(`/agents/${botId}/kb/${itemId}`, { method: 'DELETE' }),

  getChannelSettings: () => request('/channels/settings'),
  setActiveBotId: (default_bot_id) =>
    request('/channels/settings/bot', { method: 'PUT', body: JSON.stringify({ default_bot_id }) }),

  // ── WAHA Inbox ────────────────────────────────────────────────────────────
  // ── Workspace ─────────────────────────────────────────────────────────────
  getWorkspaceMembers: () => request('/workspace/members'),
  inviteMember: (payload) =>
    request('/workspace/invite', { method: 'POST', body: JSON.stringify(payload) }),
  getTeams: () => request('/workspace/teams'),
  createTeam: (payload) =>
    request('/workspace/teams', { method: 'POST', body: JSON.stringify(payload) }),
  updateTeam: (id, payload) =>
    request(`/workspace/teams/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTeam: (id) =>
    request(`/workspace/teams/${id}`, { method: 'DELETE' }),

  // ── Tareas ────────────────────────────────────────────────────────────────
  getTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/tasks${qs ? '?' + qs : ''}`)
  },
  createTask: (payload) => request('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id, payload) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // ── Mensajes programados ───────────────────────────────────────────────────
  getScheduledMessages: () => request('/scheduled-messages'),
  createScheduledMessage: (payload) =>
    request('/scheduled-messages', { method: 'POST', body: JSON.stringify(payload) }),
  deleteScheduledMessage: (id) =>
    request(`/scheduled-messages/${id}`, { method: 'DELETE' }),

  // ── AI suggest ────────────────────────────────────────────────────────────
  aiSuggest: (messages, contactName) =>
    request('/ai/suggest', { method: 'POST', body: JSON.stringify({ messages, contactName }) }),

  // ── LLM usage ─────────────────────────────────────────────────────────────
  getLlmUsage: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/usage/llm${qs ? '?' + qs : ''}`)
  },

  // ── LLM config (admin) ────────────────────────────────────────────────────
  getLlmConfig: () => request('/llm/config'),
  saveLlmConfig: (payload) => request('/llm/config', { method: 'PUT', body: JSON.stringify(payload) }),

  // ── Tiledesk Knowledge Base (Copilot) ─────────────────────────────────────
  getKbNamespaces: (projectId) =>
    request(`/tiledesk/${projectId}/kb/namespace/all`),
  getKbContents: (projectId, namespaceId, type) => {
    const qs = new URLSearchParams({ namespace: namespaceId, direction: -1, sortField: 'updatedAt', limit: 100, ...(type ? { type } : {}) }).toString()
    return request(`/tiledesk/${projectId}/kb/?${qs}`)
  },
  createKbContent: (projectId, payload) =>
    request(`/tiledesk/${projectId}/kb/`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteKbContent: (projectId, contentId) =>
    request(`/tiledesk/${projectId}/kb/${contentId}`, { method: 'DELETE' }),

  // ── WAHA Inbox ────────────────────────────────────────────────────────────
  getWahaSessions: () => request('/waha/sessions'),
  getWahaChats: (limit = 50) => request(`/waha/chats?limit=${limit}`),
  getWahaMessages: (chatId, session, limit = 50) =>
    request(`/waha/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}${session ? `&session=${encodeURIComponent(session)}` : ''}`),
  sendWahaMessage: (chatId, text, session) =>
    request('/waha/send', { method: 'POST', body: JSON.stringify({ chatId, text, session }) }),
  markChatRead: (chatId, session) =>
    request(`/waha/chats/${encodeURIComponent(chatId)}/read${session ? `?session=${encodeURIComponent(session)}` : ''}`, { method: 'POST' }),
  sendWahaFile: (chatId, session, data, mimetype, filename, caption) =>
    request('/waha/send-file', { method: 'POST', body: JSON.stringify({ chatId, session, data, mimetype, filename, caption }) }),
  sendWahaVoice: (chatId, session, data) =>
    request('/waha/send-voice', { method: 'POST', body: JSON.stringify({ chatId, session, data }) }),
}
