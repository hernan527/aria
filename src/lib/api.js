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

// URLs de media de WAHA (fotos/audios/documentos recibidos) exigen API key del lado del
// servidor — <img>/<a> no pueden mandar headers, así que pasan por este proxy con el
// token de sesión en la query string.
export function wahaMediaUrl(url) {
  if (!url) return url
  return `${ARIA_API}/waha/media?url=${encodeURIComponent(url)}&token=${encodeURIComponent(getToken())}`
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

  getContactRequests: (_projectId, contactId) =>
    request(`/contacts/${contactId}/conversations`),

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

  // ── Contactos (ARIA DB) ───────────────────────────────────────────────────────
  getContacts: (_projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/contacts?${qs}`)
  },

  getContactById: (_projectId, contactId) =>
    request(`/contacts/${contactId}`),

  createContact: (_projectId, { fullname, name, email, phone, company, note, tags, attributes }) =>
    request('/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: fullname || name, email, phone, company, note, tags, attributes }),
    }),

  updateContact: (_projectId, contactId, payload) => {
    const { fullname, ...rest } = payload
    return request(`/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify({ ...rest, ...(fullname ? { name: fullname } : {}) }),
    })
  },

  deleteContact: (_projectId, contactId) =>
    request(`/contacts/${contactId}`, { method: 'DELETE' }),

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

  // ── Lucas (agente calificador) ───────────────────────────────────────────────
  getAiScoringSettings: () => request('/ai-scoring/settings'),
  setAiScoringEnabled: (enabled) =>
    request('/ai-scoring/settings', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  getAiScoringSummary: (range = {}) => request(`/ai-scoring/summary?${new URLSearchParams(range)}`),
  getAiScoringScores: () => request('/ai-scoring/scores'),
  getAiScoringTop: (limit, range = {}) => request(`/ai-scoring/top?${new URLSearchParams({ limit: limit || 10, ...range })}`),
  runAiScoringNow: () => request('/ai-scoring/run-now', { method: 'POST' }),
  getLucasMetrics: (range) => request(`/lucas/metrics?${new URLSearchParams(range)}`),
  getLucasDaily: (range) => request(`/lucas/daily?${new URLSearchParams(range)}`),
  getLucasOrigins: (range) => request(`/lucas/origins?${new URLSearchParams(range)}`),
  getLucasHot: (range) => request(`/lucas/hot?${new URLSearchParams(range)}`),
  getLucasTags: (range) => request(`/lucas/tags?${new URLSearchParams(range)}`),
  getLucasConfig: () => request('/lucas/config'),
  updateLucasConfig: (payload) => request('/lucas/config', { method: 'PUT', body: JSON.stringify(payload) }),

  // ── Canales ────────────────────────────────────────────────────────────────
  getChannelSettings: () => request('/channels/settings'),
  saveChannelSettings: (payload) =>
    request('/channels/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getChannelInstances: () => request('/channels/instances'),
  createChannelInstance: (payload) =>
    request('/channels/instances', { method: 'POST', body: JSON.stringify(payload) }),
  getInstanceQR: (id) => request(`/channels/instances/${id}/qr`),
  setInstanceBot: (id, bot_id) =>
    request(`/channels/instances/${id}/bot`, { method: 'PUT', body: JSON.stringify({ bot_id }) }),
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
  getAgentFlows: () => request('/agents/flows'),

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
  getAvailableTools: () => request('/agents/available-tools'),
  getAgentCustomTools: (botId) => request(`/agents/${botId}/custom-tools`),
  addAgentCustomTool: (botId, payload) => request(`/agents/${botId}/custom-tools`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteAgentCustomTool: (botId, toolId) => request(`/agents/${botId}/custom-tools/${toolId}`, { method: 'DELETE' }),
  quickCreateAgent: (payload) => request('/agents/quick-create', { method: 'POST', body: JSON.stringify(payload) }),
  getDifyAgents: () => request('/agents/dify-list'),
  deleteAgent: (botId) => request(`/agents/${botId}`, { method: 'DELETE' }),
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

  // ── Billing ───────────────────────────────────────────────────────────────
  getBillingStatus: () => request('/billing/status'),
  checkoutPlan: (plan_id) => request('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan_id }) }),
  getAdminPlans: () => request('/admin/plans'),
  updateAdminPlan: (id, payload) => request(`/admin/plans/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  // ── WAHA Inbox ────────────────────────────────────────────────────────────
  // ── Workspace ─────────────────────────────────────────────────────────────
  getWorkspaceMembers: () => request('/workspace/members'),
  inviteMember: (payload) =>
    request('/workspace/invite', { method: 'POST', body: JSON.stringify(payload) }),
  updateMember: (id, payload) =>
    request(`/workspace/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMember: (id) =>
    request(`/workspace/members/${id}`, { method: 'DELETE' }),
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

  // ── Campañas (Tobías) ─────────────────────────────────────────────────────────
  // ── Axel (auditor comercial) ────────────────────────────────────────────────
  getAxelSellers: ({ from, to, q }) => request(`/axel/sellers?${new URLSearchParams({ from, to, q: q || '' })}`),
  getAxelConfig: () => request('/axel/config'),
  updateAxelConfig: (payload) => request('/axel/config', { method: 'PUT', body: JSON.stringify(payload) }),
  getAxelAnalyses: () => request('/axel/analyses'),
  getAxelAnalysis: (id) => request(`/axel/analyses/${id}`),
  createAxelAnalyses: (payload) => request('/axel/analyses', { method: 'POST', body: JSON.stringify(payload) }),
  deleteAxelAnalysis: (id) => request(`/axel/analyses/${id}`, { method: 'DELETE' }),
  // Descarga directa: el token viaja en la query porque un <a>/window.open no manda headers
  axelExportUrl: (id) => `${ARIA_API}/axel/analyses/${id}/export?token=${encodeURIComponent(getToken())}`,

  getOnboarding: () => request('/onboarding'),
  getDashboardMetrics: (range) => request(`/dashboard/metrics?${new URLSearchParams(range)}`),
  getCampaigns: () => request('/campaigns'),
  getTobiasSettings: () => request('/campaigns/settings'),
  setTobiasEnabled: (enabled) =>
    request('/campaigns/settings', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  getCampaignSummary: (days = 30) => request(`/campaigns/summary?days=${days}`),
  previewCampaignAudience: (audience, strategy) =>
    request('/campaigns/preview', { method: 'POST', body: JSON.stringify({ audience, strategy }) }),
  sampleCampaignMessage: (payload) =>
    request('/campaigns/sample-message', { method: 'POST', body: JSON.stringify(payload) }),
  createCampaign: (payload) => request('/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
  updateCampaign: (id, payload) => request(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  campaignAction: (id, action) =>
    request(`/campaigns/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
  deleteCampaign: (id) => request(`/campaigns/${id}`, { method: 'DELETE' }),
  getCampaignRecipients: (id) => request(`/campaigns/${id}/recipients`),
  // El archivo va crudo en el body (no JSON): el tipo en Content-Type y el nombre en X-Filename
  uploadCampaignAttachment: (file) =>
    request('/campaigns/attachments', {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) },
    }),
  updateTask: (id, payload) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // ── Mensajes programados ───────────────────────────────────────────────────
  getScheduledMessages: () => request('/scheduled-messages'),
  createScheduledMessage: (payload) =>
    request('/scheduled-messages', { method: 'POST', body: JSON.stringify(payload) }),
  deleteScheduledMessage: (id) =>
    request(`/scheduled-messages/${id}`, { method: 'DELETE' }),

  // ── Asistente de comandos ───────────────────────────────────────────────────
  sendAssistantCommand: (text) =>
    request('/assistant/command', { method: 'POST', body: JSON.stringify({ text }) }),

  // ── HubSpot ───────────────────────────────────────────────────────────────
  getHubspotConfig: () => request('/hubspot/config'),
  saveHubspotConfig: (api_key) => request('/hubspot/config', { method: 'PUT', body: JSON.stringify({ api_key }) }),
  syncHubspot: () => request('/hubspot/sync', { method: 'POST' }),

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

  listKbNamespaces: () => request('/kb/namespaces'),
  setAgentKbNamespace: (botId, namespaceId) =>
    request(`/agents/${botId}/kb-namespace`, { method: 'PUT', body: JSON.stringify({ namespaceId }) }),
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
