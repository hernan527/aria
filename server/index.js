import express          from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import jwt              from 'jsonwebtoken'
import bcrypt           from 'bcryptjs'
import Database         from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID }   from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { extname } from 'path'

const app       = express()
const __dirname = dirname(fileURLToPath(import.meta.url))
app.use(express.json())

// ── Config ────────────────────────────────────────────────────────────────────
const PORT                    = process.env.PORT || 4000
const JWT_SECRET              = process.env.ARIA_JWT_SECRET || 'aria-secret-change-me'
const TILEDESK_URL            = process.env.TILEDESK_INTERNAL_URL || 'http://tilrdefinitivo_server:3000'
const TILEDESK_ADMIN_EMAIL    = process.env.TILEDESK_ADMIN_EMAIL || ''
const TILEDESK_ADMIN_PASSWORD = process.env.TILEDESK_ADMIN_PASSWORD || ''

// ── DB ────────────────────────────────────────────────────────────────────────
const DB_PATH = process.env.ARIA_DB_PATH || '/data/aria.db'
mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    tiledesk_project_id TEXT NOT NULL,
    created_at          INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    workspace_id  TEXT,
    role          TEXT DEFAULT 'member',
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS invites (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    email        TEXT,
    token        TEXT UNIQUE NOT NULL,
    used         INTEGER DEFAULT 0,
    expires_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS funnel_stages (
    workspace_id TEXT NOT NULL,
    lead_id      TEXT NOT NULL,
    stage        TEXT NOT NULL DEFAULT 'prospecto',
    lead_status  TEXT NOT NULL DEFAULT 'open',
    updated_at   INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (workspace_id, lead_id)
  );

  CREATE TABLE IF NOT EXISTS funnels (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    stages       TEXT NOT NULL DEFAULT '[]',
    sort_order   INTEGER DEFAULT 0,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS channel_settings (
    workspace_id    TEXT PRIMARY KEY,
    waha_url        TEXT,
    waha_key        TEXT,
    evo_url         TEXT,
    evo_key         TEXT,
    uzapi_url       TEXT,
    uzapi_token     TEXT,
    default_bot_id  TEXT,
    updated_at      INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS channel_instances (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    provider      TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    session_name  TEXT,
    phone_number  TEXT,
    status        TEXT DEFAULT 'disconnected',
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS agent_metadata (
    bot_id           TEXT PRIMARY KEY,
    workspace_id     TEXT NOT NULL,
    tone             TEXT,
    nationality      TEXT,
    company_name     TEXT,
    template_id      TEXT,
    active           INTEGER DEFAULT 1,
    instructions     TEXT,
    temperature      REAL DEFAULT 1.0,
    top_p            REAL DEFAULT 1.0,
    channels         TEXT DEFAULT '["__all__"]',
    derivation_users TEXT DEFAULT '["__all__"]',
    updated_at       INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS agent_files (
    id           TEXT PRIMARY KEY,
    bot_id       TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    filename     TEXT NOT NULL,
    size         INTEGER DEFAULT 0,
    path         TEXT NOT NULL,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS agent_kb (
    id           TEXT PRIMARY KEY,
    bot_id       TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    type         TEXT NOT NULL,
    title        TEXT,
    content      TEXT NOT NULL,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS wa_conversations (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    session_name  TEXT NOT NULL,
    wa_from       TEXT NOT NULL,
    request_id    TEXT NOT NULL,
    closed        INTEGER DEFAULT 0,
    updated_at    INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    lead_id       TEXT,
    lead_name     TEXT,
    assignee_id   TEXT,
    assignee_name TEXT,
    due_date      INTEGER,
    status        TEXT NOT NULL DEFAULT 'pending',
    priority      TEXT NOT NULL DEFAULT 'normal',
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    chat_id      TEXT NOT NULL,
    session_name TEXT NOT NULL,
    text         TEXT NOT NULL,
    send_at      INTEGER NOT NULL,
    sent         INTEGER DEFAULT 0,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS teams (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    leader_id    TEXT,
    leader_name  TEXT,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS team_members (
    team_id  TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS llm_usage (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL,
    endpoint       TEXT NOT NULL,
    model          TEXT NOT NULL,
    input_tokens   INTEGER DEFAULT 0,
    output_tokens  INTEGER DEFAULT 0,
    created_at     INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS labels (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title        TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#6366f1',
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );
`)

// ── Migraciones de columnas ───────────────────────────────────────────────────
;(function migrateColumns() {
  const fsCols = db.prepare("PRAGMA table_info(funnel_stages)").all().map(c => c.name)
  if (!fsCols.includes('lead_status')) {
    db.exec(`ALTER TABLE funnel_stages ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'open'`)
    console.log('✓ Migrado: funnel_stages.lead_status')
  }
  const csCols = db.prepare("PRAGMA table_info(channel_settings)").all().map(c => c.name)
  if (!csCols.includes('kanban_url')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN kanban_url TEXT`)
    console.log('✓ Migrado: channel_settings.kanban_url')
  }
  if (!csCols.includes('cw_url')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN cw_url TEXT`)
    db.exec(`ALTER TABLE channel_settings ADD COLUMN cw_token TEXT`)
    db.exec(`ALTER TABLE channel_settings ADD COLUMN cw_account_id TEXT`)
    console.log('✓ Migrado: channel_settings.cw_*')
  }
  if (!csCols.includes('default_bot_id')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN default_bot_id TEXT`)
    console.log('✓ Migrado: channel_settings.default_bot_id')
  }
  // agent_metadata: columnas agregadas post-creación
  const amCols = db.prepare("PRAGMA table_info(agent_metadata)").all().map(c => c.name)
  if (!amCols.includes('instructions')) {
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN instructions TEXT`)
    console.log('✓ Migrado: agent_metadata.instructions')
  }
  if (!amCols.includes('temperature')) {
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN temperature REAL DEFAULT 1.0`)
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN top_p REAL DEFAULT 1.0`)
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN channels TEXT`)
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN derivation_users TEXT`)
    console.log('✓ Migrado: agent_metadata.temperature/top_p/channels/derivation_users')
  }
  if (!amCols.includes('bot_type')) {
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN bot_type TEXT DEFAULT 'tilebot'`)
    console.log('✓ Migrado: agent_metadata.bot_type')
  }
  if (!amCols.includes('kb_namespace_id')) {
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN kb_namespace_id TEXT`)
    console.log('✓ Migrado: agent_metadata.kb_namespace_id')
  }
  if (!csCols.includes('llm_provider')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN llm_provider TEXT DEFAULT 'openai'`)
    db.exec(`ALTER TABLE channel_settings ADD COLUMN llm_api_key TEXT`)
    db.exec(`ALTER TABLE channel_settings ADD COLUMN llm_model TEXT DEFAULT 'gpt-4o-mini'`)
    console.log('✓ Migrado: channel_settings.llm_*')
  }
})()

// ── Migración: usuarios viejos sin workspace_id ───────────────────────────────
// Si la tabla users tiene columnas viejas (tiledesk_project_id), las migramos.
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name)

if (cols.includes('tiledesk_project_id') && !cols.includes('workspace_id')) {
  // Tabla vieja: agregar columnas nuevas y migrar
  db.exec(`ALTER TABLE users ADD COLUMN workspace_id TEXT;`)
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member';`)

  const oldUsers = db.prepare('SELECT id, email, name, tiledesk_project_id FROM users').all()
  for (const u of oldUsers) {
    if (!u.tiledesk_project_id) continue
    // Crear workspace para este usuario si no existe uno con ese projectId
    let ws = db.prepare('SELECT id FROM workspaces WHERE tiledesk_project_id=?').get(u.tiledesk_project_id)
    if (!ws) {
      const wsId = randomUUID()
      db.prepare('INSERT INTO workspaces (id,name,tiledesk_project_id) VALUES (?,?,?)')
        .run(wsId, (u.name || u.email) + ' Workspace', u.tiledesk_project_id)
      ws = { id: wsId }
    }
    db.prepare('UPDATE users SET workspace_id=?, role=? WHERE id=?').run(ws.id, 'owner', u.id)
    console.log(`✓ Migrado: ${u.email} → workspace ${ws.id} (project ${u.tiledesk_project_id})`)
  }
}

// ── LLM helper — lee config del workspace (DB) con fallback a env vars ────────
async function callLLM({ system, messages, max_tokens = 1024, workspaceId }) {
  // Config del workspace (DB) tiene prioridad sobre env vars
  let provider = null, apiKey = null, model = null
  if (workspaceId) {
    const cs = db.prepare('SELECT llm_provider, llm_api_key, llm_model FROM channel_settings WHERE workspace_id=?').get(workspaceId)
    if (cs?.llm_api_key) {
      provider = cs.llm_provider || 'openai'
      apiKey   = cs.llm_api_key
      model    = cs.llm_model || (provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini')
    }
  }
  // Fallback a env vars
  if (!apiKey) {
    if (process.env.OPENAI_API_KEY)    { provider = 'openai';    apiKey = process.env.OPENAI_API_KEY;    model = model || 'gpt-4o-mini' }
    else if (process.env.ANTHROPIC_API_KEY) { provider = 'anthropic'; apiKey = process.env.ANTHROPIC_API_KEY; model = model || 'claude-haiku-4-5-20251001' }
  }
  if (!apiKey) throw new Error('No hay API key de LLM configurada')

  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
    return { text: d.content?.[0]?.text?.trim() || '', model, usage: d.usage }
  }

  // OpenAI-compatible (openai, groq, openrouter, etc.)
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens, messages: msgs }),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
  return {
    text: d.choices?.[0]?.message?.content?.trim() || '',
    model,
    usage: { input_tokens: d.usage?.prompt_tokens, output_tokens: d.usage?.completion_tokens },
  }
}

// ── LLM usage tracker ─────────────────────────────────────────────────────────
function trackLlmUsage(workspaceId, endpoint, model, usage) {
  try {
    db.prepare('INSERT INTO llm_usage (id,workspace_id,endpoint,model,input_tokens,output_tokens) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), workspaceId || 'unknown', endpoint, model, usage?.input_tokens || 0, usage?.output_tokens || 0)
  } catch (_) {}
}

// Migrar usuarios del env ARIA_USERS (legacy)
let LEGACY_USERS = []
try { LEGACY_USERS = JSON.parse(process.env.ARIA_USERS || '[]') } catch {}
for (const u of LEGACY_USERS) {
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(u.email)
  if (!exists) {
    db.prepare('INSERT INTO users (id,email,password_hash,name,role) VALUES (?,?,?,?,?)')
      .run(randomUUID(), u.email, u.password, u.name || u.email, 'owner')
    console.log('✓ Usuario migrado desde env:', u.email)
  }
}

// ── Tiledesk admin token ──────────────────────────────────────────────────────
let tiledeskToken  = null
let tiledeskUserId = null
let tokenExpiry    = 0

async function getTiledeskToken() {
  if (tiledeskToken && Date.now() < tokenExpiry) return tiledeskToken
  const res = await fetch(`${TILEDESK_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TILEDESK_ADMIN_EMAIL, password: TILEDESK_ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Tiledesk login failed: ${res.status}`)
  const data     = await res.json()
  tiledeskToken  = data.token
  tiledeskUserId = data.user?._id || data._id || data.id
  tokenExpiry    = Date.now() + 23 * 60 * 60 * 1000
  console.log('✓ Tiledesk token renovado, userId:', tiledeskUserId)
  return tiledeskToken
}
getTiledeskToken().catch(e => console.error('⚠ No se pudo conectar a Tiledesk:', e.message))

// ── Helpers Tiledesk ──────────────────────────────────────────────────────────
async function tdFetch(path, opts = {}) {
  const token = await getTiledeskToken()
  const res = await fetch(`${TILEDESK_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: token, ...(opts.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.message || body.msg || `Tiledesk ${res.status}`), { body, status: res.status })
  return body
}

async function tdCreateProject(email, password, name) {
  const firstName = name || email.split('@')[0]

  // 1. Signup en Tiledesk
  const signupRes = await fetch(`${TILEDESK_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, firstname: firstName, lastname: '-' }),
  })
  if (!signupRes.ok) {
    const body = await signupRes.json().catch(() => ({}))
    const msg  = body.message || body.msg || ''
    if (!(signupRes.status === 403 && msg.includes('already registered'))) {
      throw new Error(`Error al crear usuario en Tiledesk: ${msg || signupRes.status}`)
    }
  }

  // 2. Signin para obtener token
  const signinRes = await fetch(`${TILEDESK_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!signinRes.ok) throw new Error('No se pudo autenticar en Tiledesk')
  const signinData = await signinRes.json()
  const tdToken    = signinData.token

  // 3. Crear proyecto
  const projRes = await fetch(`${TILEDESK_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: tdToken },
    body: JSON.stringify({ name: `${firstName} Workspace` }),
  })
  if (!projRes.ok) throw new Error('No se pudo crear el proyecto en Tiledesk')
  const proj = await projRes.json()

  return proj._id
}

// ── ARIA auth ─────────────────────────────────────────────────────────────────
// ── SSE broadcaster ───────────────────────────────────────────────────────────
const sseClients    = new Map() // workspaceId → Set<res>
const waAnonSessions = new Map() // `${workspaceId}:${waFrom}` → { anonToken, anonUserId }

function sseEmit(workspaceId, data) {
  const clients = sseClients.get(workspaceId)
  if (!clients?.size) return
  const eventName = data.event || 'message'
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { clients.delete(res) }
  }
}

function requireAriaAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '') || req.query.token || ''
  if (!token) return res.status(401).json({ error: 'No autenticado' })
  try { req.ariaUser = jwt.verify(token, JWT_SECRET); next() }
  catch { res.status(401).json({ error: 'Sesión expirada' }) }
}

function makeToken(user, workspace) {
  return jwt.sign(
    {
      email:       user.email,
      name:        user.name,
      role:        user.role,
      workspaceId: workspace.id,
      projectId:   workspace.tiledesk_project_id,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' })

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id=?').get(user.workspace_id)
  if (!workspace) return res.status(400).json({ error: 'Workspace no encontrado. Contactá al administrador.' })

  const token = makeToken(user, workspace)
  res.json({
    token,
    user: { email: user.email, name: user.name, role: user.role, projectId: workspace.tiledesk_project_id },
  })
})

// ── Registro (nuevo tenant = nuevo workspace + proyecto Tiledesk) ──────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, workspaceName } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email)
  if (existing) return res.status(400).json({ error: 'El email ya está registrado' })

  try {
    const projectId = await tdCreateProject(email, password, name)
    const hash      = await bcrypt.hash(password, 10)
    const firstName = name || email.split('@')[0]
    const wsName    = workspaceName || `${firstName} Workspace`

    const wsId = randomUUID()
    db.prepare('INSERT INTO workspaces (id,name,tiledesk_project_id) VALUES (?,?,?)')
      .run(wsId, wsName, projectId)

    const userId = randomUUID()
    db.prepare('INSERT INTO users (id,email,password_hash,name,workspace_id,role) VALUES (?,?,?,?,?,?)')
      .run(userId, email, hash, firstName, wsId, 'owner')

    const workspace = { id: wsId, tiledesk_project_id: projectId }
    const user      = { email, name: firstName, role: 'owner' }
    const token     = makeToken(user, workspace)

    res.json({ token, user: { email, name: firstName, role: 'owner', projectId } })
  } catch (e) {
    console.error('Register error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Me ────────────────────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAriaAuth, (req, res) => {
  res.json({
    email:       req.ariaUser.email,
    name:        req.ariaUser.name,
    role:        req.ariaUser.role,
    projectId:   req.ariaUser.projectId,
    workspaceId: req.ariaUser.workspaceId,
  })
})

// ── Workspace info ────────────────────────────────────────────────────────────
app.get('/api/workspace/members', requireAriaAuth, (req, res) => {
  const members = db.prepare(
    'SELECT id, email, name, role FROM users WHERE workspace_id=? ORDER BY name'
  ).all(req.ariaUser.workspaceId)
  res.json(members)
})

app.get('/api/workspace', requireAriaAuth, (req, res) => {
  const ws      = db.prepare('SELECT * FROM workspaces WHERE id=?').get(req.ariaUser.workspaceId)
  const members = db.prepare('SELECT email,name,role,created_at FROM users WHERE workspace_id=?').all(req.ariaUser.workspaceId)
  res.json({ workspace: ws, members })
})

// ── LLM usage stats ───────────────────────────────────────────────────────────
app.get('/api/usage/llm', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const { from, to } = req.query
  // from/to son fechas ISO 'YYYY-MM-DD', convertir a unix
  const fromTs = from ? Math.floor(new Date(from).getTime() / 1000) : 0
  const toTs   = to   ? Math.floor(new Date(to + 'T23:59:59').getTime() / 1000) : 9999999999

  const total = db.prepare(`
    SELECT SUM(input_tokens) AS total_input, SUM(output_tokens) AS total_output, COUNT(*) AS total_calls
    FROM llm_usage WHERE workspace_id=? AND created_at BETWEEN ? AND ?
  `).get(wsId, fromTs, toTs)

  const byEndpoint = db.prepare(`
    SELECT endpoint, model,
      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, COUNT(*) AS calls
    FROM llm_usage WHERE workspace_id=? AND created_at BETWEEN ? AND ?
    GROUP BY endpoint, model ORDER BY input_tokens DESC
  `).all(wsId, fromTs, toTs)

  const byDay = db.prepare(`
    SELECT date(created_at, 'unixepoch') AS day,
      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, COUNT(*) AS calls
    FROM llm_usage WHERE workspace_id=? AND created_at BETWEEN ? AND ?
    GROUP BY day ORDER BY day DESC LIMIT 60
  `).all(wsId, fromTs, toTs)

  res.json({ total, byEndpoint, byDay })
})

// ── Config LLM del workspace ──────────────────────────────────────────────────
app.get('/api/llm/config', requireAriaAuth, (req, res) => {
  const cs = db.prepare('SELECT llm_provider, llm_api_key, llm_model FROM channel_settings WHERE workspace_id=?').get(req.ariaUser.workspaceId)
  res.json({
    provider: cs?.llm_provider || 'openai',
    api_key:  cs?.llm_api_key ? '***' + cs.llm_api_key.slice(-4) : '',
    model:    cs?.llm_model || 'gpt-4o-mini',
    configured: !!cs?.llm_api_key,
  })
})

app.put('/api/llm/config', requireAriaAuth, (req, res) => {
  if (req.ariaUser.role !== 'owner') return res.status(403).json({ error: 'Solo el owner puede cambiar la config de IA' })
  const { provider, api_key, model } = req.body || {}
  const wsId = req.ariaUser.workspaceId
  const exists = db.prepare('SELECT workspace_id FROM channel_settings WHERE workspace_id=?').get(wsId)
  if (exists) {
    const updates = []
    const vals = []
    if (provider) { updates.push('llm_provider=?'); vals.push(provider) }
    if (api_key && !api_key.startsWith('***')) { updates.push('llm_api_key=?'); vals.push(api_key) }
    if (model)   { updates.push('llm_model=?');   vals.push(model)   }
    if (updates.length) {
      db.prepare(`UPDATE channel_settings SET ${updates.join(',')} WHERE workspace_id=?`).run(...vals, wsId)
    }
  } else {
    db.prepare('INSERT INTO channel_settings (workspace_id,llm_provider,llm_api_key,llm_model) VALUES (?,?,?,?)')
      .run(wsId, provider || 'openai', api_key || null, model || 'gpt-4o-mini')
  }
  res.json({ ok: true })
})

// ── Invitaciones ──────────────────────────────────────────────────────────────
// Solo owners/admins pueden invitar
app.post('/api/workspace/invite', requireAriaAuth, (req, res) => {
  if (!['owner', 'admin'].includes(req.ariaUser.role)) {
    return res.status(403).json({ error: 'Solo los administradores pueden invitar miembros' })
  }
  const { email, name, role, permissions } = req.body || {}
  const token   = randomUUID()
  const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60  // 7 días

  db.prepare('INSERT INTO invites (id,workspace_id,email,token,expires_at) VALUES (?,?,?,?,?)')
    .run(randomUUID(), req.ariaUser.workspaceId, email || null, token, expires)

  const publicUrl = process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'
  res.json({
    invite_token: token,
    invite_url: `${publicUrl}/register?invite=${token}`,
    expires_in: '7 días',
    email: email || null,
    name: name || null,
    role: role || 'member',
    permissions: permissions || null,
  })
})

// ── Teams ─────────────────────────────────────────────────────────────────────
app.get('/api/workspace/teams', requireAriaAuth, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams WHERE workspace_id=? ORDER BY created_at').all(req.ariaUser.workspaceId)
  const members = db.prepare('SELECT tm.team_id, u.id, u.name, u.email FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id IN (SELECT id FROM teams WHERE workspace_id=?)').all(req.ariaUser.workspaceId)
  const byTeam = {}
  for (const m of members) { if (!byTeam[m.team_id]) byTeam[m.team_id] = []; byTeam[m.team_id].push({ id: m.id, name: m.name, email: m.email }) }
  res.json(teams.map(t => ({ ...t, members: byTeam[t.id] || [] })))
})

app.post('/api/workspace/teams', requireAriaAuth, (req, res) => {
  const { name, description, leader_id, leader_name, member_ids = [] } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'name requerido' })
  const id = randomUUID()
  db.prepare('INSERT INTO teams (id,workspace_id,name,description,leader_id,leader_name) VALUES (?,?,?,?,?,?)').run(id, req.ariaUser.workspaceId, name.trim(), description || null, leader_id || null, leader_name || null)
  for (const uid of member_ids) db.prepare('INSERT OR IGNORE INTO team_members (team_id,user_id) VALUES (?,?)').run(id, uid)
  const team = db.prepare('SELECT * FROM teams WHERE id=?').get(id)
  res.json({ ...team, members: [] })
})

app.put('/api/workspace/teams/:id', requireAriaAuth, (req, res) => {
  const { name, description, leader_id, leader_name, member_ids } = req.body || {}
  db.prepare('UPDATE teams SET name=COALESCE(?,name), description=?, leader_id=?, leader_name=? WHERE id=? AND workspace_id=?').run(name || null, description || null, leader_id || null, leader_name || null, req.params.id, req.ariaUser.workspaceId)
  if (Array.isArray(member_ids)) {
    db.prepare('DELETE FROM team_members WHERE team_id=?').run(req.params.id)
    for (const uid of member_ids) db.prepare('INSERT OR IGNORE INTO team_members (team_id,user_id) VALUES (?,?)').run(req.params.id, uid)
  }
  res.json({ ok: true })
})

app.delete('/api/workspace/teams/:id', requireAriaAuth, (req, res) => {
  db.prepare('DELETE FROM team_members WHERE team_id=?').run(req.params.id)
  db.prepare('DELETE FROM teams WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// Verificar invite antes de registrar
app.get('/api/auth/invite/:token', (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE token=? AND used=0 AND expires_at>?')
    .get(req.params.token, Math.floor(Date.now() / 1000))
  if (!invite) return res.status(404).json({ error: 'Invitación inválida o expirada' })

  const ws = db.prepare('SELECT name FROM workspaces WHERE id=?').get(invite.workspace_id)
  res.json({ workspace_name: ws?.name, email: invite.email })
})

// Aceptar invitación (registrarse como miembro de workspace existente)
app.post('/api/auth/join', async (req, res) => {
  const { token, email, password, name } = req.body || {}
  if (!token || !email || !password) return res.status(400).json({ error: 'Datos incompletos' })
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

  const invite = db.prepare('SELECT * FROM invites WHERE token=? AND used=0 AND expires_at>?')
    .get(token, Math.floor(Date.now() / 1000))
  if (!invite) return res.status(400).json({ error: 'Invitación inválida o expirada' })

  if (invite.email && invite.email !== email) {
    return res.status(400).json({ error: `Esta invitación es para ${invite.email}` })
  }

  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email)
  if (existing) return res.status(400).json({ error: 'El email ya está registrado' })

  try {
    const hash      = await bcrypt.hash(password, 10)
    const firstName = name || email.split('@')[0]

    db.prepare('INSERT INTO users (id,email,password_hash,name,workspace_id,role) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), email, hash, firstName, invite.workspace_id, 'member')

    db.prepare('UPDATE invites SET used=1 WHERE token=?').run(token)

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id=?').get(invite.workspace_id)
    const user      = { email, name: firstName, role: 'member' }
    const jwtToken  = makeToken(user, workspace)

    res.json({
      token: jwtToken,
      user: { email, name: firstName, role: 'member', projectId: workspace.tiledesk_project_id },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Labels (etiquetas — almacenadas en ARIA, aplicadas a contactos via tags de Tiledesk) ──
app.get('/api/labels', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM labels WHERE workspace_id=? ORDER BY created_at').all(req.ariaUser.workspaceId)
  res.json(rows)
})

app.post('/api/labels', requireAriaAuth, (req, res) => {
  const { title, color } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'title requerido' })
  const id = randomUUID()
  db.prepare('INSERT INTO labels (id, workspace_id, title, color) VALUES (?, ?, ?, ?)')
    .run(id, req.ariaUser.workspaceId, title.trim(), color || '#6366f1')
  res.json(db.prepare('SELECT * FROM labels WHERE id=?').get(id))
})

app.put('/api/labels/:id', requireAriaAuth, (req, res) => {
  const { title, color } = req.body || {}
  db.prepare('UPDATE labels SET title=COALESCE(?,title), color=COALESCE(?,color) WHERE id=? AND workspace_id=?')
    .run(title?.trim() || null, color || null, req.params.id, req.ariaUser.workspaceId)
  res.json(db.prepare('SELECT * FROM labels WHERE id=?').get(req.params.id))
})

app.delete('/api/labels/:id', requireAriaAuth, (req, res) => {
  db.prepare('DELETE FROM labels WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// ── Funnels (pipelines) ───────────────────────────────────────────────────────
const DEFAULT_STAGES_JSON = JSON.stringify([
  { id: 'prospecto',   label: 'Prospecto',   color: '#6366f1' },
  { id: 'calificado',  label: 'Calificado',  color: '#3b82f6' },
  { id: 'propuesta',   label: 'Propuesta',   color: '#f59e0b' },
  { id: 'negociacion', label: 'Negociación', color: '#f97316' },
  { id: 'cerrado',     label: 'Ganado',      color: '#22c55e' },
  { id: 'descartado',  label: 'Descartado',  color: '#ef4444' },
])

app.get('/api/funnels', requireAriaAuth, (req, res) => {
  let rows = db.prepare('SELECT * FROM funnels WHERE workspace_id=? ORDER BY sort_order,created_at').all(req.ariaUser.workspaceId)
  if (rows.length === 0) {
    // Crear funnel por defecto
    const id = randomUUID()
    db.prepare('INSERT INTO funnels (id,workspace_id,name,stages,sort_order) VALUES (?,?,?,?,0)')
      .run(id, req.ariaUser.workspaceId, 'Principal', DEFAULT_STAGES_JSON)
    rows = [{ id, workspace_id: req.ariaUser.workspaceId, name: 'Principal', stages: DEFAULT_STAGES_JSON, sort_order: 0 }]
  }
  res.json(rows.map(r => ({ ...r, stages: JSON.parse(r.stages) })))
})

app.post('/api/funnels', requireAriaAuth, (req, res) => {
  const { name, stages } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name requerido' })
  const id = randomUUID()
  const stagesJson = stages ? JSON.stringify(stages) : DEFAULT_STAGES_JSON
  db.prepare('INSERT INTO funnels (id,workspace_id,name,stages) VALUES (?,?,?,?)')
    .run(id, req.ariaUser.workspaceId, name, stagesJson)
  res.json({ id, name, stages: JSON.parse(stagesJson) })
})

app.put('/api/funnels/:id', requireAriaAuth, (req, res) => {
  const { name, stages } = req.body || {}
  const funnel = db.prepare('SELECT id FROM funnels WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!funnel) return res.status(404).json({ error: 'Funnel no encontrado' })
  if (name) db.prepare('UPDATE funnels SET name=? WHERE id=?').run(name, req.params.id)
  if (stages) db.prepare('UPDATE funnels SET stages=? WHERE id=?').run(JSON.stringify(stages), req.params.id)
  res.json({ ok: true })
})

app.delete('/api/funnels/:id', requireAriaAuth, (req, res) => {
  const count = db.prepare('SELECT count(*) as n FROM funnels WHERE workspace_id=?').get(req.ariaUser.workspaceId)?.n || 0
  if (count <= 1) return res.status(400).json({ error: 'No se puede eliminar el único funnel' })
  db.prepare('DELETE FROM funnels WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// ── Funnel stages ─────────────────────────────────────────────────────────────
// GET  /api/funnel/stages       → { [lead_id]: stage }
// PUT  /api/funnel/stages/:id   → { stage }
// DELETE /api/funnel/stages/:id → elimina (para cuando se borra un contacto)

app.get('/api/funnel/stages', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT lead_id, stage, lead_status FROM funnel_stages WHERE workspace_id=?')
    .all(req.ariaUser.workspaceId)
  const map = {}
  for (const r of rows) map[r.lead_id] = { stage: r.stage, lead_status: r.lead_status }
  res.json(map)
})

app.put('/api/funnel/stages/:leadId', requireAriaAuth, (req, res) => {
  const { stage, lead_status } = req.body || {}
  if (!stage && !lead_status) return res.status(400).json({ error: 'stage o lead_status requerido' })
  const current = db.prepare('SELECT stage, lead_status FROM funnel_stages WHERE workspace_id=? AND lead_id=?')
    .get(req.ariaUser.workspaceId, req.params.leadId) || { stage: 'prospecto', lead_status: 'open' }
  db.prepare(`
    INSERT INTO funnel_stages (workspace_id, lead_id, stage, lead_status, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(workspace_id, lead_id) DO UPDATE
    SET stage=excluded.stage, lead_status=excluded.lead_status, updated_at=excluded.updated_at
  `).run(req.ariaUser.workspaceId, req.params.leadId,
    stage || current.stage,
    lead_status || current.lead_status)
  res.json({ ok: true })
})

app.delete('/api/funnel/stages/:leadId', requireAriaAuth, (req, res) => {
  db.prepare('DELETE FROM funnel_stages WHERE workspace_id=? AND lead_id=?')
    .run(req.ariaUser.workspaceId, req.params.leadId)
  res.json({ ok: true })
})

// ── Helpers de canales ────────────────────────────────────────────────────────
function getChannelSettings(workspaceId) {
  const s = db.prepare('SELECT * FROM channel_settings WHERE workspace_id=?').get(workspaceId) || {}
  const trim = v => (v || '').replace(/\/+$/, '')
  return {
    waha_url:       trim(s.waha_url    || process.env.WAHA_URL    || ''),
    waha_key:       s.waha_key    || process.env.WAHA_KEY    || '',
    evo_url:        trim(s.evo_url     || process.env.EVO_URL     || ''),
    evo_key:        s.evo_key     || process.env.EVO_KEY     || '',
    uzapi_url:      trim(s.uzapi_url   || process.env.UZAPI_URL   || ''),
    uzapi_token:    s.uzapi_token || process.env.UZAPI_TOKEN || '',
    kanban_url:     trim(s.kanban_url     || process.env.KANBAN_URL     || ''),
    cw_url:         trim(s.cw_url         || process.env.CW_URL         || ''),
    cw_token:       s.cw_token       || process.env.CW_TOKEN       || '',
    cw_account_id:  s.cw_account_id  || process.env.CW_ACCOUNT_ID  || '',
    default_bot_id: s.default_bot_id || null,
  }
}

// ── Canales — configuración de providers ──────────────────────────────────────
app.get('/api/channels/settings', requireAriaAuth, (req, res) => {
  const s = getChannelSettings(req.ariaUser.workspaceId)
  res.json(s)
})

app.put('/api/channels/settings', requireAriaAuth, (req, res) => {
  const { waha_url, waha_key, evo_url, evo_key, uzapi_url, uzapi_token, kanban_url, cw_url, cw_token, cw_account_id, default_bot_id } = req.body || {}
  db.prepare(`
    INSERT INTO channel_settings
      (workspace_id, waha_url, waha_key, evo_url, evo_key, uzapi_url, uzapi_token, kanban_url, cw_url, cw_token, cw_account_id, default_bot_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE
    SET waha_url=excluded.waha_url, waha_key=excluded.waha_key,
        evo_url=excluded.evo_url, evo_key=excluded.evo_key,
        uzapi_url=excluded.uzapi_url, uzapi_token=excluded.uzapi_token,
        kanban_url=excluded.kanban_url,
        cw_url=excluded.cw_url, cw_token=excluded.cw_token, cw_account_id=excluded.cw_account_id,
        default_bot_id=excluded.default_bot_id,
        updated_at=excluded.updated_at
  `).run(req.ariaUser.workspaceId,
    waha_url||null, waha_key||null, evo_url||null, evo_key||null,
    uzapi_url||null, uzapi_token||null, kanban_url||null,
    cw_url||null, cw_token||null, cw_account_id||null, default_bot_id||null)
  res.json({ ok: true })
})

// Seleccionar bot activo del workspace + registrar webhook en Tiledesk
app.put('/api/channels/settings/bot', requireAriaAuth, async (req, res) => {
  const { default_bot_id } = req.body || {}
  db.prepare(`
    INSERT INTO channel_settings (workspace_id, default_bot_id, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE SET default_bot_id=excluded.default_bot_id, updated_at=excluded.updated_at
  `).run(req.ariaUser.workspaceId, default_bot_id || null)

  // Registrar webhook en Tiledesk si hay bot activo
  if (default_bot_id) {
    const ws = db.prepare('SELECT * FROM workspaces WHERE id=?').get(req.ariaUser.workspaceId)
    if (ws?.tiledesk_project_id) registerTiledeskWebhook(ws.tiledesk_project_id).catch(() => {})
  }
  res.json({ ok: true })
})

// ── Canales — instancias ──────────────────────────────────────────────────────
app.get('/api/channels/instances', requireAriaAuth, async (req, res) => {
  const instances = db.prepare('SELECT * FROM channel_instances WHERE workspace_id=? ORDER BY created_at DESC')
    .all(req.ariaUser.workspaceId)
  const settings  = getChannelSettings(req.ariaUser.workspaceId)

  // Enrich with live status from providers
  const enriched = await Promise.all(instances.map(async (inst) => {
    try {
      if (inst.provider === 'waha') {
        const r = await fetch(`${settings.waha_url}/api/sessions/${inst.session_name}`,
          { headers: { 'X-Api-Key': settings.waha_key || '' } })
        if (r.ok) {
          const d = await r.json()
          return { ...inst, status: d.status || inst.status }
        }
        // Sesión no existe en WAHA — marcar como desconectada en lugar de mostrar status viejo
        return { ...inst, status: 'disconnected' }
      } else if (inst.provider === 'evolution') {
        const r = await fetch(`${settings.evo_url}/instance/connectionState/${inst.instance_name}`,
          { headers: { 'apikey': settings.evo_key || '' } })
        if (r.ok) {
          const d = await r.json()
          return { ...inst, status: d.instance?.state || d.state || inst.status }
        }
        return { ...inst, status: 'disconnected' }
      }
    } catch {}
    return { ...inst, status: 'disconnected' }
  }))
  res.json(enriched)
})

app.post('/api/channels/instances', requireAriaAuth, async (req, res) => {
  const { provider = 'waha', instance_name } = req.body || {}
  if (!instance_name) return res.status(400).json({ error: 'instance_name requerido' })
  const settings = getChannelSettings(req.ariaUser.workspaceId)
  const wsId = req.ariaUser.workspaceId
  const id   = randomUUID()

  try {
    if (provider === 'waha') {
      if (!settings.waha_url) return res.status(400).json({ error: 'WAHA URL no configurada' })
      const sessionName = `aria_${instance_name}_${wsId.slice(0,8)}`
      const r = await fetch(`${settings.waha_url}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': settings.waha_key || '' },
        body: JSON.stringify({
          name: sessionName,
          start: true,
          config: {
            webhooks: [{
              url: `${process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'}/webhook/waha`,
              events: ['message', 'message.any', 'session.status'],
            }],
          },
        }),
      })
      // 422 = ya existe, OK
      if (!r.ok && r.status !== 422) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.message || `WAHA error ${r.status}`)
      }
      db.prepare('INSERT OR REPLACE INTO channel_instances (id,workspace_id,provider,instance_name,session_name,status) VALUES (?,?,?,?,?,?)')
        .run(id, wsId, 'waha', instance_name, sessionName, 'STARTING')
      return res.json({ id, instance_name, session_name: sessionName, provider: 'waha', status: 'STARTING' })

    } else if (provider === 'evolution') {
      if (!settings.evo_url) return res.status(400).json({ error: 'Evolution URL no configurada' })
      const r = await fetch(`${settings.evo_url}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': settings.evo_key || '' },
        body: JSON.stringify({ instanceName: instance_name, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.message || `Evolution error ${r.status}`)
      db.prepare('INSERT OR REPLACE INTO channel_instances (id,workspace_id,provider,instance_name,status) VALUES (?,?,?,?,?)')
        .run(id, wsId, 'evolution', instance_name, 'connecting')
      return res.json({ id, instance_name, provider: 'evolution', status: 'connecting',
        qrcode: body.qrcode })

    } else if (provider === 'uzapi') {
      if (!settings.uzapi_url) return res.status(400).json({ error: 'UZAPI URL no configurada' })
      const r = await fetch(`${settings.uzapi_url}/instance/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'admintoken': settings.uzapi_token || '' },
        body: JSON.stringify({ name: instance_name }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.message || body.error || `UZAPI error ${r.status}`)
      const token = body.instance?.token
      db.prepare('INSERT OR REPLACE INTO channel_instances (id,workspace_id,provider,instance_name,status) VALUES (?,?,?,?,?)')
        .run(id, wsId, 'uzapi', instance_name, 'created')
      return res.json({ id, instance_name, provider: 'uzapi', status: 'created', token })
    }

    res.status(400).json({ error: 'Provider no soportado' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/channels/instances/:id/qr', requireAriaAuth, async (req, res) => {
  const inst = db.prepare('SELECT * FROM channel_instances WHERE id=? AND workspace_id=?')
    .get(req.params.id, req.ariaUser.workspaceId)
  if (!inst) return res.status(404).json({ error: 'Instancia no encontrada' })
  const settings = getChannelSettings(req.ariaUser.workspaceId)

  try {
    if (inst.provider === 'waha') {
      // Primero verificar estado de la sesión
      const stR = await fetch(`${settings.waha_url}/api/sessions/${inst.session_name}`,
        { headers: { 'X-Api-Key': settings.waha_key || '' } })
      if (!stR.ok) {
        // Sesión no existe en WAHA
        return res.json({ status: 'disconnected', qrcode: null })
      }
      const st = await stR.json().catch(() => ({}))
      // Si ya está conectada, devolver WORKING
      if (['WORKING', 'CONNECTED'].includes((st.status || '').toUpperCase())) {
        return res.json({ status: st.status, qrcode: null })
      }
      // Intentar obtener imagen QR
      const imgR = await fetch(`${settings.waha_url}/api/${inst.session_name}/auth/qr?format=image`,
        { headers: { 'X-Api-Key': settings.waha_key || '', Accept: 'image/png' } })
      if (imgR.ok) {
        const buf = await imgR.arrayBuffer()
        const b64 = `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
        return res.json({ qrcode: b64, status: 'SCAN_QR_CODE' })
      }
      return res.json({ status: st.status || 'STARTING', qrcode: null })

    } else if (inst.provider === 'evolution') {
      const r = await fetch(`${settings.evo_url}/instance/connect/${inst.instance_name}`,
        { headers: { 'apikey': settings.evo_key || '' } })
      const d = await r.json().catch(() => ({}))
      return res.json({ qrcode: d.base64 ? `data:image/png;base64,${d.base64.replace(/^data:image\/png;base64,/,'')}` : null, status: d.state || 'connecting' })
    }
    res.json({ status: 'unknown' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/channels/instances/:id/restart', requireAriaAuth, async (req, res) => {
  const inst = db.prepare('SELECT * FROM channel_instances WHERE id=? AND workspace_id=?')
    .get(req.params.id, req.ariaUser.workspaceId)
  if (!inst) return res.status(404).json({ error: 'Instancia no encontrada' })
  const settings = getChannelSettings(req.ariaUser.workspaceId)

  try {
    if (inst.provider === 'waha') {
      const webhookUrl = `${process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'}/webhook/waha`
      // Intentar iniciar sesión existente
      const startR = await fetch(`${settings.waha_url}/api/sessions/${inst.session_name}/start`, {
        method: 'POST', headers: { 'X-Api-Key': settings.waha_key || '' },
      })
      if (!startR.ok) {
        // Sesión no existe — recrear
        const createR = await fetch(`${settings.waha_url}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': settings.waha_key || '' },
          body: JSON.stringify({
            name: inst.session_name,
            start: true,
            config: {
              webhooks: [{ url: webhookUrl, events: ['message', 'message.any', 'session.status'] }],
            },
          }),
        })
        if (!createR.ok && createR.status !== 422) {
          const body = await createR.json().catch(() => ({}))
          throw new Error(body.message || `WAHA error ${createR.status}`)
        }
      }
      db.prepare("UPDATE channel_instances SET status='STARTING' WHERE id=?").run(inst.id)
      return res.json({ ok: true, status: 'STARTING' })
    }
    res.status(400).json({ error: 'Restart no soportado para este provider' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/channels/instances/:id', requireAriaAuth, async (req, res) => {
  const inst = db.prepare('SELECT * FROM channel_instances WHERE id=? AND workspace_id=?')
    .get(req.params.id, req.ariaUser.workspaceId)
  if (!inst) return res.status(404).json({ error: 'Instancia no encontrada' })
  const settings = getChannelSettings(req.ariaUser.workspaceId)

  try {
    if (inst.provider === 'waha') {
      await fetch(`${settings.waha_url}/api/sessions/${inst.session_name}`,
        { method: 'DELETE', headers: { 'X-Api-Key': settings.waha_key || '' } }).catch(() => {})
    } else if (inst.provider === 'evolution') {
      await fetch(`${settings.evo_url}/instance/delete/${inst.instance_name}`,
        { method: 'DELETE', headers: { 'apikey': settings.evo_key || '' } }).catch(() => {})
    }
  } catch {}

  db.prepare('DELETE FROM channel_instances WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/channels/instances/:id/logout', requireAriaAuth, async (req, res) => {
  const inst = db.prepare('SELECT * FROM channel_instances WHERE id=? AND workspace_id=?')
    .get(req.params.id, req.ariaUser.workspaceId)
  if (!inst) return res.status(404).json({ error: 'Instancia no encontrada' })
  const settings = getChannelSettings(req.ariaUser.workspaceId)
  try {
    if (inst.provider === 'waha') {
      await fetch(`${settings.waha_url}/api/sessions/${inst.session_name}/logout`,
        { method: 'POST', headers: { 'X-Api-Key': settings.waha_key || '' } })
    } else if (inst.provider === 'evolution') {
      await fetch(`${settings.evo_url}/instance/logout/${inst.instance_name}`,
        { method: 'DELETE', headers: { 'apikey': settings.evo_key || '' } })
    }
    db.prepare("UPDATE channel_instances SET status='disconnected' WHERE id=?").run(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── SSE endpoint ─────────────────────────────────────────────────────────────
app.get('/api/events', requireAriaAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const wsId = req.ariaUser.workspaceId
  if (!sseClients.has(wsId)) sseClients.set(wsId, new Set())
  sseClients.get(wsId).add(res)

  const ping = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 25000)
  req.on('close', () => {
    clearInterval(ping)
    sseClients.get(wsId)?.delete(res)
  })
})

// ── Webhook WAHA → Tiledesk ───────────────────────────────────────────────────
// WAHA envía aquí los mensajes entrantes de WhatsApp
// URL a configurar en WAHA: POST /webhook/waha
app.post('/webhook/waha', async (req, res) => {
  res.json({ ok: true })  // responder rápido siempre
  const payload = req.body
  console.log('📨 WAHA webhook recibido:', payload?.event, payload?.session)
  // Actualizar status de sesión
  if (payload.event === 'session.status' && payload.session) {
    const st = payload.payload?.status || payload.status
    if (st) {
      const dbStatus = st === 'WORKING' ? 'WORKING' : st === 'STOPPED' || st === 'FAILED' ? 'disconnected' : 'STARTING'
      db.prepare("UPDATE channel_instances SET status=? WHERE session_name=? AND provider='waha'").run(dbStatus, payload.session)
      console.log(`🔄 Session status update: ${payload.session} → ${dbStatus}`)
    }
    return
  }

  if (!payload || payload.event !== 'message') return
  const msg = payload.payload
  if (!msg || msg.fromMe) return  // ignorar mensajes propios
  const rawFrom = msg.chatId || msg.from || ''
  if (rawFrom === 'status@broadcast' || rawFrom.endsWith('@g.us')) return  // ignorar estados y grupos

  // Buscar workspace por session_name
  const sessionName = payload.session
  if (!sessionName) return
  const inst = db.prepare("SELECT * FROM channel_instances WHERE session_name=? AND provider='waha'").get(sessionName)
  console.log('🔍 Instancia encontrada:', inst ? inst.session_name : 'NO ENCONTRADA')
  if (!inst) return

  const ws = db.prepare('SELECT * FROM workspaces WHERE id=?').get(inst.workspace_id)
  console.log('🏢 Workspace:', ws ? ws.id : `NO ENCONTRADO (inst.workspace_id=${inst.workspace_id})`)
  if (!ws) return

  const projectId = ws.tiledesk_project_id
  // chatId = ID real del chat (número@c.us), siempre correcto para responder
  // msg.from puede ser @lid (privacidad) — no sirve para enviar
  const rawChatId = msg.chatId || msg.from || ''
  const from      = rawChatId.replace(/@(s\.whatsapp\.net|c\.us|lid)$/i, '')
  const chatSuffix = rawChatId.includes('@c.us') ? '@c.us' : '@s.whatsapp.net'
  console.log(`📱 chatId raw: ${rawChatId} | from: ${from} | suffix: ${chatSuffix}`)
  const body      = msg.body || msg.caption || ''
  const name      = msg._data?.notifyName || msg.pushName || msg.author || from
  console.log('📱 from:', from, '| body:', body?.slice(0, 40), '| projectId:', projectId)

  // fetch con timeout
  async function tdFetchTo(path, opts = {}, ms = 12000) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    try {
      const r = await fetch(`${TILEDESK_URL}${path}`, { ...opts, signal: ctrl.signal })
      clearTimeout(t)
      return r
    } catch(e) { clearTimeout(t); throw e }
  }

  try {
    const token = await getTiledeskToken()
    const tdH = { 'Content-Type': 'application/json', Authorization: token }

    // 1. Buscar o crear lead
    let lead = null
    const searchR = await tdFetchTo(`/${projectId}/leads?phone=${encodeURIComponent(from)}&limit=1`, { headers: tdH })
    console.log('🔎 Lead search status:', searchR.status)
    if (searchR.ok) {
      const d = await searchR.json()
      lead = (d.leads || [])[0] || null
    } else { await searchR.text().catch(() => {}) }

    if (!lead) {
      const createR = await tdFetchTo(`/${projectId}/leads`, {
        method: 'POST', headers: tdH,
        body: JSON.stringify({ fullname: name || from, attributes: {} }),
      })
      console.log('➕ Lead create status:', createR.status)
      if (createR.ok) {
        lead = await createR.json()
        tdFetchTo(`/${projectId}/leads/${lead._id}`, {
          method: 'PUT', headers: tdH, body: JSON.stringify({ phone: from }),
        }).catch(() => {})
      } else { await createR.text().catch(() => {}) }
    }
    console.log('👤 Lead:', lead?._id || 'NO CREADO')

    // 2. Obtener o crear token anónimo para este número WA (Tiledesk requiere token de visitante)
    const anonKey = `${inst.workspace_id}:${from}`
    let anon = waAnonSessions.get(anonKey)
    if (!anon) {
      const anonRes = await fetch(`${TILEDESK_URL}/auth/signinAnonymously`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_project: projectId, firstname: name || from }),
      })
      if (anonRes.ok) {
        const anonData = await anonRes.json()
        anon = { anonToken: anonData.token, anonUserId: anonData.user?._id }
        waAnonSessions.set(anonKey, anon)
        console.log('🔑 Anon session creada para:', from)
      } else {
        console.error('⚠ signinAnonymously falló:', anonRes.status)
      }
    }
    const anonH = anon
      ? { Authorization: anon.anonToken, 'Content-Type': 'application/json' }
      : tdH // fallback a admin token

    // 3. Buscar conversación activa en DB de ARIA
    let requestId = null
    // Expirar convs sin actividad en 30 min → nueva conv con bot fresco
    const CONV_TTL_SECS = 30 * 60
    // Buscar por rawChatId (con sufijo) o por from (sin sufijo) para compatibilidad con registros viejos
    db.prepare(
      "UPDATE wa_conversations SET closed=1 WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 AND (strftime('%s','now') - updated_at) > ?"
    ).run(inst.workspace_id, sessionName, rawChatId, from, CONV_TTL_SECS)

    const waConv = db.prepare(
      'SELECT request_id FROM wa_conversations WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 ORDER BY updated_at DESC LIMIT 1'
    ).get(inst.workspace_id, sessionName, rawChatId, from)

    if (waConv) {
      requestId = waConv.request_id
      console.log('📂 Conv existente:', requestId)
      const msgR = await tdFetchTo(`/${projectId}/requests/${requestId}/messages`, {
        method: 'POST', headers: anonH,
        body: JSON.stringify({ text: body, sender: anon?.anonUserId }),
      })
      console.log('💬 Add message status:', msgR.status)
      if (!msgR.ok) {
        await msgR.text().catch(() => {})
        db.prepare('UPDATE wa_conversations SET closed=1 WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?)')
          .run(inst.workspace_id, sessionName, rawChatId, from)
        waAnonSessions.delete(anonKey)
        requestId = null
      } else {
        await msgR.text().catch(() => {})
        db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
        // Re-agregar bot si fue removido por handoff
        const wsBotSettings = getChannelSettings(inst.workspace_id)
        const botId = wsBotSettings.default_bot_id
        if (botId) {
          setTimeout(async () => {
            try {
              const pr = await tdFetchTo(`/${projectId}/requests/${requestId}/participants`, {
                method: 'POST', headers: tdH,
                body: JSON.stringify({ member: `bot_${botId}` }),
              })
              console.log(`🤖 Bot re-add (existente): ${pr.status}`)
            } catch(e) { console.error('⚠ Bot re-add:', e.message) }
          }, 800)
        }
      }
    }

    if (!requestId) {
      // Crear nueva conversación con requestId formato correcto (igual que test-chat)
      requestId = `support-group-${projectId}-${randomUUID().replace(/-/g, '')}`
      const msgsUrl = `${TILEDESK_URL}/${projectId}/requests/${requestId}/messages`
      console.log('➕ Nueva conv:', requestId)
      const msgR = await fetch(msgsUrl, {
        method: 'POST', headers: anonH,
        body: JSON.stringify({ text: body, sender: anon?.anonUserId }),
      })
      console.log('➕ Primera msg status:', msgR.status)
      if (msgR.ok) {
        await msgR.text().catch(() => {})
        db.prepare(
          "INSERT OR REPLACE INTO wa_conversations (id,workspace_id,session_name,wa_from,request_id,closed,updated_at) VALUES (?,?,?,?,?,0,strftime('%s','now'))"
        ).run(randomUUID(), inst.workspace_id, sessionName, rawChatId, requestId)

        // Vincular lead a la conversación
        if (lead?._id) {
          tdFetchTo(`/${projectId}/requests/${requestId}`, {
            method: 'PATCH', headers: tdH,
            body: JSON.stringify({ lead_id: lead._id }),
          }).catch(() => {})
        }

        // Agregar bot activo como participante
        const wsBotSettings = getChannelSettings(inst.workspace_id)
        if (wsBotSettings.default_bot_id) {
          const botId = wsBotSettings.default_bot_id
          setTimeout(async () => {
            try {
              const pr = await tdFetchTo(`/${projectId}/requests/${requestId}/participants`, {
                method: 'POST', headers: tdH,
                body: JSON.stringify({ member: `bot_${botId}` }),
              })
              const prBody = await pr.text().catch(() => '')
              console.log(`🤖 Bot participant status: ${pr.status} | ${prBody.slice(0, 100)}`)
            } catch(e) {
              console.error('⚠ Add bot participant:', e.message)
            }
          }, 1500)
        } else {
          console.log('⚠ Sin default_bot_id configurado para workspace:', inst.workspace_id)
        }
      } else {
        const errTxt = await msgR.text().catch(() => '')
        console.error('⚠ Conv create error:', msgR.status, errTxt)
        requestId = null
      }
    }

    console.log(`✓ WAHA→Tiledesk: ${from} → conv ${requestId}`)
    if (requestId) sseEmit(inst.workspace_id, { event: 'new-message', requestId, from, name, text: body })
  } catch (e) {
    console.error('⚠ Webhook WAHA error:', e.message, e.stack?.split('\n')[1])
  }
})

// ── Webhook Tiledesk → WAHA (respuestas del bot/agente) ──────────────────────
app.post('/webhook/tiledesk', async (req, res) => {
  res.json({ ok: true })
  try {
    const hook    = req.body?.hook || {}
    const payload = req.body?.payload || {}

    if (hook.event !== 'message.create') return

    // Payload real: { sender, senderFullname, recipient (=requestId), text, request (obj), ... }
    // Ignorar: sistema, visitante (UUID format)
    const sender = payload.sender || ''
    if (sender === 'system') return  // mensajes de sistema (joins, removes, etc.)
    const isVisitor = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sender)
    if (isVisitor) return  // ignorar mensajes del visitante (evitar loop)

    const text = payload.text || payload.message || ''
    if (!text) return

    // recipient = requestId directo. Fallback a request._id o request (si es string)
    const requestId = payload.recipient ||
      (typeof payload.request === 'string' ? payload.request : payload.request?._id) ||
      null

    console.log(`📤 Tiledesk→WAHA: sender=${sender} | requestId=${requestId} | text=${text?.slice(0,40)}`)
    if (!requestId) return console.log('⚠ Tiledesk webhook: sin requestId')

    const conv = db.prepare('SELECT * FROM wa_conversations WHERE request_id=? LIMIT 1').get(requestId)
    if (!conv) return console.log('⚠ Tiledesk webhook: conv no encontrada para', requestId)

    const settings = getChannelSettings(conv.workspace_id)
    if (!settings.waha_url) return console.log('⚠ Tiledesk webhook: sin WAHA URL')

    // wa_from tiene el rawChatId con sufijo original (ej: @lid, @c.us, @s.whatsapp.net)
    const chatId = conv.wa_from.includes('@') ? conv.wa_from : `${conv.wa_from}@c.us`

    console.log(`📤 Enviando a WAHA: chatId=${chatId} | session=${conv.session_name} | text=${text?.slice(0,40)}`)
    const wahaRes = await fetch(`${settings.waha_url}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': settings.waha_key || '' },
      body: JSON.stringify({ chatId, text, session: conv.session_name }),
    })
    const wahaBody = await wahaRes.text().catch(() => '')
    console.log(`✓ Tiledesk→WAHA: ${conv.wa_from} (${conv.session_name}) | status: ${wahaRes.status} | resp: ${wahaBody.slice(0,100)}`)
  } catch (e) {
    console.error('⚠ Tiledesk webhook error:', e.message)
  }
})

// Registrar webhook en Tiledesk (llamar al configurar el bot activo)
async function registerTiledeskWebhook(projectId) {
  try {
    const token   = await getTiledeskToken()
    const hookUrl = `${process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'}/webhook/tiledesk`
    // Verificar si ya existe
    const listR   = await fetch(`${TILEDESK_URL}/${projectId}/subscriptions`, {
      headers: { Authorization: token },
    })
    if (listR.ok) {
      const list = await listR.json()
      const exists = (list || []).some(s => s.target === hookUrl && s.event === 'message.create')
      if (exists) { console.log('✓ Tiledesk webhook ya registrado'); return }
    }
    await fetch(`${TILEDESK_URL}/${projectId}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ event: 'message.create', target: hookUrl }),
    })
    console.log('✓ Tiledesk webhook registrado:', hookUrl)
  } catch (e) {
    console.error('⚠ Error registrando Tiledesk webhook:', e.message)
  }
}

// ── Contactos: crear en Tiledesk + sync a Chatwoot ────────────────────────────
app.post('/api/tiledesk/:projectId/leads', requireAriaAuth, async (req, res) => {
  try {
    const token = await getTiledeskToken()
    const tdRes = await fetch(`${TILEDESK_URL}/${req.params.projectId}/leads`, {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const tdData = await tdRes.json().catch(() => ({}))
    if (!tdRes.ok) return res.status(tdRes.status).json(tdData)

    // Sync a Chatwoot (fire & forget)
    const s = getChannelSettings(req.ariaUser.workspaceId)
    if (s.cw_url && s.cw_token && s.cw_account_id) {
      const { fullname, email } = req.body || {}
      fetch(`${s.cw_url}/api/v1/accounts/${s.cw_account_id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api_access_token': s.cw_token },
        body: JSON.stringify({
          name:         fullname || '',
          email:        email   || '',
          phone_number: req.body.phone || '',
        }),
      }).catch(e => console.error('⚠ Chatwoot contact sync:', e.message))
    }

    res.json(tdData)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Proxy a Tiledesk ──────────────────────────────────────────────────────────
app.use('/api/tiledesk', requireAriaAuth, async (req, res, next) => {
  try {
    req.tiledeskToken = await getTiledeskToken()
    next()
  } catch (e) {
    res.status(503).json({ error: 'No se pudo conectar a Tiledesk' })
  }
}, createProxyMiddleware({
  target: TILEDESK_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/tiledesk': '' },
  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader('Authorization', req.tiledeskToken)
      if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const bodyStr = JSON.stringify(req.body)
        proxyReq.setHeader('Content-Type', 'application/json')
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyStr))
        proxyReq.write(bodyStr)
      }
    },
  },
}))

// ── WAHA Inbox ────────────────────────────────────────────────────────────────
function getPrimaryWahaSession(workspaceId) {
  return db.prepare(
    "SELECT * FROM channel_instances WHERE workspace_id=? AND provider='waha' AND status='WORKING' ORDER BY created_at LIMIT 1"
  ).get(workspaceId)
}

async function wahaReq(settings, path, opts = {}) {
  return fetch(`${settings.waha_url}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': settings.waha_key || '',
      ...(opts.headers || {}),
    },
  })
}

function getAllWahaSessions(workspaceId) {
  return db.prepare(
    "SELECT * FROM channel_instances WHERE workspace_id=? AND provider='waha' AND status='WORKING' ORDER BY created_at"
  ).all(workspaceId)
}

app.get('/api/waha/sessions', requireAriaAuth, (req, res) => {
  const rows = db.prepare(
    "SELECT id, instance_name, session_name, phone_number, status FROM channel_instances WHERE workspace_id=? AND provider='waha' ORDER BY created_at"
  ).all(req.ariaUser.workspaceId)
  res.json(rows)
})

app.get('/api/waha/chats', requireAriaAuth, async (req, res) => {
  const sessions = getAllWahaSessions(req.ariaUser.workspaceId)
  if (!sessions.length) return res.json([])
  const s = getChannelSettings(req.ariaUser.workspaceId)
  const limit = req.query.limit || 50
  try {
    const results = await Promise.allSettled(
      sessions.map(inst =>
        wahaReq(s, `/api/${inst.session_name}/chats/overview?limit=${limit}&sortBy=messageTimestamp&sortOrder=desc`)
          .then(r => r.json().catch(() => []))
          .then(chats => (Array.isArray(chats) ? chats : []).map(c => ({ ...c, _session: inst.session_name, _phone: inst.phone_number })))
      )
    )
    const merged = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0))
    res.json(merged)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/waha/chats/:chatId/messages', requireAriaAuth, async (req, res) => {
  const sessionName = req.query.session
  const s = getChannelSettings(req.ariaUser.workspaceId)
  const inst = sessionName
    ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND session_name=?").get(req.ariaUser.workspaceId, sessionName)
    : getPrimaryWahaSession(req.ariaUser.workspaceId)
  if (!inst) return res.json([])
  try {
    const limit = req.query.limit || 50
    const r = await wahaReq(s, `/api/${inst.session_name}/chats/${encodeURIComponent(req.params.chatId)}/messages?limit=${limit}&downloadMedia=false`)
    const data = await r.json().catch(() => [])
    res.json(Array.isArray(data) ? data : [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/waha/send', requireAriaAuth, async (req, res) => {
  const { chatId, text, session } = req.body || {}
  if (!chatId || !text) return res.status(400).json({ error: 'chatId y text requeridos' })
  const s = getChannelSettings(req.ariaUser.workspaceId)
  const inst = session
    ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND session_name=?").get(req.ariaUser.workspaceId, session)
    : getPrimaryWahaSession(req.ariaUser.workspaceId)
  if (!inst) return res.status(400).json({ error: 'Sin sesión WAHA activa' })
  try {
    const r = await wahaReq(s, `/api/sendText`, {
      method: 'POST',
      body: JSON.stringify({ chatId, text, session: inst.session_name }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json(data)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/waha/chats/:chatId/read', requireAriaAuth, async (req, res) => {
  const sessionName = req.query.session || req.body?.session
  const s = getChannelSettings(req.ariaUser.workspaceId)
  const inst = sessionName
    ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND session_name=?").get(req.ariaUser.workspaceId, sessionName)
    : getPrimaryWahaSession(req.ariaUser.workspaceId)
  if (!inst) return res.json({ ok: true })
  try {
    await wahaReq(s, `/api/${inst.session_name}/chats/${encodeURIComponent(req.params.chatId)}/messages/read`, {
      method: 'POST', body: '{}',
    })
  } catch {}
  res.json({ ok: true })
})

// ── Tareas ────────────────────────────────────────────────────────────────────
app.get('/api/tasks', requireAriaAuth, (req, res) => {
  const { status, priority, assignee_id, lead_id, q } = req.query
  let sql = 'SELECT * FROM tasks WHERE workspace_id=?'
  const params = [req.ariaUser.workspaceId]
  if (status)      { sql += ' AND status=?';        params.push(status) }
  if (priority)    { sql += ' AND priority=?';      params.push(priority) }
  if (assignee_id) { sql += ' AND assignee_id=?';   params.push(assignee_id) }
  if (lead_id)     { sql += ' AND lead_id=?';       params.push(lead_id) }
  if (q)           { sql += ' AND title LIKE ?';    params.push(`%${q}%`) }
  sql += ' ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/tasks', requireAriaAuth, (req, res) => {
  const { title, description, lead_id, lead_name, assignee_id, assignee_name, due_date, priority, status, funnel_id, funnel_name } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'title requerido' })
  const id = randomUUID()
  db.prepare(
    'INSERT INTO tasks (id,workspace_id,title,description,lead_id,lead_name,assignee_id,assignee_name,due_date,priority,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, req.ariaUser.workspaceId, title.trim(), description || null, lead_id || null, lead_name || null, assignee_id || null, assignee_name || null, due_date || null, priority || 'normal', status || 'pending')
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id))
})

app.put('/api/tasks/:id', requireAriaAuth, (req, res) => {
  const { title, description, lead_id, lead_name, assignee_id, assignee_name, due_date, status, priority } = req.body || {}
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!task) return res.status(404).json({ error: 'No encontrada' })
  db.prepare(
    'UPDATE tasks SET title=?,description=?,lead_id=?,lead_name=?,assignee_id=?,assignee_name=?,due_date=?,status=?,priority=? WHERE id=?'
  ).run(
    title ?? task.title, description ?? task.description, lead_id ?? task.lead_id,
    lead_name ?? task.lead_name, assignee_id ?? task.assignee_id, assignee_name ?? task.assignee_name,
    due_date ?? task.due_date, status ?? task.status, priority ?? task.priority, req.params.id
  )
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id))
})

app.delete('/api/tasks/:id', requireAriaAuth, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// ── WAHA: enviar archivo ──────────────────────────────────────────────────────
app.post('/api/waha/send-file', requireAriaAuth, async (req, res) => {
  const { chatId, session, data, mimetype, filename, caption } = req.body || {}
  if (!chatId || !data) return res.status(400).json({ error: 'chatId y data requeridos' })
  const s = getChannelSettings(req.ariaUser.workspaceId)
  const inst = session
    ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND session_name=?").get(req.ariaUser.workspaceId, session)
    : getPrimaryWahaSession(req.ariaUser.workspaceId)
  if (!inst) return res.status(400).json({ error: 'Sin sesión WAHA activa' })
  try {
    const r = await wahaReq(s, `/api/sendFile`, {
      method: 'POST',
      body: JSON.stringify({ chatId, caption: caption || '', file: { data, mimetype, filename } }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json(d)
    res.json(d)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── WAHA: enviar audio ────────────────────────────────────────────────────────
app.post('/api/waha/send-voice', requireAriaAuth, async (req, res) => {
  const { chatId, session, data } = req.body || {}
  if (!chatId || !data) return res.status(400).json({ error: 'chatId y data requeridos' })
  const s = getChannelSettings(req.ariaUser.workspaceId)
  const inst = session
    ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND session_name=?").get(req.ariaUser.workspaceId, session)
    : getPrimaryWahaSession(req.ariaUser.workspaceId)
  if (!inst) return res.status(400).json({ error: 'Sin sesión WAHA activa' })
  try {
    const r = await wahaReq(s, `/api/sendVoice`, {
      method: 'POST',
      body: JSON.stringify({ chatId, file: { data, mimetype: 'audio/ogg; codecs=opus', filename: 'voice.ogg' } }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json(d)
    res.json(d)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Mensajes programados ──────────────────────────────────────────────────────
app.get('/api/scheduled-messages', requireAriaAuth, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM scheduled_messages WHERE workspace_id=? AND sent=0 ORDER BY send_at"
  ).all(req.ariaUser.workspaceId)
  res.json(rows)
})

app.post('/api/scheduled-messages', requireAriaAuth, (req, res) => {
  const { chatId, session, text, sendAt } = req.body || {}
  if (!chatId || !text || !sendAt) return res.status(400).json({ error: 'chatId, text y sendAt requeridos' })
  const id = randomUUID()
  db.prepare(
    "INSERT INTO scheduled_messages (id,workspace_id,chat_id,session_name,text,send_at) VALUES (?,?,?,?,?,?)"
  ).run(id, req.ariaUser.workspaceId, chatId, session || '', text, Math.floor(new Date(sendAt).getTime() / 1000))
  res.json({ id, chatId, session, text, sendAt })
})

app.delete('/api/scheduled-messages/:id', requireAriaAuth, (req, res) => {
  db.prepare("DELETE FROM scheduled_messages WHERE id=? AND workspace_id=?")
    .run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// Cron: enviar mensajes programados cada 30s
setInterval(async () => {
  const now = Math.floor(Date.now() / 1000)
  const pending = db.prepare(
    "SELECT sm.*, ci.phone_number FROM scheduled_messages sm LEFT JOIN channel_instances ci ON ci.session_name=sm.session_name WHERE sm.sent=0 AND sm.send_at <= ?"
  ).all(now)
  for (const msg of pending) {
    try {
      const s = getChannelSettings(msg.workspace_id)
      const inst = msg.session_name
        ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND session_name=?").get(msg.workspace_id, msg.session_name)
        : db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND provider='waha' AND status='WORKING' LIMIT 1").get(msg.workspace_id)
      if (!inst) continue
      await wahaReq(s, `/api/sendText`, {
        method: 'POST',
        body: JSON.stringify({ chatId: msg.chat_id, text: msg.text, session: inst.session_name }),
      })
      db.prepare("UPDATE scheduled_messages SET sent=1 WHERE id=?").run(msg.id)
      console.log(`📅 Mensaje programado enviado: ${msg.id} → ${msg.chat_id}`)
    } catch (e) {
      console.error('⚠ Error enviando mensaje programado:', e.message)
    }
  }
}, 30000)

// ── AI: sugerir respuesta ─────────────────────────────────────────────────────
app.post('/api/ai/suggest', requireAriaAuth, async (req, res) => {
  const { messages, contactName } = req.body || {}
  try {
    const history = (messages || []).slice(-10).reverse().map(m => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.body || m.caption || '[media]',
    }))
    const { text, model, usage } = await callLLM({ workspaceId: req.ariaUser?.workspaceId,       system: `Sos un asistente de ventas y atención al cliente. El cliente se llama ${contactName || 'el cliente'}. Sugerí una respuesta corta, amable y en español al último mensaje. Solo devolvé el texto de la respuesta, sin explicaciones.`,
      messages: history,
      max_tokens: 200,
    })
    trackLlmUsage(req.ariaUser?.workspaceId, 'ai-suggest', model, usage)
    res.json({ suggestion: text || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Agent Wizard ──────────────────────────────────────────────────────────────

const FLOW_TEMPLATES = {
  'lead-qualifier':        'ARIA Agent.json',
  'faq':                   'ARIA Agent.json',
  'travel':                'ARIA Agent.json',
  'broker':                'ARIA Agent.json',
  'concesionaria-directa': 'ARIA Agent.json',
  'concesionaria-plan':    'ARIA Agent.json',
  'chatgpt-task':          'ARIA Agent.json',
  'aria-agent':            'ARIA Agent.json',
}
const FLOWS_DIR = join(__dirname, '../flows')

function loadFlow(templateId) {
  const file = FLOW_TEMPLATES[templateId] || 'QualiBot Pro.json'
  return JSON.parse(readFileSync(join(FLOWS_DIR, file), 'utf8'))
}

function injectInstructions(flow, instructions, welcomeMsg) {
  const intents = (flow.intents || []).map(intent => {
    const actions = (intent.actions || []).map(action => {
      // Solo inyectar en el gpt_task principal (context no vacío = tarea conversacional)
      if (action._tdActionType === 'gpt_task' && instructions && action.context && action.context.trim().length > 0) {
        return { ...action, context: instructions }
      }
      return action
    })
    // update welcome message
    if (intent.intent_display_name === 'welcome' && welcomeMsg) {
      const updatedActions = actions.map(action => {
        if (action._tdActionType === 'reply') {
          const commands = (action.attributes?.commands || []).map(cmd => {
            if (cmd.type === 'message' && cmd.message?.type === 'text') {
              return { ...cmd, message: { ...cmd.message, text: welcomeMsg } }
            }
            return cmd
          })
          return { ...action, attributes: { ...action.attributes, commands } }
        }
        return action
      })
      return { ...intent, actions: updatedActions }
    }
    return { ...intent, actions }
  })
  return { ...flow, intents }
}

async function importFlowToBot(projectId, botId, flowObj, token) {
  const blob = new Blob([JSON.stringify(flowObj)], { type: 'application/json' })
  const form = new FormData()
  form.append('uploadFile', blob, 'flow.json')
  return fetch(`${TILEDESK_URL}/${projectId}/bots/importjson/${botId}`, {
    method: 'POST',
    headers: { Authorization: token },
    body: form,
  })
}

// Crear borrador: POST bot en Tiledesk + importar flujo de la plantilla
// bot_type='tilebot' (default) → bot interno con flujo JSON importado desde /flows/
// bot_type='external'          → bot externo que llama a /api/bot-webhook (LLM directo en ARIA)
app.post('/api/agents/create-draft', requireAriaAuth, async (req, res) => {
  const { projectId, name, description, language, welcome_msg, template_id, bot_type } = req.body || {}
  if (!projectId || !name) return res.status(400).json({ error: 'projectId y name requeridos' })
  try {
    const token = await getTiledeskToken()
    const ARIA_URL = process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'
    const isExternal = bot_type === 'external'

    const botPayload = isExternal
      ? { name, description: description || '', type: 'external', subtype: 'chatbot', url: `${ARIA_URL}/api/bot-webhook` }
      : { name, description: description || '', language: language || 'es', welcome_msg: welcome_msg || '', type: 'tilebot', subtype: 'chatbot' }

    const botRes = await fetch(`${TILEDESK_URL}/${projectId}/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify(botPayload),
    })
    if (!botRes.ok) return res.status(botRes.status).json({ error: 'Error creando bot en Tiledesk' })
    const bot = await botRes.json()
    const botId = bot._id

    // Crear namespace de KB exclusivo para este bot en Tiledesk
    let kbNamespaceId = null
    try {
      const nsRes = await fetch(`${TILEDESK_URL}/${projectId}/kb/namespace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ name: `${name} [${botId}]` }),
      })
      if (nsRes.ok) {
        const nsData = await nsRes.json()
        kbNamespaceId = nsData._id || nsData.id || null
        console.log(`📚 KB namespace creado: ${kbNamespaceId} para bot ${botId}`)
      } else {
        console.warn(`⚠ KB namespace creation: ${nsRes.status}`)
      }
    } catch (nsErr) { console.warn('⚠ KB namespace error:', nsErr.message) }

    // Importar flujo de la plantilla (solo tilebots)
    if (!isExternal && template_id) {
      const flow = loadFlow(template_id)
      const importRes = await importFlowToBot(projectId, botId, flow, token)
      console.log(`📥 Flow import (${template_id}): ${importRes.status}`)
    }

    db.prepare(`INSERT OR IGNORE INTO agent_metadata (bot_id, workspace_id, template_id, bot_type, kb_namespace_id, updated_at)
      VALUES (?, ?, ?, ?, ?, strftime('%s','now'))`)
      .run(botId, req.ariaUser.workspaceId, template_id || null, isExternal ? 'external' : 'tilebot', kbNamespaceId)

    res.json({ botId, name, bot_type: isExternal ? 'external' : 'tilebot', kbNamespaceId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Generar instrucciones con LLM (incluye KB de Tiledesk si existe)
app.post('/api/agents/generate-instructions', requireAriaAuth, async (req, res) => {
  const { agent_name, tone, nationality, company_name, company_description, websites, temperature, derivation_notes, bot_id } = req.body || {}

  // Leer KB del namespace exclusivo del bot (si existe)
  let kbSection = ''
  try {
    const workspace  = db.prepare('SELECT tiledesk_project_id FROM workspaces WHERE id=?').get(req.ariaUser.workspaceId)
    const projectId  = workspace?.tiledesk_project_id
    // Intentar obtener el namespace del bot específico
    const botMeta    = bot_id ? db.prepare('SELECT kb_namespace_id FROM agent_metadata WHERE bot_id=?').get(bot_id) : null
    const nsId       = botMeta?.kb_namespace_id
    if (projectId && nsId) {
      const tdToken = await getTiledeskToken()
      const kbRes   = await fetch(`${TILEDESK_URL}/${projectId}/kb/?namespace=${nsId}&direction=-1&sortField=updatedAt&limit=100`, {
        headers: { Authorization: tdToken }
      })
      if (kbRes.ok) {
        const kbData = await kbRes.json().catch(() => null)
        const items  = Array.isArray(kbData?.kbs) ? kbData.kbs : []
        if (items.length > 0) {
          const lines = items.map(item => {
            if (item.type === 'faq') return `  - ${item.name}: ${item.content?.slice(0, 400) || ''}`
            if (item.type === 'url') return `  - Web (${item.source || item.name}): ${item.content?.slice(0, 300) || '(pendiente de indexar)'}`
            return `  - ${item.name}: ${item.content?.slice(0, 300) || ''}${(item.content?.length || 0) > 300 ? '...' : ''}`
          })
          kbSection = `\n- Base de conocimiento del agente:\n${lines.join('\n')}`
        }
      }
    }
  } catch (_) {}

  const prompt = `Generá un prompt completo en español para un agente de IA de WhatsApp con los siguientes datos:

- Nombre del agente: ${agent_name}
- Tono: ${tone}
- Nacionalidad/región: ${nationality}
- Empresa: ${company_name}
- Descripción de la empresa: ${company_description}
${websites?.filter(Boolean).length ? `- Sitios web: ${websites.filter(Boolean).join(', ')}` : ''}
${derivation_notes ? `- Instrucciones de derivación: ${derivation_notes}` : ''}${kbSection}

El prompt debe incluir:
1. Definición del agente (nombre, rol, perfil, limitaciones)
2. Descripción de la empresa${kbSection ? ' e información de la base de conocimiento' : ''}
3. Objetivos del agente
4. Audiencia dirigida
5. Flujo conversacional (pasos numerados)
6. Reglas y buenas prácticas

Escribí solo el prompt, sin explicaciones ni texto extra. El tono debe ser ${tone.toLowerCase()}, con expresiones propias de ${nationality}.`

  try {
    const { text, model, usage } = await callLLM({ messages: [{ role: 'user', content: prompt }], max_tokens: 2048, workspaceId: req.ariaUser?.workspaceId })
    trackLlmUsage(req.ariaUser?.workspaceId, 'generate-instructions', model, usage)
    res.json({ instructions: text })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Playground: prueba el prompt generado
app.post('/api/agents/playground', requireAriaAuth, async (req, res) => {
  const { instructions, messages } = req.body || {}
  try {
    const { text, model, usage } = await callLLM({ workspaceId: req.ariaUser?.workspaceId,       system: instructions || 'Sos un asistente virtual.',
      messages: (messages || []).map(m => ({ role: m.role, content: m.content })),
      max_tokens: 512,
    })
    trackLlmUsage(req.ariaUser?.workspaceId, 'playground', model, usage)
    res.json({ reply: text })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Test chat real con bot Tiledesk ───────────────────────────────────────────
// Según docs: POST a support-group-{UUID}/messages crea la request automáticamente.
// Agregar bot como participante dispara \start → welcome del bot.
const testSessions = new Map() // botId → { requestId, msgCount }

function extractMsgText(m) {
  if (m.text?.trim()) return m.text.trim()
  const cmds = m.attributes?.commands || []
  return cmds.filter(c => c.type === 'message' && c.message?.text).map(c => c.message.text).join('\n')
}

async function pollBotMsgs(msgsUrl, headers, fromIdx, maxMs = 15000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 600))
    const r = await fetch(msgsUrl, { headers }).catch(() => null)
    if (!r?.ok) continue
    const all = await r.json().catch(() => [])
    if (!Array.isArray(all)) continue
    const botMsgs = all.slice(fromIdx).filter(m => m.sender !== 'system' && extractMsgText(m))
    if (botMsgs.length > 0) return { msgs: botMsgs, total: all.length }
  }
  return { msgs: [], total: fromIdx }
}

// { projectId, reset }  → nueva sesión, retorna { welcome, requestId }
// { projectId, text }   → mensaje en sesión existente, retorna { reply }
// Flujo: mensajes del usuario usan token anónimo (end-user) — el bot ignora mensajes de admin.
app.post('/api/agents/:botId/test-chat', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { projectId, text, reset } = req.body || {}
  if (!projectId) return res.status(400).json({ error: 'projectId requerido' })

  try {
    const adminToken = await getTiledeskToken()
    const adminH = { Authorization: adminToken, 'Content-Type': 'application/json' }

    // ── Nueva sesión ─────────────────────────────────────────────────────────
    if (reset || !testSessions.get(botId)) {
      // 1. Autenticación anónima — el bot solo responde a mensajes de end-users
      const anonRes = await fetch(`${TILEDESK_URL}/auth/signinAnonymously`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_project: projectId, firstname: 'ARIA Playground' }),
      })
      const anonData = await anonRes.json()
      const anonToken  = anonData.token
      const anonUserId = anonData.user?._id
      const anonH = { Authorization: anonToken, 'Content-Type': 'application/json' }

      // 2. Cambiar temporalmente el bot del departamento por defecto al bot que se quiere testear.
      //    El routing de Tiledesk asigna el bot del depto al crear la conversación.
      //    try/finally garantiza que se restaura aunque falle.
      const deptsRes = await fetch(`${TILEDESK_URL}/${projectId}/departments`, { headers: adminH })
      const depts = await deptsRes.json().catch(() => [])
      const defaultDept = Array.isArray(depts) ? depts[0] : null
      const originalBotId = defaultDept?.id_bot

      if (defaultDept && originalBotId !== botId) {
        await fetch(`${TILEDESK_URL}/${projectId}/departments/${defaultDept.id}`, {
          method: 'PUT', headers: adminH,
          body: JSON.stringify({ id_bot: botId }),
        })
      }

      let welcome = null
      let total = 0
      let requestId

      try {
        // 3. requestId en formato requerido por Tiledesk
        requestId = `support-group-${projectId}-${randomUUID().replace(/-/g, '')}`
        const msgsUrl = `${TILEDESK_URL}/${projectId}/requests/${requestId}/messages`

        // 4. Primer POST crea la request — el bot del depto se asigna automáticamente
        await fetch(msgsUrl, {
          method: 'POST', headers: anonH,
          body: JSON.stringify({ text: 'start', sender: anonUserId }),
        })

        // Marcar el lead generado como contacto de prueba (aria_test_contact)
        // para filtrarlo en Contactos y Embudo sin depender del nombre
        try {
          const reqData = await fetch(`${TILEDESK_URL}/${projectId}/requests/${requestId}`, { headers: adminH })
            .then(r => r.json()).catch(() => null)
          const leadId = reqData?.lead?._id || reqData?.lead_id
          if (leadId) {
            await fetch(`${TILEDESK_URL}/${projectId}/leads/${leadId}`, {
              method: 'PUT', headers: adminH,
              body: JSON.stringify({ attributes: { aria_test_contact: true } }),
            }).catch(() => {})
          }
        } catch (_) {}

        // 5. Esperar welcome del bot correcto
        const result = await pollBotMsgs(msgsUrl, adminH, 1, 12000)
        welcome = result.msgs.map(extractMsgText).join('\n\n') || null
        total   = result.total
      } finally {
        // 6. Restaurar bot original del departamento
        if (defaultDept && originalBotId && originalBotId !== botId) {
          await fetch(`${TILEDESK_URL}/${projectId}/departments/${defaultDept.id}`, {
            method: 'PUT', headers: adminH,
            body: JSON.stringify({ id_bot: originalBotId }),
          }).catch(() => {})
        }
      }

      testSessions.set(botId, { requestId, msgCount: total, anonToken, anonUserId })
      return res.json({ welcome, reply: null, requestId })
    }

    // ── Mensaje en sesión existente ──────────────────────────────────────────
    if (!text) return res.status(400).json({ error: 'text requerido' })
    const session = testSessions.get(botId)
    const msgsUrl = `${TILEDESK_URL}/${projectId}/requests/${session.requestId}/messages`
    const anonH   = { Authorization: session.anonToken, 'Content-Type': 'application/json' }

    // Contar mensajes reales antes de enviar
    const snap = await fetch(msgsUrl, { headers: adminH }).then(r => r.json()).catch(() => [])
    const beforeCount = Array.isArray(snap) ? snap.length : session.msgCount

    // Enviar mensaje como end-user (anónimo) para que el bot lo procese
    await fetch(msgsUrl, {
      method: 'POST', headers: anonH,
      body: JSON.stringify({ text, sender: session.anonUserId }),
    })

    const { msgs: replyMsgs, total } = await pollBotMsgs(msgsUrl, adminH, beforeCount + 1, 15000)
    const reply = replyMsgs.map(extractMsgText).join('\n\n') || null
    session.msgCount = total

    return res.json({ welcome: null, reply, requestId: session.requestId })
  } catch (e) {
    console.error('test-chat error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Finalizar: actualizar bot + re-importar flow con instrucciones inyectadas
app.put('/api/agents/:botId/finalize', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { projectId, name, description, welcome_msg, instructions, template_id, active, tone, nationality, company_name } = req.body || {}
  if (!projectId || !botId) return res.status(400).json({ error: 'projectId y botId requeridos' })
  try {
    const token = await getTiledeskToken()
    const existingMeta = db.prepare('SELECT bot_type FROM agent_metadata WHERE bot_id=?').get(botId)
    const isExternal = (existingMeta?.bot_type || 'tilebot') === 'external'

    await fetch(`${TILEDESK_URL}/${projectId}/bots/${botId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ name, description }),
    })

    // Para bots externos: instrucciones se guardan en ARIA y el LLM las usa en runtime.
    // Para tilebots: inyectar instrucciones en el flow de Tiledesk.
    if (!isExternal && template_id) {
      const flow = loadFlow(template_id)
      const modified = injectInstructions(flow, instructions, welcome_msg)
      await importFlowToBot(projectId, botId, modified, token)
    }

    db.prepare(`INSERT OR REPLACE INTO agent_metadata
      (bot_id,workspace_id,tone,nationality,company_name,template_id,bot_type,active,instructions,temperature,top_p,channels,derivation_users,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`)
      .run(botId, req.ariaUser.workspaceId, tone||null, nationality||null, company_name||null, template_id||null,
        isExternal ? 'external' : 'tilebot',
        active ? 1 : 0, instructions||null,
        req.body.temperature ?? 1.0, req.body.top_p ?? 1.0,
        JSON.stringify(req.body.channels || ['__all__']),
        JSON.stringify(req.body.derivation_users || ['__all__']))
    res.json({ ok: true, botId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Metadata de agentes creados desde ARIA
app.get('/api/agents/metadata', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_metadata WHERE workspace_id=?').all(req.ariaUser.workspaceId)
  res.json(rows)
})

// Crear (o recuperar) el namespace de KB para un bot existente sin namespace
app.post('/api/agents/:botId/ensure-kb-namespace', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { projectId } = req.body || {}
  if (!projectId) return res.status(400).json({ error: 'projectId requerido' })
  try {
    const existing = db.prepare('SELECT kb_namespace_id FROM agent_metadata WHERE bot_id=? AND workspace_id=?')
      .get(botId, req.ariaUser.workspaceId)
    if (existing?.kb_namespace_id) return res.json({ namespaceId: existing.kb_namespace_id })

    const token = await getTiledeskToken()
    // Obtener nombre del bot desde Tiledesk
    const botRes = await fetch(`${TILEDESK_URL}/${projectId}/bots/${botId}`, { headers: { Authorization: token } })
    const botData = botRes.ok ? await botRes.json() : {}
    const botName = botData.name || botId

    const nsRes = await fetch(`${TILEDESK_URL}/${projectId}/kb/namespace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ name: `${botName} [${botId}]` }),
    })
    if (!nsRes.ok) return res.status(nsRes.status).json({ error: 'Error creando namespace en Tiledesk' })
    const nsData = await nsRes.json()
    const namespaceId = nsData._id || nsData.id
    db.prepare('UPDATE agent_metadata SET kb_namespace_id=? WHERE bot_id=? AND workspace_id=?')
      .run(namespaceId, botId, req.ariaUser.workspaceId)
    res.json({ namespaceId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Agent Detail / Edit ───────────────────────────────────────────────────────
const AGENT_FILES_DIR = process.env.ARIA_DB_PATH
  ? join(dirname(process.env.ARIA_DB_PATH), 'agent-files')
  : '/data/agent-files'

// Guardar instrucciones + re-inyectar en Tiledesk (solo tilebots)
app.put('/api/agents/:botId/instructions', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { instructions, projectId, template_id } = req.body || {}
  try {
    db.prepare(`INSERT OR IGNORE INTO agent_metadata (bot_id, workspace_id, template_id, updated_at)
      VALUES (?, ?, ?, strftime('%s','now'))`)
      .run(botId, req.ariaUser.workspaceId, template_id || null)
    db.prepare(`UPDATE agent_metadata SET instructions=?, updated_at=strftime('%s','now') WHERE bot_id=? AND workspace_id=?`)
      .run(instructions || null, botId, req.ariaUser.workspaceId)
    const meta = db.prepare('SELECT bot_type FROM agent_metadata WHERE bot_id=?').get(botId)
    const isExternal = (meta?.bot_type || 'tilebot') === 'external'
    // Para tilebots: re-inyectar en el flow de Tiledesk
    if (!isExternal && projectId && template_id) {
      const token = await getTiledeskToken()
      const flow  = loadFlow(template_id)
      const modified = injectInstructions(flow, instructions, null)
      await importFlowToBot(projectId, botId, modified, token)
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Guardar configuración técnica + re-inyectar en Tiledesk (solo tilebots)
app.put('/api/agents/:botId/config', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { temperature, top_p, channels, derivation_users, projectId, template_id } = req.body || {}
  try {
    db.prepare(`UPDATE agent_metadata SET temperature=?, top_p=?, channels=?, derivation_users=?, updated_at=strftime('%s','now')
      WHERE bot_id=? AND workspace_id=?`)
      .run(temperature ?? 1.0, top_p ?? 1.0,
        JSON.stringify(channels || ['__all__']), JSON.stringify(derivation_users || ['__all__']),
        botId, req.ariaUser.workspaceId)
    const meta = db.prepare('SELECT bot_type, instructions FROM agent_metadata WHERE bot_id=?').get(botId)
    const isExternal = (meta?.bot_type || 'tilebot') === 'external'
    // Para tilebots: re-inyectar temperature/top_p en el flow de Tiledesk
    if (!isExternal && projectId && template_id) {
      const token = await getTiledeskToken()
      const flow  = loadFlow(template_id)
      const modified = {
        ...flow,
        intents: (flow.intents || []).map(intent => ({
          ...intent,
          actions: (intent.actions || []).map(action =>
            action._tdActionType === 'gpt_task'
              ? { ...action, temperature: parseFloat(temperature ?? 1.0), context: meta?.instructions || action.context }
              : action
          ),
        })),
      }
      await importFlowToBot(projectId, botId, modified, token)
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Activar/desactivar bot
app.put('/api/agents/:botId/active', requireAriaAuth, (req, res) => {
  const { active } = req.body || {}
  db.prepare('UPDATE agent_metadata SET active=?, updated_at=strftime(%s,now) WHERE bot_id=? AND workspace_id=?')
    .run(active ? 1 : 0, req.params.botId, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// ── Agent files ───────────────────────────────────────────────────────────────
app.get('/api/agents/:botId/files', requireAriaAuth, (req, res) => {
  const files = db.prepare('SELECT id,filename,size,created_at FROM agent_files WHERE bot_id=? AND workspace_id=?')
    .all(req.params.botId, req.ariaUser.workspaceId)
  res.json(files)
})

app.post('/api/agents/:botId/files', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const wsId = req.ariaUser.workspaceId
  try {
    const ALLOWED = ['.pdf','.doc','.docx','.pptx','.txt','.md','.json','.html']
    const TEXT_READABLE = ['.txt','.md','.json','.html']
    const existing = db.prepare('SELECT COUNT(*) as n FROM agent_files WHERE bot_id=? AND workspace_id=?').get(botId, wsId)
    if (existing.n >= 3) return res.status(400).json({ error: 'Máximo 3 archivos por agente' })

    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buf = Buffer.concat(chunks)

    const ct = req.headers['content-type'] || ''
    const boundaryMatch = ct.match(/boundary=([^\s;]+)/)
    if (!boundaryMatch) return res.status(400).json({ error: 'Sin boundary' })
    const boundary = '--' + boundaryMatch[1]

    const parts = buf.toString('binary').split(boundary).slice(1, -1)
    const saved = []

    for (const part of parts) {
      const [headerRaw, ...bodyParts] = part.split('\r\n\r\n')
      const bodyStr = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '')
      const nameMatch = headerRaw.match(/filename="([^"]+)"/)
      if (!nameMatch) continue
      const filename = nameMatch[1]
      const ext = extname(filename).toLowerCase()
      if (!ALLOWED.includes(ext)) continue

      const fileId  = randomUUID()
      const dir     = join(AGENT_FILES_DIR, botId)
      mkdirSync(dir, { recursive: true })
      const filePath = join(dir, fileId + ext)
      const fileBuf = Buffer.from(bodyStr, 'binary')
      writeFileSync(filePath, fileBuf)
      const size = fileBuf.length

      db.prepare('INSERT INTO agent_files (id,bot_id,workspace_id,filename,size,path) VALUES (?,?,?,?,?,?)')
        .run(fileId, botId, wsId, filename, size, filePath)

      // Extraer texto para KB (solo formatos legibles)
      if (TEXT_READABLE.includes(ext)) {
        try {
          let text = fileBuf.toString('utf8')
          if (ext === '.html') text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          if (text.length > 20000) text = text.slice(0, 20000) + '\n[... contenido truncado]'
          db.prepare('INSERT INTO agent_kb (id,bot_id,workspace_id,type,title,content) VALUES (?,?,?,?,?,?)')
            .run(randomUUID(), botId, wsId, 'file', filename, text)
        } catch {}
      }

      saved.push({ id: fileId, filename, size })
    }
    res.json(saved)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/agents/:botId/files/:fileId', requireAriaAuth, (req, res) => {
  const { botId, fileId } = req.params
  const file = db.prepare('SELECT * FROM agent_files WHERE id=? AND bot_id=? AND workspace_id=?')
    .get(fileId, botId, req.ariaUser.workspaceId)
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })
  try { if (existsSync(file.path)) unlinkSync(file.path) } catch {}
  db.prepare('DELETE FROM agent_files WHERE id=?').run(fileId)
  // Eliminar también de KB si se había extraído texto
  db.prepare("DELETE FROM agent_kb WHERE bot_id=? AND workspace_id=? AND type='file' AND title=?")
    .run(botId, req.ariaUser.workspaceId, file.filename)
  res.json({ ok: true })
})

// ── Knowledge Base (KB) ───────────────────────────────────────────────────────
// KB es por agente (bot_id). Se incluye en el system prompt del LLM al responder.
// Tipos: 'text' (texto libre), 'faq' (pregunta/respuesta), 'url' (scraped), 'file' (auto desde upload)

app.get('/api/agents/:botId/kb', requireAriaAuth, (req, res) => {
  const rows = db.prepare(
    "SELECT id, type, title, substr(content,1,200) as preview, length(content) as chars, created_at FROM agent_kb WHERE bot_id=? AND workspace_id=? ORDER BY created_at DESC"
  ).all(req.params.botId, req.ariaUser.workspaceId)
  res.json(rows)
})

app.post('/api/agents/:botId/kb', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { type, title, content, url } = req.body || {}
  const wsId = req.ariaUser.workspaceId
  try {
    if (type === 'url') {
      if (!url) return res.status(400).json({ error: 'url requerida' })
      const fullUrl = url.startsWith('http') ? url : `https://${url}`
      const r = await fetch(fullUrl, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!r.ok) return res.status(400).json({ error: `No se pudo acceder a ${url}: ${r.status}` })
      let html = await r.text()
      // Strip tags, scripts, styles
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (html.length > 15000) html = html.slice(0, 15000) + '\n[... contenido truncado]'
      const id = randomUUID()
      db.prepare('INSERT INTO agent_kb (id,bot_id,workspace_id,type,title,content) VALUES (?,?,?,?,?,?)')
        .run(id, botId, wsId, 'url', title || url, html)
      return res.json({ id, type: 'url', title: title || url, chars: html.length })
    }

    if (!content?.trim()) return res.status(400).json({ error: 'content requerido' })
    const id = randomUUID()
    db.prepare('INSERT INTO agent_kb (id,bot_id,workspace_id,type,title,content) VALUES (?,?,?,?,?,?)')
      .run(id, botId, wsId, type || 'text', title || null, content.trim())
    res.json({ id, type: type || 'text', title: title || null, chars: content.trim().length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/agents/:botId/kb/:itemId', requireAriaAuth, (req, res) => {
  const { botId, itemId } = req.params
  db.prepare('DELETE FROM agent_kb WHERE id=? AND bot_id=? AND workspace_id=?')
    .run(itemId, botId, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// ── External Bot Webhook (Tiledesk → ARIA → LLM → Tiledesk) ──────────────────
// Tiledesk llama a este endpoint cuando un usuario envía un mensaje en una conv con bot externo.
// Protocolo: Tiledesk POST {payload:{text,request,id_project,attributes}, token, hook}
// ARIA responde 200 inmediatamente, llama al LLM y postea la respuesta de vuelta.
const extBotHistory = new Map()  // requestId → [{role, content}]

app.post('/api/bot-webhook', async (req, res) => {
  res.json({ success: true })  // responder antes de cualquier await

  try {
    const { payload, token, hook } = req.body || {}
    const text      = payload?.text?.trim() || ''
    const request   = payload?.request || {}
    const projectId = payload?.id_project || ''
    const action    = payload?.attributes?.action || ''
    const requestId = request?.request_id || request?._id || (typeof request === 'string' ? request : '')
    const botId     = hook?._id || hook?.id || ''
    const botName   = hook?.name || 'ARIA'

    console.log(`🤖 bot-webhook: action=${action} | requestId=...${requestId?.slice(-8)} | text=${text?.slice(0, 50)}`)

    if (!projectId || !requestId || !token) {
      return console.log('⚠ bot-webhook: faltan campos requeridos')
    }

    // Limpiar historial al iniciar nueva conversación
    if (action === 'start') extBotHistory.delete(requestId)

    // No procesar si no hay texto (ej: acción "close")
    if (!text) return

    if (!extBotHistory.has(requestId)) extBotHistory.set(requestId, [])
    const history = extBotHistory.get(requestId)
    history.push({ role: 'user', content: text })

    // Instrucciones del bot
    const meta = db.prepare('SELECT instructions, workspace_id FROM agent_metadata WHERE bot_id=?').get(botId)
    const baseInstructions = meta?.instructions?.trim() ||
      'Sos un asistente virtual amable y conciso. Respondé siempre en el mismo idioma que el usuario.'

    // KB del namespace exclusivo del bot
    let kbBlock = ''
    try {
      const nsId = db.prepare('SELECT kb_namespace_id FROM agent_metadata WHERE bot_id=?').get(botId)?.kb_namespace_id
      const workspace = meta?.workspace_id
        ? db.prepare('SELECT tiledesk_project_id FROM workspaces WHERE id=?').get(meta.workspace_id)
        : null
      const tdProjectId = workspace?.tiledesk_project_id
      if (tdProjectId && nsId) {
        const tdToken = await getTiledeskToken()
        const kbRes   = await fetch(`${TILEDESK_URL}/${tdProjectId}/kb/?namespace=${nsId}&direction=-1&sortField=updatedAt&limit=100`, {
          headers: { Authorization: tdToken }
        })
        if (kbRes.ok) {
          const kbData = await kbRes.json().catch(() => null)
          const items  = Array.isArray(kbData?.kbs) ? kbData.kbs.filter(i => i.status === 300) : []
          if (items.length > 0) {
            const sections = items.map(item => {
              if (item.type === 'faq') return `P: ${item.name}\nR: ${item.content}`
              const label = item.name ? `[${item.name}]` : `[${item.type}]`
              return `${label}\n${item.content?.slice(0, 600) || ''}`
            })
            kbBlock = `\n\n## BASE DE CONOCIMIENTO\nUsá esta información para responder preguntas del usuario:\n\n${sections.join('\n\n---\n\n')}`
          }
        }
      }
    } catch (kbErr) { console.error('⚠ bot-webhook: error leyendo KB', kbErr.message) }

    const systemPrompt = baseInstructions + kbBlock

    const { text: reply, model: llmModel, usage: llmUsage } = await callLLM({
      workspaceId: meta?.workspace_id,
      system: systemPrompt,
      messages: history,
      max_tokens: 512,
    }).catch(e => { console.error('⚠ bot-webhook: LLM error', e.message); return {} })
    if (!reply) return
    trackLlmUsage(meta?.workspace_id || 'unknown', 'bot-webhook', llmModel, llmUsage)

    history.push({ role: 'assistant', content: reply })
    // Limitar historial a 20 turnos para no crecer indefinidamente
    if (history.length > 20) history.splice(0, history.length - 20)

    // Postear respuesta a Tiledesk usando el token del bot
    const tdReply = await fetch(`${TILEDESK_URL}/${projectId}/requests/${requestId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ text: reply, sender: botId, senderFullname: botName }),
    })
    if (!tdReply.ok) {
      const errBody = await tdReply.text().catch(() => '')
      console.error(`⚠ bot-webhook reply error: ${tdReply.status} | ${errBody.slice(0, 200)}`)
    } else {
      console.log(`✓ bot-webhook → Tiledesk: ${tdReply.status} | requestId=...${requestId.slice(-8)}`)
    }
  } catch (e) {
    console.error('⚠ bot-webhook error:', e.message, e.stack?.split('\n')[1])
  }
})

// ── React SPA ─────────────────────────────────────────────────────────────────
const DIST = join(__dirname, '../dist')
app.use(express.static(DIST))
app.get('*', (_, res) => res.sendFile(join(DIST, 'index.html')))

app.listen(PORT, () => {
  console.log(`ARIA corriendo en :${PORT}`)
  // Registrar webhook de Tiledesk para todos los workspaces activos
  setTimeout(() => {
    try {
      const workspaces = db.prepare('SELECT * FROM workspaces WHERE tiledesk_project_id IS NOT NULL').all()
      for (const ws of workspaces) {
        registerTiledeskWebhook(ws.tiledesk_project_id).catch(e =>
          console.error(`⚠ Webhook registro (${ws.tiledesk_project_id}):`, e.message)
        )
      }
    } catch (e) {
      console.error('⚠ Error registrando webhooks al arrancar:', e.message)
    }
  }, 5000) // esperar 5s a que el servidor esté listo
})
