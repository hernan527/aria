import express          from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import jwt              from 'jsonwebtoken'
import bcrypt           from 'bcryptjs'
import Database         from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID }   from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'fs'
import { extname } from 'path'
import nodemailer       from 'nodemailer'

const app       = express()
const __dirname = dirname(fileURLToPath(import.meta.url))
app.use(express.json())

// ── Config ────────────────────────────────────────────────────────────────────
const PORT                    = process.env.PORT || 4000
const JWT_SECRET              = process.env.ARIA_JWT_SECRET || 'aria-secret-change-me'
const TILEDESK_URL            = process.env.TILEDESK_INTERNAL_URL || 'http://tilrdefinitivo_server:3000'
const TILEDESK_ADMIN_EMAIL    = process.env.TILEDESK_ADMIN_EMAIL || ''
const TILEDESK_ADMIN_PASSWORD = process.env.TILEDESK_ADMIN_PASSWORD || ''

// ── Mailer ────────────────────────────────────────────────────────────────────
const smtpTransporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
}) : null

async function sendInviteEmail(toEmail, inviteUrl, workspaceName) {
  if (!smtpTransporter || !toEmail) return false
  try {
    await smtpTransporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `Invitación a ${workspaceName || 'ARIA'}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f0f23;color:#fff;border-radius:16px">
          <h2 style="color:#818cf8;margin-bottom:8px">Fuiste invitado a ${workspaceName || 'ARIA'}</h2>
          <p style="color:#94a3b8;margin-bottom:24px">Hacé click en el botón para crear tu cuenta y acceder a la plataforma.</p>
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
            Aceptar invitación
          </a>
          <p style="color:#475569;font-size:12px;margin-top:24px">O copiá este link: ${inviteUrl}</p>
          <p style="color:#475569;font-size:12px">El link expira en 7 días.</p>
        </div>
      `,
    })
    return true
  } catch (e) {
    console.error('[Mailer] Error enviando invitación:', e.message)
    return false
  }
}

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
    bot_id              TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    tone                TEXT,
    nationality         TEXT,
    company_name        TEXT,
    company_description TEXT,
    derivation_notes    TEXT,
    template_id         TEXT,
    flow_file           TEXT,
    active              INTEGER DEFAULT 1,
    instructions        TEXT,
    temperature         REAL DEFAULT 1.0,
    top_p               REAL DEFAULT 1.0,
    channels            TEXT DEFAULT '["__all__"]',
    derivation_users    TEXT DEFAULT '["__all__"]',
    updated_at          INTEGER DEFAULT (strftime('%s','now'))
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
    id              TEXT PRIMARY KEY,
    bot_id          TEXT NOT NULL,
    workspace_id    TEXT NOT NULL,
    type            TEXT NOT NULL,
    title           TEXT,
    content         TEXT NOT NULL,
    tiledesk_kb_id  TEXT,
    created_at      INTEGER DEFAULT (strftime('%s','now'))
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

  CREATE TABLE IF NOT EXISTS contacts (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT,
    phone        TEXT,
    email        TEXT,
    company      TEXT,
    note         TEXT,
    tags         TEXT DEFAULT '[]',
    attributes   TEXT DEFAULT '{}',
    created_at   INTEGER DEFAULT (strftime('%s','now')),
    updated_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS dify_agents (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    system_prompt TEXT,
    dify_app_id   TEXT,
    dify_api_key  TEXT,
    active        INTEGER DEFAULT 1,
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );
`)

// ── Migraciones de columnas ───────────────────────────────────────────────────
;(function migrateColumns() {
  // Crear tabla contacts si no existe (el db.exec inicial puede fallar en DBs viejas)
  db.exec(`CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, phone TEXT,
    email TEXT, company TEXT, note TEXT, tags TEXT DEFAULT '[]',
    attributes TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )`)

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
  // agent_kb: columna tiledesk_kb_id
  const akCols = db.prepare("PRAGMA table_info(agent_kb)").all().map(c => c.name)
  if (!akCols.includes('tiledesk_kb_id')) {
    db.exec(`ALTER TABLE agent_kb ADD COLUMN tiledesk_kb_id TEXT`)
    console.log('✓ Migrado: agent_kb.tiledesk_kb_id')
  }
  // dify_agents: columnas extendidas para wizard
  const daCols = db.prepare("PRAGMA table_info(dify_agents)").all().map(c => c.name)
  if (!daCols.includes('template_id')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN template_id TEXT`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN tone TEXT`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN nationality TEXT`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN company_name TEXT`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN company_description TEXT`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN derivation_notes TEXT`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN temperature REAL DEFAULT 0.7`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN top_p REAL DEFAULT 1.0`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN channels TEXT DEFAULT '["__all__"]'`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN derivation_users TEXT DEFAULT '["__all__"]'`)
    console.log('✓ Migrado: dify_agents columnas extendidas')
  }
  if (!daCols.includes('dify_dataset_id')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN dify_dataset_id TEXT`)
    console.log('✓ Migrado: dify_agents.dify_dataset_id')
  }
  // agent_kb: columna dify_document_id
  const akCols2 = db.prepare("PRAGMA table_info(agent_kb)").all().map(c => c.name)
  if (!akCols2.includes('dify_document_id')) {
    db.exec(`ALTER TABLE agent_kb ADD COLUMN dify_document_id TEXT`)
    console.log('✓ Migrado: agent_kb.dify_document_id')
  }
  // agent_files: columna dify_document_id
  const afCols = db.prepare("PRAGMA table_info(agent_files)").all().map(c => c.name)
  if (!afCols.includes('dify_document_id')) {
    db.exec(`ALTER TABLE agent_files ADD COLUMN dify_document_id TEXT`)
    console.log('✓ Migrado: agent_files.dify_document_id')
  }
  // agent_metadata: columnas nuevas
  const amCols2 = db.prepare("PRAGMA table_info(agent_metadata)").all().map(c => c.name)
  if (!amCols2.includes('company_description')) {
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN company_description TEXT`)
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN derivation_notes TEXT`)
    console.log('✓ Migrado: agent_metadata.company_description/derivation_notes')
  }
  if (!amCols2.includes('flow_file')) {
    db.exec(`ALTER TABLE agent_metadata ADD COLUMN flow_file TEXT`)
    console.log('✓ Migrado: agent_metadata.flow_file')
  }
  // wa_conversations: dify_conversation_id + bot_mode
  const waCols = db.prepare("PRAGMA table_info(wa_conversations)").all().map(c => c.name)
  if (!waCols.includes('dify_conversation_id')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN dify_conversation_id TEXT`)
    console.log('✓ Migrado: wa_conversations.dify_conversation_id')
  }
  if (!waCols.includes('bot_mode')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN bot_mode TEXT DEFAULT 'bot'`)
    console.log('✓ Migrado: wa_conversations.bot_mode')
  }
  // channel_instances: instance_token para EvolutionGo
  const ciCols = db.prepare("PRAGMA table_info(channel_instances)").all().map(c => c.name)
  if (!ciCols.includes('instance_token')) {
    db.exec(`ALTER TABLE channel_instances ADD COLUMN instance_token TEXT`)
    console.log('✓ Migrado: channel_instances.instance_token')
  }
  // channel_settings: hubspot_api_key
  const csCols2 = db.prepare("PRAGMA table_info(channel_settings)").all().map(c => c.name)
  if (!csCols2.includes('hubspot_api_key')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN hubspot_api_key TEXT`)
    console.log('✓ Migrado: channel_settings.hubspot_api_key')
  }
  // contacts: hubspot_contact_id
  const contactCols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  if (!contactCols.includes('hubspot_contact_id')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN hubspot_contact_id TEXT`)
    console.log('✓ Migrado: contacts.hubspot_contact_id')
  }
})();

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
async function callLLM({ system, messages, max_tokens = 1024, workspaceId, difyConversationId }) {
  // Config del workspace (DB) tiene prioridad sobre env vars
  let provider = null, apiKey = null, model = null
  if (workspaceId) {
    const cs = db.prepare('SELECT llm_provider, llm_api_key, llm_model FROM channel_settings WHERE workspace_id=?').get(workspaceId)
    if (cs?.llm_api_key) {
      provider = cs.llm_provider || 'openai'
      apiKey   = cs.llm_api_key
      model    = cs.llm_model || (provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : provider === 'dify' ? 'dify' : 'gpt-4o-mini')
    }
  }
  // Fallback a env vars
  if (!apiKey) {
    if (process.env.OPENAI_API_KEY)    { provider = 'openai';    apiKey = process.env.OPENAI_API_KEY;    model = model || 'gpt-4o-mini' }
    else if (process.env.ANTHROPIC_API_KEY) { provider = 'anthropic'; apiKey = process.env.ANTHROPIC_API_KEY; model = model || 'claude-haiku-4-5-20251001' }
  }
  if (!apiKey) throw new Error('No hay API key de LLM configurada')

  if (provider === 'dify') {
    const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const r = await fetch(`${difyUrl}/v1/chat-messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        inputs: {},
        query: lastUserMsg,
        response_mode: 'blocking',
        conversation_id: difyConversationId || '',
        user: workspaceId || 'aria',
      }),
    })
    const d = await r.json()
    if (d.code || d.status === 400) throw new Error(d.message || JSON.stringify(d))
    return {
      text: d.answer?.trim() || '',
      model: 'dify',
      usage: { input_tokens: d.metadata?.usage?.prompt_tokens || 0, output_tokens: d.metadata?.usage?.completion_tokens || 0 },
      difyConversationId: d.conversation_id,
    }
  }

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
// Tiledesk deshabilitado — solo se conecta si hay rutas legacy que lo usan
// getTiledeskToken().catch(e => console.error('⚠ No se pudo conectar a Tiledesk:', e.message))

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
app.post('/api/workspace/invite', requireAriaAuth, async (req, res) => {
  if (!['owner', 'admin'].includes(req.ariaUser.role)) {
    return res.status(403).json({ error: 'Solo los administradores pueden invitar miembros' })
  }
  const { email, name, role, permissions } = req.body || {}
  const token   = randomUUID()
  const expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60  // 7 días

  db.prepare('INSERT INTO invites (id,workspace_id,email,token,expires_at) VALUES (?,?,?,?,?)')
    .run(randomUUID(), req.ariaUser.workspaceId, email || null, token, expires)

  const publicUrl = process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'
  const inviteUrl = `${publicUrl}/register?invite=${token}`

  // Enviar email si hay dirección y SMTP configurado
  const ws = db.prepare('SELECT name FROM workspaces WHERE id=?').get(req.ariaUser.workspaceId)
  let emailSent = false
  if (email) emailSent = await sendInviteEmail(email, inviteUrl, ws?.name)

  res.json({
    invite_token: token,
    invite_url: inviteUrl,
    expires_in: '7 días',
    email: email || null,
    name: name || null,
    role: role || 'member',
    permissions: permissions || null,
    email_sent: emailSent,
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

// Aceptar invite desde la página AcceptInvite (no requiere email — lo tenemos en el invite)
app.post('/api/auth/register-invite', async (req, res) => {
  const { token, name, password } = req.body || {}
  if (!token || !name || !password) return res.status(400).json({ error: 'Datos incompletos' })
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })

  const invite = db.prepare('SELECT * FROM invites WHERE token=? AND used=0 AND expires_at>?')
    .get(token, Math.floor(Date.now() / 1000))
  if (!invite) return res.status(400).json({ error: 'Invitación inválida o expirada' })

  // Email: usar el del invite si existe, sino generar uno temporal
  const email = invite.email || `usuario_${randomUUID().slice(0,8)}@aria.local`
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email)
  if (existing) return res.status(400).json({ error: 'Esta invitación ya fue usada' })

  try {
    const hash = await bcrypt.hash(password, 10)
    const userId = randomUUID()
    db.prepare('INSERT INTO users (id,email,password_hash,name,workspace_id,role) VALUES (?,?,?,?,?,?)')
      .run(userId, email, hash, name.trim(), invite.workspace_id, 'member')
    db.prepare('UPDATE invites SET used=1 WHERE token=?').run(token)

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id=?').get(invite.workspace_id)
    const user = { email, name: name.trim(), role: 'member' }
    res.json({
      token: makeToken(user, workspace),
      user: { email, name: name.trim(), role: 'member', projectId: workspace?.tiledesk_project_id },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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

// ── Contactos (ARIA DB) ───────────────────────────────────────────────────────
app.get('/api/contacts', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const { q, phone, label, limit = 200 } = req.query
  let sql = 'SELECT * FROM contacts WHERE workspace_id=?'
  const params = [wsId]
  if (q)     { sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR company LIKE ?)'; const p = `%${q}%`; params.push(p,p,p,p) }
  if (phone) { sql += ' AND phone=?'; params.push(phone) }
  if (label) { sql += ' AND tags LIKE ?'; params.push(`%"${label}"%`) }
  sql += ' ORDER BY updated_at DESC LIMIT ?'
  params.push(Number(limit))
  const rows = db.prepare(sql).all(...params)
  res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), attributes: JSON.parse(r.attributes || '{}') })))
})

app.post('/api/contacts', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const { name, phone, email, company, note, tags = [], attributes = {} } = req.body || {}
  // Upsert por teléfono si ya existe
  if (phone) {
    const existing = db.prepare('SELECT * FROM contacts WHERE workspace_id=? AND phone=?').get(wsId, phone)
    if (existing) {
      db.prepare("UPDATE contacts SET name=COALESCE(?,name), email=COALESCE(?,email), company=COALESCE(?,company), updated_at=strftime('%s','now') WHERE id=?")
        .run(name||null, email||null, company||null, existing.id)
      return res.json({ ...existing, _id: existing.id })
    }
  }
  const id = randomUUID()
  db.prepare('INSERT INTO contacts (id,workspace_id,name,phone,email,company,note,tags,attributes) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, wsId, name||null, phone||null, email||null, company||null, note||null, JSON.stringify(tags), JSON.stringify(attributes))
  const row = db.prepare('SELECT * FROM contacts WHERE id=?').get(id)
  res.json({ ...row, _id: id, tags: JSON.parse(row.tags||'[]'), attributes: JSON.parse(row.attributes||'{}') })
})

app.get('/api/contacts/:id', requireAriaAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM contacts WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!row) return res.status(404).json({ error: 'No encontrado' })
  res.json({ ...row, _id: row.id, tags: JSON.parse(row.tags||'[]'), attributes: JSON.parse(row.attributes||'{}') })
})

app.put('/api/contacts/:id', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const row = db.prepare('SELECT * FROM contacts WHERE id=? AND workspace_id=?').get(req.params.id, wsId)
  if (!row) return res.status(404).json({ error: 'No encontrado' })
  const { name, phone, email, company, note, tags, attributes } = req.body || {}
  db.prepare("UPDATE contacts SET name=?,phone=?,email=?,company=?,note=?,tags=?,attributes=?,updated_at=strftime('%s','now') WHERE id=?")
    .run(
      name ?? row.name, phone ?? row.phone, email ?? row.email,
      company ?? row.company, note ?? row.note,
      tags !== undefined ? JSON.stringify(tags) : row.tags,
      attributes !== undefined ? JSON.stringify(attributes) : row.attributes,
      req.params.id
    )
  const updated = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id)
  res.json({ ...updated, _id: updated.id, tags: JSON.parse(updated.tags||'[]'), attributes: JSON.parse(updated.attributes||'{}') })
})

app.delete('/api/contacts/:id', requireAriaAuth, (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

app.get('/api/contacts/:id/conversations', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const contact = db.prepare('SELECT phone FROM contacts WHERE id=? AND workspace_id=?').get(req.params.id, wsId)
  if (!contact?.phone) return res.json([])
  const convs = db.prepare(
    'SELECT * FROM wa_conversations WHERE workspace_id=? AND (wa_from=? OR wa_from LIKE ?) ORDER BY updated_at DESC LIMIT 20'
  ).all(wsId, contact.phone, `${contact.phone}@%`)
  res.json(convs)
})

// ── HubSpot integration ───────────────────────────────────────────────────────

async function syncContactToHubSpot(workspaceId, contactRow) {
  const cs = db.prepare('SELECT hubspot_api_key FROM channel_settings WHERE workspace_id=?').get(workspaceId)
  if (!cs?.hubspot_api_key) return null

  const { id: ariaId, name, phone, email, company } = contactRow
  const attrs = JSON.parse(contactRow.attributes || '{}')
  const isLid = attrs.jid_type === 'lid'

  const token = cs.hubspot_api_key
  const hdrs = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  const nameParts = (name || '').trim().split(' ')
  const properties = {}
  // Nombre: usar pushName si existe, sino "WhatsApp Contact"
  if (nameParts[0]) properties.firstname = nameParts[0]
  else properties.firstname = 'WhatsApp'
  if (nameParts.length > 1) properties.lastname = nameParts.slice(1).join(' ')
  // Teléfono: usar si es número real (jid_type real o lid_resolved)
  const isUnresolvedLid = attrs.jid_type === 'lid'
  if (phone && !isUnresolvedLid) properties.phone = `+${phone}`
  if (email)   properties.email   = email
  if (company) properties.company = company

  try {
    const existing = db.prepare('SELECT hubspot_contact_id FROM contacts WHERE id=?').get(ariaId)
    if (existing?.hubspot_contact_id) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existing.hubspot_contact_id}`,
        { method: 'PATCH', headers: hdrs, body: JSON.stringify({ properties }) })
      return existing.hubspot_contact_id
    }

    // Buscar por teléfono en HubSpot antes de crear
    if (phone) {
      const sr = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] }], limit: 1 })
      })
      const sd = await sr.json()
      if (sd.results?.length > 0) {
        const hsId = sd.results[0].id
        db.prepare('UPDATE contacts SET hubspot_contact_id=? WHERE id=?').run(hsId, ariaId)
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${hsId}`,
          { method: 'PATCH', headers: hdrs, body: JSON.stringify({ properties }) })
        return hsId
      }
    }

    // Crear nuevo contacto en HubSpot
    const cr = await fetch('https://api.hubapi.com/crm/v3/objects/contacts',
      { method: 'POST', headers: hdrs, body: JSON.stringify({ properties }) })
    const cd = await cr.json()
    if (cd.id) {
      db.prepare('UPDATE contacts SET hubspot_contact_id=? WHERE id=?').run(cd.id, ariaId)
      return cd.id
    }
  } catch (e) {
    console.error('[HubSpot] sync contact error:', e.message)
  }
  return null
}

async function createHubSpotDeal(workspaceId, hsContactId, contactName, phone) {
  const cs = db.prepare('SELECT hubspot_api_key FROM channel_settings WHERE workspace_id=?').get(workspaceId)
  if (!cs?.hubspot_api_key || !hsContactId) return

  const token = cs.hubspot_api_key
  const hdrs = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  try {
    const dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ properties: {
        dealname: `WhatsApp — ${contactName || (phone ? `+${phone}` : 'Nuevo contacto')}`,
        dealstage: 'appointmentscheduled',
        pipeline: 'default'
      }})
    })
    const dealData = await dealRes.json()
    if (!dealData.id) return

    // Asociar deal con contacto (API v4)
    await fetch(`https://api.hubapi.com/crm/v4/objects/deals/${dealData.id}/associations/contacts/${hsContactId}`, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }])
    })
  } catch (e) {
    console.error('[HubSpot] create deal error:', e.message)
  }
}

// Helper: upsert contacto desde mensaje WA entrante
// rawJid: JID completo (ej: 5491164840888@s.whatsapp.net, 161534323998914@lid, etc.)
// realPhone: número real extraído de SenderAlt cuando rawJid es @lid
function upsertContactFromWA(workspaceId, rawJid, pushName, realPhone) {
  if (!rawJid) return
  // Ignorar grupos, newsletters y broadcasts
  if (rawJid.endsWith('@g.us') || rawJid.endsWith('@newsletter') || rawJid === 'status@broadcast') return
  // Detectar si es LID (identificador de privacidad, no es teléfono real)
  const isLid = rawJid.toLowerCase().endsWith('@lid')
  // Usar número real si viene, sino usar el identificador del JID
  const lidId = rawJid.replace(/@(s\.whatsapp\.net|c\.us|lid)$/i, '')
  if (!lidId || !/^\d+$/.test(lidId)) return
  // phone = número real siempre que esté disponible
  const phone = (isLid && realPhone && /^\d+$/.test(realPhone)) ? realPhone : lidId
  const attrs = JSON.stringify({ jid_type: isLid ? (realPhone ? 'lid_resolved' : 'lid') : 'real', lid: isLid ? lidId : null })
  // Nombre: solo si es texto real, no un número
  const cleanName = (pushName && !/^\d+$/.test(pushName) && pushName !== phone) ? pushName.trim() : null

  // Buscar por teléfono real o por LID (para no duplicar)
  let existing = db.prepare('SELECT id, name FROM contacts WHERE workspace_id=? AND phone=?').get(workspaceId, phone)
  // Si no encontró por phone real, buscar por LID como fallback
  if (!existing && isLid && realPhone) {
    existing = db.prepare('SELECT id, name FROM contacts WHERE workspace_id=? AND phone=?').get(workspaceId, lidId)
    if (existing) {
      // Actualizar el LID por el número real
      db.prepare("UPDATE contacts SET phone=?, attributes=?, updated_at=strftime('%s','now') WHERE id=?")
        .run(phone, attrs, existing.id)
    }
  }

  if (existing) {
    if (!existing.name && cleanName)
      db.prepare("UPDATE contacts SET name=?, updated_at=strftime('%s','now') WHERE id=?").run(cleanName, existing.id)
    const row = db.prepare('SELECT * FROM contacts WHERE id=?').get(existing.id)
    if (row) syncContactToHubSpot(workspaceId, row).catch(() => {})
    return existing.id
  }
  const id = randomUUID()
  db.prepare('INSERT INTO contacts (id,workspace_id,name,phone,tags,attributes) VALUES (?,?,?,?,?,?)')
    .run(id, workspaceId, cleanName, phone, '[]', attrs)
  // Nuevo contacto: sincronizar a HubSpot y crear Deal
  const newRow = db.prepare('SELECT * FROM contacts WHERE id=?').get(id)
  syncContactToHubSpot(workspaceId, newRow)
    .then(hsId => { if (hsId) createHubSpotDeal(workspaceId, hsId, cleanName, phone) })
    .catch(() => {})
  return id
}

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
app.put('/api/channels/settings/bot', requireAriaAuth, (req, res) => {
  const { default_bot_id } = req.body || {}
  const workspaceId = req.ariaUser.workspaceId

  // Si es un agente Dify, actualizar también la config LLM con su API key
  if (default_bot_id && default_bot_id !== '__dify__') {
    const difyAgent = db.prepare('SELECT dify_api_key FROM dify_agents WHERE id=? AND workspace_id=?').get(default_bot_id, workspaceId)
    if (difyAgent?.dify_api_key) {
      db.prepare(`
        INSERT INTO channel_settings (workspace_id, default_bot_id, llm_provider, llm_api_key, llm_model, updated_at)
        VALUES (?, ?, 'dify', ?, 'dify', strftime('%s','now'))
        ON CONFLICT(workspace_id) DO UPDATE SET
          default_bot_id=excluded.default_bot_id,
          llm_provider='dify', llm_api_key=excluded.llm_api_key, llm_model='dify',
          updated_at=excluded.updated_at
      `).run(workspaceId, default_bot_id, difyAgent.dify_api_key)
      return res.json({ ok: true })
    }
  }

  db.prepare(`
    INSERT INTO channel_settings (workspace_id, default_bot_id, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE SET default_bot_id=excluded.default_bot_id, updated_at=excluded.updated_at
  `).run(workspaceId, default_bot_id || null)
  res.json({ ok: true })
})

// ── HubSpot — config ─────────────────────────────────────────────────────────
app.get('/api/hubspot/config', requireAriaAuth, (req, res) => {
  const cs = db.prepare('SELECT hubspot_api_key FROM channel_settings WHERE workspace_id=?').get(req.ariaUser.workspaceId)
  const key = cs?.hubspot_api_key
  res.json({ configured: !!key, api_key: key ? `${key.slice(0, 16)}...` : null })
})

app.put('/api/hubspot/config', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const { api_key } = req.body || {}
  db.prepare(`
    INSERT INTO channel_settings (workspace_id, hubspot_api_key, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE SET hubspot_api_key=excluded.hubspot_api_key, updated_at=excluded.updated_at
  `).run(wsId, api_key || null)
  res.json({ ok: true })
})

// Sincronizar manualmente todos los contactos a HubSpot
app.post('/api/hubspot/sync', requireAriaAuth, async (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const cs = db.prepare('SELECT hubspot_api_key FROM channel_settings WHERE workspace_id=?').get(wsId)
  if (!cs?.hubspot_api_key) return res.status(400).json({ error: 'HubSpot no configurado' })

  const contacts = db.prepare('SELECT * FROM contacts WHERE workspace_id=?').all(wsId)
  res.json({ queued: contacts.length })

  // Procesar en background (no bloquear respuesta)
  ;(async () => {
    for (const row of contacts) {
      await syncContactToHubSpot(wsId, row).catch(() => {})
      await new Promise(r => setTimeout(r, 200)) // rate limit
    }
    console.log(`[HubSpot] sync completo: ${contacts.length} contactos`)
  })()
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
        if (!inst.instance_token) return { ...inst, status: 'disconnected' }
        const evoUrl = settings.evo_url || process.env.EVO_URL || ''
        const r = await fetch(`${evoUrl}/instance/status`, {
          headers: { 'apikey': inst.instance_token }
        })
        if (r.ok) {
          const d = await r.json()
          const connected = d.data?.Connected
          const loggedIn  = d.data?.LoggedIn
          const status = (connected && loggedIn) ? 'WORKING' : connected ? 'STARTING' : 'disconnected'
          return { ...inst, status }
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
      const sessionName = 'default'
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
      const evoUrl = settings.evo_url || process.env.EVO_URL || ''
      const evoKey = settings.evo_key || process.env.EVO_KEY || ''
      if (!evoUrl) return res.status(400).json({ error: 'EvolutionGo URL no configurada' })
      const instanceToken = randomUUID().replace(/-/g, '')
      // 1. Crear instancia
      const createR = await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evoKey },
        body: JSON.stringify({ name: instance_name, token: instanceToken }),
      })
      const createBody = await createR.json().catch(() => ({}))
      if (!createR.ok) throw new Error(createBody.message || createBody.error || `EvolutionGo error ${createR.status}`)
      // 2. Conectar (configura webhook + inicia QR)
      const webhookUrl = `${process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'}/webhook/evogo`
      await fetch(`${evoUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': instanceToken },
        body: JSON.stringify({
          webhookUrl,
          subscribe: ['Messages', 'Connection'],
          ignoreGroups: true,
          ignoreStatus: true,
        }),
      }).catch(() => {})
      db.prepare('INSERT OR REPLACE INTO channel_instances (id,workspace_id,provider,instance_name,session_name,status,instance_token) VALUES (?,?,?,?,?,?,?)')
        .run(id, wsId, 'evolution', instance_name, instance_name, 'STARTING', instanceToken)
      return res.json({ id, instance_name, provider: 'evolution', status: 'STARTING' })

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
      if (!inst.instance_token) return res.json({ status: 'disconnected', qrcode: null })
      const evoUrl = settings.evo_url || process.env.EVO_URL || ''
      // Check status first
      const stR = await fetch(`${evoUrl}/instance/status`, { headers: { 'apikey': inst.instance_token } })
      if (stR.ok) {
        const st = await stR.json().catch(() => ({}))
        if (st.data?.Connected && st.data?.LoggedIn) return res.json({ status: 'WORKING', qrcode: null })
      }
      // Get QR — formato: { data: { Qrcode: "data:image/png;base64,..." } }
      const qrR = await fetch(`${evoUrl}/instance/qr`, { headers: { 'apikey': inst.instance_token } })
      const qrD = await qrR.json().catch(() => ({}))
      const qrImg = qrD.data?.Qrcode || qrD.base64 || ''
      if (qrImg) {
        return res.json({ qrcode: qrImg.startsWith('data:') ? qrImg : `data:image/png;base64,${qrImg}`, status: 'SCAN_QR_CODE' })
      }
      return res.json({ status: 'STARTING', qrcode: null })
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
    } else if (inst.provider === 'evolution') {
      if (!inst.instance_token) return res.status(400).json({ error: 'Sin token de instancia' })
      const evoUrl = settings.evo_url || process.env.EVO_URL || ''
      const webhookUrl = `${process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'}/webhook/evogo`
      await fetch(`${evoUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': inst.instance_token },
        body: JSON.stringify({
          webhookUrl,
          subscribe: ['Messages', 'Connection'],
          ignoreGroups: true,
          ignoreStatus: true,
        }),
      }).catch(() => {})
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
      const evoUrl = settings.evo_url || process.env.EVO_URL || ''
      const evoKey = settings.evo_key || process.env.EVO_KEY || ''
      await fetch(`${evoUrl}/instance/delete`, {
        method: 'DELETE',
        headers: { 'apikey': evoKey },
      }).catch(() => {})
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
      const evoUrl = settings.evo_url || process.env.EVO_URL || ''
      if (inst.instance_token) {
        await fetch(`${evoUrl}/instance/logout`, {
          method: 'POST',
          headers: { 'apikey': inst.instance_token },
        }).catch(() => {})
      }
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
  // Debug: loggear payload completo cuando es @lid para descubrir campos con número real
  // SenderAlt: número real cuando el chatId es @lid (privacidad de WhatsApp)
  const senderAlt = msg._data?.Info?.SenderAlt || msg._data?.Info?.senderAlt || null
  const realPhone = senderAlt ? senderAlt.replace(/@(s\.whatsapp\.net|c\.us)$/i, '') : null
  if (rawChatId.toLowerCase().endsWith('@lid') && realPhone) {
    console.log(`[LID→REAL] ${rawChatId} → ${realPhone}@s.whatsapp.net`)
  }
  const body      = msg.body || msg.caption || ''
  const pushName  = msg._data?.Info?.PushName || msg._data?.notifyName || msg.pushName || null
  // Para notificaciones: usar pushName si hay, sino buscar en contactos, sino el número limpio
  const effectivePhone = realPhone || from
  const contactRow = effectivePhone ? db.prepare('SELECT name FROM contacts WHERE phone=? LIMIT 1').get(effectivePhone) : null
  const name      = pushName || contactRow?.name || effectivePhone
  console.log('📱 from:', from, '| real:', realPhone || 'LID', '| body:', body?.slice(0, 40), '| projectId:', projectId)

  // Auto-crear/actualizar contacto (realPhone resuelve LID → número real)
  upsertContactFromWA(inst.workspace_id, rawChatId, pushName, realPhone)

  // ── Path directo: WAHA → Dify (sin Tiledesk) ────────────────────────────────
  const llmCfg = db.prepare('SELECT llm_provider, llm_api_key FROM channel_settings WHERE workspace_id=?').get(inst.workspace_id)
  if (llmCfg?.llm_provider === 'dify' && llmCfg?.llm_api_key) {
    try {
      const CONV_TTL_SECS  = 30 * 60
      const HUMAN_TTL_SECS = 4 * 60 * 60
      db.prepare(
        "UPDATE wa_conversations SET closed=1 WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 AND ((bot_mode='bot' AND (strftime('%s','now') - updated_at) > ?) OR (bot_mode='human' AND (strftime('%s','now') - updated_at) > ?))"
      ).run(inst.workspace_id, sessionName, rawChatId, from, CONV_TTL_SECS, HUMAN_TTL_SECS)

      let waConv = db.prepare(
        'SELECT * FROM wa_conversations WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 ORDER BY updated_at DESC LIMIT 1'
      ).get(inst.workspace_id, sessionName, rawChatId, from)

      if (waConv?.bot_mode === 'human') {
        db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(waConv.request_id)
        console.log(`👤 [Dify] Modo humano — ignorado: ${from}`)
        return
      }

      let requestId = waConv?.request_id
      if (!requestId) {
        requestId = `dify-${randomUUID()}`
        db.prepare(
          "INSERT INTO wa_conversations (id,workspace_id,session_name,wa_from,request_id,closed,updated_at) VALUES (?,?,?,?,?,0,strftime('%s','now'))"
        ).run(randomUUID(), inst.workspace_id, sessionName, rawChatId, requestId)
        waConv = { request_id: requestId, dify_conversation_id: null, bot_mode: 'bot' }
        console.log(`➕ [Dify] Nueva conv: ${requestId}`)
      } else {
        db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
      }

      const difyConvId = waConv.dify_conversation_id || extDifyConvId.get(requestId)
      const { text: reply, difyConversationId } = await callLLM({
        messages: [{ role: 'user', content: body }],
        workspaceId: inst.workspace_id,
        difyConversationId: difyConvId,
      })

      if (difyConversationId) {
        extDifyConvId.set(requestId, difyConversationId)
        db.prepare('UPDATE wa_conversations SET dify_conversation_id=? WHERE request_id=?').run(difyConversationId, requestId)
      }

      let finalReply = reply || ''
      if (finalReply.includes('[HANDOFF]')) {
        finalReply = finalReply.replace(/\[HANDOFF\]/g, '').trim() || 'Un momento, te conecto con un asesor.'
        db.prepare("UPDATE wa_conversations SET bot_mode='human', updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
        extDifyConvId.delete(requestId)
        console.log(`👤 [Dify] HANDOFF detectado → modo humano`)
      }

      if (!finalReply) return

      const waSettings = getChannelSettings(inst.workspace_id)
      const chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`
      await fetch(`${waSettings.waha_url}/api/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': waSettings.waha_key || '' },
        body: JSON.stringify({ chatId, text: finalReply, session: sessionName }),
      })
      console.log(`✓ [Dify direct] → ${chatId} | ${finalReply.slice(0, 50)}`)
      sseEmit(inst.workspace_id, { event: 'new-message', requestId, from, name, text: body })
    } catch(e) {
      console.error('⚠ Dify direct error:', e.message)
    }
    return
  }

  // ── Path Tiledesk ─────────────────────────────────────────────────────────────
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
    const CONV_TTL_SECS  = 30 * 60     // bot mode: 30 min
    const HUMAN_TTL_SECS = 4 * 60 * 60 // human mode: 4 horas
    db.prepare(
      "UPDATE wa_conversations SET closed=1 WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 AND ((bot_mode='bot' AND (strftime('%s','now') - updated_at) > ?) OR (bot_mode='human' AND (strftime('%s','now') - updated_at) > ?))"
    ).run(inst.workspace_id, sessionName, rawChatId, from, CONV_TTL_SECS, HUMAN_TTL_SECS)

    const waConv = db.prepare(
      'SELECT request_id, bot_mode FROM wa_conversations WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 ORDER BY updated_at DESC LIMIT 1'
    ).get(inst.workspace_id, sessionName, rawChatId, from)

    if (waConv) {
      requestId = waConv.request_id
      // Modo humano: actualizar timestamp e ignorar bot
      if (waConv.bot_mode === 'human') {
        db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
        console.log(`👤 Chat modo humano — bot ignorado: ${requestId.slice(-8)}`)
        return
      }
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

// ── EvolutionGo webhook ───────────────────────────────────────────────────────
app.post('/webhook/evogo', async (req, res) => {
  res.json({ ok: true })
  const payload = req.body
  if (!payload) return

  const event = payload.event || ''
  const instanceName = payload.instance || ''
  if (!instanceName) return

  // Buscar instancia en DB por nombre
  const inst = db.prepare("SELECT * FROM channel_instances WHERE instance_name=? AND provider='evolution'").get(instanceName)
  if (!inst) return console.log(`⚠ evogo webhook: instancia '${instanceName}' no encontrada`)

  // Actualizar estado de conexión
  if (event === 'connection.update' || event === 'Connection') {
    const state = payload.data?.state || payload.state || ''
    const status = state === 'open' ? 'WORKING' : state === 'close' ? 'disconnected' : 'STARTING'
    db.prepare("UPDATE channel_instances SET status=? WHERE id=?").run(status, inst.id)
    console.log(`🔄 evogo connection update: ${instanceName} → ${status}`)
    return
  }

  // Procesar mensajes entrantes
  if (event !== 'messages.upsert' && event !== 'Messages') return
  const msgData = payload.data || payload
  const key = msgData.key || {}
  if (key.fromMe) return  // ignorar mensajes propios

  const rawChatId = key.remoteJid || ''
  if (!rawChatId || rawChatId === 'status@broadcast' || rawChatId.endsWith('@g.us')) return

  const body = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || ''
  if (!body) return

  const from     = rawChatId.replace(/@(s\.whatsapp\.net|c\.us)$/i, '')
  const pushName = msgData.pushName || null
  const contactRow2 = from ? db.prepare('SELECT name FROM contacts WHERE phone=? LIMIT 1').get(from) : null
  const name     = pushName || contactRow2?.name || from

  console.log(`📨 evogo: ${from} → ${body.slice(0, 50)}`)

  // Auto-crear/actualizar contacto (evogo no tiene SenderAlt)
  upsertContactFromWA(inst.workspace_id, rawChatId, pushName, null)

  try {
    const CONV_TTL_SECS = 30 * 60
    db.prepare(
      "UPDATE wa_conversations SET closed=1 WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 AND bot_mode='bot' AND (strftime('%s','now') - updated_at) > ?"
    ).run(inst.workspace_id, instanceName, rawChatId, from, CONV_TTL_SECS)

    let waConv = db.prepare(
      'SELECT * FROM wa_conversations WHERE workspace_id=? AND session_name=? AND (wa_from=? OR wa_from=?) AND closed=0 ORDER BY updated_at DESC LIMIT 1'
    ).get(inst.workspace_id, instanceName, rawChatId, from)

    if (waConv?.bot_mode === 'human') {
      db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(waConv.request_id)
      sseEmit(inst.workspace_id, { event: 'new-message', from, name, text: body })
      return
    }

    let requestId = waConv?.request_id
    if (!requestId) {
      requestId = `evogo-${randomUUID()}`
      db.prepare(
        "INSERT INTO wa_conversations (id,workspace_id,session_name,wa_from,request_id,closed,updated_at) VALUES (?,?,?,?,?,0,strftime('%s','now'))"
      ).run(randomUUID(), inst.workspace_id, instanceName, rawChatId, requestId)
      waConv = { request_id: requestId, dify_conversation_id: null, bot_mode: 'bot' }
    } else {
      db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
    }

    const difyConvId = waConv?.dify_conversation_id || extDifyConvId.get(requestId)
    const { text: reply, difyConversationId } = await callLLM({
      messages: [{ role: 'user', content: body }],
      workspaceId: inst.workspace_id,
      difyConversationId: difyConvId,
    })

    if (difyConversationId) {
      extDifyConvId.set(requestId, difyConversationId)
      db.prepare('UPDATE wa_conversations SET dify_conversation_id=? WHERE request_id=?').run(difyConversationId, requestId)
    }

    let finalReply = reply || ''
    if (finalReply.includes('[HANDOFF]')) {
      finalReply = finalReply.replace(/\[HANDOFF\]/g, '').trim() || 'Un momento, te conecto con un asesor.'
      db.prepare("UPDATE wa_conversations SET bot_mode='human', updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
      extDifyConvId.delete(requestId)
    }

    if (!finalReply) return

    const settings = getChannelSettings(inst.workspace_id)
    const evoUrl = settings.evo_url || process.env.EVO_URL || ''
    const number = from.replace(/\D/g, '')
    await fetch(`${evoUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': inst.instance_token },
      body: JSON.stringify({ number, text: finalReply }),
    })
    console.log(`✓ evogo → ${from}: ${finalReply.slice(0, 50)}`)
    sseEmit(inst.workspace_id, { event: 'new-message', requestId, from, name, text: body })
  } catch (e) {
    console.error('⚠ evogo webhook error:', e.message)
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
      if (req.path.includes('/kb')) console.log(`🔵 proxy KB ${req.method} ${req.path}`)
    },
    proxyRes: (proxyRes, req) => {
      if (req.path.includes('/kb')) console.log(`🔵 proxy KB res ${proxyRes.statusCode} ${req.path}`)
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
    ? db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND (session_name=? OR instance_name=?)").get(req.ariaUser.workspaceId, session, session)
    : getPrimaryWahaSession(req.ariaUser.workspaceId)
  if (!inst) return res.status(400).json({ error: 'Sin sesión activa' })
  try {
    if (inst.provider === 'evolution') {
      const evoUrl = s.evo_url || process.env.EVO_URL || ''
      const number = chatId.replace(/@(s\.whatsapp\.net|c\.us)$/i, '').replace(/\D/g, '')
      const r = await fetch(`${evoUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': inst.instance_token },
        body: JSON.stringify({ number, text }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) return res.status(r.status).json(data)
      return res.json(data)
    }
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
  const wsId = req.ariaUser?.workspaceId
  try {
    const history = (messages || []).slice(-10).reverse().map(m => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.body || m.caption || '[media]',
    }))

    // Si hay bot activo con Dify, usarlo directamente (ya tiene KB + personalidad)
    const cs = db.prepare('SELECT default_bot_id FROM channel_settings WHERE workspace_id=?').get(wsId)
    const activeBotId = cs?.default_bot_id
    if (activeBotId) {
      const bot = db.prepare('SELECT dify_api_key FROM dify_agents WHERE id=? AND workspace_id=?').get(activeBotId, wsId)
      if (bot?.dify_api_key) {
        const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content || ''
        const r = await fetch(`${difyUrl}/v1/chat-messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bot.dify_api_key}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            inputs: {},
            query: lastUserMsg,
            response_mode: 'blocking',
            conversation_id: '',
            user: `suggest-${wsId}`,
          }),
        })
        const d = await r.json()
        const suggestion = d.answer?.trim() || null
        trackLlmUsage(wsId, 'ai-suggest', 'dify', { input_tokens: d.metadata?.usage?.prompt_tokens || 0, output_tokens: d.metadata?.usage?.completion_tokens || 0 })
        return res.json({ suggestion })
      }
    }

    // Fallback: callLLM con config del workspace
    const { text, model, usage } = await callLLM({
      workspaceId: wsId,
      system: `Sos un asistente de ventas y atención al cliente. El cliente se llama ${contactName || 'el cliente'}. Sugerí una respuesta corta, amable y en español al último mensaje. Solo devolvé el texto de la respuesta, sin explicaciones.`,
      messages: history,
      max_tokens: 200,
    })
    trackLlmUsage(wsId, 'ai-suggest', model, usage)
    res.json({ suggestion: text || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Agent Wizard ──────────────────────────────────────────────────────────────

const FLOW_TEMPLATES = {
  'lead-qualifier':        'AI My Agent.json',
  'faq':                   'AI My Agent.json',
  'travel':                'AI My Agent.json',
  'broker':                'AI My Agent.json',
  'concesionaria-directa': 'AI My Agent.json',
  'concesionaria-plan':    'AI My Agent.json',
  'chatgpt-task':          'AI My Agent.json',
  'aria-agent':            'AI My Agent.json',
}
const FLOWS_DIR = join(__dirname, '../flows')

// ── Dify console API helpers ──────────────────────────────────────────────────

// Retorna { accessToken, csrfToken } — Dify usa double-submit cookie para CSRF
async function getDifyAdminToken() {
  const difyUrl  = process.env.DIFY_URL            || 'https://dify.saludok.com.ar'
  const email    = process.env.DIFY_ADMIN_EMAIL    || 'hernan527@gmail.com'
  const password = process.env.DIFY_ADMIN_PASSWORD || ''
  const passwordB64 = Buffer.from(password).toString('base64')
  const r = await fetch(`${difyUrl}/console/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordB64, language: 'en-US', remember_me: true }),
  })
  const cookies = typeof r.headers.getSetCookie === 'function'
    ? r.headers.getSetCookie()
    : [(r.headers.get('set-cookie') || '')]
  const get = (name) => {
    const c = cookies.find(c => c.startsWith(name + '='))
    return c ? c.split(';')[0].slice(name.length + 1) : null
  }
  const accessToken = get('access_token')
  const csrfToken   = get('csrf_token')
  if (!accessToken) throw new Error('Dify login falló — no se recibió access_token')
  return { accessToken, csrfToken }
}

// Actualiza pre_prompt + parámetros del modelo en una app Dify sin pisar el modelo configurado
async function difyUpdateModelConfig(appId, { prePrompt, temperature, topP, datasetId }) {
  // Leer config actual para preservar modelo
  const cur = await difyConsoleApi(`/apps/${appId}/model-config`)
  const curData = await cur.json().catch(() => ({}))
  const model = curData?.model || { provider: 'openai', name: 'gpt-4o-mini', mode: 'chat' }
  const completionParams = { ...(curData?.model?.completion_params || {}), max_tokens: 800 }
  if (temperature !== undefined) completionParams.temperature = parseFloat(temperature)
  if (topP       !== undefined) completionParams.top_p       = parseFloat(topP)

  // Configurar dataset si corresponde
  const retrieverResource = datasetId
    ? { enabled: true }
    : (curData?.retriever_resource ?? { enabled: false })

  const datasetConfigs = datasetId
    ? {
        datasets: { datasets: [{ dataset: { enabled: true, id: datasetId } }] },
        retrieval_model: 'single',
        reranking_enable: false,
        top_k: 4,
        score_threshold_enabled: false,
        score_threshold: 0.5,
      }
    : (curData?.dataset_configs ?? undefined)

  const payload = {
    pre_prompt:                       prePrompt ?? curData?.pre_prompt ?? '',
    opening_statement:                curData?.opening_statement ?? '¡Hola! ¿En qué puedo ayudarte hoy?',
    suggested_questions:              curData?.suggested_questions ?? [],
    suggested_questions_after_answer: curData?.suggested_questions_after_answer ?? { enabled: false },
    speech_to_text:                   curData?.speech_to_text ?? { enabled: false },
    retriever_resource:               retrieverResource,
    sensitive_word_avoidance:         curData?.sensitive_word_avoidance ?? { enabled: false },
    more_like_this:                   curData?.more_like_this ?? { enabled: false },
    user_input_form:                  curData?.user_input_form ?? [],
    model:                            { ...model, completion_params: completionParams },
  }
  if (datasetConfigs) payload.dataset_configs = datasetConfigs

  await difyConsoleApi(`/apps/${appId}/model-config`, 'POST', payload)
}

// Llama console API de Dify — cookie + X-CSRFToken para POST/PUT/DELETE
async function difyConsoleApi(path, method = 'GET', body = null) {
  const { accessToken, csrfToken } = await getDifyAdminToken()
  const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `access_token=${accessToken}${csrfToken ? `; csrf_token=${csrfToken}` : ''}`,
  }
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  return fetch(`${difyUrl}/console/api${path}`, opts)
}

// Service API de Dify — Bearer token (para operaciones de dataset/documentos)
let _difyDatasetApiKey = null
async function getDifyDatasetApiKey() {
  if (_difyDatasetApiKey) return _difyDatasetApiKey
  // Intentar leer keys existentes
  const listResp = await difyConsoleApi('/datasets/api-keys', 'GET')
  if (listResp.ok) {
    const listData = await listResp.json()
    if (listData.data?.length > 0) {
      _difyDatasetApiKey = listData.data[0].token
      return _difyDatasetApiKey
    }
  }
  // Crear una nueva key
  const createResp = await difyConsoleApi('/datasets/api-keys', 'POST')
  const createData = await createResp.json()
  if (!createData.token) throw new Error('No se pudo obtener dataset API key de Dify')
  _difyDatasetApiKey = createData.token
  return _difyDatasetApiKey
}

async function difyServiceApi(path, method = 'GET', body = null) {
  const key = await getDifyDatasetApiKey()
  const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
  const headers = { 'Authorization': `Bearer ${key}` }
  if (body && !(body instanceof Buffer)) headers['Content-Type'] = 'application/json'
  const opts = { method, headers }
  if (body) opts.body = (body instanceof Buffer) ? body : JSON.stringify(body)
  return fetch(`${difyUrl}/v1${path}`, opts)
}

// Sube un archivo a Dify dataset via multipart (service API /v1/)
async function difyUploadFileToDataset(datasetId, fileBuffer, filename, mimetype) {
  const key = await getDifyDatasetApiKey()
  const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
  const boundary = '----AriaFormBoundary' + randomUUID().replace(/-/g, '')
  const CRLF = '\r\n'
  const dataStr = JSON.stringify({
    indexing_technique: 'economy',
    process_rule: { mode: 'automatic' },
  })
  const parts = []
  parts.push(
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="data"${CRLF}Content-Type: application/json${CRLF}${CRLF}${dataStr}${CRLF}`)
  )
  parts.push(
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${mimetype}${CRLF}${CRLF}`)
  )
  parts.push(fileBuffer)
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`))
  const multipartBody = Buffer.concat(parts)

  return fetch(`${difyUrl}/v1/datasets/${datasetId}/document/create-by-file`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Authorization': `Bearer ${key}`,
    },
    body: multipartBody,
  })
}

async function callLLMDirect({ system, userMsg }) {
  // Para tareas meta (generar system prompts) usa siempre OpenAI/Anthropic, nunca Dify
  if (process.env.OPENAI_API_KEY) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1500, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }] }),
    })
    const d = await r.json()
    return d.choices?.[0]?.message?.content?.trim() || ''
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system, messages: [{ role: 'user', content: userMsg }] }),
    })
    const d = await r.json()
    return d.content?.[0]?.text?.trim() || ''
  }
  throw new Error('No hay API key de OpenAI o Anthropic configurada en el servidor')
}

// ── Generador de Chatflow DSL con integración HTTP ────────────────────────────
function buildChatflowDSL({ agentName, systemPrompt, integrations, integrationDetail, apiKey: extApiKey, integrationUrl }) {
  const ts = () => String(Date.now() + Math.floor(Math.random() * 9999))
  const idStart = '1', idLlm = '2', idAnswer = '3'
  const idHttp = '4', idLlm2 = '5', idAnswer2 = '6', idIfElse = '7'

  const hasInteg = integrations && integrations !== 'none'

  // Auth header para HTTP node
  const authHeader = extApiKey && extApiKey.toLowerCase() !== 'sin auth'
    ? (extApiKey.startsWith('Bearer ') ? extApiKey : `Bearer ${extApiKey}`)
    : null

  // URL del endpoint externo
  let httpUrl = ''
  if (integrations === 'sheets' && integrationUrl) {
    httpUrl = `https://sheets.googleapis.com/v4/spreadsheets/${integrationUrl}/values/Sheet1`
  } else if (integrations === 'api' && integrationUrl) {
    httpUrl = integrationUrl
  }

  const baseNodes = [
    {
      id: idStart, type: 'custom',
      data: { type: 'start', title: 'Inicio', desc: '', variables: [], selected: false },
      position: { x: 80, y: 280 }, width: 244, height: 54,
      sourcePosition: 'right', targetPosition: 'left',
    },
    {
      id: idLlm, type: 'custom',
      data: {
        type: 'llm', title: hasInteg ? 'LLM — Clasificar consulta' : 'LLM', desc: '',
        model: { provider: 'openai', name: 'gpt-4o-mini', mode: 'chat', completion_params: { temperature: 0.7 } },
        prompt_template: [
          { id: 'sys1', role: 'system', text: hasInteg
            ? `${systemPrompt}\n\nSi el usuario solicita información que requiere consultar datos externos (${integrationDetail || 'datos externos'}), responde SOLO con la palabra: CONSULTAR_EXTERNO\nEn cualquier otro caso, responde normalmente.`
            : systemPrompt },
          { id: 'usr1', role: 'user', text: '{{#sys.query#}}' },
        ],
        context: { enabled: false, variable_selector: [] },
        vision: { enabled: false }, variables: [], selected: false,
      },
      position: { x: 380, y: 280 }, width: 244, height: 98,
      sourcePosition: 'right', targetPosition: 'left',
    },
  ]

  let edges = [
    { id: 'e1', source: idStart, target: idLlm, sourceHandle: 'source', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'start', targetType: 'llm' } },
  ]

  let extraNodes = []

  if (hasInteg) {
    // Nodo IF/ELSE: ¿LLM dijo CONSULTAR_EXTERNO?
    extraNodes.push({
      id: idIfElse, type: 'custom',
      data: {
        type: 'if-else', title: '¿Consultar externo?', desc: '',
        cases: [{
          case_id: 'true', logical_operator: 'and',
          conditions: [{
            id: 'c1', varType: 'string',
            variable_selector: [idLlm, 'text'],
            comparison_operator: 'contains',
            value: 'CONSULTAR_EXTERNO',
          }],
        }],
        selected: false,
      },
      position: { x: 680, y: 200 }, width: 244, height: 126,
      sourcePosition: 'right', targetPosition: 'left',
    })

    // Nodo HTTP request
    extraNodes.push({
      id: idHttp, type: 'custom',
      data: {
        type: 'http-request', title: integrations === 'sheets' ? 'Google Sheets' : 'API Externa', desc: '',
        method: 'GET',
        url: httpUrl || '{{your_api_url}}',
        authorization: authHeader
          ? { type: 'bearer', config: { token: authHeader } }
          : { type: 'no-auth', config: null },
        headers: '',
        params: '',
        body: { type: 'none', data: '' },
        timeout: { max_connect_timeout: 10, max_read_timeout: 30, max_write_timeout: 10 },
        selected: false,
      },
      position: { x: 980, y: 120 }, width: 244, height: 154,
      sourcePosition: 'right', targetPosition: 'left',
    })

    // LLM 2: formular respuesta con datos externos
    extraNodes.push({
      id: idLlm2, type: 'custom',
      data: {
        type: 'llm', title: 'LLM — Responder con datos', desc: '',
        model: { provider: 'openai', name: 'gpt-4o-mini', mode: 'chat', completion_params: { temperature: 0.5 } },
        prompt_template: [
          { id: 'sys2', role: 'system', text: `${systemPrompt}\n\nTenés acceso a los siguientes datos en tiempo real:\n{{#${idHttp}.body#}}\n\nUsá estos datos para responder la consulta del usuario de forma precisa y natural.` },
          { id: 'usr2', role: 'user', text: '{{#sys.query#}}' },
        ],
        context: { enabled: false, variable_selector: [] },
        vision: { enabled: false }, variables: [], selected: false,
      },
      position: { x: 1280, y: 120 }, width: 244, height: 98,
      sourcePosition: 'right', targetPosition: 'left',
    })

    // Answer 1: cuando hay datos externos
    extraNodes.push({
      id: idAnswer2, type: 'custom',
      data: { type: 'answer', title: 'Respuesta con datos', answer: `{{#${idLlm2}.text#}}`, desc: '', variables: [], selected: false },
      position: { x: 1580, y: 120 }, width: 244, height: 107,
      sourcePosition: 'right', targetPosition: 'left',
    })

    // Answer 2: respuesta directa (sin datos externos)
    extraNodes.push({
      id: idAnswer, type: 'custom',
      data: { type: 'answer', title: 'Respuesta directa', answer: `{{#${idLlm}.text#}}`, desc: '', variables: [], selected: false },
      position: { x: 980, y: 420 }, width: 244, height: 107,
      sourcePosition: 'right', targetPosition: 'left',
    })

    edges = [
      ...edges,
      { id: 'e2', source: idLlm, target: idIfElse, sourceHandle: 'source', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'llm', targetType: 'if-else' } },
      { id: 'e3', source: idIfElse, target: idHttp, sourceHandle: 'true', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'if-else', targetType: 'http-request' } },
      { id: 'e4', source: idIfElse, target: idAnswer, sourceHandle: 'false', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'if-else', targetType: 'answer' } },
      { id: 'e5', source: idHttp, target: idLlm2, sourceHandle: 'source', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'http-request', targetType: 'llm' } },
      { id: 'e6', source: idLlm2, target: idAnswer2, sourceHandle: 'source', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'llm', targetType: 'answer' } },
    ]
  } else {
    // Sin integración: flujo simple Start → LLM → Answer
    extraNodes.push({
      id: idAnswer, type: 'custom',
      data: { type: 'answer', title: 'Respuesta', answer: `{{#${idLlm}.text#}}`, desc: '', variables: [], selected: false },
      position: { x: 680, y: 280 }, width: 244, height: 107,
      sourcePosition: 'right', targetPosition: 'left',
    })
    edges.push({ id: 'e2', source: idLlm, target: idAnswer, sourceHandle: 'source', targetHandle: 'target', type: 'custom', zIndex: 0, data: { isInIteration: false, sourceType: 'llm', targetType: 'answer' } })
  }

  return {
    nodes: [...baseNodes, ...extraNodes],
    edges,
    viewport: { x: 0, y: 0, zoom: 0.8 },
  }
}

// POST /api/agents/quick-create
// Crea un agente Dify completo desde descripción conversacional
app.post('/api/agents/quick-create', requireAriaAuth, async (req, res) => {
  const { description, name, company, tone, integrations, integrationDetail, apiKey: extApiKey, integrationUrl } = req.body
  const workspaceId = req.ariaUser?.workspaceId
  if (!description?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })

  const hasInteg = integrations && integrations !== 'none'

  try {
    // 1. Buscar agentes anteriores similares para usar como referencia
    const prevAgents = db.prepare(
      'SELECT name, description, system_prompt FROM dify_agents WHERE workspace_id=? ORDER BY created_at DESC LIMIT 5'
    ).all(workspaceId)

    const prevContext = prevAgents.length > 0
      ? `\n\nAClaración: Ya creé estos agentes anteriormente para este mismo cliente. Usalos como referencia de estilo y nivel de detalle, pero adaptá el nuevo al contexto específico:\n${prevAgents.map(a => `- ${a.name}: ${a.description?.substring(0, 120)}`).join('\n')}`
      : ''

    // 2. Generar system prompt
    const contextLines = [
      company ? `Empresa / Marca: ${company}` : null,
      name    ? `Nombre del agente: ${name}`   : null,
      tone    ? `Tono requerido: ${tone}`       : null,
      `Descripción y tareas: ${description}`,
      hasInteg ? `Integración externa: ${integrationDetail || integrations}` : null,
    ].filter(Boolean).join('\n')

    const systemPrompt = await callLLMDirect({
      system: `Sos un experto en diseño de asistentes virtuales de atención al cliente en español latinoamericano.
Generá un system prompt profesional y detallado para un chatbot de WhatsApp.

El system prompt debe:
- Presentar el asistente con su nombre y empresa
- Describir exactamente qué puede y qué NO puede responder
- Usar el tono indicado de forma consistente
- Nunca inventar información — si no sabe, decirlo con honestidad
- Si se menciona derivación a humano: cuando el cliente lo pida o esté muy frustrado, responder con la frase exacta [HANDOFF]
- Estar en español latinoamericano, ser específico, no genérico
${prevContext}

Solo devolvé el system prompt listo para usar, sin explicaciones ni comillas.`,
      userMsg: contextLines,
    })

    // 3. Crear app en Dify vía console API
    const agentName = name?.trim() || (company ? `Asistente ${company}` : 'Agente IA')
    let appId, apiKey, hasWorkflow = false

    if (hasInteg) {
      // ── Chatflow con nodos ────────────────────────────────────────────────
      const createResp = await difyConsoleApi('/apps', 'POST',
        { name: agentName, mode: 'advanced-chat', icon: '🔌', icon_background: '#EFF1FE', description })
      const appData = await createResp.json()
      if (!appData.id) throw new Error('Error creando app: ' + JSON.stringify(appData))
      appId = appData.id

      const graph = buildChatflowDSL({ agentName, systemPrompt, integrations, integrationDetail, apiKey: extApiKey, integrationUrl })
      await difyConsoleApi(`/apps/${appId}/workflows/draft`, 'PUT', { graph })
      hasWorkflow = true
    } else {
      // ── Chat simple ───────────────────────────────────────────────────────
      const createResp = await difyConsoleApi('/apps', 'POST',
        { name: agentName, mode: 'chat', icon: '🤖', icon_background: '#FFEAD5', description })
      const appData = await createResp.json()
      if (!appData.id) throw new Error('Error creando app: ' + JSON.stringify(appData))
      appId = appData.id

      const modelProvider = appData.model_config?.model?.provider || 'openai'
      const modelName     = appData.model_config?.model?.name     || 'gpt-4o-mini'
      await difyConsoleApi(`/apps/${appId}/model-config`, 'POST', {
        pre_prompt: systemPrompt,
        opening_statement: '¡Hola! ¿En qué puedo ayudarte hoy?',
        suggested_questions: [], suggested_questions_after_answer: { enabled: false },
        speech_to_text: { enabled: false }, retriever_resource: { enabled: false },
        sensitive_word_avoidance: { enabled: false }, more_like_this: { enabled: false },
        user_input_form: [],
        model: { provider: modelProvider, name: modelName, mode: 'chat', completion_params: { temperature: 0.7, max_tokens: 800 } },
      })
    }

    // 4. Crear API key
    const keyResp = await difyConsoleApi(`/apps/${appId}/api-keys`, 'POST', {})
    const keyData = await keyResp.json()
    apiKey = keyData.token || keyData.api_key

    // 5. Guardar en ARIA DB
    const agentId = randomUUID()
    db.prepare(`INSERT INTO dify_agents (id, workspace_id, name, description, system_prompt, dify_app_id, dify_api_key) VALUES (?,?,?,?,?,?,?)`)
      .run(agentId, workspaceId, agentName, description, systemPrompt, appId, apiKey)

    // 6. Activar como proveedor activo del workspace
    const csExists = db.prepare('SELECT workspace_id FROM channel_settings WHERE workspace_id=?').get(workspaceId)
    if (csExists) {
      db.prepare('UPDATE channel_settings SET llm_provider=?, llm_api_key=?, llm_model=?, default_bot_id=? WHERE workspace_id=?')
        .run('dify', apiKey, 'dify', '__dify__', workspaceId)
    } else {
      db.prepare('INSERT INTO channel_settings (workspace_id, llm_provider, llm_api_key, llm_model, default_bot_id) VALUES (?,?,?,?,?)')
        .run(workspaceId, 'dify', apiKey, 'dify', '__dify__')
    }

    res.json({ success: true, agentId, appId, apiKey, agentName, systemPrompt, hasWorkflow })
  } catch (e) {
    console.error('quick-create error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// GET /api/agents/dify-list — lista agentes creados con quick-create
app.get('/api/agents/dify-list', requireAriaAuth, (req, res) => {
  const workspaceId = req.ariaUser?.workspaceId
  const agents = db.prepare('SELECT * FROM dify_agents WHERE workspace_id=? ORDER BY created_at DESC').all(workspaceId)
  res.json(agents)
})

// Listar flows disponibles en /flows/
app.get('/api/agents/flows', requireAriaAuth, (req, res) => {
  try {
    const files = readdirSync(FLOWS_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .sort()
      .map(f => ({ filename: f, name: f.replace(/\.json$/, '') }))
    res.json({ flows: files })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

function loadFlow(templateId, flowFile) {
  // flowFile tiene prioridad (selección manual)
  const file = flowFile || FLOW_TEMPLATES[templateId] || 'AI My Agent.json'
  return JSON.parse(readFileSync(join(FLOWS_DIR, file), 'utf8'))
}

function injectInstructions(flow, instructions, welcomeMsg, kbNamespaceId) {
  const intents = (flow.intents || []).map(intent => {
    const actions = (intent.actions || []).map(action => {
      // gpt_task (ARIA Agent.json — legacy)
      if (action._tdActionType === 'gpt_task' && instructions && action.context && action.context.trim().length > 0) {
        return { ...action, context: instructions }
      }
      // askgptv2 (AI My Agent.json) — inyectar instrucciones + namespace KB
      if (action._tdActionType === 'askgptv2' && instructions) {
        return {
          ...action,
          context: instructions,
          ...(kbNamespaceId ? { namespace: kbNamespaceId } : {}),
        }
      }
      // ai_prompt en gen_welcome — usar el saludo del agente
      if (action._tdActionType === 'ai_prompt' && intent.intent_display_name === 'gen_welcome' && welcomeMsg) {
        return { ...action, question: `Usá exactamente este saludo, sin modificarlo: "${welcomeMsg}"` }
      }
      return action
    })
    // welcome_static (AI My Agent.json) y welcome (ARIA Agent.json)
    if ((intent.intent_display_name === 'welcome_static' || intent.intent_display_name === 'welcome') && welcomeMsg) {
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
  const { name, description, template_id } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name requerido' })
  try {
    // 1. Crear app en Dify
    const createResp = await difyConsoleApi('/apps', 'POST', {
      name,
      mode: 'chat',
      icon: '🤖',
      icon_background: '#FFEAD5',
      description: description || '',
    })
    const appData = await createResp.json()
    if (!appData.id) throw new Error('Dify no creó la app: ' + JSON.stringify(appData).slice(0, 200))
    const difyAppId = appData.id

    // 2. Crear API key para la app
    const keyResp = await difyConsoleApi(`/apps/${difyAppId}/api-keys`, 'POST', {})
    const keyData = await keyResp.json()
    const difyApiKey = keyData.token || keyData.api_key
    if (!difyApiKey) throw new Error('No se pudo obtener API key de Dify')

    // 3. Crear dataset (Knowledge Base) para el agente en Dify
    let difyDatasetId = null
    try {
      const dsResp = await difyConsoleApi('/datasets', 'POST', {
        name: `KB — ${name}`,
        description: `Base de conocimiento del agente ${name}`,
        indexing_technique: 'economy',
        permission: 'only_me',
      })
      const dsData = await dsResp.json()
      difyDatasetId = dsData.id || null
      if (difyDatasetId) {
        console.log(`✓ Dify dataset creado: ${difyDatasetId}`)
        // 4. Enlazar dataset a la app
        await difyUpdateModelConfig(difyAppId, { datasetId: difyDatasetId })
      }
    } catch (dsErr) {
      console.warn('⚠ No se pudo crear dataset Dify (continúa sin KB):', dsErr.message)
    }

    // 5. Guardar en ARIA DB
    const agentId = randomUUID()
    db.prepare(`INSERT INTO dify_agents (id, workspace_id, name, description, template_id, dify_app_id, dify_api_key, dify_dataset_id) VALUES (?,?,?,?,?,?,?,?)`)
      .run(agentId, req.ariaUser.workspaceId, name, description || '', template_id || null, difyAppId, difyApiKey, difyDatasetId)

    console.log(`✓ Dify app creada: ${difyAppId} → agent ${agentId}`)
    res.json({ botId: agentId, kbNamespaceId: null, difyAppId, difyDatasetId })
  } catch (e) {
    console.error('create-draft error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Generar instrucciones con LLM (incluye KB de Tiledesk si existe)
app.post('/api/agents/generate-instructions', requireAriaAuth, async (req, res) => {
  const { agent_name, tone, nationality, company_name, company_description, websites, temperature, derivation_notes, bot_id, template_id } = req.body || {}

  // Leer KB del bot desde ARIA DB (aislada por bot_id)
  let kbSection = ''
  try {
    if (bot_id) {
      const items = db.prepare('SELECT type, title, content FROM agent_kb WHERE bot_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 100')
        .all(bot_id, req.ariaUser.workspaceId)
      if (items.length > 0) {
        const lines = items.map(item => {
          if (item.type === 'faq') return `  - ${item.title}: ${item.content?.slice(0, 400) || ''}`
          if (item.type === 'url') return `  - Web (${item.title}): ${item.content?.slice(0, 300) || ''}`
          return `  - ${item.title}: ${item.content?.slice(0, 300) || ''}${(item.content?.length || 0) > 300 ? '...' : ''}`
        })
        kbSection = `\n- Base de conocimiento del agente:\n${lines.join('\n')}`
      }
    }
  } catch (_) {}

  const isBrokerSalud = ['broker', 'lead-qualifier'].includes(template_id)

  const prompt = isBrokerSalud
    ? `Generá un prompt completo en español para un agente de IA de WhatsApp especializado en calificar leads para broker de salud / prepagas. Usá EXACTAMENTE los datos provistos — no uses placeholders, completá todo con la información real.

Datos del agente:
- Nombre: ${agent_name}
- Tono: ${tone}
- Región/expresiones: ${nationality}
- Empresa: ${company_name}
- Descripción de la empresa: ${company_description}
${websites?.filter(Boolean).length ? `- Sitios web: ${websites.filter(Boolean).join(', ')}` : ''}
${derivation_notes ? `- Criterios de derivación: ${derivation_notes}` : ''}${kbSection}

El prompt resultante debe tener estas secciones completamente redactadas (no como esquema, sino como texto final listo para usar):

# Instrucciones del agente: ${agent_name}

## Rol y personalidad
Redactar en primera persona describiendo al agente ${agent_name} como especialista de ${company_name}, con tono ${tone} y expresiones de ${nationality}. Incluir reglas irrompibles: máx 2-3 oraciones por respuesta, una sola pregunta por mensaje, si califica asignar puntuación 0-100 y derivar a asesor.

## Sobre la empresa
Texto completo usando la descripción de ${company_name}: área de operación, modalidades (particular / empleado en relación de dependencia), criterio de lead calificado.

## Derivación a asesor humano
Lista concreta de situaciones de derivación, basada en los criterios provistos${derivation_notes ? ' y los criterios de derivación dados' : ''}.

## Flujo de conversación
Pasos internos numerados (advertir que nunca se muestran así al usuario). Incluir: saludo presentándose como ${agent_name} de ${company_name}, situación actual de cobertura, grupo familiar y edades, modalidad de pago (recibo sueldo/monotributo/particular), tratamientos o medicación, datos de contacto (nombre completo, email, CUIL), cierre cálido con próximos pasos.

## Memoria y contexto
Reglas de continuidad: nunca pedir datos ya dados, nunca empezar de cero si hay historial. Incluir ejemplo correcto vs incorrecto.

## Resumen estructurado
Template completo: Qué busca mejorar, Cobertura para, Modalidad de pago, Tratamientos/medicación, Datos de contacto, Presupuesto actual, Prestaciones buscadas, Estado del lead, Puntuación 0-100, Próximos pasos.

Escribí solo el prompt final redactado, sin explicaciones ni meta-comentarios.`
    : `Generá un prompt completo en español para un agente de IA de WhatsApp con los siguientes datos:

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
const testSessions = new Map() // botId → { conversationId }

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

// Chat de prueba con agente Dify (playground del wizard)
app.post('/api/agents/:botId/test-chat', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { text, reset } = req.body || {}

  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent?.dify_api_key) return res.status(404).json({ error: 'Agente no encontrado o sin API key' })

  if (reset) testSessions.delete(botId)

  const session = testSessions.get(botId) || {}
  const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
  const queryText = text || '¡Hola!'

  try {
    const r = await fetch(`${difyUrl}/v1/chat-messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agent.dify_api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {},
        query: queryText,
        response_mode: 'blocking',
        conversation_id: session.conversationId || '',
        user: req.ariaUser.workspaceId,
      }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.message || JSON.stringify(d).slice(0, 200))

    testSessions.set(botId, { conversationId: d.conversation_id })

    if (reset) return res.json({ welcome: d.answer || '¡Hola! ¿En qué puedo ayudarte?', reply: null })
    return res.json({ welcome: null, reply: d.answer || '(sin respuesta)' })
  } catch (e) {
    console.error('test-chat error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Finalizar: actualizar bot + re-importar flow con instrucciones inyectadas
app.put('/api/agents/:botId/finalize', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { name, instructions, template_id, tone, nationality, company_name, company_description, derivation_notes } = req.body || {}

  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })

  try {
    const temperature = parseFloat(req.body.temperature ?? 0.7)
    const topP        = parseFloat(req.body.top_p ?? 1.0)

    // 1. Actualizar system prompt + params en Dify (preserva modelo configurado)
    await difyUpdateModelConfig(agent.dify_app_id, {
      prePrompt:   instructions || '',
      temperature,
      topP,
      datasetId: agent.dify_dataset_id || undefined,
    })

    // 2. Actualizar nombre en Dify si cambió
    if (name && name !== agent.name) {
      await difyConsoleApi(`/apps/${agent.dify_app_id}`, 'PUT', { name, description: agent.description || '' })
    }

    // 3. Guardar metadata en ARIA DB
    db.prepare(`UPDATE dify_agents SET
      name=?, system_prompt=?, template_id=?, tone=?, nationality=?,
      company_name=?, company_description=?, derivation_notes=?,
      temperature=?, top_p=?, channels=?, derivation_users=?, active=1
      WHERE id=?`)
      .run(name || agent.name, instructions || '', template_id || agent.template_id || null,
        tone || null, nationality || null, company_name || null, company_description || null,
        derivation_notes || null, temperature, topP,
        JSON.stringify(req.body.channels || ['__all__']),
        JSON.stringify(req.body.derivation_users || ['__all__']),
        botId)

    res.json({ ok: true, botId })
  } catch (e) {
    console.error('finalize error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Metadata de agentes (Dify)
app.get('/api/agents/metadata', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM dify_agents WHERE workspace_id=? ORDER BY created_at DESC').all(req.ariaUser.workspaceId)
  const mapped = rows.map(r => ({
    bot_id:              r.id,
    workspace_id:        r.workspace_id,
    name:                r.name,
    description:         r.description,
    tone:                r.tone,
    nationality:         r.nationality,
    company_name:        r.company_name,
    company_description: r.company_description,
    derivation_notes:    r.derivation_notes,
    template_id:         r.template_id,
    active:              r.active,
    instructions:        r.system_prompt,
    temperature:         r.temperature,
    top_p:               r.top_p,
    channels:            r.channels,
    derivation_users:    r.derivation_users,
    dify_app_id:         r.dify_app_id,
    created_at:          r.created_at,
  }))
  res.json(mapped)
})

// Listar namespaces KB disponibles en el proyecto Tiledesk del workspace
app.get('/api/kb/namespaces', requireAriaAuth, async (req, res) => {
  try {
    const workspace = db.prepare('SELECT tiledesk_project_id FROM workspaces WHERE id=?').get(req.ariaUser.workspaceId)
    const projectId = workspace?.tiledesk_project_id
    if (!projectId) return res.status(400).json({ error: 'No hay proyecto Tiledesk' })
    const token = await getTiledeskToken()
    const r = await fetch(`${TILEDESK_URL}/${projectId}/kb/namespace/all`, { headers: { Authorization: token } })
    const data = await r.json().catch(() => [])
    const list = (Array.isArray(data) ? data : []).map(n => ({ id: n._id || n.id, name: n.name, isDefault: !!n.default }))
    res.json({ namespaces: list, projectId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Cambiar el namespace KB asignado a un bot
app.put('/api/agents/:botId/kb-namespace', requireAriaAuth, (req, res) => {
  const { botId } = req.params
  const { namespaceId } = req.body || {}
  if (!namespaceId) return res.status(400).json({ error: 'namespaceId requerido' })
  db.prepare('UPDATE agent_metadata SET kb_namespace_id=? WHERE bot_id=? AND workspace_id=?')
    .run(namespaceId, botId, req.ariaUser.workspaceId)
  res.json({ ok: true, namespaceId })
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
    let namespaceId
    if (!nsRes.ok) {
      const allNs = await fetch(`${TILEDESK_URL}/${projectId}/kb/namespace/all`, { headers: { Authorization: token } })
        .then(r => r.json()).catch(() => [])
      const def = (Array.isArray(allNs) ? allNs : []).find(n => n.default) || (Array.isArray(allNs) ? allNs[0] : null)
      namespaceId = def?.id || def?._id || projectId
    } else {
      const nsData = await nsRes.json()
      namespaceId = nsData._id || nsData.id
    }
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
  const { instructions, tone, nationality, company_name, company_description, derivation_notes } = req.body || {}
  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
  try {
    await difyUpdateModelConfig(agent.dify_app_id, {
      prePrompt:   instructions || '',
      temperature: agent.temperature ?? 0.7,
      topP:        agent.top_p ?? 1.0,
    })
    db.prepare(`UPDATE dify_agents SET system_prompt=?,
      tone=COALESCE(?,tone), nationality=COALESCE(?,nationality),
      company_name=COALESCE(?,company_name), company_description=COALESCE(?,company_description),
      derivation_notes=COALESCE(?,derivation_notes)
      WHERE id=? AND workspace_id=?`)
      .run(instructions||null, tone||null, nationality||null, company_name||null,
        company_description||null, derivation_notes||null, botId, req.ariaUser.workspaceId)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/agents/:botId/config', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { temperature, top_p, channels, derivation_users } = req.body || {}
  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
  try {
    const t  = parseFloat(temperature ?? agent.temperature ?? 0.7)
    const tp = parseFloat(top_p ?? agent.top_p ?? 1.0)
    await difyUpdateModelConfig(agent.dify_app_id, { prePrompt: agent.system_prompt || '', temperature: t, topP: tp })
    db.prepare(`UPDATE dify_agents SET temperature=?, top_p=?, channels=?, derivation_users=? WHERE id=? AND workspace_id=?`)
      .run(t, tp, JSON.stringify(channels || ['__all__']), JSON.stringify(derivation_users || ['__all__']),
        botId, req.ariaUser.workspaceId)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/agents/:botId/active', requireAriaAuth, (req, res) => {
  const { active } = req.body || {}
  db.prepare('UPDATE dify_agents SET active=? WHERE id=? AND workspace_id=?')
    .run(active ? 1 : 0, req.params.botId, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

app.delete('/api/agents/:botId', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
  try {
    await difyConsoleApi(`/apps/${agent.dify_app_id}`, 'DELETE')
  } catch (e) {
    console.warn('⚠ Dify delete app error (continúa):', e.message)
  }
  if (agent.dify_dataset_id) {
    await difyServiceApi(`/datasets/${agent.dify_dataset_id}`, 'DELETE').catch(e =>
      console.warn('⚠ Dify delete dataset error (continúa):', e.message)
    )
  }
  // Limpiar archivos locales
  const files = db.prepare('SELECT path FROM agent_files WHERE bot_id=?').all(botId)
  for (const f of files) { try { if (existsSync(f.path)) unlinkSync(f.path) } catch {} }
  db.prepare('DELETE FROM dify_agents WHERE id=? AND workspace_id=?').run(botId, req.ariaUser.workspaceId)
  db.prepare('DELETE FROM agent_kb WHERE bot_id=?').run(botId)
  db.prepare('DELETE FROM agent_files WHERE bot_id=?').run(botId)
  res.json({ ok: true })
})

// ── Agent files ───────────────────────────────────────────────────────────────
app.get('/api/agents/:botId/files', requireAriaAuth, (req, res) => {
  const files = db.prepare('SELECT id,filename,size,dify_document_id,created_at FROM agent_files WHERE bot_id=? AND workspace_id=?')
    .all(req.params.botId, req.ariaUser.workspaceId)
  res.json(files)
})

app.post('/api/agents/:botId/files', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const wsId = req.ariaUser.workspaceId
  try {
    const ALLOWED = ['.pdf','.doc','.docx','.pptx','.txt','.md','.json','.html','.csv','.xlsx']
    const MIME_MAP = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.html': 'text/html',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    const existing = db.prepare('SELECT COUNT(*) as n FROM agent_files WHERE bot_id=? AND workspace_id=?').get(botId, wsId)
    if (existing.n >= 10) return res.status(400).json({ error: 'Máximo 10 archivos por agente' })

    const agent = db.prepare('SELECT dify_dataset_id FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, wsId)

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

      const fileBuf = Buffer.from(bodyStr, 'binary')
      const size = fileBuf.length

      // Guardar en disco (backup local)
      const fileId  = randomUUID()
      const dir     = join(AGENT_FILES_DIR, botId)
      mkdirSync(dir, { recursive: true })
      const filePath = join(dir, fileId + ext)
      writeFileSync(filePath, fileBuf)

      db.prepare('INSERT INTO agent_files (id,bot_id,workspace_id,filename,size,path) VALUES (?,?,?,?,?,?)')
        .run(fileId, botId, wsId, filename, size, filePath)

      // Subir a Dify dataset para RAG nativo
      let difyDocumentId = null
      if (agent?.dify_dataset_id) {
        try {
          const mimetype = MIME_MAP[ext] || 'application/octet-stream'
          const uploadResp = await difyUploadFileToDataset(agent.dify_dataset_id, fileBuf, filename, mimetype)
          const uploadData = await uploadResp.json()
          difyDocumentId = uploadData.document?.id || uploadData.id || null
          if (difyDocumentId) {
            db.prepare('UPDATE agent_files SET dify_document_id=? WHERE id=?').run(difyDocumentId, fileId)
            console.log(`📎 Archivo subido a Dify KB: ${filename} → doc ${difyDocumentId}`)
          } else {
            console.warn('⚠ Dify file upload no devolvió ID:', JSON.stringify(uploadData).slice(0, 200))
          }
        } catch (uErr) {
          console.warn('⚠ Dify file upload error:', uErr.message)
        }
      }

      saved.push({ id: fileId, filename, size, difyDocumentId })
    }
    res.json(saved)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/agents/:botId/files/:fileId', requireAriaAuth, async (req, res) => {
  const { botId, fileId } = req.params
  const wsId = req.ariaUser.workspaceId
  const file = db.prepare('SELECT * FROM agent_files WHERE id=? AND bot_id=? AND workspace_id=?')
    .get(fileId, botId, wsId)
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })
  try {
    // Borrar del disco
    if (existsSync(file.path)) unlinkSync(file.path)
    // Borrar de Dify dataset (service API)
    if (file.dify_document_id) {
      const agent = db.prepare('SELECT dify_dataset_id FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, wsId)
      if (agent?.dify_dataset_id) {
        await difyServiceApi(`/datasets/${agent.dify_dataset_id}/documents/${file.dify_document_id}`, 'DELETE').catch(() => {})
      }
    }
  } catch {}
  db.prepare('DELETE FROM agent_files WHERE id=?').run(fileId)
  res.json({ ok: true })
})

// ── Knowledge Base (KB) ───────────────────────────────────────────────────────
// KB es por agente (bot_id). Se almacena en Dify Knowledge Base (dataset) por RAG nativo.
// Tipos: 'text' (texto libre), 'faq' (pregunta/respuesta), 'url' (scraped)

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
    const agent = db.prepare('SELECT dify_app_id, dify_dataset_id FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, wsId)

    let finalContent = content?.trim() || ''
    let finalTitle = title || url || 'Sin título'

    if (type === 'url') {
      if (!url) return res.status(400).json({ error: 'url requerida' })
      const fullUrl = url.startsWith('http') ? url : `https://${url}`
      const r = await fetch(fullUrl, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!r.ok) return res.status(400).json({ error: `No se pudo acceder a ${url}: ${r.status}` })
      let html = await r.text()
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (html.length > 10000) html = html.slice(0, 10000) + '\n[... contenido truncado]'
      finalContent = html
      finalTitle = title || url
    } else {
      if (!finalContent) return res.status(400).json({ error: 'content requerido' })
    }

    // 1. Guardar en ARIA DB
    const id = randomUUID()
    db.prepare('INSERT INTO agent_kb (id,bot_id,workspace_id,type,title,content) VALUES (?,?,?,?,?,?)')
      .run(id, botId, wsId, type || 'text', finalTitle, finalContent)

    // 2. Crear documento en Dify dataset (RAG nativo con Qdrant) — service API
    let difyDocumentId = null
    if (agent?.dify_dataset_id) {
      try {
        const docResp = await difyServiceApi(`/datasets/${agent.dify_dataset_id}/document/create-by-text`, 'POST', {
          name: finalTitle,
          text: finalContent,
          indexing_technique: 'economy',
          process_rule: { mode: 'automatic' },
        })
        const docData = await docResp.json()
        difyDocumentId = docData.document?.id || docData.id || null
        if (difyDocumentId) {
          db.prepare('UPDATE agent_kb SET dify_document_id=? WHERE id=?').run(difyDocumentId, id)
          console.log(`📚 KB documento creado en Dify: ${difyDocumentId}`)
        } else {
          console.warn('⚠ Dify KB document error:', JSON.stringify(docData).slice(0, 300))
        }
      } catch (dErr) {
        console.warn('⚠ Dify KB document error:', dErr.message)
      }
    }

    res.json({ id, type: type || 'text', title: finalTitle, chars: finalContent.length, difyDocumentId })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/agents/:botId/kb/:itemId', requireAriaAuth, async (req, res) => {
  const { botId, itemId } = req.params
  const wsId = req.ariaUser.workspaceId
  try {
    const item = db.prepare('SELECT dify_document_id FROM agent_kb WHERE id=? AND bot_id=?').get(itemId, botId)
    // Borrar documento de Dify dataset (service API)
    if (item?.dify_document_id) {
      const agent = db.prepare('SELECT dify_dataset_id FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, wsId)
      if (agent?.dify_dataset_id) {
        await difyServiceApi(`/datasets/${agent.dify_dataset_id}/documents/${item.dify_document_id}`, 'DELETE').catch(() => {})
      }
    }
    db.prepare('DELETE FROM agent_kb WHERE id=? AND bot_id=? AND workspace_id=?')
      .run(itemId, botId, wsId)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Bot Tools ─────────────────────────────────────────────────────────────────

// Definición de tools para el LLM
const BOT_TOOLS = [
  {
    name: 'get_contact',
    description: 'Obtiene los datos del contacto actual: nombre, email, teléfono, empresa, etiquetas.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_contact',
    description: 'Actualiza datos del contacto. Usalo cuando el usuario comparte su email, teléfono, empresa u otro dato.',
    input_schema: {
      type: 'object',
      properties: {
        email:   { type: 'string', description: 'Email del contacto' },
        phone:   { type: 'string', description: 'Teléfono del contacto' },
        company: { type: 'string', description: 'Empresa del contacto' },
        note:    { type: 'string', description: 'Nota libre sobre el contacto' },
      },
    },
  },
  {
    name: 'set_funnel_stage',
    description: 'Mueve el contacto a una etapa del embudo de ventas.',
    input_schema: {
      type: 'object',
      properties: {
        stage:       { type: 'string', description: 'ID de la etapa (ej: prospecto, calificado, propuesta, cerrado)' },
        lead_status: { type: 'string', enum: ['open', 'won', 'lost'], description: 'Estado del lead' },
      },
      required: ['stage'],
    },
  },
  {
    name: 'create_task',
    description: 'Crea una tarea de seguimiento para un agente humano.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Título de la tarea' },
        description: { type: 'string', description: 'Descripción o contexto de la tarea' },
        priority:    { type: 'string', enum: ['low', 'normal', 'high'], description: 'Prioridad' },
      },
      required: ['title'],
    },
  },
  {
    name: 'escalate_to_human',
    description: 'Deriva la conversación a un agente humano. Usalo cuando el usuario lo pide, cuando no podés resolver el problema, o cuando detectás urgencia o frustración.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo de la derivación' },
      },
      required: ['reason'],
    },
  },
]

// Ejecuta una tool y devuelve el resultado como string
async function executeTool(toolName, toolInput, context) {
  const { projectId, requestId, leadId, workspaceId, token } = context
  const tdToken = await getTiledeskToken()

  if (toolName === 'get_contact') {
    if (!leadId) return 'No se encontró información del contacto.'
    const r = await fetch(`${TILEDESK_URL}/${projectId}/leads/${leadId}`, { headers: { Authorization: tdToken } })
    if (!r.ok) return 'Error al obtener el contacto.'
    const c = await r.json()
    return JSON.stringify({ fullname: c.fullname, email: c.email, phone: c.phone, company: c.company, note: c.note, tags: c.tags })
  }

  if (toolName === 'update_contact') {
    if (!leadId) return 'No se encontró el contacto para actualizar.'
    const r = await fetch(`${TILEDESK_URL}/${projectId}/leads/${leadId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: tdToken },
      body: JSON.stringify(toolInput),
    })
    return r.ok ? 'Contacto actualizado correctamente.' : 'Error al actualizar el contacto.'
  }

  if (toolName === 'set_funnel_stage') {
    if (!leadId) return 'No se encontró el contacto.'
    const { stage, lead_status = 'open' } = toolInput
    try {
      db.prepare('INSERT OR REPLACE INTO funnel_stages (workspace_id, lead_id, stage, lead_status) VALUES (?,?,?,?)')
        .run(workspaceId, leadId, stage, lead_status)
      return `Contacto movido a etapa "${stage}".`
    } catch { return 'Error al mover el contacto en el embudo.' }
  }

  if (toolName === 'create_task') {
    const { title, description, priority = 'normal' } = toolInput
    try {
      db.prepare('INSERT INTO tasks (id,workspace_id,title,description,lead_id,priority,status) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), workspaceId, title, description || null, leadId || null, priority, 'pending')
      return `Tarea "${title}" creada.`
    } catch { return 'Error al crear la tarea.' }
  }

  if (toolName === 'escalate_to_human') {
    const { reason } = toolInput
    // Cerrar el bot de la conversación para que pase a un humano
    await fetch(`${TILEDESK_URL}/${projectId}/requests/${requestId}/participants/bot_${context.botId}`, {
      method: 'DELETE', headers: { Authorization: tdToken },
    }).catch(() => {})
    return `Derivado a agente humano. Motivo: ${reason}`
  }

  return 'Tool desconocida.'
}

// callLLM con soporte de tools (agentic loop: hasta 5 rondas de tool calls)
async function callLLMWithTools({ system, messages, workspaceId, projectId, requestId, leadId, botId }) {
  const MAX_ROUNDS = 5
  let cs = null
  if (workspaceId) cs = db.prepare('SELECT llm_provider, llm_api_key, llm_model FROM channel_settings WHERE workspace_id=?').get(workspaceId)

  let provider = cs?.llm_api_key ? (cs.llm_provider || 'openai') : null
  let apiKey   = cs?.llm_api_key || null
  let model    = cs?.llm_model   || null

  if (!apiKey) {
    if (process.env.OPENAI_API_KEY)       { provider = 'openai';    apiKey = process.env.OPENAI_API_KEY;    model = model || 'gpt-4o-mini' }
    else if (process.env.ANTHROPIC_API_KEY) { provider = 'anthropic'; apiKey = process.env.ANTHROPIC_API_KEY; model = model || 'claude-haiku-4-5-20251001' }
  }
  if (!apiKey) throw new Error('No hay API key configurada')

  // Dify: delegar a callLLM directo (Dify gestiona el historial internamente)
  if (provider === 'dify') {
    // Leer dify_conversation_id desde cache en memoria, luego desde DB
    let difyConvId = requestId ? extDifyConvId.get(requestId) : undefined
    if (!difyConvId && requestId) {
      const row = db.prepare('SELECT dify_conversation_id FROM wa_conversations WHERE request_id=? LIMIT 1').get(requestId)
      if (row?.dify_conversation_id) difyConvId = row.dify_conversation_id
    }
    const result = await callLLM({ system, messages, workspaceId, difyConversationId: difyConvId })
    if (requestId && result.difyConversationId) {
      extDifyConvId.set(requestId, result.difyConversationId)
      db.prepare('UPDATE wa_conversations SET dify_conversation_id=? WHERE request_id=?')
        .run(result.difyConversationId, requestId)
    }
    return result
  }

  const workspace = workspaceId ? db.prepare('SELECT tiledesk_project_id FROM workspaces WHERE id=?').get(workspaceId) : null

  const toolContext = { projectId, requestId, leadId, workspaceId, botId }

  let currentMessages = [...messages]
  let totalUsage = { input_tokens: 0, output_tokens: 0 }
  let finalText = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let resp, d

    if (provider === 'anthropic') {
      // Convertir tools al formato Anthropic
      const anthropicTools = BOT_TOOLS.map(t => ({
        name: t.name, description: t.description, input_schema: t.input_schema,
      }))
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, system, messages: currentMessages, tools: anthropicTools }),
      })
      d = await resp.json()
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
      totalUsage.input_tokens  += d.usage?.input_tokens  || 0
      totalUsage.output_tokens += d.usage?.output_tokens || 0

      const toolUses = d.content?.filter(b => b.type === 'tool_use') || []
      const textBlocks = d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''

      if (toolUses.length === 0 || d.stop_reason === 'end_turn') {
        finalText = textBlocks
        break
      }

      // Agregar respuesta del asistente con tool_use
      currentMessages.push({ role: 'assistant', content: d.content })

      // Ejecutar tools y agregar resultados
      const toolResults = []
      for (const tu of toolUses) {
        console.log(`🔧 tool: ${tu.name}`, JSON.stringify(tu.input).slice(0, 100))
        const result = await executeTool(tu.name, tu.input, toolContext)
        console.log(`✓ tool result: ${result.slice(0, 100)}`)
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
      }
      currentMessages.push({ role: 'user', content: toolResults })

    } else {
      // OpenAI format
      const openaiTools = BOT_TOOLS.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }))
      const msgs = system ? [{ role: 'system', content: system }, ...currentMessages] : currentMessages
      resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, messages: msgs, tools: openaiTools, tool_choice: 'auto' }),
      })
      d = await resp.json()
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
      totalUsage.input_tokens  += d.usage?.prompt_tokens     || 0
      totalUsage.output_tokens += d.usage?.completion_tokens || 0

      const msg = d.choices?.[0]?.message
      const toolCalls = msg?.tool_calls || []

      if (toolCalls.length === 0 || d.choices?.[0]?.finish_reason === 'stop') {
        finalText = msg?.content?.trim() || ''
        break
      }

      currentMessages.push(msg)
      for (const tc of toolCalls) {
        let args = {}
        try { args = JSON.parse(tc.function.arguments) } catch {}
        console.log(`🔧 tool: ${tc.function.name}`, JSON.stringify(args).slice(0, 100))
        const result = await executeTool(tc.function.name, args, toolContext)
        console.log(`✓ tool result: ${result.slice(0, 100)}`)
        currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }
  }

  return { text: finalText, model, usage: totalUsage }
}

// ── External Bot Webhook (Tiledesk → ARIA → LLM → Tiledesk) ──────────────────
const extBotHistory  = new Map()  // requestId → [{role, content}]
const extDifyConvId  = new Map()  // requestId → dify conversation_id

app.post('/api/bot-webhook', async (req, res) => {
  res.json({ success: true })

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

    if (!projectId || !requestId || !token) return console.log('⚠ bot-webhook: faltan campos requeridos')

    if (action === 'start') {
      extBotHistory.delete(requestId)
      extDifyConvId.delete(requestId)
      db.prepare('UPDATE wa_conversations SET dify_conversation_id=NULL WHERE request_id=?').run(requestId)
    }
    if (!text) return

    if (!extBotHistory.has(requestId)) extBotHistory.set(requestId, [])
    const history = extBotHistory.get(requestId)
    history.push({ role: 'user', content: text })

    const meta = db.prepare('SELECT instructions, workspace_id FROM agent_metadata WHERE bot_id=?').get(botId)
    const baseInstructions = meta?.instructions?.trim() ||
      'Sos un asistente virtual amable y conciso. Respondé siempre en el mismo idioma que el usuario.'

    // Obtener leadId de la conversación en Tiledesk
    let leadId = null
    try {
      const tdToken = await getTiledeskToken()
      const reqData = await fetch(`${TILEDESK_URL}/${projectId}/requests/${requestId}`, { headers: { Authorization: tdToken } })
        .then(r => r.json()).catch(() => null)
      leadId = reqData?.lead?._id || reqData?.lead_id || null
    } catch {}

    // KB del bot desde ARIA DB (aislada por bot_id)
    let kbBlock = ''
    try {
      if (meta?.workspace_id) {
        const items = db.prepare('SELECT type, title, content FROM agent_kb WHERE bot_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 100')
          .all(botId, meta.workspace_id)
        if (items.length > 0) {
          const sections = items.map(item => {
            if (item.type === 'faq') return `P: ${item.title}\nR: ${item.content}`
            return `[${item.title || item.type}]\n${item.content?.slice(0, 600) || ''}`
          })
          kbBlock = `\n\n## BASE DE CONOCIMIENTO\nUsá esta información para responder preguntas del usuario:\n\n${sections.join('\n\n---\n\n')}`
        }
      }
    } catch (kbErr) { console.error('⚠ bot-webhook: error leyendo KB', kbErr.message) }

    const systemPrompt = baseInstructions + kbBlock

    const { text: reply, model: llmModel, usage: llmUsage } = await callLLMWithTools({
      system: systemPrompt,
      messages: history,
      workspaceId: meta?.workspace_id,
      projectId,
      requestId,
      leadId,
      botId,
    }).catch(e => { console.error('⚠ bot-webhook: LLM error', e.message); return {} })

    if (!reply) return
    trackLlmUsage(meta?.workspace_id || 'unknown', 'bot-webhook', llmModel, llmUsage)

    // Detectar HANDOFF
    let finalReply = reply
    if (reply.includes('[HANDOFF]')) {
      finalReply = reply.replace(/\[HANDOFF\]/g, '').trim() || 'Un momento, te conecto con un asesor.'
      db.prepare("UPDATE wa_conversations SET bot_mode='human', updated_at=strftime('%s','now') WHERE request_id=?").run(requestId)
      extDifyConvId.delete(requestId)
      extBotHistory.delete(requestId)
      console.log(`👤 HANDOFF → modo humano activado | requestId=...${requestId.slice(-8)}`)
    }

    history.push({ role: 'assistant', content: finalReply })
    if (history.length > 20) history.splice(0, history.length - 20)

    const tdReply = await fetch(`${TILEDESK_URL}/${projectId}/requests/${requestId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ text: finalReply, sender: botId, senderFullname: botName }),
    })
    if (!tdReply.ok) {
      console.error(`⚠ bot-webhook reply error: ${tdReply.status}`)
    } else {
      console.log(`✓ bot-webhook → reply ok | requestId=...${requestId.slice(-8)}`)
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
  // Tiledesk deshabilitado — no registrar webhooks al arrancar
})
