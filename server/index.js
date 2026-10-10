import express          from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import jwt              from 'jsonwebtoken'
import bcrypt           from 'bcryptjs'
import Database         from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'fs'
import { extname } from 'path'
import nodemailer       from 'nodemailer'

const app       = express()
const __dirname = dirname(fileURLToPath(import.meta.url))
app.use(express.json({ limit: '25mb' }))

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
  // users: active (permite desactivar vendedores sin borrarlos)
  const usersCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name)
  if (!usersCols.includes('active')) {
    db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`)
    console.log('✓ Migrado: users.active')
  }
  // wa_conversations: contact_id (ancla al contacto local, fix de matching LID/teléfono real)
  // + scored_at/score_attempts (circuit breaker del agente calificador "Lucas")
  const waCols2 = db.prepare("PRAGMA table_info(wa_conversations)").all().map(c => c.name)
  if (!waCols2.includes('contact_id')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN contact_id TEXT`)
    console.log('✓ Migrado: wa_conversations.contact_id')
  }
  if (!waCols2.includes('scored_at')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN scored_at INTEGER`)
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN score_attempts INTEGER DEFAULT 0`)
    console.log('✓ Migrado: wa_conversations.scored_at/score_attempts')
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_conv_contact ON wa_conversations(workspace_id, contact_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_conv_sweep ON wa_conversations(closed, scored_at, updated_at)`)
  // channel_settings: toggle del agente calificador "Lucas"
  const csCols3 = db.prepare("PRAGMA table_info(channel_settings)").all().map(c => c.name)
  if (!csCols3.includes('ai_scoring_enabled')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN ai_scoring_enabled INTEGER DEFAULT 0`)
    console.log('✓ Migrado: channel_settings.ai_scoring_enabled')
  }
  // lead_scores: tabla del agente calificador "Lucas"
  db.exec(`CREATE TABLE IF NOT EXISTS lead_scores (
    workspace_id    TEXT NOT NULL,
    contact_id      TEXT NOT NULL,
    temperature     TEXT NOT NULL DEFAULT 'frio',
    score           INTEGER NOT NULL DEFAULT 0,
    reasoning       TEXT,
    last_request_id TEXT,
    updated_at      INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (workspace_id, contact_id)
  )`)
  // dify_agents: seguimientos automáticos + derivación estructurada conectada a Lucas
  const daCols2 = db.prepare("PRAGMA table_info(dify_agents)").all().map(c => c.name)
  if (!daCols2.includes('followup_cadence')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN followup_cadence TEXT DEFAULT 'none'`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN followup_intervals TEXT DEFAULT '[]'`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN followup_hours_start TEXT DEFAULT '08:00'`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN followup_hours_end TEXT DEFAULT '20:00'`)
    console.log('✓ Migrado: dify_agents.followup_*')
  }
  if (!daCols2.includes('derivation_mode')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN derivation_mode TEXT DEFAULT 'nunca'`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN derivation_score_threshold INTEGER DEFAULT 70`)
    console.log('✓ Migrado: dify_agents.derivation_mode/derivation_score_threshold')
  }
  // wa_conversations: contador de seguimientos enviados
  const waCols3 = db.prepare("PRAGMA table_info(wa_conversations)").all().map(c => c.name)
  if (!waCols3.includes('followup_count')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN followup_count INTEGER DEFAULT 0`)
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN last_followup_at INTEGER`)
    console.log('✓ Migrado: wa_conversations.followup_count/last_followup_at')
  }
  // channel_instances: agente Dify asignado a este canal (routing por canal)
  const ciCols2 = db.prepare("PRAGMA table_info(channel_instances)").all().map(c => c.name)
  if (!ciCols2.includes('bot_id')) {
    db.exec(`ALTER TABLE channel_instances ADD COLUMN bot_id TEXT`)
    console.log('✓ Migrado: channel_instances.bot_id')
  }
  // dify_agents: Objetivo + Comportamiento
  const daCols3 = db.prepare("PRAGMA table_info(dify_agents)").all().map(c => c.name)
  if (!daCols3.includes('goals')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN goals TEXT DEFAULT '[]'`)
    db.exec(`ALTER TABLE dify_agents ADD COLUMN goal_success_criteria TEXT`)
    console.log('✓ Migrado: dify_agents.goals/goal_success_criteria')
  }
  if (!daCols3.includes('behavior_notes')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN behavior_notes TEXT`)
    console.log('✓ Migrado: dify_agents.behavior_notes')
  }
  // wa_conversations: usuario asignado al derivar a humano
  if (!waCols3.includes('assigned_user_id')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN assigned_user_id TEXT`)
    console.log('✓ Migrado: wa_conversations.assigned_user_id')
  }
  // channel_settings: tool provider de Dify (agent-chat) registrado para este workspace
  const csCols4 = db.prepare("PRAGMA table_info(channel_settings)").all().map(c => c.name)
  if (!csCols4.includes('dify_tool_provider_id')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN dify_tool_provider_id TEXT`)
    console.log('✓ Migrado: channel_settings.dify_tool_provider_id')
  }
  // Tobías (gestor de campañas): app "completion" de Dify propia del workspace
  if (!csCols4.includes('tobias_dify_app_id')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN tobias_dify_app_id TEXT`)
    db.exec(`ALTER TABLE channel_settings ADD COLUMN tobias_dify_api_key TEXT`)
    console.log('✓ Migrado: channel_settings.tobias_dify_*')
  }
  if (!csCols4.includes('tobias_enabled')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN tobias_enabled INTEGER DEFAULT 1`)
  }
  if (!csCols4.includes('tobias_prompt_hash')) {
    db.exec(`ALTER TABLE channel_settings ADD COLUMN tobias_prompt_hash TEXT`)
  }
  db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    strategy            TEXT DEFAULT 'reactivar',
    status              TEXT NOT NULL DEFAULT 'draft',
    objective           TEXT,
    guidelines          TEXT,
    audience            TEXT DEFAULT '{}',
    channel_instance_id TEXT,
    scheduled_at        INTEGER,
    hours_start         TEXT DEFAULT '09:00',
    hours_end           TEXT DEFAULT '20:00',
    interval_minutes    INTEGER DEFAULT 3,
    daily_limit         INTEGER DEFAULT 50,
    on_reply            TEXT DEFAULT 'agent',
    created_by          TEXT,
    created_at          INTEGER DEFAULT (strftime('%s','now')),
    updated_at          INTEGER DEFAULT (strftime('%s','now')),
    started_at          INTEGER,
    finished_at         INTEGER
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_recipients (
    id           TEXT PRIMARY KEY,
    campaign_id  TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    contact_id   TEXT NOT NULL,
    phone        TEXT,
    name         TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    message      TEXT,
    error        TEXT,
    sent_at      INTEGER,
    replied_at   INTEGER,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  )`)
  const cpCols = db.prepare("PRAGMA table_info(campaigns)").all().map(c => c.name)
  if (!cpCols.includes('description')) db.exec(`ALTER TABLE campaigns ADD COLUMN description TEXT`)
  if (!cpCols.includes('strategy'))    db.exec(`ALTER TABLE campaigns ADD COLUMN strategy TEXT DEFAULT 'reactivar'`)
  if (!cpCols.includes('on_reply'))    db.exec(`ALTER TABLE campaigns ADD COLUMN on_reply TEXT DEFAULT 'agent'`)
  // Recurrente: se vuelve a lanzar con audiencia nueva cada `recurrence` (daily/weekly/biweekly/monthly)
  if (!cpCols.includes('recurrence'))  db.exec(`ALTER TABLE campaigns ADD COLUMN recurrence TEXT`)
  if (!cpCols.includes('run_count'))   db.exec(`ALTER TABLE campaigns ADD COLUMN run_count INTEGER DEFAULT 0`)
  if (!cpCols.includes('recurrence_time'))  db.exec(`ALTER TABLE campaigns ADD COLUMN recurrence_time TEXT DEFAULT '09:30'`)
  if (!cpCols.includes('recurrence_days'))  db.exec(`ALTER TABLE campaigns ADD COLUMN recurrence_days TEXT DEFAULT '[1,2,3,4,5]'`)
  if (!cpCols.includes('recurrence_until')) db.exec(`ALTER TABLE campaigns ADD COLUMN recurrence_until INTEGER`)
  // Cada corrida de una serie recurrente es una campaña propia que apunta a la serie
  if (!cpCols.includes('parent_id'))        db.exec(`ALTER TABLE campaigns ADD COLUMN parent_id TEXT`)
  // Depurar con IA: antes de escribir, Tobías revisa el historial y omite a quien no corresponde
  if (!cpCols.includes('ai_screening'))     db.exec(`ALTER TABLE campaigns ADD COLUMN ai_screening INTEGER DEFAULT 0`)
  // Línea: 'last' = el último número que le escribió a cada contacto; 'specific' = channel_instance_id
  if (!cpCols.includes('channel_mode'))     db.exec(`ALTER TABLE campaigns ADD COLUMN channel_mode TEXT DEFAULT 'specific'`)
  // Ritmo (goteo): preset + segundos entre mensajes (reemplaza interval_minutes)
  if (!cpCols.includes('pace'))             db.exec(`ALTER TABLE campaigns ADD COLUMN pace TEXT`)
  if (!cpCols.includes('interval_seconds')) db.exec(`ALTER TABLE campaigns ADD COLUMN interval_seconds INTEGER`)
  // Días de la semana en que se envía (0 = domingo) y próximo envío permitido (goteo con pausas aleatorias)
  if (!cpCols.includes('send_days'))        db.exec(`ALTER TABLE campaigns ADD COLUMN send_days TEXT DEFAULT '[0,1,2,3,4,5,6]'`)
  if (!cpCols.includes('next_send_at'))     db.exec(`ALTER TABLE campaigns ADD COLUMN next_send_at INTEGER`)
  // Mensaje: 'ai' (Tobías redacta con tono/longitud) o 'template' (texto con variables) + adjunto opcional
  if (!cpCols.includes('message_mode'))     db.exec(`ALTER TABLE campaigns ADD COLUMN message_mode TEXT DEFAULT 'ai'`)
  if (!cpCols.includes('tone'))             db.exec(`ALTER TABLE campaigns ADD COLUMN tone TEXT DEFAULT 'cercano'`)
  if (!cpCols.includes('length'))           db.exec(`ALTER TABLE campaigns ADD COLUMN length TEXT DEFAULT 'medio'`)
  if (!cpCols.includes('template'))         db.exec(`ALTER TABLE campaigns ADD COLUMN template TEXT`)
  if (!cpCols.includes('attachment'))       db.exec(`ALTER TABLE campaigns ADD COLUMN attachment TEXT`)
  // Axel (auditor comercial): registro liviano de mensajes entrantes/salientes por contacto, para medir
  // tiempos de respuesta de los vendedores. Se llena desde los webhooks a partir de este deploy.
  db.exec(`CREATE TABLE IF NOT EXISTS wa_message_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    contact_id   TEXT,
    session_name TEXT,
    direction    TEXT NOT NULL,          -- 'in' (cliente) | 'out' (nosotros: bot, vendedor o campaña)
    at           INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_events_contact ON wa_message_events(workspace_id, contact_id, at)`)
  const evCols = db.prepare("PRAGMA table_info(wa_message_events)").all().map(c => c.name)
  if (!evCols.includes('actor')) db.exec(`ALTER TABLE wa_message_events ADD COLUMN actor TEXT`)
  const waColsAx = db.prepare("PRAGMA table_info(wa_conversations)").all().map(c => c.name)
  if (!waColsAx.includes('handoff_at'))           db.exec(`ALTER TABLE wa_conversations ADD COLUMN handoff_at INTEGER`)
  if (!waColsAx.includes('first_human_reply_at')) db.exec(`ALTER TABLE wa_conversations ADD COLUMN first_human_reply_at INTEGER`)
  // Fecha de creación de la conversación (métricas de Lucas). Las viejas toman su última actividad.
  if (!waColsAx.includes('created_at')) {
    db.exec(`ALTER TABLE wa_conversations ADD COLUMN created_at INTEGER`)
    db.exec(`UPDATE wa_conversations SET created_at=updated_at WHERE created_at IS NULL`)
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_wa_conv_created AFTER INSERT ON wa_conversations
    WHEN NEW.created_at IS NULL
    BEGIN UPDATE wa_conversations SET created_at=strftime('%s','now') WHERE id=NEW.id; END`)
  // Cualquier camino que pase una conversación a modo humano (handoff del bot, Lucas, campañas,
  // límite de créditos, toma manual) deja marcado el momento de la derivación.
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_wa_conv_handoff_upd AFTER UPDATE OF bot_mode ON wa_conversations
    WHEN NEW.bot_mode='human' AND (OLD.bot_mode IS NULL OR OLD.bot_mode!='human')
    BEGIN UPDATE wa_conversations SET handoff_at=strftime('%s','now'), first_human_reply_at=NULL WHERE id=NEW.id; END`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_wa_conv_handoff_ins AFTER INSERT ON wa_conversations
    WHEN NEW.bot_mode='human'
    BEGIN UPDATE wa_conversations SET handoff_at=strftime('%s','now') WHERE id=NEW.id; END`)
  const csColsAx = db.prepare("PRAGMA table_info(channel_settings)").all().map(c => c.name)
  if (!csColsAx.includes('axel_sla_minutes')) db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_sla_minutes INTEGER DEFAULT 30`)
  // Dimensiones (variables) que analiza Axel y reglas comerciales del negocio — se editan en Configuración
  if (!csColsAx.includes('axel_dimensions'))  db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_dimensions TEXT`)
  if (!csColsAx.includes('axel_rules'))       db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_rules TEXT`)
  // Ejecución programada: { enabled, frequency: daily|weekly|monthly, days: [0-6], month_day: 1-28 }
  if (!csColsAx.includes('axel_schedule'))    db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_schedule TEXT`)
  if (!csColsAx.includes('axel_last_run'))    db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_last_run TEXT`)
  // Métricas duras: horario laboral (los tiempos y el SLA cuentan solo dentro de él), SLA en segundos
  // e inactividad "en riesgo" en horas
  if (!csColsAx.includes('axel_work_start'))  db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_work_start TEXT`)
  if (!csColsAx.includes('axel_work_end'))    db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_work_end TEXT`)
  if (!csColsAx.includes('axel_sla_seconds')) db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_sla_seconds INTEGER`)
  if (!csColsAx.includes('axel_risk_hours'))  db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_risk_hours INTEGER`)
  if (!csColsAx.includes('axel_work_days'))   db.exec(`ALTER TABLE channel_settings ADD COLUMN axel_work_days TEXT`)
  // Lucas: ejecución programada diaria { enabled, time: 'HH:MM' }
  if (!csColsAx.includes('lucas_schedule'))   db.exec(`ALTER TABLE channel_settings ADD COLUMN lucas_schedule TEXT`)
  if (!csColsAx.includes('lucas_last_run'))   db.exec(`ALTER TABLE channel_settings ADD COLUMN lucas_last_run TEXT`)
  // Lucas · Oportunidades: { move: bool } — si es false, Lucas califica pero no mueve etapas del embudo
  if (!csColsAx.includes('lucas_opportunities')) db.exec(`ALTER TABLE channel_settings ADD COLUMN lucas_opportunities TEXT`)
  // Lucas · Smart Tags: { enabled } + criterio por tag (Contactos > Tags) para el etiquetado con IA
  if (!csColsAx.includes('lucas_smart_tags')) db.exec(`ALTER TABLE channel_settings ADD COLUMN lucas_smart_tags TEXT`)
  // Lucas · Calificación: { enabled, criteria: { caliente, tibio, frio } } — criterios de temperatura
  if (!csColsAx.includes('lucas_rating'))     db.exec(`ALTER TABLE channel_settings ADD COLUMN lucas_rating TEXT`)
  const lbCols = db.prepare("PRAGMA table_info(labels)").all().map(c => c.name)
  if (!lbCols.includes('criteria')) db.exec(`ALTER TABLE labels ADD COLUMN criteria TEXT`)
  db.exec(`CREATE TABLE IF NOT EXISTS axel_analyses (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    seller_id    TEXT,
    seller_name  TEXT,
    range_from   INTEGER,
    range_to     INTEGER,
    question     TEXT,
    dimensions   TEXT,
    metrics      TEXT,
    result       TEXT,
    status       TEXT NOT NULL DEFAULT 'running',   -- running | done | error
    error        TEXT,
    created_by   TEXT,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  )`)

  const crCols = db.prepare("PRAGMA table_info(campaign_recipients)").all().map(c => c.name)
  // Marca de "su respuesta se derivó a un vendedor" (métrica del Resumen de Ventas)
  if (!crCols.includes('handed_off')) db.exec(`ALTER TABLE campaign_recipients ADD COLUMN handed_off INTEGER DEFAULT 0`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id, status)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON campaign_recipients(workspace_id, contact_id, status)`)

  // ── Planes de pago (MercadoPago) ───────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS plans (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    price_ars           REAL NOT NULL,
    ai_credits_month    INTEGER NOT NULL,
    max_whatsapp_numbers INTEGER,
    max_users           INTEGER,
    max_agents          INTEGER,
    max_funnels         INTEGER,
    support_tier        TEXT NOT NULL DEFAULT 'email',
    mp_plan_id          TEXT
  )`)
  const plansCount = db.prepare('SELECT count(*) n FROM plans').get().n
  if (plansCount === 0) {
    const insPlan = db.prepare(`INSERT INTO plans
      (id, name, price_ars, ai_credits_month, max_whatsapp_numbers, max_users, max_agents, max_funnels, support_tier)
      VALUES (?,?,?,?,?,?,?,?,?)`)
    insPlan.run('inicial',     'Inicial',     99,  2000,   1,  3,  1,    1,    'email')
    insPlan.run('crecer',      'Crecer',      299, 45000,  3,  10, 5,    5,    'whatsapp')
    insPlan.run('performance', 'Performance', 699, 120000, 10, 25, null, null, 'whatsapp')
    console.log('✓ Migrado: plans (inicial/crecer/performance)')
  }

  const wsCols = db.prepare("PRAGMA table_info(workspaces)").all().map(c => c.name)
  if (!wsCols.includes('plan_id')) {
    db.exec(`ALTER TABLE workspaces ADD COLUMN plan_id TEXT DEFAULT 'inicial'`)
    db.exec(`ALTER TABLE workspaces ADD COLUMN plan_status TEXT DEFAULT 'trial'`)
    db.exec(`ALTER TABLE workspaces ADD COLUMN mp_subscription_id TEXT`)
    db.exec(`ALTER TABLE workspaces ADD COLUMN trial_ends_at INTEGER`)
    console.log('✓ Migrado: workspaces.plan_id/plan_status/mp_subscription_id/trial_ends_at')
  }

  db.exec(`CREATE TABLE IF NOT EXISTS usage_counters (
    workspace_id TEXT NOT NULL,
    year_month   TEXT NOT NULL,
    messages     INTEGER DEFAULT 0,
    PRIMARY KEY (workspace_id, year_month)
  )`)

  // Integraciones del agente: tools builtin de Dify activadas + tools custom (endpoints propios)
  const daCols4 = db.prepare("PRAGMA table_info(dify_agents)").all().map(c => c.name)
  if (!daCols4.includes('extra_builtin_tools')) {
    db.exec(`ALTER TABLE dify_agents ADD COLUMN extra_builtin_tools TEXT DEFAULT '[]'`)
    console.log('✓ Migrado: dify_agents.extra_builtin_tools')
  }
  db.exec(`CREATE TABLE IF NOT EXISTS agent_custom_tools (
    id              TEXT PRIMARY KEY,
    bot_id          TEXT NOT NULL,
    workspace_id    TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    url             TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'GET',
    params          TEXT DEFAULT '[]',
    dify_provider_id   TEXT,
    dify_provider_name TEXT,
    created_at      INTEGER DEFAULT (strftime('%s','now'))
  )`)

  // users: teléfono propio — para avisarle por WhatsApp cuando se le asigna un chat
  const usersCols2 = db.prepare("PRAGMA table_info(users)").all().map(c => c.name)
  if (!usersCols2.includes('phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`)
    console.log('✓ Migrado: users.phone')
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
    // Streaming siempre: las apps agent-chat (con tools) rechazan 'blocking'.
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const { answer, conversationId, usage } = await callDifyChat(apiKey, { query: lastUserMsg, conversationId: difyConversationId, user: workspaceId })
    return {
      text: answer,
      model: 'dify',
      usage,
      difyConversationId: conversationId,
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

  if (user.active === 0) return res.status(403).json({ error: 'Tu cuenta está desactivada. Contactá al administrador.' })

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
    'SELECT id, email, name, phone, role, COALESCE(active,1) AS active FROM users WHERE workspace_id=? ORDER BY name'
  ).all(req.ariaUser.workspaceId)
  res.json(members)
})

app.put('/api/workspace/members/:id', requireAriaAuth, (req, res) => {
  if (!['owner', 'admin'].includes(req.ariaUser.role)) {
    return res.status(403).json({ error: 'Solo los administradores pueden editar miembros' })
  }
  const target = db.prepare('SELECT * FROM users WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!target) return res.status(404).json({ error: 'Miembro no encontrado' })
  if (target.role === 'owner' && req.ariaUser.email !== target.email) {
    return res.status(403).json({ error: 'No se puede editar al owner del workspace' })
  }

  const { name, role, active, phone } = req.body || {}
  const updates = []
  const vals = []
  if (name !== undefined)   { updates.push('name=?');   vals.push(name || null) }
  if (phone !== undefined)  { updates.push('phone=?');  vals.push(phone || null) }
  if (role !== undefined && ['admin', 'member'].includes(role)) { updates.push('role=?'); vals.push(role) }
  if (active !== undefined) { updates.push('active=?'); vals.push(active ? 1 : 0) }
  if (updates.length) {
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=? AND workspace_id=?`).run(...vals, req.params.id, req.ariaUser.workspaceId)
  }
  res.json({ ok: true })
})

app.delete('/api/workspace/members/:id', requireAriaAuth, (req, res) => {
  if (!['owner', 'admin'].includes(req.ariaUser.role)) {
    return res.status(403).json({ error: 'Solo los administradores pueden eliminar miembros' })
  }
  const target = db.prepare('SELECT * FROM users WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!target) return res.status(404).json({ error: 'Miembro no encontrado' })
  if (target.role === 'owner') return res.status(403).json({ error: 'No se puede eliminar al owner del workspace' })
  if (target.email === req.ariaUser.email) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' })

  db.prepare('DELETE FROM team_members WHERE user_id=?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
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
  const usage = getPlanAndUsage(req.ariaUser.workspaceId)
  if (usage.usersLimitReached) {
    return res.status(403).json({ error: `Llegaste al límite de usuarios de tu plan (${usage.plan.name}: ${usage.plan.max_users}) — actualizá tu plan para invitar más.` })
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
  const { title, color, criteria } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'title requerido' })
  const id = randomUUID()
  db.prepare('INSERT INTO labels (id, workspace_id, title, color, criteria) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.ariaUser.workspaceId, title.trim(), color || '#6366f1', criteria?.trim() || null)
  res.json(db.prepare('SELECT * FROM labels WHERE id=?').get(id))
})

app.put('/api/labels/:id', requireAriaAuth, (req, res) => {
  const { title, color, criteria } = req.body || {}
  db.prepare('UPDATE labels SET title=COALESCE(?,title), color=COALESCE(?,color) WHERE id=? AND workspace_id=?')
    .run(title?.trim() || null, color || null, req.params.id, req.ariaUser.workspaceId)
  // El criterio se puede vaciar: solo se toca si viene en el body
  if (criteria !== undefined) {
    db.prepare('UPDATE labels SET criteria=? WHERE id=? AND workspace_id=?').run(criteria?.trim() || null, req.params.id, req.ariaUser.workspaceId)
  }
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
function upsertContactFromWA(workspaceId, rawJid, pushName, realPhone, { skipHubspot = false } = {}) {
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
    if (row && !skipHubspot) syncContactToHubSpot(workspaceId, row).catch(() => {})
    return existing.id
  }
  const id = randomUUID()
  db.prepare('INSERT INTO contacts (id,workspace_id,name,phone,tags,attributes) VALUES (?,?,?,?,?,?)')
    .run(id, workspaceId, cleanName, phone, '[]', attrs)
  // Nuevo contacto: sincronizar a HubSpot y crear Deal
  if (!skipHubspot) {
    const newRow = db.prepare('SELECT * FROM contacts WHERE id=?').get(id)
    syncContactToHubSpot(workspaceId, newRow)
      .then(hsId => { if (hsId) createHubSpotDeal(workspaceId, hsId, cleanName, phone) })
      .catch(() => {})
  }
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
  const usage = getPlanAndUsage(req.ariaUser.workspaceId)
  if (usage.funnelsLimitReached) {
    return res.status(403).json({ error: `Llegaste al límite de embudos de tu plan (${usage.plan.name}: ${usage.plan.max_funnels}) — actualizá tu plan para crear más.` })
  }
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

// Resuelve qué agente Dify atiende un canal: el asignado directamente a la sesión
// (routing por canal) o, si no hay, el bot por defecto del workspace (compatibilidad
// con workspaces de un solo agente).
function resolveActiveAgent(workspaceId, sessionName) {
  const inst = sessionName
    ? db.prepare('SELECT bot_id FROM channel_instances WHERE workspace_id=? AND session_name=?').get(workspaceId, sessionName)
    : null
  const botId = inst?.bot_id || db.prepare('SELECT default_bot_id FROM channel_settings WHERE workspace_id=?').get(workspaceId)?.default_bot_id
  if (!botId || botId === '__dify__') return null
  return db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, workspaceId)
}

// Elige a quién asignar una conversación derivada a humano, según derivation_users
// del agente ('__all__' → cualquier miembro del workspace; lista → solo esos).
function pickHandoffUser(workspaceId, derivationUsersJson) {
  let ids = []
  try { ids = JSON.parse(derivationUsersJson || '["__all__"]') } catch { ids = ['__all__'] }
  const members = db.prepare('SELECT id FROM users WHERE workspace_id=? AND COALESCE(active,1)=1').all(workspaceId)
  if (!members.length) return null
  const pool = ids.includes('__all__') ? members.map(m => m.id) : members.map(m => m.id).filter(id => ids.includes(id))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// Avisa por WhatsApp (al celular propio del vendedor, no un toast en el navegador que
// puede no estar mirando) cuando se le asigna una conversación derivada a humano.
async function notifyAssignedUser(workspaceId, userId, { contactName, lastMessage }) {
  if (!userId) return
  const user = db.prepare('SELECT phone, name FROM users WHERE id=?').get(userId)
  if (!user?.phone) return
  try {
    const settings = getChannelSettings(workspaceId)
    const inst = getPrimaryWahaSession(workspaceId)
    if (!inst) return
    const chatId = `${user.phone.replace(/\D/g, '')}@c.us`
    const text = `🔥 Te asignaron un chat de WhatsApp: *${contactName || 'un contacto'}*\n"${(lastMessage || '').slice(0, 150)}"\n\nEntrá a ARIA para responder.`
    await wahaReq(settings, '/api/sendText', {
      method: 'POST',
      body: JSON.stringify({ chatId, text, session: inst.session_name }),
    })
    console.log(`📲 [Handoff] Aviso enviado a ${user.name || userId}`)
  } catch (e) {
    console.error('⚠ [Handoff] Error avisando al vendedor:', e.message)
  }
}

// ── Planes de pago — métricas y gating ────────────────────────────────────────

function currentYearMonth() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Suma 1 "crédito AI" consumido este mes — se llama una vez por mensaje real que
// efectivamente generó una respuesta de IA (no por cada webhook recibido).
function incrementMessageUsage(workspaceId) {
  const ym = currentYearMonth()
  db.prepare(`
    INSERT INTO usage_counters (workspace_id, year_month, messages) VALUES (?,?,1)
    ON CONFLICT(workspace_id, year_month) DO UPDATE SET messages = messages + 1
  `).run(workspaceId, ym)
}

// Resuelve el plan activo de un workspace + su uso actual contra los límites del plan.
// Los límites NULL en la tabla plans significan "ilimitado" (plan Performance).
function getPlanAndUsage(workspaceId) {
  const ws = db.prepare('SELECT plan_id, plan_status FROM workspaces WHERE id=?').get(workspaceId)
  const plan = db.prepare('SELECT * FROM plans WHERE id=?').get(ws?.plan_id || 'inicial') || db.prepare('SELECT * FROM plans WHERE id=?').get('inicial')
  const agentsUsed   = db.prepare('SELECT count(*) n FROM dify_agents WHERE workspace_id=?').get(workspaceId).n
  const whatsappUsed = db.prepare("SELECT count(*) n FROM channel_instances WHERE workspace_id=? AND provider IN ('waha','evolution')").get(workspaceId).n
  const usersUsed    = db.prepare('SELECT count(*) n FROM users WHERE workspace_id=?').get(workspaceId).n
  const funnelsUsed  = db.prepare('SELECT count(*) n FROM funnels WHERE workspace_id=?').get(workspaceId).n
  const messagesUsed = db.prepare('SELECT messages FROM usage_counters WHERE workspace_id=? AND year_month=?').get(workspaceId, currentYearMonth())?.messages || 0

  const within = (used, max) => max == null || used < max
  return {
    plan, planStatus: ws?.plan_status || 'trial',
    agentsUsed, whatsappUsed, usersUsed, funnelsUsed, messagesUsed,
    agentsLimitReached:   !within(agentsUsed,   plan.max_agents),
    whatsappLimitReached: !within(whatsappUsed, plan.max_whatsapp_numbers),
    usersLimitReached:    !within(usersUsed,    plan.max_users),
    funnelsLimitReached:  !within(funnelsUsed,  plan.max_funnels),
    messagesLimitReached: !within(messagesUsed, plan.ai_credits_month),
  }
}

// Resuelve la respuesta de Dify para un mensaje de WhatsApp entrante, manteniendo
// la conversación (TTL, dify_conversation_id, handoff) — usada por WAHA y EvolutionGo
// para no duplicar esta lógica en cada webhook.
// ── Origen del contacto (Lucas · Calidad por origen) ─────────────────────────
// Los mensajes que llegan desde un anuncio Click to WhatsApp traen el contexto del anuncio
// (externalAdReply / referral). La ubicación exacta varía según el motor de WAHA, así que se
// busca la clave en todo el payload. Se guarda solo el primer origen (first touch).
function findAdContext(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return null
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase()
    if ((key === 'externaladreply' || key === 'referral') && v && typeof v === 'object') return v
    const found = findAdContext(v, depth + 1)
    if (found) return found
  }
  return null
}
function saveContactAdOrigin(contactId, msg) {
  if (!contactId) return
  const ad = findAdContext(msg?._data) || findAdContext(msg)
  if (!ad) return
  const row = db.prepare('SELECT attributes FROM contacts WHERE id=?').get(contactId)
  let attrs = {}
  try { attrs = JSON.parse(row?.attributes || '{}') } catch {}
  if (attrs.origin) return
  attrs.origin = {
    type: 'ctwa',
    title: String(ad.title || ad.headline || ad.Title || '').slice(0, 200) || null,
    source_id: String(ad.sourceId || ad.source_id || ad.SourceID || ad.ctwaClid || '').slice(0, 100) || null,
    source_url: String(ad.sourceUrl || ad.source_url || ad.SourceURL || '').slice(0, 500) || null,
    at: Math.floor(Date.now() / 1000),
  }
  db.prepare("UPDATE contacts SET attributes=?, updated_at=strftime('%s','now') WHERE id=?").run(JSON.stringify(attrs), contactId)
  console.log(`📢 [Lucas] Origen de anuncio guardado para ${contactId}: ${attrs.origin.title || attrs.origin.source_id || 'anuncio'}`)
}

// ── Axel: registro de mensajes ────────────────────────────────────────────────
// El mensaje automático de derivación ("te conecto con un asesor") sale apenas se deriva: lo que
// llegue dentro de este margen no cuenta como primera respuesta del vendedor.
const HANDOFF_GRACE_SECS = 20

function logWaEvent(workspaceId, contactId, sessionName, direction) {
  if (!workspaceId || !contactId) return
  // Salientes: 'human' si la conversación abierta del contacto está derivada a un vendedor, 'bot' si no
  const actor = direction === 'out'
    ? (db.prepare("SELECT 1 FROM wa_conversations WHERE workspace_id=? AND contact_id=? AND closed=0 AND bot_mode='human' LIMIT 1")
        .get(workspaceId, contactId) ? 'human' : 'bot')
    : 'lead'
  db.prepare('INSERT INTO wa_message_events (workspace_id, contact_id, session_name, direction, actor) VALUES (?,?,?,?,?)')
    .run(workspaceId, contactId, sessionName || null, direction, actor)
  if (direction === 'out') {
    // Primera respuesta humana: primer saliente en una conversación derivada a un vendedor
    db.prepare(`
      UPDATE wa_conversations SET first_human_reply_at=strftime('%s','now')
      WHERE workspace_id=? AND contact_id=? AND bot_mode='human' AND assigned_user_id IS NOT NULL
        AND first_human_reply_at IS NULL AND handoff_at IS NOT NULL AND strftime('%s','now') - handoff_at > ?
    `).run(workspaceId, contactId, HANDOFF_GRACE_SECS)
  }
}

// Mensaje saliente visto por webhook (sale del teléfono, de ARIA o de una campaña): solo se
// registra si el chat corresponde a un contacto existente; no crea contactos.
function logOutgoingWa(workspaceId, sessionName, rawChatId) {
  if (!rawChatId || rawChatId.endsWith('@g.us') || rawChatId === 'status@broadcast') return
  const id = rawChatId.replace(/@(s\.whatsapp\.net|c\.us|lid)$/i, '')
  if (!/^\d+$/.test(id)) return
  const contact = db.prepare(`SELECT id FROM contacts WHERE workspace_id=? AND (phone=? OR attributes LIKE ?) LIMIT 1`)
    .get(workspaceId, id, `%"lid":"${id}"%`)
  if (contact) logWaEvent(workspaceId, contact.id, sessionName, 'out')
}

async function resolveDifyReply({ workspaceId, sessionName, rawChatId, from, body, pushName, realPhone }) {
  const contactId = upsertContactFromWA(workspaceId, rawChatId, pushName, realPhone)
  logWaEvent(workspaceId, contactId, sessionName, 'in')
  try { maybeCreateOpportunity(workspaceId, sessionName, contactId) } catch (e) { console.warn('⚠ [Lucas] crear oportunidad:', e.message) }
  // Antes del chequeo de modo humano: una respuesta a Tobías cuenta aunque la atienda un vendedor
  const campaignTouch = markCampaignReply(workspaceId, contactId)
  const activeAgent = resolveActiveAgent(workspaceId, sessionName)
  const CONV_TTL_SECS  = 30 * 60
  const HUMAN_TTL_SECS = 4 * 60 * 60

  // Cierre perezoso (fallback) + matching por contact_id — ya no se pierde la conversación
  // cuando WhatsApp entrega un chatId distinto (LID vs número real) para el mismo contacto.
  db.prepare(`
    UPDATE wa_conversations SET closed=1
    WHERE workspace_id=? AND session_name=? AND (contact_id=? OR wa_from=? OR wa_from=?) AND closed=0
      AND ((bot_mode='bot' AND (strftime('%s','now') - updated_at) > ?)
        OR (bot_mode='human' AND (strftime('%s','now') - updated_at) > ?))
  `).run(workspaceId, sessionName, contactId, rawChatId, from, CONV_TTL_SECS, HUMAN_TTL_SECS)

  let waConv = db.prepare(`
    SELECT * FROM wa_conversations
    WHERE workspace_id=? AND session_name=? AND (contact_id=? OR wa_from=? OR wa_from=?) AND closed=0
    ORDER BY updated_at DESC LIMIT 1
  `).get(workspaceId, sessionName, contactId, rawChatId, from)

  if (waConv?.bot_mode === 'human') {
    db.prepare("UPDATE wa_conversations SET updated_at=strftime('%s','now') WHERE request_id=?").run(waConv.request_id)
    console.log(`👤 [Dify] Modo humano — ignorado: ${from}`)
    return { skip: true, contactId }
  }

  // Campaña de Tobías configurada para que la respuesta la tome un vendedor (no el agente).
  // 'human' es el valor viejo de 'seller'. Va al último vendedor que atendió al contacto; si nunca
  // lo atendió nadie, a uno de los vendedores de derivación del agente.
  if (campaignTouch?.on_reply === 'seller' || campaignTouch?.on_reply === 'human') {
    const lastSeller = contactId && db.prepare(`
      SELECT wc.assigned_user_id FROM wa_conversations wc JOIN users u ON u.id=wc.assigned_user_id
      WHERE wc.workspace_id=? AND wc.contact_id=? ORDER BY wc.updated_at DESC LIMIT 1
    `).get(workspaceId, contactId)?.assigned_user_id
    const assignedUser = lastSeller || pickHandoffUser(workspaceId, activeAgent?.derivation_users)
    const rid = waConv?.request_id || `dify-${randomUUID()}`
    if (waConv) {
      db.prepare("UPDATE wa_conversations SET bot_mode='human', assigned_user_id=?, updated_at=strftime('%s','now') WHERE request_id=?").run(assignedUser, rid)
    } else {
      db.prepare(`
        INSERT INTO wa_conversations (id,workspace_id,session_name,wa_from,contact_id,request_id,closed,bot_mode,assigned_user_id,updated_at)
        VALUES (?,?,?,?,?,?,0,'human',?,strftime('%s','now'))
      `).run(randomUUID(), workspaceId, sessionName, rawChatId, contactId, rid, assignedUser)
    }
    const contact = contactId ? db.prepare('SELECT name FROM contacts WHERE id=?').get(contactId) : null
    db.prepare(`
      INSERT INTO tasks (id, workspace_id, title, description, lead_id, lead_name, assignee_id, priority, status)
      VALUES (?,?,?,?,?,?,?,'high','pending')
    `).run(randomUUID(), workspaceId, `Respondió a la campaña "${campaignTouch.name}" — tomalo`,
      `Le escribimos: "${campaignTouch.message}"\nRespondió: "${body}"`, contactId, contact?.name || pushName || null, assignedUser)
    notifyAssignedUser(workspaceId, assignedUser, { contactName: contact?.name || pushName || from, lastMessage: body })
    db.prepare('UPDATE campaign_recipients SET handed_off=1 WHERE id=?').run(campaignTouch.id)
    console.log(`📣 [Tobías] Respuesta de campaña derivada a vendedor: ${from} → ${assignedUser || 'sin asignar'}`)
    return { skip: true, contactId }
  }

  // Límite de créditos AI del plan: nunca se pierde el mensaje, pero el bot deja de
  // responder solo (pasa a modo humano) hasta el próximo mes o un upgrade de plan.
  if (getPlanAndUsage(workspaceId).messagesLimitReached) {
    const rid = waConv?.request_id || `dify-${randomUUID()}`
    if (!waConv) {
      db.prepare(`
        INSERT INTO wa_conversations (id,workspace_id,session_name,wa_from,contact_id,request_id,closed,bot_mode,updated_at)
        VALUES (?,?,?,?,?,?,0,'human',strftime('%s','now'))
      `).run(randomUUID(), workspaceId, sessionName, rawChatId, contactId, rid)
    } else {
      db.prepare("UPDATE wa_conversations SET bot_mode='human', updated_at=strftime('%s','now') WHERE request_id=?").run(rid)
    }
    console.log(`💳 [Billing] Límite de créditos AI alcanzado → modo humano: ws ${workspaceId}`)
    return { skip: true, contactId, creditsExhausted: true }
  }

  let requestId = waConv?.request_id
  let isNewConv = false
  if (!requestId) {
    isNewConv = true
    requestId = `dify-${randomUUID()}`
    db.prepare(`
      INSERT INTO wa_conversations (id,workspace_id,session_name,wa_from,contact_id,request_id,closed,updated_at)
      VALUES (?,?,?,?,?,?,0,strftime('%s','now'))
    `).run(randomUUID(), workspaceId, sessionName, rawChatId, contactId, requestId)
    waConv = { request_id: requestId, dify_conversation_id: null, bot_mode: 'bot' }
    console.log(`➕ [Dify] Nueva conv: ${requestId}`)
  } else {
    db.prepare(`UPDATE wa_conversations SET updated_at=strftime('%s','now'), contact_id=COALESCE(contact_id,?) WHERE request_id=?`)
      .run(contactId, requestId)
  }

  // Memoria entre sesiones: si es conversación nueva y el contacto ya tiene una nota
  // (dejada por el agente calificador "Lucas" en una sesión anterior), se la pasamos
  // como contexto interno — el TTL de 30 min sigue limpiando el historial de Dify a propósito.
  let effectiveBody = body
  if (isNewConv && contactId) {
    const c = db.prepare('SELECT note FROM contacts WHERE id=?').get(contactId)
    if (c?.note) {
      effectiveBody = `Contexto interno del CRM sobre este contacto (no lo menciones salvo que ayude a responder): ${c.note}\n---\nMensaje del contacto: ${body}`
    }
  }
  // El contacto responde a un mensaje saliente de Tobías: el agente tiene que saber qué
  // se le escribió, si no recibe un "sí, me interesa" sin saber a qué.
  if (isNewConv && campaignTouch) {
    effectiveBody = `Contexto interno: hace poco le escribimos a este contacto por una campaña (objetivo: ${campaignTouch.objective || 'retomar contacto'}). Mensaje que le enviamos: "${campaignTouch.message}". Ahora responde a ese mensaje.\n---\n${effectiveBody}`
  }
  // Membrete [ref:...] — permite que un agente agent-chat con la tool saveLeadData
  // sepa a qué contacto local de ARIA corresponde esta conversación, copiándolo tal
  // cual al llamar la tool (ver ensureAriaToolProvider/buildAriaSaveLeadTool).
  if (contactId) effectiveBody = `[ref:${contactId}]\n${effectiveBody}`

  const difyConvId = waConv.dify_conversation_id || extDifyConvId.get(requestId)
  let reply, difyConversationId
  if (activeAgent?.dify_api_key) {
    // Routing por canal: este canal tiene un agente Dify propio asignado — pegarle
    // directo con su API key, sin pasar por la config global de channel_settings.
    // Streaming siempre: las apps agent-chat (con tools) rechazan 'blocking'.
    const r = await callDifyChat(activeAgent.dify_api_key, { query: effectiveBody, conversationId: difyConvId, user: workspaceId })
    reply = r.answer
    difyConversationId = r.conversationId
  } else {
    ;({ text: reply, difyConversationId } = await callLLM({
      messages: [{ role: 'user', content: effectiveBody }],
      workspaceId, difyConversationId: difyConvId,
    }))
  }

  if (difyConversationId) {
    extDifyConvId.set(requestId, difyConversationId)
    db.prepare('UPDATE wa_conversations SET dify_conversation_id=? WHERE request_id=?').run(difyConversationId, requestId)
  }

  let finalReply = reply || '', handoff = false
  if (finalReply.includes('[HANDOFF]')) {
    finalReply = finalReply.replace(/\[HANDOFF\]/g, '').trim() || 'Un momento, te conecto con un asesor.'
    const assignedUser = pickHandoffUser(workspaceId, activeAgent?.derivation_users)
    db.prepare("UPDATE wa_conversations SET bot_mode='human', assigned_user_id=?, updated_at=strftime('%s','now') WHERE request_id=?").run(assignedUser, requestId)
    extDifyConvId.delete(requestId)
    handoff = true
    console.log(`👤 [Dify] HANDOFF detectado → modo humano`)
    const contact = contactId ? db.prepare('SELECT name FROM contacts WHERE id=?').get(contactId) : null
    notifyAssignedUser(workspaceId, assignedUser, { contactName: contact?.name, lastMessage: body })
  }

  if (finalReply) incrementMessageUsage(workspaceId)

  return { skip: false, requestId, contactId, reply: finalReply, handoff }
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

  // Al desactivar (sin bot seleccionado), limpiar también las credenciales Dify
  // "pegadas" en llm_provider/llm_api_key — si no, el webhook de WAHA sigue
  // respondiendo vía el path directo a Dify aunque no haya bot activo.
  db.prepare(`
    INSERT INTO channel_settings (workspace_id, default_bot_id, llm_provider, llm_api_key, llm_model, updated_at)
    VALUES (?, ?, NULL, NULL, NULL, strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE SET
      default_bot_id=excluded.default_bot_id,
      llm_provider=CASE WHEN llm_provider='dify' THEN NULL ELSE llm_provider END,
      llm_api_key=CASE WHEN llm_provider='dify' THEN NULL ELSE llm_api_key END,
      llm_model=CASE WHEN llm_provider='dify' THEN NULL ELSE llm_model END,
      updated_at=excluded.updated_at
  `).run(workspaceId, default_bot_id || null)
  res.json({ ok: true })
})

// ── Lucas — agente calificador (toggle + lecturas) ────────────────────────────
app.get('/api/ai-scoring/settings', requireAriaAuth, (req, res) => {
  const s = db.prepare('SELECT ai_scoring_enabled FROM channel_settings WHERE workspace_id=?').get(req.ariaUser.workspaceId)
  res.json({ enabled: !!(s?.ai_scoring_enabled) })
})

app.put('/api/ai-scoring/settings', requireAriaAuth, (req, res) => {
  const { enabled } = req.body || {}
  db.prepare(`
    INSERT INTO channel_settings (workspace_id, ai_scoring_enabled, updated_at) VALUES (?,?,strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE SET ai_scoring_enabled=excluded.ai_scoring_enabled, updated_at=excluded.updated_at
  `).run(req.ariaUser.workspaceId, enabled ? 1 : 0)
  res.json({ ok: true })
})

// Tablero de Lucas: métricas del período y del período anterior de igual duración (para la variación).
app.get('/api/lucas/metrics', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const now = Math.floor(Date.now() / 1000)
  const to = parseInt(req.query.to, 10) || now
  const from = parseInt(req.query.from, 10) || to - 30 * 86400
  const span = to - from
  const count = (a, b) => db.prepare('SELECT COUNT(*) AS n FROM wa_conversations WHERE workspace_id=? AND created_at BETWEEN ? AND ?')
    .get(wsId, a, b).n
  // Score promedio de los contactos calificados por Lucas en el rango (null si no hubo ninguno)
  const avgScore = (a, b) => {
    const v = db.prepare('SELECT AVG(score) AS v FROM lead_scores WHERE workspace_id=? AND updated_at BETWEEN ? AND ?').get(wsId, a, b).v
    return v == null ? null : Math.round(v)
  }
  res.json({
    from, to,
    conversations_created: { current: count(from, to), previous: count(from - span - 1, from - 1) },
    avg_score: { current: avgScore(from, to), previous: avgScore(from - span - 1, from - 1) },
  })
})

// Volumen diario: leads calificados por día (según su última calificación) por temperatura + score promedio.
// Los días se arman en hora del negocio.
app.get('/api/lucas/daily', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const now = Math.floor(Date.now() / 1000)
  const to = parseInt(req.query.to, 10) || now
  const from = parseInt(req.query.from, 10) || to - 30 * 86400
  const rows = db.prepare('SELECT temperature, score, updated_at FROM lead_scores WHERE workspace_id=? AND updated_at BETWEEN ? AND ?')
    .all(wsId, from, to)
  const days = {}
  for (const r of rows) {
    const p = businessParts(r.updated_at * 1000)
    const key = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
    const d = days[key] || (days[key] = { day: key, frio: 0, tibio: 0, caliente: 0, _sum: 0, _n: 0 })
    if (d[r.temperature] != null) d[r.temperature]++
    d._sum += r.score || 0; d._n++
  }
  res.json(Object.values(days).sort((a, b) => a.day.localeCompare(b.day))
    .map(({ _sum, _n, ...d }) => ({ ...d, avg_score: _n ? Math.round(_sum / _n) : null })))
})

// Calidad por origen: leads calificados en el período agrupados por anuncio de origen.
app.get('/api/lucas/origins', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const now = Math.floor(Date.now() / 1000)
  const to = parseInt(req.query.to, 10) || now
  const from = parseInt(req.query.from, 10) || to - 30 * 86400
  const rows = db.prepare(`
    SELECT c.attributes, ls.temperature, ls.score FROM lead_scores ls JOIN contacts c ON c.id=ls.contact_id
    WHERE ls.workspace_id=? AND ls.updated_at BETWEEN ? AND ? AND c.attributes LIKE '%"origin"%'
  `).all(wsId, from, to)
  const groups = {}
  for (const r of rows) {
    let o = null
    try { o = JSON.parse(r.attributes || '{}').origin } catch {}
    if (!o) continue
    const key = o.source_id || o.title || 'Anuncio sin nombre'
    const g = groups[key] || (groups[key] = { origin: o.title || o.source_id || 'Anuncio sin nombre', source_url: o.source_url, leads: 0, hot: 0, _sum: 0 })
    g.leads++; g._sum += r.score || 0
    if (r.temperature === 'caliente') g.hot++
  }
  res.json(Object.values(groups)
    .map(({ _sum, ...g }) => ({ ...g, avg_score: Math.round(_sum / g.leads), hot_pct: Math.round((g.hot / g.leads) * 1000) / 10 }))
    .sort((a, b) => b.avg_score - a.avg_score))
})

// Smart Tags: etiquetas configuradas en el workspace y cuántos contactos tienen asignada cada una.
app.get('/api/lucas/tags', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const labels = db.prepare('SELECT id, title, color FROM labels WHERE workspace_id=? ORDER BY created_at').all(wsId)
  const counts = Object.fromEntries(labels.map(l => [l.id, 0]))
  for (const r of db.prepare("SELECT tags FROM contacts WHERE workspace_id=? AND tags IS NOT NULL AND tags != '[]'").all(wsId)) {
    let tags = []
    try { tags = JSON.parse(r.tags || '[]') } catch {}
    const vals = new Set(tags.flatMap(t => (t && typeof t === 'object') ? [t.id, t.title, t.name] : [t]))
    for (const l of labels) if (vals.has(l.id) || vals.has(l.title)) counts[l.id]++
  }
  res.json(labels.map(l => ({ id: l.id, tag: l.title, color: l.color, count: counts[l.id] }))
    .sort((a, b) => b.count - a.count))
})

// Leads calientes recientes: los de mayor temperatura del período, más recientes primero.
app.get('/api/lucas/hot', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const now = Math.floor(Date.now() / 1000)
  const to = parseInt(req.query.to, 10) || now
  const from = parseInt(req.query.from, 10) || to - 30 * 86400
  res.json(db.prepare(`
    SELECT ls.contact_id, ls.score, ls.reasoning, ls.updated_at, c.name, c.phone
    FROM lead_scores ls JOIN contacts c ON c.id=ls.contact_id
    WHERE ls.workspace_id=? AND ls.temperature='caliente' AND ls.updated_at BETWEEN ? AND ?
    ORDER BY ls.updated_at DESC, ls.score DESC LIMIT 10
  `).all(wsId, from, to))
})

// Período opcional (?from=&to= en epoch segundos) sobre la fecha de la última calificación
function scoringRange(req) {
  return [parseInt(req.query.from, 10) || 0, parseInt(req.query.to, 10) || 4102444800]
}

app.get('/api/ai-scoring/summary', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT temperature, count(*) n FROM lead_scores WHERE workspace_id=? AND updated_at BETWEEN ? AND ? GROUP BY temperature')
    .all(req.ariaUser.workspaceId, ...scoringRange(req))
  const out = { frio: 0, tibio: 0, caliente: 0 }
  rows.forEach(r => { out[r.temperature] = r.n })
  res.json(out)
})

app.get('/api/ai-scoring/scores', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT contact_id, temperature, score FROM lead_scores WHERE workspace_id=?').all(req.ariaUser.workspaceId)
  const map = {}
  rows.forEach(r => { map[r.contact_id] = { temperature: r.temperature, score: r.score } })
  res.json(map)
})

app.get('/api/ai-scoring/top', requireAriaAuth, (req, res) => {
  const limit = Number(req.query.limit) || 10
  const rows = db.prepare(`
    SELECT ls.contact_id, ls.temperature, ls.score, ls.reasoning, ls.updated_at, c.name, c.phone
    FROM lead_scores ls JOIN contacts c ON c.id = ls.contact_id
    WHERE ls.workspace_id=? AND ls.updated_at BETWEEN ? AND ? ORDER BY ls.score DESC LIMIT ?
  `).all(req.ariaUser.workspaceId, ...scoringRange(req), limit)
  res.json(rows)
})

// Disparo manual: importa el historial de WAHA que todavía no estaba rastreado y arranca
// varias tandas de calificación ya mismo (el resto del backlog lo sigue drenando el cron
// de 5 min solo, sin que el usuario tenga que quedarse clickeando).
app.post('/api/ai-scoring/run-now', requireAriaAuth, async (req, res) => {
  const workspaceId = req.ariaUser.workspaceId
  ;(async () => {
    try { await runLucasFull(workspaceId) }
    catch (e) { console.error('⚠ [Lucas] run-now error:', e.message) }
  })()
  res.json({ ok: true })
})

// Etapas de los embudos del workspace que tienen criterio para la IA (Embudos > Configurar > Etapa)
function stagesWithCriteria(workspaceId) {
  const out = []
  for (const f of db.prepare('SELECT name, stages FROM funnels WHERE workspace_id=? ORDER BY sort_order, created_at').all(workspaceId)) {
    let stages = []
    try { stages = JSON.parse(f.stages || '[]') } catch {}
    for (const st of stages) if (st?.criteria?.trim()) out.push({ funnel: f.name, id: st.id, label: st.label, criteria: st.criteria.trim() })
  }
  return out
}

// Crear oportunidad al primer contacto por un canal habilitado: entra en la primera etapa del
// primer embudo, solo si el contacto todavía no tiene oportunidad.
function maybeCreateOpportunity(workspaceId, sessionName, contactId) {
  if (!contactId) return
  const { opportunities } = lucasConfig(workspaceId)
  if (!opportunities.create || !opportunities.channels.length) return
  const inst = db.prepare('SELECT id FROM channel_instances WHERE workspace_id=? AND (session_name=? OR instance_name=?) LIMIT 1')
    .get(workspaceId, sessionName, sessionName)
  if (!inst || !opportunities.channels.includes(inst.id)) return
  if (db.prepare('SELECT 1 FROM funnel_stages WHERE workspace_id=? AND lead_id=?').get(workspaceId, contactId)) return
  const f = db.prepare('SELECT stages FROM funnels WHERE workspace_id=? ORDER BY sort_order, created_at LIMIT 1').get(workspaceId)
  let first = 'prospecto'
  try { first = JSON.parse(f?.stages || '[]')[0]?.id || first } catch {}
  db.prepare("INSERT INTO funnel_stages (workspace_id, lead_id, stage, lead_status, updated_at) VALUES (?,?,?,'open',strftime('%s','now'))")
    .run(workspaceId, contactId, first)
  console.log(`🎯 [Lucas] Oportunidad creada automáticamente: ${contactId} → ${first}`)
}

// ── Dashboard: métricas del período (y del período anterior de igual duración) ──
app.get('/api/dashboard/metrics', requireAriaAuth, (req, res) => {
  const ws = req.ariaUser.workspaceId
  const now = Math.floor(Date.now() / 1000)
  const to = parseInt(req.query.to, 10) || now
  const from = parseInt(req.query.from, 10) || to - 7 * 86400
  const span = to - from
  const pair = fn => ({ current: fn(from, to), previous: fn(from - span - 1, from - 1) })
  // Conversación activa = tuvo mensajes (actividad) dentro del rango
  const activeConvs = (a, b) => db.prepare('SELECT COUNT(*) AS n FROM wa_conversations WHERE workspace_id=? AND updated_at BETWEEN ? AND ?').get(ws, a, b).n
  const hotLeads = (a, b) => db.prepare("SELECT COUNT(*) AS n FROM lead_scores WHERE workspace_id=? AND temperature='caliente' AND updated_at BETWEEN ? AND ?").get(ws, a, b).n
  // Tibios con una conversación abierta ahora mismo (no depende del rango)
  const warmInConversation = db.prepare(`SELECT COUNT(DISTINCT ls.contact_id) AS n FROM lead_scores ls
    JOIN wa_conversations wc ON wc.workspace_id=ls.workspace_id AND wc.contact_id=ls.contact_id AND wc.closed=0
    WHERE ls.workspace_id=? AND ls.temperature='tibio'`).get(ws).n
  // Primera respuesta: por cada conversación iniciada en el rango, tiempo entre el primer mensaje del
  // cliente y la primera respuesta nuestra (bot o persona). Se informa la mediana, en segundos.
  const firstInStmt = db.prepare("SELECT at FROM wa_message_events WHERE workspace_id=? AND contact_id=? AND direction='in' AND at >= ? ORDER BY at LIMIT 1")
  const firstOutStmt = db.prepare("SELECT at, actor FROM wa_message_events WHERE workspace_id=? AND contact_id=? AND direction='out' AND at >= ? ORDER BY at LIMIT 1")
  const median = times => {
    if (!times.length) return null
    times.sort((x, y) => x - y)
    const mid = Math.floor(times.length / 2)
    return times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2)
  }
  const firstReplyStats = (a, b) => {
    const all = [], human = [], bot = []
    for (const c of db.prepare('SELECT contact_id, created_at FROM wa_conversations WHERE workspace_id=? AND contact_id IS NOT NULL AND created_at BETWEEN ? AND ?').all(ws, a, b)) {
      const fin = firstInStmt.get(ws, c.contact_id, c.created_at - 60)
      if (!fin) continue
      const fout = firstOutStmt.get(ws, c.contact_id, fin.at)
      if (!fout) continue
      const t = fout.at - fin.at
      all.push(t); (fout.actor === 'human' ? human : bot).push(t)
    }
    return { all: median(all), human: median(human), bot: median(bot) }
  }
  const medianFirstReply = (a, b) => firstReplyStats(a, b).all
  // Cierres: oportunidades marcadas como ganadas (o en la etapa "cerrado") dentro del rango
  const wonInRange = (a, b) => db.prepare(`SELECT COUNT(*) AS n FROM funnel_stages
    WHERE workspace_id=? AND (lead_status='won' OR stage='cerrado') AND updated_at BETWEEN ? AND ?`).get(ws, a, b).n
  // Contactabilidad: % de conversaciones con actividad en el rango donde hubo ida y vuelta
  // (al menos un mensaje del contacto y uno nuestro dentro del rango).
  const contactability = (a, b) => {
    const convs = db.prepare('SELECT DISTINCT contact_id FROM wa_conversations WHERE workspace_id=? AND contact_id IS NOT NULL AND updated_at BETWEEN ? AND ?').all(ws, a, b)
    if (!convs.length) return { pct: null, total: 0 }
    const dirs = db.prepare('SELECT DISTINCT direction FROM wa_message_events WHERE workspace_id=? AND contact_id=? AND at BETWEEN ? AND ?')
    const reached = convs.filter(c => dirs.all(ws, c.contact_id, a, b).length === 2).length
    return { pct: Math.round((reached / convs.length) * 1000) / 10, total: convs.length, reached }
  }
  // Embudo comercial: oportunidades abiertas por etapa (ahora) + ganadas/perdidas en el rango
  const funnelSummary = () => {
    const seen = new Map()
    for (const f of db.prepare('SELECT stages FROM funnels WHERE workspace_id=? ORDER BY sort_order, created_at').all(ws)) {
      let st = []
      try { st = JSON.parse(f.stages || '[]') } catch {}
      for (const x of st) if (!seen.has(x.id)) seen.set(x.id, { id: x.id, label: x.label, color: x.color, count: 0 })
    }
    for (const r of db.prepare(`SELECT stage, COUNT(*) AS n FROM funnel_stages
      WHERE workspace_id=? AND lead_status='open' AND stage NOT IN ('cerrado','descartado') GROUP BY stage`).all(ws)) {
      const st = seen.get(r.stage) || { id: r.stage, label: r.stage, color: '#6366f1', count: 0 }
      st.count = r.n; seen.set(r.stage, st)
    }
    const lost = db.prepare(`SELECT COUNT(*) AS n FROM funnel_stages
      WHERE workspace_id=? AND (lead_status='lost' OR stage='descartado') AND updated_at BETWEEN ? AND ?`).get(ws, from, to).n
    const won = wonInRange(from, to)
    const stages = [...seen.values()].filter(x => !['cerrado', 'descartado'].includes(x.id))
    return { won, lost, open: stages.reduce((n, x) => n + x.count, 0), stages }
  }
  // Conversaciones con respuesta del período: las 5 más recientes con ida y vuelta
  const recentExchanges = () => {
    const rows = db.prepare(`SELECT wc.contact_id, MAX(wc.updated_at) AS last_at, c.name, c.phone FROM wa_conversations wc
      JOIN contacts c ON c.id=wc.contact_id
      WHERE wc.workspace_id=? AND wc.updated_at BETWEEN ? AND ? GROUP BY wc.contact_id ORDER BY last_at DESC LIMIT 50`).all(ws, from, to)
    const out = []
    for (const r of rows) {
      const fin = db.prepare("SELECT at FROM wa_message_events WHERE workspace_id=? AND contact_id=? AND direction='in' AND at BETWEEN ? AND ? ORDER BY at LIMIT 1").get(ws, r.contact_id, from, to)
      if (!fin) continue
      const fout = db.prepare("SELECT at, actor FROM wa_message_events WHERE workspace_id=? AND contact_id=? AND direction='out' AND at >= ? ORDER BY at LIMIT 1").get(ws, r.contact_id, fin.at)
      if (!fout) continue
      out.push({ contact_id: r.contact_id, name: r.name || r.phone, last_at: r.last_at, reply_secs: fout.at - fin.at, by: fout.actor })
      if (out.length >= 5) break
    }
    return out
  }
  // Conversaciones creadas por día (hora del negocio): serie diaria, total, promedio diario y día pico
  const createdPerDay = () => {
    const counts = {}
    for (const r of db.prepare('SELECT created_at FROM wa_conversations WHERE workspace_id=? AND created_at BETWEEN ? AND ?').all(ws, from, to)) {
      const p = businessParts(r.created_at * 1000)
      const key = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
      counts[key] = (counts[key] || 0) + 1
    }
    // Serie completa del rango (los días sin conversaciones van en 0)
    const days = []
    const start = businessParts(from * 1000), end = businessParts(to * 1000)
    const endKey = `${end.y}-${String(end.m).padStart(2, '0')}-${String(end.d).padStart(2, '0')}`
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.UTC(start.y, start.m - 1, start.d + i))
      const key = d.toISOString().slice(0, 10)
      days.push({ day: key, count: counts[key] || 0 })
      if (key >= endKey) break
    }
    const total = days.reduce((n, d) => n + d.count, 0)
    const peak = days.reduce((best, d) => (d.count > (best?.count || 0) ? d : best), null)
    return { total, daily_avg: days.length ? Math.round((total / days.length) * 10) / 10 : 0, peak_day: peak, days }
  }
  // Tiempo de respuesta promedio: por contacto, cada tanda de mensajes del cliente se mide desde su
  // primer mensaje hasta nuestra siguiente respuesta.
  const avgResponse = (a, b) => {
    const evs = db.prepare('SELECT contact_id, direction, at FROM wa_message_events WHERE workspace_id=? AND at BETWEEN ? AND ? ORDER BY contact_id, at').all(ws, a, b)
    let sum = 0, n = 0, waitingSince = null, cur = null
    for (const e of evs) {
      if (e.contact_id !== cur) { cur = e.contact_id; waitingSince = null }
      if (e.direction === 'in') { if (waitingSince == null) waitingSince = e.at }
      else if (waitingSince != null) { sum += e.at - waitingSince; n++; waitingSince = null }
    }
    return n ? Math.round(sum / n) : null
  }
  res.json({
    from, to, active_conversations: pair(activeConvs), hot_leads: pair(hotLeads), warm_in_conversation: warmInConversation,
    first_reply_median: pair(medianFirstReply), avg_response_time: pair(avgResponse),
    first_reply_split: (({ human, bot }) => ({ human, bot }))(firstReplyStats(from, to)),
    exchange_conversations: contactability(from, to).reached || 0,
    recent_exchanges: recentExchanges(),
    created_per_day: createdPerDay(),
    // Impacto de Aria: trabajo que hicieron los agentes de IA dentro del rango
    ai_impact: {
      bot_replies: db.prepare("SELECT COUNT(*) AS n FROM wa_message_events WHERE workspace_id=? AND direction='out' AND actor='bot' AND at BETWEEN ? AND ?").get(ws, from, to).n,
      leads_scored: db.prepare('SELECT COUNT(*) AS n FROM lead_scores WHERE workspace_id=? AND updated_at BETWEEN ? AND ?').get(ws, from, to).n,
      campaign_messages: db.prepare("SELECT COUNT(*) AS n FROM campaign_recipients WHERE workspace_id=? AND status IN ('sent','replied') AND sent_at BETWEEN ? AND ?").get(ws, from, to).n,
      analyses: db.prepare("SELECT COUNT(*) AS n FROM axel_analyses WHERE workspace_id=? AND status='done' AND created_at BETWEEN ? AND ?").get(ws, from, to).n,
    },
    // Priorización con IA: conversaciones abiertas con temperatura y score de Lucas
    scoring_enabled: !!db.prepare('SELECT ai_scoring_enabled FROM channel_settings WHERE workspace_id=?').get(ws)?.ai_scoring_enabled,
    prioritized: db.prepare(`SELECT DISTINCT ls.contact_id, ls.temperature, ls.score, ls.reasoning, c.name, c.phone
      FROM lead_scores ls JOIN contacts c ON c.id=ls.contact_id
      JOIN wa_conversations wc ON wc.workspace_id=ls.workspace_id AND wc.contact_id=ls.contact_id AND wc.closed=0
      WHERE ls.workspace_id=? ORDER BY ls.score DESC LIMIT 10`).all(ws),
    closes: pair(wonInRange),
    contactability: pair((a, b) => contactability(a, b).pct),
    contactability_base: contactability(from, to).total,
    funnel: funnelSummary(),
    // Tasa de cierre: ganadas sobre las oportunidades que se movieron en el período
    close_rate: (() => {
      const touched = db.prepare('SELECT COUNT(*) AS n FROM funnel_stages WHERE workspace_id=? AND updated_at BETWEEN ? AND ?').get(ws, from, to).n
      return touched ? Math.round((wonInRange(from, to) / touched) * 1000) / 10 : null
    })(),
  })
})

// ── Dashboard: configuración inicial (5 pasos) ────────────────────────────────
app.get('/api/onboarding', requireAriaAuth, (req, res) => {
  const ws = req.ariaUser.workspaceId
  const n = (sql, ...p) => db.prepare(sql).get(ws, ...p).n
  const steps = {
    account:  true,
    agent:    n('SELECT COUNT(*) AS n FROM dify_agents WHERE workspace_id=?') > 0,
    channel:  n('SELECT COUNT(*) AS n FROM channel_instances WHERE workspace_id=?') > 0,
    // El embudo "Principal" se crea solo: cuenta como hecho si hay otro embudo o alguna oportunidad cargada
    funnel:   n('SELECT COUNT(*) AS n FROM funnels WHERE workspace_id=?') > 1 || n('SELECT COUNT(*) AS n FROM funnel_stages WHERE workspace_id=?') > 0,
    team:     n('SELECT COUNT(*) AS n FROM users WHERE workspace_id=?') > 1 || n('SELECT COUNT(*) AS n FROM invites WHERE workspace_id=?') > 0,
  }
  res.json({ steps, done: Object.values(steps).filter(Boolean).length, total: 5 })
})

// ── Lucas — configuración ─────────────────────────────────────────────────────
const LUCAS_DEFAULT_RATING = {
  caliente: `El lead mostró alta intención de compra o urgencia real.
Clasificar como HOT cuando:
- Pregunta por precios, planes o cotizaciones
- Solicita presupuesto o cotización
- Habla de implementación o onboarding
- Expresa urgencia temporal ("esta semana", "este mes", etc.)
- Menciona que está comparando proveedores activamente
- Involucra decisores
- Quiere avanzar al siguiente paso comercial`,
  tibio: `El lead tiene interés genuino pero todavía está evaluando.
Clasificar como WARM cuando:
- Hace preguntas funcionales o generales del producto
- Solicita más información sin compromiso inmediato
- Tiene un problema identificado pero sin urgencia clara
- Evalúa opciones o investiga alternativas
- Responde positivamente pero sin intención inmediata de compra
- Menciona implementación futura o a mediano plazo`,
  frio: `El lead tiene bajo interés, baja prioridad o poca interacción.
Clasificar como COLD cuando:
- Solo está investigando o explorando
- No muestra señales claras de intención de compra
- Responde de forma corta o inconsistente
- No responde durante varios días
- Dice que no es prioridad actualmente
- No demuestra necesidad concreta
- La conversación no avanza comercialmente`,
}

const LUCAS_DEFAULT_SCORING = `+20 puntos si el lead pregunta por precios, planes o cotización
+15 puntos si solicita presupuesto o cotización
+20 puntos si solicita una propuesta comercial
+15 puntos si habla de implementación, onboarding o integración
+15 puntos si expresa urgencia clara ("lo necesitamos este mes", "esta semana", etc.)
+10 puntos si describe un problema o pain específico
+10 puntos si involucra decisores
+10 puntos si menciona alto volumen de usuarios o necesidad enterprise
+15 puntos si compara competidores o alternativas
+15 puntos por respuestas positivas o señales claras de interés
-10 puntos si dice que solo está investigando
-10 puntos si no hay decisor involucrado
-10 puntos si menciona que no es prioridad actualmente
-15 puntos si expresa objeciones fuertes sobre precio
-15 puntos si no tiene presupuesto confirmado
-20 puntos si deja de responder por varios días luego de mostrar interés
-25 puntos si no encaja con el perfil de cliente ideal
-30 puntos si expresa desinterés explícito o pide no ser contactado`

function lucasConfig(workspaceId) {
  const cs = db.prepare('SELECT lucas_schedule, lucas_opportunities, lucas_smart_tags, lucas_rating FROM channel_settings WHERE workspace_id=?').get(workspaceId)
  let schedule = null, opportunities = null, smartTags = null, rating = null
  try { rating = cs?.lucas_rating ? JSON.parse(cs.lucas_rating) : null } catch {}
  try { smartTags = cs?.lucas_smart_tags ? JSON.parse(cs.lucas_smart_tags) : null } catch {}
  try { schedule = cs?.lucas_schedule ? JSON.parse(cs.lucas_schedule) : null } catch {}
  try { opportunities = cs?.lucas_opportunities ? JSON.parse(cs.lucas_opportunities) : null } catch {}
  return {
    schedule: { enabled: false, time: '08:00', ...(schedule || {}) },
    opportunities: { move: true, create: false, channels: [], ...(opportunities || {}) },
    smart_tags: { enabled: false, ...(smartTags || {}) },
    rating: { enabled: true, icp: LUCAS_DEFAULT_SCORING, ...(rating || {}), criteria: { ...LUCAS_DEFAULT_RATING, ...(rating?.criteria || {}) } },
  }
}

app.get('/api/lucas/config', requireAriaAuth, (req, res) => res.json(lucasConfig(req.ariaUser.workspaceId)))

// Cada sección se guarda por separado: solo se actualiza lo que viene en el body
app.put('/api/lucas/config', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  if (!db.prepare('SELECT 1 FROM channel_settings WHERE workspace_id=?').get(wsId)) {
    db.prepare('INSERT INTO channel_settings (workspace_id) VALUES (?)').run(wsId)
  }
  const sc = req.body?.schedule
  if (sc) {
    const time = /^\d{2}:\d{2}$/.test(sc.time || '') ? sc.time : '08:00'
    db.prepare('UPDATE channel_settings SET lucas_schedule=? WHERE workspace_id=?').run(JSON.stringify({ enabled: !!sc.enabled, time }), wsId)
  }
  const rt = req.body?.rating
  if (rt) {
    const criteria = {}
    for (const k of ['caliente', 'tibio', 'frio']) criteria[k] = String(rt.criteria?.[k] ?? LUCAS_DEFAULT_RATING[k]).slice(0, 3000)
    const icp = String(rt.icp ?? LUCAS_DEFAULT_SCORING).slice(0, 4000)
    db.prepare('UPDATE channel_settings SET lucas_rating=? WHERE workspace_id=?').run(JSON.stringify({ enabled: !!rt.enabled, criteria, icp }), wsId)
  }
  const st = req.body?.smart_tags
  if (st) db.prepare('UPDATE channel_settings SET lucas_smart_tags=? WHERE workspace_id=?').run(JSON.stringify({ enabled: !!st.enabled }), wsId)
  const op = req.body?.opportunities
  if (op) {
    const ownIds = new Set(db.prepare('SELECT id FROM channel_instances WHERE workspace_id=?').all(wsId).map(r => r.id))
    const channels = (Array.isArray(op.channels) ? op.channels : []).filter(id => ownIds.has(id))
    db.prepare('UPDATE channel_settings SET lucas_opportunities=? WHERE workspace_id=?')
      .run(JSON.stringify({ move: op.move !== false, create: !!op.create, channels }), wsId)
  }
  res.json(lucasConfig(wsId))
})

// Análisis completo de un workspace: suma el historial de WAHA que falte, vuelve a poner en cola
// las conversaciones con actividad posterior a su última calificación y procesa varias tandas.
async function runLucasFull(workspaceId) {
  const { inserted } = await backfillWahaConversations(workspaceId)
  if (inserted > 0) console.log(`📥 [Lucas] ${inserted} conversaciones del historial sumadas a la cola de análisis`)
  const requeued = db.prepare(`UPDATE wa_conversations SET scored_at=NULL, score_attempts=0
    WHERE workspace_id=? AND closed=1 AND scored_at IS NOT NULL AND updated_at > scored_at`).run(workspaceId).changes
  if (requeued) console.log(`🔁 [Lucas] ${requeued} conversaciones con actividad nueva vuelven a calificarse`)
  for (let i = 0; i < 5; i++) await sweepAndScoreConversations()
}

// Ejecución programada: una vez por día, a partir de la hora configurada (hora del negocio)
let lucasScheduleRunning = false
async function runLucasSchedules() {
  if (lucasScheduleRunning) return
  const p = businessParts(Date.now())
  const nowHHMM = `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`
  const today = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
  lucasScheduleRunning = true
  try {
    for (const row of db.prepare(`SELECT workspace_id, lucas_last_run FROM channel_settings
      WHERE ai_scoring_enabled=1 AND lucas_schedule LIKE '%"enabled":true%'`).all()) {
      const { schedule } = lucasConfig(row.workspace_id)
      if (row.lucas_last_run === today || nowHHMM < schedule.time) continue
      db.prepare('UPDATE channel_settings SET lucas_last_run=? WHERE workspace_id=?').run(today, row.workspace_id)
      console.log(`🧠 [Lucas] Ejecución programada (${schedule.time}) en workspace ${row.workspace_id}`)
      await runLucasFull(row.workspace_id)
    }
  } finally { lucasScheduleRunning = false }
}
setInterval(() => { runLucasSchedules().catch(e => console.error('⚠ [Lucas] programación:', e.message)) }, 5 * 60 * 1000)

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
  const usage = getPlanAndUsage(req.ariaUser.workspaceId)
  if (usage.whatsappLimitReached) {
    return res.status(403).json({ error: `Llegaste al límite de números de WhatsApp de tu plan (${usage.plan.name}: ${usage.plan.max_whatsapp_numbers}) — actualizá tu plan para conectar más.` })
  }
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

// Asignar un agente Dify a un canal específico (routing por canal, en vez del bot global único)
app.put('/api/channels/instances/:id/bot', requireAriaAuth, (req, res) => {
  const { bot_id } = req.body || {}
  const inst = db.prepare('SELECT id FROM channel_instances WHERE id=? AND workspace_id=?')
    .get(req.params.id, req.ariaUser.workspaceId)
  if (!inst) return res.status(404).json({ error: 'Instancia no encontrada' })
  db.prepare('UPDATE channel_instances SET bot_id=? WHERE id=?').run(bot_id || null, req.params.id)
  res.json({ ok: true })
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

  // Salientes (message.any con fromMe): solo se registran para las métricas de Axel
  if (payload?.event === 'message.any' && payload.payload?.fromMe) {
    const inst = payload.session && db.prepare("SELECT workspace_id FROM channel_instances WHERE session_name=? AND provider='waha'").get(payload.session)
    const m = payload.payload
    if (inst) { try { logOutgoingWa(inst.workspace_id, payload.session, m.to || m.chatId) } catch (e) { console.warn('⚠ [Axel] log saliente:', e.message) } }
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
  const originContactId = upsertContactFromWA(inst.workspace_id, rawChatId, pushName, realPhone)
  try { saveContactAdOrigin(originContactId, msg) } catch (e) { console.warn('⚠ [Lucas] origen:', e.message) }

  // ── Path directo: WAHA → Dify (sin Tiledesk) ────────────────────────────────
  // Entra si este canal tiene un agente propio asignado (routing por canal) o si
  // el workspace tiene Dify configurado como proveedor global (compatibilidad).
  const llmCfg = db.prepare('SELECT llm_provider, llm_api_key FROM channel_settings WHERE workspace_id=?').get(inst.workspace_id)
  const channelAgent = resolveActiveAgent(inst.workspace_id, sessionName)
  if (channelAgent?.dify_api_key || (llmCfg?.llm_provider === 'dify' && llmCfg?.llm_api_key)) {
    try {
      const result = await resolveDifyReply({ workspaceId: inst.workspace_id, sessionName, rawChatId, from, body, pushName, realPhone })
      if (result.skip || !result.reply) return

      const waSettings = getChannelSettings(inst.workspace_id)
      const chatId = rawChatId.includes('@') ? rawChatId : `${rawChatId}@c.us`
      await fetch(`${waSettings.waha_url}/api/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': waSettings.waha_key || '' },
        body: JSON.stringify({ chatId, text: result.reply, session: sessionName }),
      })
      console.log(`✓ [Dify direct] → ${chatId} | ${result.reply.slice(0, 50)}`)
      sseEmit(inst.workspace_id, { event: 'new-message', requestId: result.requestId, from, name, text: body })
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
  if (key.fromMe) {  // propios: solo se registran para las métricas de Axel
    try { logOutgoingWa(inst.workspace_id, instanceName, key.remoteJid || '') } catch (e) { console.warn('⚠ [Axel] log saliente:', e.message) }
    return
  }

  const rawChatId = key.remoteJid || ''
  if (!rawChatId || rawChatId === 'status@broadcast' || rawChatId.endsWith('@g.us')) return

  const body = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || ''
  if (!body) return

  const from     = rawChatId.replace(/@(s\.whatsapp\.net|c\.us)$/i, '')
  const pushName = msgData.pushName || null
  const contactRow2 = from ? db.prepare('SELECT name FROM contacts WHERE phone=? LIMIT 1').get(from) : null
  const name     = pushName || contactRow2?.name || from

  console.log(`📨 evogo: ${from} → ${body.slice(0, 50)}`)

  try {
    // resolveDifyReply llama a upsertContactFromWA internamente (evogo no tiene SenderAlt → realPhone=null)
    const result = await resolveDifyReply({ workspaceId: inst.workspace_id, sessionName: instanceName, rawChatId, from, body, pushName, realPhone: null })
    if (result.skip) {
      sseEmit(inst.workspace_id, { event: 'new-message', from, name, text: body })
      return
    }
    if (!result.reply) return

    const settings = getChannelSettings(inst.workspace_id)
    const evoUrl = settings.evo_url || process.env.EVO_URL || ''
    const number = from.replace(/\D/g, '')
    await fetch(`${evoUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': inst.instance_token },
      body: JSON.stringify({ number, text: result.reply }),
    })
    console.log(`✓ evogo → ${from}: ${result.reply.slice(0, 50)}`)
    sseEmit(inst.workspace_id, { event: 'new-message', requestId: result.requestId, from, name, text: body })
  } catch (e) {
    console.error('⚠ evogo webhook error:', e.message)
  }
})

// ── Tool de Dify (agent-chat): guarda en vivo datos de contacto detectados en la charla ──
// Llamada por el propio agente Dify vía tool-calling, no por un usuario de ARIA — sin auth de
// sesión, scoped por workspaceId en la URL (fijo en el tool provider, no lo decide el LLM).
app.post('/api/tools/:workspaceId/save-lead-data', (req, res) => {
  const { workspaceId } = req.params
  const { ref, email, company, phone, note } = req.body || {}
  if (!ref) return res.json({ result: 'Falta el parámetro ref, no se guardó nada.' })

  const contact = db.prepare('SELECT * FROM contacts WHERE id=? AND workspace_id=?').get(ref, workspaceId)
  if (!contact) return res.json({ result: 'Contacto no encontrado para ese ref.' })

  const sets = [], vals = []
  if (email && !contact.email)     { sets.push('email=?');   vals.push(email) }
  if (company && !contact.company) { sets.push('company=?'); vals.push(company) }
  if (phone && !contact.phone)     { sets.push('phone=?');   vals.push(phone) }
  if (sets.length) {
    db.prepare(`UPDATE contacts SET ${sets.join(',')}, updated_at=strftime('%s','now') WHERE id=?`).run(...vals, ref)
  }
  if (note) {
    const stamp = new Date().toISOString().slice(0, 10)
    const newNote = contact.note ? `${contact.note}\n---\n[${stamp}] ${note}` : `[${stamp}] ${note}`
    db.prepare("UPDATE contacts SET note=?, updated_at=strftime('%s','now') WHERE id=?").run(newNote, ref)
  }
  console.log(`🔧 [agent-tool] saveLeadData → contact ${ref}: ${sets.join(',') || '(solo nota)'}`)
  res.json({ result: 'Datos guardados correctamente.' })
})

// ── Admin de planes — solo el/los admin de la plataforma, no cualquier owner ──
// (editar precios/límites afecta a TODOS los workspaces, no solo al propio)
function requirePlatformAdmin(req, res, next) {
  const allowed = (process.env.ADMIN_EMAILS || 'hernan527@gmail.com').split(',').map(e => e.trim().toLowerCase())
  if (!allowed.includes((req.ariaUser.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'No autorizado' })
  }
  next()
}

app.get('/api/admin/plans', requireAriaAuth, requirePlatformAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM plans ORDER BY price_ars').all())
})

app.put('/api/admin/plans/:id', requireAriaAuth, requirePlatformAdmin, (req, res) => {
  const { name, price_ars, ai_credits_month, max_whatsapp_numbers, max_users, max_agents, max_funnels, support_tier, mp_plan_id } = req.body || {}
  const plan = db.prepare('SELECT * FROM plans WHERE id=?').get(req.params.id)
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' })
  db.prepare(`UPDATE plans SET name=?, price_ars=?, ai_credits_month=?, max_whatsapp_numbers=?, max_users=?, max_agents=?, max_funnels=?, support_tier=?, mp_plan_id=? WHERE id=?`)
    .run(name ?? plan.name, price_ars ?? plan.price_ars, ai_credits_month ?? plan.ai_credits_month,
      max_whatsapp_numbers ?? plan.max_whatsapp_numbers, max_users ?? plan.max_users,
      max_agents ?? plan.max_agents, max_funnels ?? plan.max_funnels,
      support_tier ?? plan.support_tier, mp_plan_id ?? plan.mp_plan_id, req.params.id)
  res.json(db.prepare('SELECT * FROM plans WHERE id=?').get(req.params.id))
})

// ── Planes de pago (MercadoPago) ───────────────────────────────────────────────

app.get('/api/billing/status', requireAriaAuth, (req, res) => {
  const usage = getPlanAndUsage(req.ariaUser.workspaceId)
  const allPlans = db.prepare('SELECT id, name, price_ars, ai_credits_month, max_whatsapp_numbers, max_users, max_agents, max_funnels, support_tier FROM plans ORDER BY price_ars').all()
  res.json({ ...usage, allPlans })
})

app.post('/api/billing/checkout', requireAriaAuth, async (req, res) => {
  if (req.ariaUser.role !== 'owner') return res.status(403).json({ error: 'Solo el owner puede cambiar el plan' })
  const { plan_id } = req.body || {}
  const plan = db.prepare('SELECT * FROM plans WHERE id=?').get(plan_id)
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' })
  const mpToken = process.env.MP_ACCESS_TOKEN
  if (!mpToken) return res.status(500).json({ error: 'MercadoPago no está configurado (falta MP_ACCESS_TOKEN)' })

  try {
    const publicUrl = process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'
    const user = db.prepare('SELECT email FROM users WHERE workspace_id=? AND role=\'owner\' LIMIT 1').get(req.ariaUser.workspaceId)
    const r = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `ARIA — Plan ${plan.name}`,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: plan.price_ars, currency_id: 'ARS' },
        back_url: `${publicUrl}/settings?tab=billing`,
        payer_email: user?.email,
        // workspaceId:planId — recuperamos ambos en el webhook con un solo campo
        external_reference: `${req.ariaUser.workspaceId}:${plan.id}`,
        status: 'pending',
      }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.message || JSON.stringify(d).slice(0, 200))

    db.prepare('UPDATE workspaces SET mp_subscription_id=? WHERE id=?').run(d.id, req.ariaUser.workspaceId)
    res.json({ init_point: d.init_point })
  } catch (e) {
    console.error('billing/checkout error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/webhook/mercadopago', async (req, res) => {
  res.json({ ok: true })  // responder rápido siempre
  try {
    const type = req.query.type || req.query.topic || req.body?.type
    const id   = req.query.id || req.body?.data?.id
    if (type !== 'preapproval' || !id) return

    const mpToken = process.env.MP_ACCESS_TOKEN
    if (!mpToken) return console.warn('⚠ Webhook MercadoPago recibido pero MP_ACCESS_TOKEN no está configurado')

    // Nunca confiar en el payload del webhook solo — confirmar el estado real contra la API.
    const r = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    })
    const d = await r.json()
    if (!r.ok) return console.error('⚠ Webhook MercadoPago: error consultando preapproval', d)

    const [workspaceId, planId] = (d.external_reference || '').split(':')
    if (!workspaceId) return console.warn('⚠ Webhook MercadoPago: preapproval sin external_reference válido', id)

    const statusMap = { authorized: 'active', paused: 'past_due', cancelled: 'cancelled', pending: 'pending' }
    const planStatus = statusMap[d.status] || 'pending'

    db.prepare('UPDATE workspaces SET plan_id=COALESCE(?,plan_id), plan_status=?, mp_subscription_id=? WHERE id=?')
      .run(planStatus === 'active' ? planId : null, planStatus, id, workspaceId)
    console.log(`💳 [MercadoPago] workspace ${workspaceId} → plan ${planId || '(sin cambio)'} / ${planStatus}`)
  } catch (e) {
    console.error('⚠ Webhook MercadoPago error:', e.message)
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

// Transcript crudo de WAHA para un chat — usado por el inbox y por el agente calificador "Lucas"
async function fetchWahaMessages(settings, sessionName, chatId, limit = 50) {
  const r = await wahaReq(settings, `/api/${sessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&downloadMedia=true`)
  const data = await r.json().catch(() => [])
  return Array.isArray(data) ? data : []
}

// Proxy de media de WAHA — las URLs de /api/files/* exigen X-Api-Key, que el navegador
// no puede mandar en <img>/<a>. ARIA pide el archivo server-side y lo reenvía autenticado.
app.get('/api/waha/media', requireAriaAuth, async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url requerida' })
  const s = getChannelSettings(req.ariaUser.workspaceId)
  let target, wahaHost
  try { target = new URL(url); wahaHost = new URL(s.waha_url).host } catch { return res.status(400).json({ error: 'url inválida' }) }
  if (target.host !== wahaHost) return res.status(403).json({ error: 'host no permitido' })
  try {
    const r = await wahaReq(s, target.pathname + target.search)
    if (!r.ok) return res.status(r.status).end()
    res.set('Content-Type', r.headers.get('content-type') || 'application/octet-stream')
    res.set('Cache-Control', 'private, max-age=86400')
    res.send(Buffer.from(await r.arrayBuffer()))
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
    const messages = await fetchWahaMessages(s, inst.session_name, req.params.chatId, req.query.limit || 50)
    res.json(messages)
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
      body: JSON.stringify({ chatId, caption: caption || '', file: { data, mimetype, filename }, session: inst.session_name }),
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
      body: JSON.stringify({ chatId, file: { data, mimetype: 'audio/ogg; codecs=opus', filename: 'voice.ogg' }, session: inst.session_name }),
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

// ── Asistente de comandos — "Decime qué necesitás que haga" ──────────────────
// Un vendedor escribe en lenguaje natural ("a Pepito mandarle un WhatsApp el 6/12
// avisándole que ya puede cambiarse de obra social") y esto lo convierte en una
// acción concreta: WhatsApp programado o tarea con fecha. Nunca agenda "a mano":
// si falta un dato clave (a quién, cuándo), devuelve una pregunta en vez de adivinar.
app.post('/api/assistant/command', requireAriaAuth, async (req, res) => {
  const { text } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'text requerido' })
  const workspaceId = req.ariaUser.workspaceId
  const today = new Date().toISOString().slice(0, 10)

  try {
    const system = `Sos el asistente de comandos de ARIA. Un vendedor te escribe una instrucción en lenguaje natural y la convertís en UNA acción estructurada. Hoy es ${today} (YYYY-MM-DD). Las fechas que escribe el usuario están en formato día/mes (DD/MM), como se usa en Argentina.

Devolvé SOLO un JSON válido, sin texto alrededor ni markdown, con esta forma exacta:
{
  "action": "schedule_whatsapp" | "create_task" | "schedule_calendar" | "unclear",
  "contact_name": string o null,
  "message_text": string o null,
  "task_title": string o null,
  "task_description": string o null,
  "date": "YYYY-MM-DD" o null,
  "time": "HH:MM" (24hs, default "10:00" si no lo menciona) o null,
  "clarification": string o null
}

Reglas:
- "schedule_whatsapp": pide mandarle un WhatsApp a alguien en una fecha. Completá contact_name, message_text (el texto que hay que mandarle, redactado por vos en base al pedido), date, time.
- "create_task": pide que le recuerden hacer algo sin que sea explícitamente mandar un WhatsApp (ej: "llamar a X", "preparar la cotización de Y"). Completá task_title, task_description, contact_name si corresponde, date si la menciona.
- "schedule_calendar": pide agendar una reunión/cita en Google Calendar específicamente.
- "unclear": falta un dato clave (no queda claro a quién, o la acción necesita fecha y no la dio). Completá "clarification" con UNA pregunta corta y específica. Nunca inventes un contacto o una fecha que no te dieron.`

    const { text: raw } = await callLLM({
      system,
      messages: [{ role: 'user', content: text.trim() }],
      max_tokens: 500,
      workspaceId,
    })

    let parsed
    try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw) }
    catch { return res.json({ ok: false, message: 'No entendí bien la instrucción — ¿la podés reformular?' }) }

    if (parsed.action === 'unclear') {
      return res.json({ ok: false, message: parsed.clarification || 'Necesito más detalles para hacer esto.' })
    }

    if (parsed.action === 'schedule_calendar') {
      return res.json({ ok: false, message: 'Todavía no tengo Google Calendar conectado en ARIA — por ahora puedo programarte un WhatsApp o crear una tarea con fecha.' })
    }

    // Resolver contacto por nombre (fuzzy) — nunca manda si hay ambigüedad o no lo encuentra
    let contact = null
    if (parsed.contact_name) {
      const matches = db.prepare('SELECT * FROM contacts WHERE workspace_id=? AND name LIKE ?')
        .all(workspaceId, `%${parsed.contact_name}%`)
      if (matches.length === 1) contact = matches[0]
      else if (matches.length > 1) {
        return res.json({ ok: false, message: `Hay ${matches.length} contactos que coinciden con "${parsed.contact_name}": ${matches.map(m => m.name).join(', ')}. ¿Cuál es?` })
      } else if (parsed.action === 'schedule_whatsapp') {
        return res.json({ ok: false, message: `No encontré a "${parsed.contact_name}" en tus contactos — revisá el nombre.` })
      }
    }

    const dateStr = parsed.date
    const timeStr = parsed.time || '10:00'

    if (parsed.action === 'schedule_whatsapp') {
      if (!contact?.phone) return res.json({ ok: false, message: `${parsed.contact_name || 'Ese contacto'} no tiene teléfono cargado.` })
      if (!dateStr) return res.json({ ok: false, message: '¿Para qué fecha querés mandar el mensaje?' })
      const inst = getPrimaryWahaSession(workspaceId)
      if (!inst) return res.json({ ok: false, message: 'No tenés un WhatsApp conectado todavía.' })
      const sendAt = Math.floor(new Date(`${dateStr}T${timeStr}:00-03:00`).getTime() / 1000)
      const chatId = `${contact.phone.replace(/\D/g, '')}@c.us`
      db.prepare(`INSERT INTO scheduled_messages (id,workspace_id,chat_id,session_name,text,send_at) VALUES (?,?,?,?,?,?)`)
        .run(randomUUID(), workspaceId, chatId, inst.session_name, parsed.message_text || text.trim(), sendAt)
      return res.json({ ok: true, message: `Listo — le programé un WhatsApp a ${contact.name || parsed.contact_name} para el ${dateStr} ${timeStr}.` })
    }

    if (parsed.action === 'create_task') {
      const dueDate = dateStr ? Math.floor(new Date(`${dateStr}T${timeStr}:00-03:00`).getTime() / 1000) : null
      db.prepare(`
        INSERT INTO tasks (id,workspace_id,title,description,lead_id,lead_name,assignee_id,assignee_name,due_date,priority,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(randomUUID(), workspaceId, parsed.task_title || text.trim(), parsed.task_description || null,
        contact?.id || null, contact?.name || parsed.contact_name || null, null, null, dueDate, 'normal', 'pending')
      return res.json({ ok: true, message: `Listo — creé la tarea "${parsed.task_title || text.trim()}"${dateStr ? ` para el ${dateStr}` : ''}.` })
    }

    return res.json({ ok: false, message: 'No entendí bien qué necesitás — ¿lo podés reformular?' })
  } catch (e) {
    console.error('⚠ [Asistente] error:', e.message)
    res.status(500).json({ error: e.message })
  }
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

// Trae los chats de WAHA que ya existían pero nunca pasaron por el webhook en vivo de ARIA
// (historial previo a que ARIA empezara a rastrear esa sesión) y los deja "cerrados, sin
// calificar" para que el sweep de Lucas los recorra como a cualquier conversación nueva.
// No sincroniza a HubSpot — es historial para calificar en ARIA, no leads nuevos para el CRM externo.
async function backfillWahaConversations(workspaceId) {
  const settings = getChannelSettings(workspaceId)
  const sessions = getAllWahaSessions(workspaceId)
  let found = 0, inserted = 0

  for (const inst of sessions) {
    let chats = []
    try {
      const r = await wahaReq(settings, `/api/${inst.session_name}/chats/overview?limit=300&sortBy=messageTimestamp&sortOrder=desc`)
      const data = await r.json().catch(() => [])
      chats = Array.isArray(data) ? data : []
    } catch (e) { console.error('⚠ [Lucas backfill] error leyendo chats:', e.message); continue }

    for (const c of chats) {
      if (!c.id || c.id === 'status@broadcast' || c.id.endsWith('@g.us') || c.id.endsWith('@newsletter')) continue
      found++
      const already = db.prepare('SELECT 1 FROM wa_conversations WHERE workspace_id=? AND session_name=? AND wa_from=?')
        .get(workspaceId, inst.session_name, c.id)
      if (already) continue

      const contactId = upsertContactFromWA(workspaceId, c.id, c.name, null, { skipHubspot: true })
      db.prepare(`
        INSERT INTO wa_conversations (id, workspace_id, session_name, wa_from, request_id, closed, contact_id, updated_at)
        VALUES (?,?,?,?,?,1,?,strftime('%s','now'))
      `).run(randomUUID(), workspaceId, inst.session_name, c.id, `backfill-${randomUUID()}`, contactId || null)
      inserted++
    }
  }
  console.log(`📥 [Lucas backfill] ${inserted} conversaciones nuevas de ${found} revisadas (workspace ${workspaceId})`)
  return { found, inserted }
}

// Cron: Lucas — cierre activo de conversaciones vencidas + calificación silenciosa.
// El cierre por TTL en los webhooks es perezoso (solo ocurre si el contacto vuelve a
// escribir); este sweep lo hace de forma activa para que una conversación abandonada
// también se analice.
async function sweepAndScoreConversations() {
  const CONV_TTL_SECS = 30 * 60, HUMAN_TTL_SECS = 4 * 60 * 60

  db.prepare(`
    UPDATE wa_conversations SET closed=1
    WHERE closed=0 AND (
      (bot_mode='bot'   AND (strftime('%s','now')-updated_at) > ?) OR
      (bot_mode='human' AND (strftime('%s','now')-updated_at) > ?)
    )
  `).run(CONV_TTL_SECS, HUMAN_TTL_SECS)

  // V1: solo conversaciones de WAHA (único canal con endpoint de transcript hoy).
  const candidates = db.prepare(`
    SELECT wc.* FROM wa_conversations wc
    JOIN channel_settings cs ON cs.workspace_id=wc.workspace_id AND cs.ai_scoring_enabled=1
    JOIN channel_instances ci ON ci.workspace_id=wc.workspace_id AND ci.session_name=wc.session_name AND ci.provider='waha'
    WHERE wc.closed=1 AND wc.scored_at IS NULL AND wc.score_attempts < 3
    ORDER BY wc.updated_at ASC LIMIT 20
  `).all()

  for (const conv of candidates) {
    try {
      let contactId = conv.contact_id
      if (!contactId) {
        const guess = db.prepare('SELECT id FROM contacts WHERE workspace_id=? AND phone=?')
          .get(conv.workspace_id, conv.wa_from.replace(/@.*/, ''))
        contactId = guess?.id
      }
      if (!contactId) {
        db.prepare("UPDATE wa_conversations SET scored_at=strftime('%s','now') WHERE id=?").run(conv.id)
        continue
      }

      const settings = getChannelSettings(conv.workspace_id)
      const msgs = await fetchWahaMessages(settings, conv.session_name, conv.wa_from, 60)

      if (msgs.length < 2) {
        // Conversación demasiado corta ("Hola" sin respuesta): heurística barata, sin gastar LLM.
        executeQualifierTool('set_lead_score', { temperature: 'frio', score: 10, reasoning: 'Conversación muy corta.' }, { workspaceId: conv.workspace_id, contactId })
        db.prepare("UPDATE wa_conversations SET scored_at=strftime('%s','now'), contact_id=? WHERE id=?").run(contactId, conv.id)
        continue
      }

      const transcriptText = msgs.slice(-60)
        .map(m => `${m.fromMe ? 'Bot' : 'Lead'}: ${m.body || m.caption || ''}`)
        .join('\n').slice(0, 6000)

      await runQualifierAgent({ workspaceId: conv.workspace_id, contactId, transcriptText })
      db.prepare("UPDATE wa_conversations SET scored_at=strftime('%s','now'), contact_id=? WHERE id=?").run(contactId, conv.id)

      const score = db.prepare('SELECT temperature, score, reasoning FROM lead_scores WHERE workspace_id=? AND contact_id=?').get(conv.workspace_id, contactId)
      if (score) sseEmit(conv.workspace_id, { event: 'lead-score-updated', contactId, ...score })
      console.log(`🧠 [Lucas] ${conv.id} → ${score?.temperature}/${score?.score}`)

      // Derivación automática: si el agente activo del workspace está configurado como
      // "objetivo_cumplido" y el score de Lucas supera el umbral, deriva a humano sin
      // esperar a que el bot conversacional decida nada — Lucas empuja la derivación.
      if (score?.score != null) {
        const agentCfg = resolveActiveAgent(conv.workspace_id, conv.session_name)
        if (agentCfg?.derivation_mode === 'objetivo_cumplido' && score.score >= (agentCfg.derivation_score_threshold ?? 70)) {
          const assignedUser = pickHandoffUser(conv.workspace_id, agentCfg.derivation_users)
          db.prepare("UPDATE wa_conversations SET bot_mode='human', assigned_user_id=? WHERE id=?").run(assignedUser, conv.id)
          const contact = db.prepare('SELECT name FROM contacts WHERE id=?').get(contactId)
          db.prepare(`
            INSERT INTO tasks (id, workspace_id, title, description, lead_id, lead_name, assignee_id, priority, status)
            VALUES (?,?,?,?,?,?,?,'high','pending')
          `).run(randomUUID(), conv.workspace_id, `Lead caliente (score ${score.score}) — tomalo`,
            `Lucas detectó intención de compra alta. ${score.reasoning || ''}`.trim(), contactId, contact?.name || null, assignedUser)
          console.log(`🔥 [Lucas] Derivación automática por score alto: ${conv.id} (${score.score}) → ${assignedUser || 'sin asignar'}`)
          notifyAssignedUser(conv.workspace_id, assignedUser, { contactName: contact?.name, lastMessage: `Score ${score.score}/100 — ${score.reasoning || ''}` })
        }
      }
    } catch (e) {
      console.error('⚠ [Lucas] Error calificando conversación:', conv.id, e.message)
      db.prepare('UPDATE wa_conversations SET score_attempts=score_attempts+1 WHERE id=?').run(conv.id)
      db.prepare("UPDATE wa_conversations SET scored_at=strftime('%s','now') WHERE id=? AND score_attempts>=3").run(conv.id)
    }
  }
}
setInterval(() => { sweepAndScoreConversations().catch(e => console.error('⚠ [Lucas] sweep error:', e.message)) }, 5 * 60 * 1000)

// ── Seguimientos automáticos ───────────────────────────────────────────────────
// Genera un mensaje de reengagement — igual que Lucas, bypassea Dify (no tiene sentido
// pedirle a la app de chat del cliente que redacte un mensaje "meta") y usa fallback a env.
async function generateFollowupMessage(transcriptText) {
  let provider = null, apiKey = null, model = null
  if (process.env.ANTHROPIC_API_KEY)   { provider = 'anthropic'; apiKey = process.env.ANTHROPIC_API_KEY; model = CLAUDE_INTERNAL_MODEL }
  else if (process.env.OPENAI_API_KEY) { provider = 'openai';    apiKey = process.env.OPENAI_API_KEY;    model = 'gpt-4o-mini' }
  else throw new Error('Seguimientos: sin ANTHROPIC_API_KEY/OPENAI_API_KEY configurada')

  const system = 'Redactá un mensaje de WhatsApp breve (máx 2 líneas) para retomar contacto con un lead que dejó de responder. Natural, sin sonar desesperado, sin repetir literalmente lo último que se dijo. No uses placeholders. Devolvé solo el mensaje, sin comillas ni explicaciones.'
  const messages = [{ role: 'user', content: `Conversación hasta ahora:\n${transcriptText}` }]

  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 150, system, messages }),
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
    return stripThink(d.content?.find?.(b => b.type === 'text')?.text || d.content?.[0]?.text)
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 150, messages: [{ role: 'system', content: system }, ...messages] }),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
  return d.choices?.[0]?.message?.content?.trim() || ''
}

// Ventanas horarias en hora del negocio, no del contenedor (que corre en UTC).
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'America/Argentina/Buenos_Aires'
function withinHours(startStr, endStr) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).split(':').map(Number)
  const cur = (h % 24) * 60 + m
  const [sh, sm] = (startStr || '08:00').split(':').map(Number)
  const [eh, em] = (endStr   || '20:00').split(':').map(Number)
  return cur >= (sh * 60 + sm) && cur <= (eh * 60 + em)
}

async function sendFollowups() {
  // Candidatas: conversaciones abiertas en modo bot, cuyo agente activo del workspace
  // tiene cadencia de seguimiento configurada.
  const candidates = db.prepare(`
    SELECT wc.* FROM wa_conversations wc
    JOIN channel_instances ci ON ci.workspace_id=wc.workspace_id AND ci.session_name=wc.session_name AND ci.provider='waha'
    WHERE wc.closed=0 AND wc.bot_mode='bot'
  `).all()

  for (const conv of candidates) {
    try {
      const agent = resolveActiveAgent(conv.workspace_id, conv.session_name)
      if (!agent || agent.followup_cadence === 'none') continue
      if (!withinHours(agent.followup_hours_start, agent.followup_hours_end)) continue

      const intervals = JSON.parse(agent.followup_intervals || '[]')
      const nextCheckpoint = intervals[conv.followup_count]
      if (nextCheckpoint == null) continue  // cadencia agotada

      const elapsedHours = (Math.floor(Date.now() / 1000) - conv.updated_at) / 3600
      if (elapsedHours < nextCheckpoint) continue

      const settings = getChannelSettings(conv.workspace_id)
      const msgs = await fetchWahaMessages(settings, conv.session_name, conv.wa_from, 30)
      const transcriptText = msgs.slice(-30)
        .map(m => `${m.fromMe ? 'Bot' : 'Lead'}: ${m.body || m.caption || ''}`)
        .join('\n').slice(0, 4000)

      const followupText = await generateFollowupMessage(transcriptText)
      if (!followupText) continue

      const chatId = conv.wa_from.includes('@') ? conv.wa_from : `${conv.wa_from}@c.us`
      await wahaReq(settings, '/api/sendText', {
        method: 'POST',
        body: JSON.stringify({ chatId, text: followupText, session: conv.session_name }),
      })
      db.prepare("UPDATE wa_conversations SET followup_count=followup_count+1, last_followup_at=strftime('%s','now') WHERE id=?").run(conv.id)
      console.log(`📨 [Seguimiento] ${conv.id} → checkpoint ${nextCheckpoint}h: ${followupText.slice(0, 50)}`)
    } catch (e) {
      console.error('⚠ [Seguimiento] Error en conversación:', conv.id, e.message)
    }
  }
}
setInterval(() => { sendFollowups().catch(e => console.error('⚠ [Seguimiento] sweep error:', e.message)) }, 10 * 60 * 1000)

app.post('/api/followups/run-now', requireAriaAuth, async (req, res) => {
  sendFollowups().catch(e => console.error('⚠ [Seguimiento] run-now error:', e.message))
  res.json({ ok: true })
})

// ── Tobías — gestor de campañas de reactivación ───────────────────────────────
// Busca leads que se enfriaron (según Lucas + días sin actividad) y les escribe uno por
// uno, con un mensaje personalizado por una app "completion" de Dify propia del workspace.
// Seguimientos (arriba) reintenta conversaciones abiertas; Tobías trabaja sobre las ya
// cerradas y frías — no se pisan porque la audiencia excluye contactos con conv abierta.
const CAMPAIGN_REPLY_WINDOW_SECS = 7 * 24 * 3600
const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'finished']
const TOBIAS_VARS = ['nombre', 'contexto', 'objetivo', 'pautas']
const TOBIAS_PROMPT = `Sos Tobías, gestor de campañas comerciales por WhatsApp. Redactá UN mensaje saliente para {{nombre}}, un contacto que ya tiene relación con el negocio.

Estrategia y objetivo de la campaña:
{{objetivo}}
Pautas del negocio: {{pautas}}

Lo que sabemos del contacto (CRM y últimos mensajes):
{{contexto}}

Reglas:
- Respetá el tono y la longitud que indican las pautas (si no dicen nada: máximo 3 líneas), natural y personal, como lo escribiría una persona del equipo.
- Seguí la estrategia: es lo que define de qué se trata el mensaje.
- Si el historial menciona algo concreto (producto, duda, objeción), usalo para personalizar.
- Terminá con una pregunta simple que invite a responder.
- Si no hay nombre, no lo inventes. Sin placeholders, sin corchetes, sin firma, sin comillas.
Devolvé solo el mensaje.`

// Estrategia comercial: define la audiencia base (sobre la etapa del embudo) y especializa
// la instrucción que recibe la IA. Las etapas se leen por id del embudo por defecto
// (cerrado=ganado, descartado=perdido, propuesta/negociacion=cotización enviada) además de lead_status.
const isWon  = r => r.lead_status === 'won'  || r.stage === 'cerrado'
const isLost = r => r.lead_status === 'lost' || r.stage === 'descartado'
const isOpenOpportunity = r => !!r.stage && !isWon(r) && !isLost(r)
const CAMPAIGN_STRATEGIES = {
  reactivar: {
    base: r => !!r.last_conv_at && !isWon(r),
    prompt: 'Reactivar conversación: el contacto conversó con nosotros y dejó de responder. Retomá la charla donde quedó, sin presionar.',
  },
  recuperar: {
    base: r => isLost(r),
    prompt: 'Recuperar oportunidad: esta oportunidad se dio por perdida. Volvé a intentar con un motivo nuevo (novedad, condición especial o una pregunta sobre qué lo frenó), sin reprochar.',
  },
  venta_cruzada: {
    base: r => isWon(r),
    prompt: 'Venta cruzada: es un cliente actual. Agradecé la relación y presentá otro servicio o producto que le pueda sumar, conectándolo con lo que ya tiene.',
  },
  presentar_producto: {
    base: r => !isLost(r),
    prompt: 'Presentar producto: dá a conocer un producto o servicio nuevo de forma breve y concreta, destacando por qué le puede interesar a este contacto.',
  },
  recordar_cotizacion: {
    base: r => ['propuesta', 'negociacion'].includes(r.stage) && !isWon(r) && !isLost(r),
    prompt: 'Recordar cotización: le enviamos una cotización que quedó sin respuesta. Recordásela con amabilidad y ofrecé resolver dudas para avanzar.',
  },
  agendar_reunion: {
    base: r => isOpenOpportunity(r) || !!r.last_conv_at,
    prompt: 'Agendar reunión: proponé coordinar una llamada o cita breve. Pedí día y horario de preferencia con una pregunta concreta.',
  },
  solicitar_documentacion: {
    base: r => !isLost(r),
    prompt: 'Solicitar documentación: pedí con claridad la información o los documentos pendientes y ofrecé ayuda si tiene dudas sobre cómo enviarlos.',
  },
  personalizado: {
    base: () => true,
    prompt: '',
  },
}
function strategyObjective(strategy, objective) {
  const st = CAMPAIGN_STRATEGIES[strategy] || CAMPAIGN_STRATEGIES.reactivar
  return [st.prompt, objective ? `Objetivo concreto: ${objective}` : ''].filter(Boolean).join('\n') || 'Retomar la conversación'
}

// Un contacto que responde dentro de la ventana cuenta como "respondió" para la campaña.
// Devuelve el envío (con objetivo) solo la primera vez, para inyectarlo como contexto al agente.
function markCampaignReply(workspaceId, contactId) {
  if (!contactId) return null
  const row = db.prepare(`
    SELECT cr.id, cr.campaign_id, cr.message, c.name, c.objective, c.on_reply FROM campaign_recipients cr
    JOIN campaigns c ON c.id=cr.campaign_id
    WHERE cr.workspace_id=? AND cr.contact_id=? AND cr.status='sent' AND cr.sent_at > strftime('%s','now') - ?
    ORDER BY cr.sent_at DESC LIMIT 1
  `).get(workspaceId, contactId, CAMPAIGN_REPLY_WINDOW_SECS)
  if (!row) return null
  db.prepare("UPDATE campaign_recipients SET status='replied', replied_at=strftime('%s','now') WHERE id=?").run(row.id)
  sseEmit(workspaceId, { event: 'campaign-reply', campaignId: row.campaign_id, contactId })
  console.log(`📣 [Tobías] Respondió ${contactId} (campaña ${row.campaign_id})`)
  return row
}

// Crea (una vez por workspace) la app de Dify de Tobías. Promesa compartida para que dos
// envíos simultáneos no creen dos apps.
// Modelo de las apps que ARIA crea en Dify: Claude Haiku 5.5, cargado en Dify como modelo personalizado del
// plugin Anthropic (Dify todavía no lo trae). El plugin está parcheado para no mandarle temperature (ver
// /root/CLAUDE.md, Bug 4), y acá tampoco se la mandamos. Se puede cambiar con DIFY_AGENT_MODEL(_PROVIDER).
const DIFY_AGENT_MODEL = {
  provider: process.env.DIFY_AGENT_MODEL_PROVIDER || 'langgenius/anthropic/anthropic',
  name:     process.env.DIFY_AGENT_MODEL || 'claude-haiku-5-5',
  mode:     'chat',
}
const tobiasAppPending = new Map()
const TOBIAS_PROMPT_HASH = createHash('sha1').update(TOBIAS_PROMPT).digest('hex').slice(0, 12)
async function configureTobiasApp(appId, model) {
  const cfg = await difyConsoleApi(`/apps/${appId}/model-config`, 'POST', {
      pre_prompt: TOBIAS_PROMPT, prompt_type: 'simple', opening_statement: '',
      suggested_questions: [], suggested_questions_after_answer: { enabled: false },
      speech_to_text: { enabled: false }, retriever_resource: { enabled: false },
      sensitive_word_avoidance: { enabled: false }, more_like_this: { enabled: false },
      user_input_form: TOBIAS_VARS.map(v => ({ paragraph: { label: v, variable: v, required: false, max_length: 8000, default: '' } })),
      model: { provider: model.provider, name: model.name, mode: 'chat', completion_params: { max_tokens: 250 } },
      agent_mode: { enabled: false, strategy: 'function_call', tools: [] },
  })
  if (!cfg.ok) throw new Error(`Tobías: error configurando app Dify (${cfg.status})`)
}

function ensureTobiasApp(workspaceId) {
  const cs = db.prepare('SELECT tobias_dify_app_id, tobias_dify_api_key, tobias_prompt_hash FROM channel_settings WHERE workspace_id=?').get(workspaceId)
  if (cs?.tobias_dify_api_key && cs.tobias_prompt_hash === TOBIAS_PROMPT_HASH) return Promise.resolve(cs.tobias_dify_api_key)
  if (tobiasAppPending.has(workspaceId)) return tobiasAppPending.get(workspaceId)
  const p = (async () => {
    // App ya creada con un prompt anterior: solo se actualiza la config, conservando el modelo elegido en Dify.
    if (cs?.tobias_dify_api_key && cs.tobias_dify_app_id) {
      const cur = await difyConsoleApi(`/apps/${cs.tobias_dify_app_id}`).then(r => r.json()).catch(() => ({}))
      await configureTobiasApp(cs.tobias_dify_app_id, cur?.model_config?.model || DIFY_AGENT_MODEL)
      db.prepare('UPDATE channel_settings SET tobias_prompt_hash=? WHERE workspace_id=?').run(TOBIAS_PROMPT_HASH, workspaceId)
      return cs.tobias_dify_api_key
    }
    const ws = db.prepare('SELECT name FROM workspaces WHERE id=?').get(workspaceId)
    const appData = await difyConsoleApi('/apps', 'POST', {
      name: `Tobías — ${ws?.name || workspaceId.slice(0, 8)}`, mode: 'completion', icon: '📣', icon_background: '#FEF7C3',
      description: 'Gestor de campañas de ARIA: redacta mensajes comerciales salientes personalizados.',
    }).then(r => r.json())
    if (!appData.id) throw new Error('Tobías: error creando app Dify: ' + JSON.stringify(appData).slice(0, 200))
    await configureTobiasApp(appData.id, DIFY_AGENT_MODEL)
    const key = await difyConsoleApi(`/apps/${appData.id}/api-keys`, 'POST', {}).then(r => r.json())
    const apiKey = key.token || key.api_key
    if (!apiKey) throw new Error('Tobías: Dify no devolvió API key')
    if (db.prepare('SELECT 1 FROM channel_settings WHERE workspace_id=?').get(workspaceId)) {
      db.prepare('UPDATE channel_settings SET tobias_dify_app_id=?, tobias_dify_api_key=?, tobias_prompt_hash=? WHERE workspace_id=?').run(appData.id, apiKey, TOBIAS_PROMPT_HASH, workspaceId)
    } else {
      db.prepare('INSERT INTO channel_settings (workspace_id, tobias_dify_app_id, tobias_dify_api_key, tobias_prompt_hash) VALUES (?,?,?,?)').run(workspaceId, appData.id, apiKey, TOBIAS_PROMPT_HASH)
    }
    console.log(`📣 [Tobías] App Dify creada para workspace ${workspaceId}: ${appData.id}`)
    return apiKey
  })().finally(() => tobiasAppPending.delete(workspaceId))
  tobiasAppPending.set(workspaceId, p)
  return p
}

function cleanCampaignMessage(text) {
  return (text || '').trim().replace(/^["“”']+|["“”']+$/g, '').trim()
}

// Redacta el mensaje vía Dify; si Dify falla (sin créditos, caído) usa el LLM directo
// de entorno para no frenar la campaña.
const CAMPAIGN_TONES = {
  cercano:     'Tono cercano y cálido, como un conocido del equipo.',
  profesional: 'Tono profesional y cordial, sin exceso de confianza.',
  directo:     'Tono directo y al grano, sin rodeos ni relleno.',
  entusiasta:  'Tono entusiasta y con energía positiva, sin exagerar.',
}
const CAMPAIGN_LENGTHS = {
  breve:     'Longitud: una sola línea.',
  medio:     'Longitud: entre 2 y 3 líneas.',
  detallado: 'Longitud: 4 líneas o más, con el detalle necesario.',
}

// Plantilla con variables: {{nombre}} (completo), {{nombre_pila}}, {{apellido}}, {{teléfono}},
// {{email}}, {{notas}}. Las claves se comparan sin tildes ({{telefono}} también vale).
function renderCampaignTemplate(template, contact) {
  const full = (contact?.name || '').trim()
  const [first = '', ...rest] = full.split(/\s+/).filter(Boolean)
  const vars = {
    nombre: full, nombre_pila: first, apellido: rest.join(' '),
    telefono: contact?.phone || '', email: contact?.email || '', notas: contact?.note || '',
    empresa: contact?.company || '',
  }
  const norm = k => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return (template || '')
    .replace(/\{\{\s*([\p{L}_]+)\s*\}\}/gu, (_, k) => vars[norm(k)] ?? '')
    .replace(/[ \t]+([,.!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim()
}

const SCREENING_PREFIX = 'OMITIR:'
const SCREENING_RULE = `DEPURACIÓN: antes de escribir, evaluá el historial. Si el contacto pidió no ser contactado, ya resolvió o compró lo que ofrece esta campaña, no es un cliente potencial (número equivocado, proveedor, spam) o el mensaje no tendría sentido para él, NO redactes nada y respondé únicamente: ${SCREENING_PREFIX} <motivo breve>.`

// Devuelve { message } o, con depuración activa, { skipReason } si la IA decide no escribirle.
async function generateCampaignMessage({ workspaceId, contact, transcriptText, strategy, objective, guidelines, tone, length, screening = false }) {
  const lines = []
  if (contact?.company)   lines.push(`Empresa: ${contact.company}`)
  if (contact?.note)      lines.push(`Nota del CRM: ${contact.note}`)
  if (contact?.reasoning) lines.push(`Evaluación previa: ${contact.reasoning}`)
  if (transcriptText)     lines.push(`Últimos mensajes:\n${transcriptText}`)
  const inputs = {
    nombre:   contact?.name || 'el contacto (nombre desconocido)',
    contexto: (lines.join('\n') || 'Sin historial disponible.').slice(0, 7500),
    objetivo: strategyObjective(strategy, objective),
    pautas:   [
      CAMPAIGN_TONES[tone] || CAMPAIGN_TONES.cercano,
      CAMPAIGN_LENGTHS[length] || '',
      guidelines ? `Instrucciones adicionales: ${guidelines}` : '',
      screening ? SCREENING_RULE : '',
    ].filter(Boolean).join('\n'),
  }
  const result = text => {
    if (screening && text.toUpperCase().startsWith(SCREENING_PREFIX)) {
      return { skipReason: text.slice(SCREENING_PREFIX.length).trim() || 'Sin motivo' }
    }
    return { message: text }
  }
  try {
    const apiKey = await ensureTobiasApp(workspaceId)
    const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
    const r = await fetch(`${difyUrl}/v1/completion-messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, response_mode: 'blocking', user: `tobias-${workspaceId}` }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`)
    const text = cleanCampaignMessage(d.answer)
    if (text) return result(text)
    throw new Error('respuesta vacía')
  } catch (e) {
    console.warn('⚠ [Tobías] Dify falló, uso LLM directo:', e.message)
    const system = TOBIAS_PROMPT.replace(/\{\{(\w+)\}\}/g, (_, k) => inputs[k] ?? '')
    return result(cleanCampaignMessage(await callLLMDirect({ system, userMsg: 'Redactá el mensaje.', workspaceId })))
  }
}

// Audiencia: contactos con teléfono real, sin conversación abierta, no ganados, que no
// recibieron otra campaña en la última semana, filtrados por temperatura de Lucas,
// días sin actividad y etiquetas.
function buildCampaignAudience(workspaceId, audience = {}, strategy = 'reactivar', { seriesId = null } = {}) {
  const base = (CAMPAIGN_STRATEGIES[strategy] || CAMPAIGN_STRATEGIES.reactivar).base
  // Serie recurrente: la frecuencia la decide la serie (y se ve en el medidor de seguridad), así que
  // no aplica la exclusión de 7 días entre campañas; solo se saltea a quien todavía tiene un envío en cola.
  const queued = seriesId
    ? new Set(db.prepare(`
        SELECT cr.contact_id FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id
        WHERE c.parent_id=? AND cr.status IN ('pending','sending')
      `).all(seriesId).map(r => r.contact_id))
    : null
  // Sin temperaturas elegidas = sin filtro por temperatura (el paso 3 ahora filtra con reglas).
  const temps = Array.isArray(audience.temperatures) && audience.temperatures.length ? audience.temperatures : null
  const inactiveDays = Math.max(0, parseInt(audience.inactive_days ?? 0, 10) || 0)
  const rules = Array.isArray(audience.rules) ? audience.rules.filter(r => r && r.field && r.value !== '' && r.value != null) : []
  const tags = Array.isArray(audience.tags) ? audience.tags : []
  const max = Math.min(Math.max(parseInt(audience.max_recipients ?? 200, 10) || 200, 1), 1000)
  const now = Math.floor(Date.now() / 1000)
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone, c.company, c.note, c.tags, c.attributes, c.updated_at,
      ls.temperature, ls.score, ls.reasoning,
      (SELECT MAX(wc.updated_at) FROM wa_conversations wc WHERE wc.workspace_id=c.workspace_id AND wc.contact_id=c.id) AS last_conv_at,
      (SELECT COUNT(*) FROM wa_conversations wc WHERE wc.workspace_id=c.workspace_id AND wc.contact_id=c.id AND wc.closed=0) AS open_convs,
      (SELECT fs.lead_status FROM funnel_stages fs WHERE fs.workspace_id=c.workspace_id AND fs.lead_id=c.id) AS lead_status,
      (SELECT fs.stage FROM funnel_stages fs WHERE fs.workspace_id=c.workspace_id AND fs.lead_id=c.id) AS stage,
      (SELECT MAX(cr.sent_at) FROM campaign_recipients cr WHERE cr.workspace_id=c.workspace_id AND cr.contact_id=c.id) AS last_campaign_at
    FROM contacts c
    LEFT JOIN lead_scores ls ON ls.workspace_id=c.workspace_id AND ls.contact_id=c.id
    WHERE c.workspace_id=? AND c.phone IS NOT NULL AND c.phone != ''
  `).all(workspaceId)

  const out = []
  for (const r of rows) {
    if (!/^\d{8,15}$/.test(r.phone)) continue
    let attrs = {}
    try { attrs = JSON.parse(r.attributes || '{}') } catch {}
    if (attrs.aria_test_contact) continue
    if (attrs.jid_type === 'lid') continue  // LID sin número real: no es un teléfono al que se pueda escribir
    if (r.open_convs > 0 || !base(r)) continue
    if (queued ? queued.has(r.id) : (r.last_campaign_at && now - r.last_campaign_at < CAMPAIGN_REPLY_WINDOW_SECS)) continue
    const temperature = r.temperature || 'sin_calificar'
    if (temps && !temps.includes(temperature)) continue
    const lastActivity = r.last_conv_at || r.updated_at || 0
    if (inactiveDays && now - lastActivity < inactiveDays * 86400) continue
    if (rules.length && !matchAudienceRules(rules, r, lastActivity, now)) continue
    if (tags.length) {
      let ct = []
      try { ct = JSON.parse(r.tags || '[]') } catch {}
      const vals = ct.flatMap(t => (t && typeof t === 'object') ? [t.id, t.title, t.name] : [t])
      if (!vals.some(v => tags.includes(v))) continue
    }
    out.push({
      contact_id: r.id, name: r.name, phone: r.phone, company: r.company, note: r.note,
      temperature, score: r.score, reasoning: r.reasoning, last_activity: lastActivity, stage: r.stage,
    })
  }
  out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.last_activity - a.last_activity)

  // Agregados a mano: entran siempre (por fuera de estrategia y filtros) si tienen un teléfono
  // al que se pueda escribir; no cuentan para el máximo del filtro.
  const manualIds = new Set(Array.isArray(audience.manual_contacts) ? audience.manual_contacts : [])
  const manual = []
  if (manualIds.size) {
    for (const r of rows) {
      if (!manualIds.has(r.id) || !/^\d{8,15}$/.test(r.phone)) continue
      let attrs = {}
      try { attrs = JSON.parse(r.attributes || '{}') } catch {}
      if (attrs.jid_type === 'lid' || (queued && queued.has(r.id))) continue
      manual.push({
        contact_id: r.id, name: r.name, phone: r.phone, company: r.company, note: r.note,
        temperature: r.temperature || 'sin_calificar', score: r.score, reasoning: r.reasoning,
        last_activity: r.last_conv_at || r.updated_at || 0, stage: r.stage, manual: true,
      })
    }
  }
  return [...manual, ...out.filter(a => !manualIds.has(a.contact_id)).slice(0, max)]
}

// Filtros del paso 3. Cada regla (salvo la primera) trae `join` 'and'|'or'; Y tiene prioridad
// sobre O: se arman grupos de reglas unidas por Y y alcanza con que se cumpla un grupo.
function contactTagValues(r) {
  let ct = []
  try { ct = JSON.parse(r.tags || '[]') } catch {}
  return ct.flatMap(t => (t && typeof t === 'object') ? [t.id, t.title, t.name] : [t])
}
function opportunityStatus(r) {
  if (isWon(r)) return 'won'
  if (isLost(r)) return 'lost'
  return r.stage ? 'open' : 'none'
}
function matchAudienceRule(rule, r, lastActivity, now) {
  const v = rule.value
  switch (rule.field) {
    case 'last_interaction': {
      const age = now - lastActivity, limit = Number(v) * 86400
      return rule.op === 'less' ? age < limit : age >= limit
    }
    case 'opp_status': return (opportunityStatus(r) === v) === (rule.op !== 'is_not')
    case 'opp_stage':  return (r.stage === v) === (rule.op !== 'is_not')
    case 'tag':        return contactTagValues(r).includes(v) === (rule.op !== 'has_not')
    default:           return true
  }
}
function matchAudienceRules(rules, r, lastActivity, now) {
  const groups = [[]]
  rules.forEach((rule, i) => {
    if (i > 0 && rule.join === 'or') groups.push([])
    groups[groups.length - 1].push(rule)
  })
  return groups.some(g => g.every(rule => matchAudienceRule(rule, r, lastActivity, now)))
}

function parseCampaign(c) {
  if (!c) return c
  let audience = {}, recurrence_days = []
  try { audience = JSON.parse(c.audience || '{}') } catch {}
  let send_days = [0, 1, 2, 3, 4, 5, 6]
  try { recurrence_days = JSON.parse(c.recurrence_days || '[]') } catch {}
  try { send_days = JSON.parse(c.send_days || '[0,1,2,3,4,5,6]') } catch {}
  let attachment = null
  try { attachment = c.attachment ? JSON.parse(c.attachment) : null } catch {}
  if (attachment) { const { path, ...pub } = attachment; attachment = pub }
  return { ...c, audience, recurrence_days, send_days, attachment }
}

const RECURRENCES = ['daily', 'weekly', 'monthly']

// Partes de fecha/hora de un instante en la zona del negocio.
function businessParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms))
  const g = t => Number(parts.find(p => p.type === t).value)
  return { y: g('year'), m: g('month'), d: g('day'), hh: g('hour') % 24, mm: g('minute') }
}
// Fecha/hora "de pared" en la zona del negocio → epoch ms.
function businessToEpochMs(y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const p = businessParts(guess)
  return guess - (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - guess)
}

// Próxima corrida de una serie: el primer día marcado (L–D) a la hora elegida, posterior a `afterSec`.
// Diaria/semanal corren cada día marcado; mensual, solo los días marcados de la primera semana del mes.
// Devuelve null si la serie ya pasó su fecha de fin.
function nextCampaignRun(c, afterSec = Math.floor(Date.now() / 1000)) {
  let days = c.recurrence_days
  if (typeof days === 'string') { try { days = JSON.parse(days) } catch { days = [] } }
  if (!Array.isArray(days) || !days.length) days = [1, 2, 3, 4, 5]
  const [hh, mm] = (c.recurrence_time || '09:30').split(':').map(Number)
  const today = businessParts(Date.now())
  for (let i = 0; i < 400; i++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d + i))
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate()
    if (!days.includes(date.getUTCDay())) continue
    if (c.recurrence === 'monthly' && d > 7) continue
    const at = Math.floor(businessToEpochMs(y, m, d, hh, mm) / 1000)
    if (c.recurrence_until && at > c.recurrence_until) return null
    if (at > afterSec) return at
  }
  return null
}

function finishCampaign(c) {
  db.prepare("UPDATE campaigns SET status='finished', finished_at=strftime('%s','now'), updated_at=strftime('%s','now') WHERE id=?").run(c.id)
  console.log(`📣 [Tobías] Campaña "${c.name}" finalizada`)
  sseEmit(c.workspace_id, { event: 'campaign-updated', campaignId: c.id })
}

// Congela la audiencia al arrancar: lo que se ve en "destinatarios" es exactamente a quién se le escribe.
function startCampaign(c, { seriesId = null } = {}) {
  const audience = buildCampaignAudience(c.workspace_id, parseCampaign(c).audience, c.strategy, { seriesId })
  const ins = db.prepare('INSERT INTO campaign_recipients (id, campaign_id, workspace_id, contact_id, phone, name) VALUES (?,?,?,?,?,?)')
  db.transaction(() => {
    for (const a of audience) ins.run(randomUUID(), c.id, c.workspace_id, a.contact_id, a.phone, a.name)
    db.prepare(`UPDATE campaigns SET status='active', started_at=COALESCE(started_at, strftime('%s','now')),
      updated_at=strftime('%s','now') WHERE id=?`).run(c.id)
  })()
  console.log(`📣 [Tobías] Campaña "${c.name}" iniciada con ${audience.length} destinatarios`)
  if (!audience.length) finishCampaign(c)
  else sseEmit(c.workspace_id, { event: 'campaign-updated', campaignId: c.id })
  return audience.length
}

// Corrida de una serie recurrente: crea una campaña propia (con sus métricas) copiando la
// configuración de la serie, y deja la serie programada para la próxima corrida.
function runCampaignSeries(series) {
  const runNumber = (series.run_count || 0) + 1
  const label = new Date().toLocaleDateString('es-AR', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short' })
  const childId = randomUUID()
  db.prepare(`
    INSERT INTO campaigns (id, workspace_id, parent_id, name, description, strategy, status, objective, guidelines, audience,
      channel_instance_id, hours_start, hours_end, interval_minutes, daily_limit, on_reply, ai_screening,
      channel_mode, pace, interval_seconds, send_days, message_mode, tone, length, template, attachment, created_by)
    SELECT ?, workspace_id, id, ?, description, strategy, 'draft', objective, guidelines, audience,
      channel_instance_id, hours_start, hours_end, interval_minutes, daily_limit, on_reply, ai_screening,
      channel_mode, pace, interval_seconds, send_days, message_mode, tone, length, template, attachment, created_by
    FROM campaigns WHERE id=?
  `).run(childId, `${series.name} · corrida ${runNumber} (${label})`, series.id)
  const sent = startCampaign(db.prepare('SELECT * FROM campaigns WHERE id=?').get(childId), { seriesId: series.id })
  // Corrida sin nadie a quien escribir: no ensucia la lista con una campaña vacía.
  if (!sent) db.prepare('DELETE FROM campaigns WHERE id=?').run(childId)

  const next = nextCampaignRun(series)
  db.prepare(`UPDATE campaigns SET run_count=?, started_at=COALESCE(started_at, strftime('%s','now')),
    status=?, scheduled_at=?, finished_at=?, updated_at=strftime('%s','now') WHERE id=?`)
    .run(runNumber, next ? 'scheduled' : 'finished', next, next ? null : Math.floor(Date.now() / 1000), series.id)
  console.log(`📣 [Tobías] Serie "${series.name}" corrida ${runNumber}: ${sent} destinatarios · próxima ${next ? new Date(next * 1000).toISOString() : 'ninguna (fin de serie)'}`)
  sseEmit(series.workspace_id, { event: 'campaign-updated', campaignId: series.id })
}

function resolveCampaignInstance(workspaceId, instanceId) {
  if (instanceId) {
    const inst = db.prepare('SELECT * FROM channel_instances WHERE id=? AND workspace_id=?').get(instanceId, workspaceId)
    if (inst) return inst
  }
  return db.prepare("SELECT * FROM channel_instances WHERE workspace_id=? AND status='WORKING' ORDER BY created_at LIMIT 1").get(workspaceId)
}

async function sendCampaignText(workspaceId, inst, phone, text, attachment = null) {
  const settings = getChannelSettings(workspaceId)
  if (attachment && inst.provider === 'waha') {
    // Un solo mensaje: el adjunto con el texto como caption
    const data = readFileSync(attachment.path).toString('base64')
    const isImage = /^image\//.test(attachment.mimetype)
    const r = await wahaReq(settings, isImage ? '/api/sendImage' : '/api/sendFile', {
      method: 'POST',
      body: JSON.stringify({
        chatId: `${phone}@c.us`, session: inst.session_name, caption: text,
        file: { data, mimetype: attachment.mimetype, filename: attachment.filename },
      }),
    })
    if (!r.ok) throw new Error(`WAHA ${r.status}: ${(await r.text()).slice(0, 150)}`)
    return
  }
  if (attachment) console.warn(`⚠ [Tobías] Adjunto omitido: el envío de archivos por ${inst.provider} todavía no está soportado`)
  if (inst.provider === 'evolution') {
    const evoUrl = settings.evo_url || process.env.EVO_URL || ''
    const r = await fetch(`${evoUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: inst.instance_token },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!r.ok) throw new Error(`EvolutionGo ${r.status}: ${(await r.text()).slice(0, 150)}`)
    return
  }
  const r = await wahaReq(settings, '/api/sendText', {
    method: 'POST',
    body: JSON.stringify({ chatId: `${phone}@c.us`, text, session: inst.session_name }),
  })
  if (!r.ok) throw new Error(`WAHA ${r.status}: ${(await r.text()).slice(0, 150)}`)
}

// Un envío por campaña por tick, respetando intervalo, ventana horaria y límite diario.
function lastInstanceForContact(workspaceId, contactId) {
  const conv = db.prepare('SELECT session_name FROM wa_conversations WHERE workspace_id=? AND contact_id=? ORDER BY updated_at DESC LIMIT 1')
    .get(workspaceId, contactId)
  if (!conv) return null
  return db.prepare(`SELECT * FROM channel_instances WHERE workspace_id=? AND status='WORKING'
    AND ((provider='waha' AND session_name=?) OR (provider='evolution' AND instance_name=?)) LIMIT 1`)
    .get(workspaceId, conv.session_name, conv.session_name)
}

async function runCampaignTick(c, now) {
  if (!withinHours(c.hours_start, c.hours_end)) return
  let sendDays = [0, 1, 2, 3, 4, 5, 6]
  try { sendDays = JSON.parse(c.send_days || '[0,1,2,3,4,5,6]') } catch {}
  const p = businessParts(now * 1000)
  if (!sendDays.includes(new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay())) return
  if (c.next_send_at && now < c.next_send_at) return
  // Límite diario como ventana móvil de 24 h: evita depender de la zona horaria del contenedor.
  const sentToday = db.prepare('SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id=? AND sent_at >= ?')
    .get(c.id, now - 86400).n
  if (sentToday >= (c.daily_limit || 50)) return

  const defaultInst = resolveCampaignInstance(c.workspace_id, c.channel_mode === 'last' ? null : c.channel_instance_id)
  if (!defaultInst) { console.warn(`⚠ [Tobías] Campaña ${c.id}: sin canal de WhatsApp conectado`); return }

  // Salta (sin gastar el turno) a quien volvió a escribir desde que arrancó la campaña: ya no está frío.
  for (let i = 0; i < 10; i++) {
    const r = db.prepare("SELECT * FROM campaign_recipients WHERE campaign_id=? AND status='pending' ORDER BY rowid LIMIT 1").get(c.id)
    if (!r) { finishCampaign(c); return }
    const active = db.prepare('SELECT 1 FROM wa_conversations WHERE workspace_id=? AND contact_id=? AND (closed=0 OR updated_at > ?) LIMIT 1')
      .get(c.workspace_id, r.contact_id, c.started_at || 0)
    if (active) {
      db.prepare("UPDATE campaign_recipients SET status='skipped', error='Volvió a escribir antes del envío' WHERE id=?").run(r.id)
      continue
    }

    // Línea: el último número con el que venía hablando el contacto (no rompe el hilo), si sigue conectado.
    const inst = (c.channel_mode === 'last' && lastInstanceForContact(c.workspace_id, r.contact_id)) || defaultInst

    // 'sending' antes de enviar: si el proceso se cae a mitad, no se le escribe dos veces.
    db.prepare("UPDATE campaign_recipients SET status='sending' WHERE id=?").run(r.id)
    try {
      const contact = db.prepare(`
        SELECT c.*, ls.reasoning FROM contacts c
        LEFT JOIN lead_scores ls ON ls.workspace_id=c.workspace_id AND ls.contact_id=c.id
        WHERE c.id=?
      `).get(r.contact_id)
      let transcriptText = ''
      if (inst.provider === 'waha') {
        try {
          const msgs = await fetchWahaMessages(getChannelSettings(c.workspace_id), inst.session_name, `${r.phone}@c.us`, 20)
          transcriptText = msgs.slice(-20).map(m => `${m.fromMe ? 'Nosotros' : 'Lead'}: ${m.body || m.caption || ''}`).join('\n').slice(0, 4000)
        } catch {}
      }
      // Depuración con Jev (si está configurado): decide si vale la pena escribirle, sin gastar la IA de texto
      let message, skipReason
      let jevScreened = false
      if (c.ai_screening && process.env.JEV_API_KEY) {
        try {
          const state = [
            `Contacto: ${contact?.name || r.phone}${contact?.company ? ` (${contact.company})` : ''}`,
            contact?.note ? `Nota del CRM: ${contact.note}` : '',
            transcriptText ? `Últimos mensajes:\n${transcriptText}` : 'Sin historial de mensajes.',
          ].filter(Boolean).join('\n')
          const a = await jevAsk(state, {
            worth: {
              type: 'noul',
              instructions: `¿Vale la pena escribirle a este contacto en esta campaña? ${strategyObjective(c.strategy, c.objective)}`,
              criteria: {
                true: 'El contacto encaja con el objetivo de la campaña y no hay señales en contra',
                false: 'Pidió no ser contactado, ya resolvió o compró lo que ofrece la campaña, no es un cliente potencial (número equivocado, proveedor, spam) o el mensaje no tendría sentido',
              },
            },
          })
          jevScreened = true
          if ((a.worth?.noul ?? 1) < 0.4) skipReason = `Jev: no vale la pena escribirle (${Math.round(a.worth.noul * 100)}%)`
        } catch (e) { console.warn('⚠ [Tobías] Jev falló, depura la IA de texto:', e.message) }
      }
      if (skipReason) {
        db.prepare("UPDATE campaign_recipients SET status='skipped', error=? WHERE id=?").run(`Depurado por IA: ${skipReason}`.slice(0, 300), r.id)
        console.log(`🧹 [Tobías] "${c.name}" omitió ${r.phone}: ${skipReason}`)
        continue
      }
      // Plantilla: el texto sale de la plantilla; la IA solo se consulta si hay que depurar.
      if (c.message_mode === 'template') {
        if (c.ai_screening && !jevScreened) {
          ;({ skipReason } = await generateCampaignMessage({
            workspaceId: c.workspace_id, contact, transcriptText, strategy: c.strategy, objective: c.objective, screening: true,
          }))
        }
        message = renderCampaignTemplate(c.template, contact)
      } else {
        ;({ message, skipReason } = await generateCampaignMessage({
          workspaceId: c.workspace_id, contact, transcriptText, strategy: c.strategy, objective: c.objective,
          guidelines: c.guidelines, tone: c.tone, length: c.length, screening: !!c.ai_screening && !jevScreened,
        }))
      }
      if (skipReason) {
        db.prepare("UPDATE campaign_recipients SET status='skipped', error=? WHERE id=?").run(`Depurado por IA: ${skipReason}`.slice(0, 300), r.id)
        console.log(`🧹 [Tobías] "${c.name}" omitió ${r.phone}: ${skipReason}`)
        continue  // no gasta el turno de envío
      }
      if (!message) throw new Error('No se pudo generar el mensaje')
      let attachment = null
      try { attachment = c.attachment ? JSON.parse(c.attachment) : null } catch {}
      if (attachment && !existsSync(attachment.path)) attachment = null
      await sendCampaignText(c.workspace_id, inst, r.phone, message, attachment)
      db.prepare("UPDATE campaign_recipients SET status='sent', message=?, sent_at=strftime('%s','now'), error=NULL WHERE id=?").run(message, r.id)
      // Goteo: calentamiento progresivo (los primeros 10 envíos del día van al doble del intervalo)
      // y pausa aleatoria entre 0,7× y 1,6× para que el patrón no sea mecánico.
      const base = c.interval_seconds || (c.interval_minutes || 3) * 60
      const warmup = sentToday < 10 ? 2 : 1
      db.prepare('UPDATE campaigns SET next_send_at=? WHERE id=?')
        .run(Math.floor(Date.now() / 1000 + base * warmup * (0.7 + Math.random() * 0.9)), c.id)
      console.log(`📣 [Tobías] "${c.name}" → ${r.phone}: ${message.slice(0, 60)}`)
    } catch (e) {
      db.prepare("UPDATE campaign_recipients SET status='failed', error=?, sent_at=strftime('%s','now') WHERE id=?").run(e.message.slice(0, 300), r.id)
      console.error(`⚠ [Tobías] "${c.name}" → ${r.phone}:`, e.message)
    }
    sseEmit(c.workspace_id, { event: 'campaign-updated', campaignId: c.id })
    return
  }
}

let campaignsRunning = false
async function runCampaigns() {
  if (campaignsRunning) return
  campaignsRunning = true
  try {
    const now = Math.floor(Date.now() / 1000)
    // Interruptor de Tobías por workspace: apagado = no arranca ni envía nada (quedan en espera).
    const off = new Set(db.prepare('SELECT workspace_id FROM channel_settings WHERE tobias_enabled=0').all().map(r => r.workspace_id))
    for (const c of db.prepare("SELECT * FROM campaigns WHERE status='scheduled' AND scheduled_at <= ?").all(now)) {
      if (off.has(c.workspace_id)) continue
      if (c.recurrence) runCampaignSeries(c)
      else startCampaign(c)
    }
    for (const c of db.prepare("SELECT * FROM campaigns WHERE status='active'").all()) {
      if (off.has(c.workspace_id)) continue
      try { await runCampaignTick(c, now) }
      catch (e) { console.error(`⚠ [Tobías] Campaña ${c.id}:`, e.message) }
    }
  } finally { campaignsRunning = false }
}
// Si el server se reinició durante un envío, ese destinatario queda como fallido (no se reintenta: pudo haber salido).
db.prepare("UPDATE campaign_recipients SET status='failed', error='Interrumpido por reinicio del servidor' WHERE status='sending'").run()
setInterval(() => { runCampaigns().catch(e => console.error('⚠ [Tobías] sweep error:', e.message)) }, 15 * 1000)

// Ritmos de goteo: mensajes cada 30 minutos → segundos entre un envío y el siguiente.
// 'rapido' y 'personalizado' están deshabilitados en la UI por ahora.
const CAMPAIGN_PACES = { conservador: 15, equilibrado: 40 }

function campaignFields(body = {}) {
  const hhmm = (v, d) => (/^\d{2}:\d{2}$/.test(v || '') ? v : d)
  return {
    name:                (body.name || '').trim().slice(0, 120),
    description:         (body.description || '').trim().slice(0, 2000),
    strategy:            CAMPAIGN_STRATEGIES[body.strategy] ? body.strategy : 'reactivar',
    objective:           (body.objective || '').trim().slice(0, 2000),
    guidelines:          (body.guidelines || '').trim().slice(0, 2000),
    audience:            JSON.stringify(body.audience || {}),
    channel_instance_id: body.channel_instance_id || null,
    hours_start:         hhmm(body.hours_start, '09:00'),
    hours_end:           hhmm(body.hours_end, '20:00'),
    interval_minutes:    Math.min(Math.max(parseInt(body.interval_minutes, 10) || 3, 1), 240),
    daily_limit:         Math.min(Math.max(parseInt(body.daily_limit, 10) || 50, 1), 1000),
    scheduled_at:        body.scheduled_at ? parseInt(body.scheduled_at, 10) : null,
    on_reply:            ['seller', 'human'].includes(body.on_reply) ? 'seller' : 'agent',
    ai_screening:        body.ai_screening ? 1 : 0,
    channel_mode:        body.channel_mode === 'specific' ? 'specific' : 'last',
    message_mode:        body.message_mode === 'template' ? 'template' : 'ai',
    tone:                CAMPAIGN_TONES[body.tone] ? body.tone : 'cercano',
    length:              CAMPAIGN_LENGTHS[body.length] ? body.length : 'medio',
    template:            (body.template || '').slice(0, 4000),
    attachment:          body.attachment?.id ? JSON.stringify(campaignAttachmentById(body.attachment.id)) : null,
    pace:                CAMPAIGN_PACES[body.pace] ? body.pace : 'conservador',
    interval_seconds:    Math.round(1800 / (CAMPAIGN_PACES[body.pace] || CAMPAIGN_PACES.conservador)),
    send_days:           JSON.stringify([...new Set((Array.isArray(body.send_days) ? body.send_days : [0, 1, 2, 3, 4, 5, 6])
                           .map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))]),
    recurrence:          body.launch === 'recurring' && RECURRENCES.includes(body.recurrence) ? body.recurrence : null,
    recurrence_time:     hhmm(body.recurrence_time, '09:30'),
    recurrence_days:     JSON.stringify([...new Set((Array.isArray(body.recurrence_days) ? body.recurrence_days : [])
                           .map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))]),
    recurrence_until:    body.recurrence_until ? parseInt(body.recurrence_until, 10) : null,
  }
}

const CAMPAIGN_STATS_SQL = `
  SELECT c.*, COUNT(cr.id) AS total,
    COALESCE(SUM(cr.status='pending'), 0)              AS pending,
    COALESCE(SUM(cr.status IN ('sent','replied')), 0)  AS sent,
    COALESCE(SUM(cr.status='replied'), 0)              AS replied,
    COALESCE(SUM(cr.status='failed'), 0)               AS failed,
    COALESCE(SUM(cr.status='skipped'), 0)              AS skipped
  FROM campaigns c LEFT JOIN campaign_recipients cr
    ON cr.campaign_id=c.id OR cr.campaign_id IN (SELECT id FROM campaigns WHERE parent_id=c.id)`

// Adjuntos de campaña: JPG/PNG hasta 5 MB, PDF hasta 50 MB. Se suben en binario (body crudo,
// nombre en X-Filename) y quedan junto a la base de datos, en el volumen persistente.
const CAMPAIGN_FILES_DIR = join(dirname(DB_PATH), 'campaign_files')
const CAMPAIGN_ATTACHMENT_TYPES = {
  'image/jpeg': 5 * 1024 * 1024, 'image/png': 5 * 1024 * 1024, 'application/pdf': 50 * 1024 * 1024,
}
const campaignAttachments = new Map()  // id → { id, filename, mimetype, size, path } (subidos y aún no guardados)
function campaignAttachmentById(id) {
  if (campaignAttachments.has(id)) return campaignAttachments.get(id)
  const row = db.prepare("SELECT attachment FROM campaigns WHERE attachment LIKE ? LIMIT 1").get(`%"id":"${String(id).replace(/[^\w-]/g, '')}"%`)
  try { return row ? JSON.parse(row.attachment) : null } catch { return null }
}

app.post('/api/campaigns/attachments', requireAriaAuth, express.raw({ type: () => true, limit: '51mb' }), (req, res) => {
  const mimetype = (req.headers['content-type'] || '').split(';')[0].trim()
  const maxSize = CAMPAIGN_ATTACHMENT_TYPES[mimetype]
  if (!maxSize) return res.status(400).json({ error: 'Formato no permitido: solo JPG, PNG o PDF' })
  const buf = req.body
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Archivo vacío' })
  if (buf.length > maxSize) return res.status(400).json({ error: `El archivo supera ${maxSize / 1024 / 1024} MB` })
  const filename = decodeURIComponent(req.headers['x-filename'] || 'adjunto').replace(/[\/\\]/g, '_').slice(0, 120)
  const id = randomUUID()
  const dir = join(CAMPAIGN_FILES_DIR, req.ariaUser.workspaceId)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, id + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' }[mimetype]))
  writeFileSync(path, buf)
  const meta = { id, filename, mimetype, size: buf.length, path }
  campaignAttachments.set(id, meta)
  const { path: _p, ...pub } = meta
  res.json(pub)
})

// ── Axel — auditor comercial ──────────────────────────────────────────────────
// Segundos hábiles entre dos instantes: solo cuenta lo que cae dentro del horario laboral (hora del negocio).
function businessSecondsBetween(a, b, start = '09:00', end = '18:00', days = [0, 1, 2, 3, 4, 5, 6]) {
  if (!a || !b || b <= a) return 0
  const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number)
  const p = businessParts(a * 1000)
  let total = 0
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d + i))
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate()
    const ws = businessToEpochMs(y, m, dd, sh, sm) / 1000, we = businessToEpochMs(y, m, dd, eh, em) / 1000
    if (ws >= b) break
    if (!days.includes(d.getUTCDay())) continue
    total += Math.max(0, Math.min(b, we) - Math.max(a, ws))
  }
  return Math.round(total)
}

// Variables del análisis profundo: { label, entity: conversations|tasks|opportunities, rule }.
// La regla es la instrucción al agente (qué debería hacer el vendedor), no una descripción.
const AXEL_ENTITIES = ['conversations', 'tasks', 'opportunities']
const AXEL_ENTITY_LABELS = { conversations: 'Conversaciones', tasks: 'Tareas', opportunities: 'Oportunidades' }
const AXEL_DEFAULT_DIMENSIONS = [
  { label: 'Velocidad de respuesta', entity: 'conversations', rule: 'El vendedor responde rápido y no deja mensajes del cliente sin contestar.' },
  { label: 'Calidad de la atención', entity: 'conversations', rule: 'El vendedor es claro, empático y responde exactamente lo que el cliente preguntó.' },
  { label: 'Manejo de objeciones', entity: 'conversations', rule: 'Ante dudas de precio, tiempo o confianza, el vendedor las indaga y las responde con argumentos, sin abandonar la conversación.' },
  { label: 'Seguimiento y cierre', entity: 'tasks', rule: 'El vendedor agenda y cumple seguimientos, y propone un próximo paso concreto en cada conversación.' },
]
function normalizeAxelDimension(d) {
  if (typeof d === 'string') return { label: d, entity: 'conversations', rule: '' }
  return {
    label: String(d?.label || '').trim().slice(0, 120),
    entity: AXEL_ENTITIES.includes(d?.entity) ? d.entity : 'conversations',
    rule: String(d?.rule || '').trim().slice(0, 1000),
  }
}
const AXEL_DEFAULT_SCHEDULE = { enabled: false, frequency: 'weekly', days: [1], month_day: 1 }
function axelConfig(workspaceId) {
  const cs = db.prepare(`SELECT axel_sla_minutes, axel_dimensions, axel_rules, axel_schedule,
    axel_work_start, axel_work_end, axel_sla_seconds, axel_risk_hours, axel_work_days FROM channel_settings WHERE workspace_id=?`).get(workspaceId)
  let dimensions = null, schedule = null, workDays = null
  try { workDays = cs?.axel_work_days ? JSON.parse(cs.axel_work_days) : null } catch {}
  try { dimensions = cs?.axel_dimensions ? JSON.parse(cs.axel_dimensions) : null } catch {}
  try { schedule = cs?.axel_schedule ? JSON.parse(cs.axel_schedule) : null } catch {}
  return {
    work_start: cs?.axel_work_start || '09:00',
    work_end: cs?.axel_work_end || '18:00',
    work_days: Array.isArray(workDays) && workDays.length ? workDays : [1, 2, 3, 4, 5],
    sla_seconds: cs?.axel_sla_seconds || 7200,
    risk_hours: cs?.axel_risk_hours || 48,
    // custom_dimensions: lo que cargó el usuario (puede estar vacío); dimensions: lo que se usa
    custom_dimensions: Array.isArray(dimensions) ? dimensions.map(normalizeAxelDimension).filter(d => d.label) : [],
    dimensions: Array.isArray(dimensions) && dimensions.length
      ? dimensions.map(normalizeAxelDimension).filter(d => d.label)
      : AXEL_DEFAULT_DIMENSIONS,
    rules: cs?.axel_rules || '',
    schedule: { ...AXEL_DEFAULT_SCHEDULE, ...(schedule || {}) },
  }
}

// Métricas por vendedor sobre las conversaciones que se le derivaron en el rango [from, to].
function axelSellerMetrics(wsId, from, to, q = '') {
  const now = Math.floor(Date.now() / 1000)
  const cfg = axelConfig(wsId)
  const sla = cfg.sla_seconds
  const riskSecs = cfg.risk_hours * 3600
  const bsecs = (a, b) => businessSecondsBetween(a, b, cfg.work_start, cfg.work_end, cfg.work_days)

  const users = db.prepare('SELECT id, name, email, role FROM users WHERE workspace_id=? ORDER BY name').all(wsId)
    .filter(u => !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
  const convs = db.prepare(`
    SELECT wc.*, (SELECT 1 FROM funnel_stages fs WHERE fs.workspace_id=wc.workspace_id AND fs.lead_id=wc.contact_id) AS has_opp
    FROM wa_conversations wc
    WHERE wc.workspace_id=? AND wc.assigned_user_id IS NOT NULL AND wc.handoff_at BETWEEN ? AND ?
  `).all(wsId, from, to)
  const lastEvent = db.prepare('SELECT direction, at FROM wa_message_events WHERE workspace_id=? AND contact_id=? ORDER BY at DESC, id DESC LIMIT 1')

  const sellers = users.map(u => {
    const mine = convs.filter(c => c.assigned_user_id === u.id)
    const times = mine.filter(c => c.first_human_reply_at).map(c => bsecs(c.handoff_at, c.first_human_reply_at))
    const breached = mine.filter(c => bsecs(c.handoff_at, c.first_human_reply_at || now) > sla).length
    const noReply48 = mine.filter(c => {
      const ev = c.contact_id && lastEvent.get(wsId, c.contact_id)
      return ev && ev.direction === 'in' && now - ev.at > riskSecs
    }).length
    const opps = new Set(mine.filter(c => c.has_opp).map(c => c.contact_id)).size
    return {
      id: u.id, name: u.name || u.email, email: u.email, role: u.role,
      conversations: mine.length,
      opportunities: opps,
      avg_first_reply: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      no_reply_48h: noReply48,
      sla_breached: breached,
      compliance: mine.length ? Math.round(((mine.length - breached) / mine.length) * 1000) / 10 : null,
      _convs: mine,
    }
  })
  return sellers
}

app.get('/api/axel/sellers', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const now = Math.floor(Date.now() / 1000)
  const from = parseInt(req.query.from, 10) || now - 30 * 86400
  const to = parseInt(req.query.to, 10) || now
  const sellers = axelSellerMetrics(wsId, from, to, (req.query.q || '').trim().toLowerCase())
    .map(({ _convs, ...s }) => s)
  const cfg = axelConfig(wsId)
  res.json({ sellers, sla_seconds: cfg.sla_seconds, risk_hours: cfg.risk_hours, work_start: cfg.work_start, work_end: cfg.work_end, work_days: cfg.work_days, from, to })
})

// ── Análisis profundo: la IA interpreta datos ya calculados + muestras de conversaciones ──
const fmtArDate = ts => new Date(ts * 1000).toLocaleDateString('es-AR', { timeZone: BUSINESS_TZ })

async function runAxelAnalysis(analysisId) {
  const a = db.prepare('SELECT * FROM axel_analyses WHERE id=?').get(analysisId)
  if (!a) return
  try {
    const cfg = axelConfig(a.workspace_id)
    const dims = JSON.parse(a.dimensions || '[]').map(normalizeAxelDimension)
    const entities = new Set(dims.map(d => d.entity))
    const seller = axelSellerMetrics(a.workspace_id, a.range_from, a.range_to).find(s => s.id === a.seller_id)
    if (!seller) throw new Error('El vendedor ya no existe en el workspace')
    const { _convs, ...metrics } = seller

    // Muestras: hasta 8 conversaciones del rango (WAHA es el único canal con historial consultable)
    const settings = getChannelSettings(a.workspace_id)
    const samples = []
    for (const c of _convs.slice(-8)) {
      const inst = db.prepare("SELECT provider FROM channel_instances WHERE workspace_id=? AND session_name=?").get(a.workspace_id, c.session_name)
      if (inst?.provider !== 'waha') continue
      try {
        const msgs = await fetchWahaMessages(settings, c.session_name, c.wa_from, 40)
        const contact = c.contact_id && db.prepare('SELECT name, phone FROM contacts WHERE id=?').get(c.contact_id)
        samples.push(`### Conversación con ${contact?.name || contact?.phone || 'contacto'} (derivada el ${fmtArDate(c.handoff_at)})\n` +
          msgs.slice(-40).map(m => `${m.fromMe ? 'Nosotros' : 'Cliente'}: ${m.body || m.caption || '[adjunto]'}`).join('\n'))
      } catch {}
    }

    // Datos extra según las entidades que piden las variables
    const extra = []
    if (entities.has('tasks')) {
      const tasks = db.prepare(`SELECT title, status, priority, due_date FROM tasks
        WHERE workspace_id=? AND assignee_id=? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 30`)
        .all(a.workspace_id, a.seller_id, a.range_from, a.range_to)
      const late = tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < Math.floor(Date.now() / 1000)).length
      extra.push(`### Tareas del vendedor en el período (${tasks.length}, vencidas sin completar: ${late})\n` +
        (tasks.map(t => `- [${t.status}] ${t.title}${t.due_date ? ` (vence ${fmtArDate(t.due_date)})` : ''}`).join('\n') || 'Sin tareas.'))
    }
    if (entities.has('opportunities')) {
      const opps = [...new Set(_convs.map(c => c.contact_id).filter(Boolean))].map(cid => db.prepare(`
        SELECT c.name, c.phone, fs.stage, fs.lead_status FROM contacts c
        LEFT JOIN funnel_stages fs ON fs.workspace_id=c.workspace_id AND fs.lead_id=c.id WHERE c.id=?`).get(cid)).filter(Boolean)
      extra.push(`### Oportunidades de sus conversaciones (${opps.length})\n` +
        (opps.map(o => `- ${o.name || o.phone}: etapa ${o.stage || 'sin embudo'}${o.lead_status && o.lead_status !== 'open' ? ` (${o.lead_status})` : ''}`).join('\n') || 'Sin oportunidades.'))
    }

    const metricsText = [
      `Conversaciones derivadas: ${metrics.conversations}`,
      `Oportunidades: ${metrics.opportunities}`,
      `Tiempo medio de 1ª respuesta (en horario laboral ${cfg.work_start}–${cfg.work_end}): ${metrics.avg_first_reply == null ? 'sin datos' : Math.round(metrics.avg_first_reply / 60) + ' min'}`,
      `En riesgo (sin respuesta hace más de ${cfg.risk_hours} h): ${metrics.no_reply_48h}`,
      `SLA de primera respuesta (${Math.round(cfg.sla_seconds / 60)} min hábiles) vencido: ${metrics.sla_breached}`,
      `Cumplimiento de SLA: ${metrics.compliance == null ? 'sin datos' : metrics.compliance + '%'}`,
    ].join('\n')

    const system = `Sos Axel, auditor comercial. Mirás cómo vende un vendedor y decís, sin vueltas, por qué se escapan las ventas.
Analizá a ${metrics.name} entre el ${fmtArDate(a.range_from)} y el ${fmtArDate(a.range_to)}.

Datos duros del período (ya calculados: interpretalos, no los recalcules ni inventes otros números):
${metricsText}
${cfg.rules ? `\nReglas comerciales del negocio:\n${cfg.rules}\n` : ''}
Formato de la respuesta (en español rioplatense, directo, sin relleno):
${dims.map(d => `## ${d.label} (sobre ${AXEL_ENTITY_LABELS[d.entity]})\n${d.rule ? `Criterio a evaluar: ${d.rule}\n` : ''}Decí si el vendedor cumple el criterio, con hallazgos concretos (citá frases breves cuando sirva) y una recomendación accionable.`).join('\n')}
${a.question ? `## Pregunta adicional: ${a.question}\nRespondela con lo que muestran los datos y las conversaciones.` : ''}
## Por qué se escapan las ventas
Las 3 causas principales, en orden de impacto.

Si no hay conversaciones o datos suficientes para una dimensión, decilo en una línea en vez de suponer.`
    const userMsg = [
      samples.length ? samples.join('\n\n').slice(0, 20000) : 'No hay conversaciones con historial disponible en el período.',
      ...extra,
    ].join('\n\n')
    const result = await callLLMDirect({ system, userMsg, workspaceId: a.workspace_id })
    if (!result) throw new Error('La IA no devolvió respuesta')
    db.prepare("UPDATE axel_analyses SET status='done', result=?, metrics=? WHERE id=?").run(result, JSON.stringify(metrics), analysisId)
    console.log(`🔎 [Axel] Análisis listo: ${metrics.name}`)
  } catch (e) {
    db.prepare("UPDATE axel_analyses SET status='error', error=? WHERE id=?").run(e.message.slice(0, 300), analysisId)
    console.error('⚠ [Axel] Análisis falló:', e.message)
  }
  sseEmit(a.workspace_id, { event: 'axel-analysis', id: analysisId })
}

app.get('/api/axel/config', requireAriaAuth, (req, res) => res.json(axelConfig(req.ariaUser.workspaceId)))

app.put('/api/axel/config', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const cur = axelConfig(wsId)
  const b = req.body || {}
  const hhmm = (v, d) => (/^\d{2}:\d{2}$/.test(v || '') ? v : d)
  const workStart = hhmm(b.work_start, cur.work_start)
  const workEnd = hhmm(b.work_end, cur.work_end)
  if (workStart >= workEnd) return res.status(400).json({ error: 'El fin del horario laboral tiene que ser posterior al inicio' })
  const slaSecs = b.sla_seconds != null && b.sla_seconds !== '' ? Math.min(Math.max(parseInt(b.sla_seconds, 10) || 7200, 1), 30 * 86400) : cur.sla_seconds
  const workDays = Array.isArray(b.work_days)
    ? [...new Set(b.work_days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))]
    : cur.work_days
  if (!workDays.length) return res.status(400).json({ error: 'Elegí al menos un día laborable' })
  const riskHours = b.risk_hours != null && b.risk_hours !== '' ? Math.min(Math.max(parseInt(b.risk_hours, 10) || 48, 1), 24 * 90) : cur.risk_hours
  let schedule = cur.schedule
  if (b.schedule) {
    const sc = b.schedule
    const days = [...new Set((Array.isArray(sc.days) ? sc.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))]
    schedule = {
      enabled: !!sc.enabled,
      frequency: ['daily', 'weekly', 'monthly'].includes(sc.frequency) ? sc.frequency : 'weekly',
      days,
      month_day: Math.min(Math.max(parseInt(sc.month_day, 10) || 1, 1), 28),
    }
    if (schedule.enabled && schedule.frequency === 'weekly' && !days.length) {
      return res.status(400).json({ error: 'Elegí al menos un día de la semana' })
    }
  }
  const dimensions = Array.isArray(b.dimensions)
    ? b.dimensions.map(normalizeAxelDimension).filter(d => d.label).slice(0, 20)
    : cur.custom_dimensions
  const rules = b.rules != null ? String(b.rules).slice(0, 4000) : cur.rules
  if (!db.prepare('SELECT 1 FROM channel_settings WHERE workspace_id=?').get(wsId)) {
    db.prepare('INSERT INTO channel_settings (workspace_id) VALUES (?)').run(wsId)
  }
  db.prepare(`UPDATE channel_settings SET axel_work_start=?, axel_work_end=?, axel_work_days=?, axel_sla_seconds=?, axel_risk_hours=?,
      axel_schedule=?, axel_dimensions=?, axel_rules=? WHERE workspace_id=?`)
    .run(workStart, workEnd, JSON.stringify(workDays), slaSecs, riskHours, JSON.stringify(schedule), JSON.stringify(dimensions), rules, wsId)
  res.json(axelConfig(wsId))
})

// Ejecución programada: a las 8:00 (hora del negocio) de cada día que corresponda, analiza a todos
// los vendedores del workspace sobre el período cubierto (día / semana / mes anterior).
const AXEL_RUN_HOUR = 8
function createAxelAnalysesFor(wsId, users, from, to, question, createdBy) {
  const cfg = axelConfig(wsId)
  return users.map(u => {
    const id = randomUUID()
    db.prepare(`INSERT INTO axel_analyses (id, workspace_id, seller_id, seller_name, range_from, range_to, question, dimensions, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, wsId, u.id, u.name || u.email, from, to, question || null, JSON.stringify(cfg.dimensions), createdBy)
    return id
  })
}
let axelScheduleRunning = false
async function runAxelSchedules() {
  if (axelScheduleRunning) return
  const p = businessParts(Date.now())
  if (p.hh < AXEL_RUN_HOUR) return
  const today = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  axelScheduleRunning = true
  try {
    for (const row of db.prepare("SELECT workspace_id, axel_last_run FROM channel_settings WHERE axel_schedule LIKE '%\"enabled\":true%'").all()) {
      if (row.axel_last_run === today) continue
      const { schedule } = axelConfig(row.workspace_id)
      const due = schedule.frequency === 'daily'
        || (schedule.frequency === 'weekly' && schedule.days.includes(weekday))
        || (schedule.frequency === 'monthly' && p.d === schedule.month_day)
      if (!due) continue
      db.prepare('UPDATE channel_settings SET axel_last_run=? WHERE workspace_id=?').run(today, row.workspace_id)
      const spanDays = schedule.frequency === 'daily' ? 1 : schedule.frequency === 'weekly' ? 7 : 30
      const to = Math.floor(Date.now() / 1000)
      const users = db.prepare('SELECT id, name, email FROM users WHERE workspace_id=?').all(row.workspace_id)
      const ids = createAxelAnalysesFor(row.workspace_id, users, to - spanDays * 86400, to, null, 'Ejecución programada')
      console.log(`🔎 [Axel] Ejecución programada (${schedule.frequency}): ${ids.length} análisis en workspace ${row.workspace_id}`)
      for (const id of ids) await runAxelAnalysis(id)
    }
  } finally { axelScheduleRunning = false }
}
setInterval(() => { runAxelSchedules().catch(e => console.error('⚠ [Axel] programación:', e.message)) }, 10 * 60 * 1000)

app.get('/api/axel/analyses', requireAriaAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, seller_id, seller_name, range_from, range_to, question, dimensions, status, error, created_at,
      substr(result, 1, 400) AS excerpt FROM axel_analyses WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200`)
    .all(req.ariaUser.workspaceId)
  res.json(rows.map(r => ({ ...r, dimensions: JSON.parse(r.dimensions || '[]') })))
})

app.get('/api/axel/analyses/:id', requireAriaAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM axel_analyses WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!r) return res.status(404).json({ error: 'Análisis no encontrado' })
  res.json({ ...r, dimensions: JSON.parse(r.dimensions || '[]'), metrics: JSON.parse(r.metrics || 'null') })
})

// Un análisis por vendedor; corren en segundo plano, de a uno
app.post('/api/axel/analyses', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const { seller_ids, from, to, question } = req.body || {}
  const ids = Array.isArray(seller_ids) ? seller_ids : []
  if (!ids.length) return res.status(400).json({ error: 'Elegí al menos un vendedor' })
  const f = parseInt(from, 10), t = parseInt(to, 10)
  if (!f || !t || f > t) return res.status(400).json({ error: 'Rango de fechas inválido' })
  const users = db.prepare(`SELECT id, name, email FROM users WHERE workspace_id=? AND id IN (${ids.map(() => '?').join(',')})`).all(wsId, ...ids)
  const created = createAxelAnalysesFor(wsId, users, f, t, (question || '').trim().slice(0, 1000), req.ariaUser.email || null)
  ;(async () => { for (const id of created) await runAxelAnalysis(id) })()
  res.json({ ids: created })
})

// Exporta como .txt (el token va por query: se abre como descarga directa)
app.get('/api/axel/analyses/:id/export', requireAriaAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM axel_analyses WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!r) return res.status(404).json({ error: 'Análisis no encontrado' })
  const text = [
    `Análisis profundo — ${r.seller_name}`,
    `Período: ${fmtArDate(r.range_from)} al ${fmtArDate(r.range_to)}`,
    `Generado: ${new Date(r.created_at * 1000).toLocaleString('es-AR', { timeZone: BUSINESS_TZ })}`,
    r.question ? `Pregunta adicional: ${r.question}` : null,
    '', r.status === 'done' ? r.result : `(${r.status === 'error' ? 'Error: ' + r.error : 'En curso'})`,
  ].filter(x => x !== null).join('\n')
  const safe = (r.seller_name || 'vendedor').normalize('NFD').replace(/[^\w-]+/g, '_')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="analisis_${safe}_${fmtArDate(r.range_from).replace(/\//g, '-')}.txt"`)
  res.send(text)
})

app.delete('/api/axel/analyses/:id', requireAriaAuth, (req, res) => {
  db.prepare('DELETE FROM axel_analyses WHERE id=? AND workspace_id=?').run(req.params.id, req.ariaUser.workspaceId)
  res.json({ ok: true })
})

// Si el server se reinició con análisis en curso, quedan como error (se pueden volver a ejecutar)
db.prepare("UPDATE axel_analyses SET status='error', error='Interrumpido por reinicio del servidor' WHERE status='running'").run()

app.get('/api/campaigns/settings', requireAriaAuth, (req, res) => {
  const cs = db.prepare('SELECT tobias_enabled FROM channel_settings WHERE workspace_id=?').get(req.ariaUser.workspaceId)
  res.json({ enabled: cs ? cs.tobias_enabled !== 0 : true })
})

app.put('/api/campaigns/settings', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const enabled = req.body?.enabled ? 1 : 0
  if (db.prepare('SELECT 1 FROM channel_settings WHERE workspace_id=?').get(wsId)) {
    db.prepare('UPDATE channel_settings SET tobias_enabled=? WHERE workspace_id=?').run(enabled, wsId)
  } else {
    db.prepare('INSERT INTO channel_settings (workspace_id, tobias_enabled) VALUES (?,?)').run(wsId, enabled)
  }
  console.log(`📣 [Tobías] ${enabled ? 'Activado' : 'Desactivado'} en workspace ${wsId}`)
  res.json({ enabled: !!enabled })
})

app.get('/api/campaigns', requireAriaAuth, (req, res) => {
  const rows = db.prepare(`${CAMPAIGN_STATS_SQL} WHERE c.workspace_id=? GROUP BY c.id ORDER BY c.created_at DESC`).all(req.ariaUser.workspaceId)
  res.json(rows.map(parseCampaign))
})

// Resumen de Ventas de Tobías (histórico completo del workspace). "Entregados" = aceptados por el
// proveedor de WhatsApp; no hay acuse de entrega real todavía.
app.get('/api/campaigns/summary', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const byStatus = Object.fromEntries(CAMPAIGN_STATUSES.map(s => [s, 0]))
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM campaigns WHERE workspace_id=? GROUP BY status').all(wsId)) byStatus[r.status] = r.n
  const t = db.prepare(`
    SELECT
      COALESCE(SUM(status IN ('sent','replied','failed')), 0) AS contacted,
      COALESCE(SUM(status IN ('sent','replied')), 0)          AS delivered,
      COALESCE(SUM(status='replied'), 0)                      AS replied,
      COALESCE(SUM(handed_off=1), 0)                          AS handed_off,
      COUNT(DISTINCT CASE WHEN status IN ('sent','replied') THEN contact_id END) AS reached,
      AVG(CASE WHEN status='replied' AND replied_at IS NOT NULL AND sent_at IS NOT NULL THEN replied_at - sent_at END) AS avg_first_reply
    FROM campaign_recipients WHERE workspace_id=?
  `).get(wsId)
  res.json({
    byStatus, ...t,
    avg_first_reply: t.avg_first_reply == null ? null : Math.round(t.avg_first_reply),
    reply_rate: t.delivered ? Math.round((t.replied / t.delivered) * 1000) / 10 : 0,
  })
})

app.post('/api/campaigns/preview', requireAriaAuth, (req, res) => {
  const audience = buildCampaignAudience(req.ariaUser.workspaceId, req.body?.audience || {}, req.body?.strategy)
  const manual = audience.filter(a => a.manual).length
  res.json({
    count: audience.length, filter_count: audience.length - manual, manual_count: manual,
    filter_ids: audience.filter(a => !a.manual).map(a => a.contact_id),
    sample: audience.filter(a => !a.manual).slice(0, 8).map(({ note, reasoning, ...a }) => a),
  })
})

// Muestra cómo escribiría Tobías: genera el mensaje para el primer contacto de la audiencia, sin enviarlo.
app.post('/api/campaigns/sample-message', requireAriaAuth, async (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const { objective, guidelines, audience, strategy, tone, length, message_mode, template } = req.body || {}
  if (message_mode !== 'template' && !objective?.trim()) return res.status(400).json({ error: 'Falta el objetivo de la campaña' })
  try {
    const first = buildCampaignAudience(wsId, audience || {}, strategy)[0] || null
    const message = message_mode === 'template'
      ? renderCampaignTemplate(template, first)
      : (await generateCampaignMessage({ workspaceId: wsId, contact: first, transcriptText: '', strategy, objective, guidelines, tone, length })).message
    res.json({ message, contact: first ? { name: first.name, phone: first.phone } : null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/campaigns', requireAriaAuth, (req, res) => {
  const wsId = req.ariaUser.workspaceId
  const f = campaignFields(req.body)
  const launch = req.body?.launch || 'draft'
  if (!f.name) return res.status(400).json({ error: 'Falta el nombre de la campaña' })
  if (launch !== 'draft' && !f.objective) return res.status(400).json({ error: 'Falta el objetivo de la campaña' })
  if (launch === 'schedule' && !(f.scheduled_at > Math.floor(Date.now() / 1000))) return res.status(400).json({ error: 'La fecha programada tiene que ser futura' })
  let firstRun = null
  if (launch === 'recurring') {
    if (!f.recurrence) return res.status(400).json({ error: 'Elegí la frecuencia de la campaña recurrente' })
    if (f.recurrence_days === '[]') return res.status(400).json({ error: 'Elegí al menos un día' })
    firstRun = nextCampaignRun(f)
    if (!firstRun) return res.status(400).json({ error: 'No hay ninguna corrida antes de la fecha de fin' })
  }
  const id = randomUUID()
  db.prepare(`
    INSERT INTO campaigns (id, workspace_id, name, description, strategy, status, objective, guidelines, audience, channel_instance_id,
      scheduled_at, hours_start, hours_end, interval_minutes, daily_limit, on_reply, recurrence,
      recurrence_time, recurrence_days, recurrence_until, ai_screening, channel_mode, pace, interval_seconds, send_days,
      message_mode, tone, length, template, attachment, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, wsId, f.name, f.description, f.strategy,
    (launch === 'schedule' || launch === 'recurring') ? 'scheduled' : 'draft',
    f.objective, f.guidelines, f.audience, f.channel_instance_id,
    launch === 'schedule' ? f.scheduled_at : firstRun,
    f.hours_start, f.hours_end, f.interval_minutes, f.daily_limit, f.on_reply, f.recurrence,
    f.recurrence_time, f.recurrence_days, f.recurrence_until, f.ai_screening, f.channel_mode, f.pace, f.interval_seconds,
    f.send_days, f.message_mode, f.tone, f.length, f.template, f.attachment, req.ariaUser.email || null)
  if (launch === 'now') startCampaign(db.prepare('SELECT * FROM campaigns WHERE id=?').get(id))
  res.json(parseCampaign(db.prepare(`${CAMPAIGN_STATS_SQL} WHERE c.id=? GROUP BY c.id`).get(id)))
})

app.put('/api/campaigns/:id', requireAriaAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' })
  if (!['draft', 'scheduled', 'paused'].includes(c.status)) return res.status(400).json({ error: 'Pausá la campaña antes de editarla' })
  const f = campaignFields(req.body)
  if (!f.name) return res.status(400).json({ error: 'Falta el nombre de la campaña' })
  db.prepare(`
    UPDATE campaigns SET name=?, description=?, strategy=?, objective=?, guidelines=?, audience=?, channel_instance_id=?, hours_start=?, hours_end=?,
      interval_minutes=?, daily_limit=?, on_reply=?, recurrence=?, recurrence_time=?, recurrence_days=?, recurrence_until=?, ai_screening=?,
      channel_mode=?, pace=?, interval_seconds=?, send_days=?, message_mode=?, tone=?, length=?, template=?, attachment=?,
      scheduled_at=COALESCE(?, scheduled_at), updated_at=strftime('%s','now')
    WHERE id=?
  `).run(f.name, f.description, f.strategy, f.objective, f.guidelines, f.audience, f.channel_instance_id, f.hours_start, f.hours_end,
    f.interval_minutes, f.daily_limit, f.on_reply, f.recurrence, f.recurrence_time, f.recurrence_days, f.recurrence_until,
    f.ai_screening, f.channel_mode, f.pace, f.interval_seconds, f.send_days, f.message_mode, f.tone, f.length, f.template, f.attachment,
    f.scheduled_at, c.id)
  if (c.recurrence && c.status === 'scheduled' && f.recurrence) {
    const next = nextCampaignRun(f)
    if (next) db.prepare('UPDATE campaigns SET scheduled_at=? WHERE id=?').run(next, c.id)
  }
  // Desde el asistente, un borrador/programada se puede lanzar o (re)programar al guardar.
  const launch = req.body?.launch
  if (['draft', 'scheduled'].includes(c.status) && launch && launch !== 'draft') {
    if (!f.objective) return res.status(400).json({ error: 'Falta el objetivo de la campaña' })
    if (launch === 'schedule') {
      if (!(f.scheduled_at > Math.floor(Date.now() / 1000))) return res.status(400).json({ error: 'La fecha programada tiene que ser futura' })
      db.prepare("UPDATE campaigns SET status='scheduled' WHERE id=?").run(c.id)
    } else if (launch === 'recurring') {
      if (!f.recurrence) return res.status(400).json({ error: 'Elegí la frecuencia de la campaña recurrente' })
      const firstRun = nextCampaignRun(f)
      if (!firstRun) return res.status(400).json({ error: 'No hay ninguna corrida antes de la fecha de fin' })
      db.prepare("UPDATE campaigns SET status='scheduled', scheduled_at=? WHERE id=?").run(firstRun, c.id)
    } else if (launch === 'now') {
      startCampaign(db.prepare('SELECT * FROM campaigns WHERE id=?').get(c.id))
    }
  }
  res.json(parseCampaign(db.prepare(`${CAMPAIGN_STATS_SQL} WHERE c.id=? GROUP BY c.id`).get(c.id)))
})

app.post('/api/campaigns/:id/action', requireAriaAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' })
  const action = req.body?.action
  const set = (status, extra = '') =>
    db.prepare(`UPDATE campaigns SET status=?, updated_at=strftime('%s','now')${extra} WHERE id=?`).run(status, c.id)
  if (action === 'start' && ['draft', 'scheduled'].includes(c.status)) {
    if (!c.objective) return res.status(400).json({ error: 'Completá el objetivo antes de lanzar' })
    // Serie: "lanzar ahora" adelanta una corrida y la serie sigue con su calendario.
    if (c.recurrence) runCampaignSeries(c)
    else startCampaign(c)
  } else if (action === 'pause' && ['active', 'scheduled'].includes(c.status)) {
    set('paused')
  } else if (action === 'resume' && c.status === 'paused') {
    const hasPending = db.prepare("SELECT 1 FROM campaign_recipients WHERE campaign_id=? AND status='pending' LIMIT 1").get(c.id)
    if (c.recurrence) {
      const next = nextCampaignRun(c)
      if (next) db.prepare("UPDATE campaigns SET status='scheduled', scheduled_at=?, updated_at=strftime('%s','now') WHERE id=?").run(next, c.id)
      else set('finished', ", finished_at=strftime('%s','now')")
    }
    else if (hasPending || c.started_at) set('active')
    else startCampaign(c)
  } else if (action === 'finish' && c.status !== 'finished') {
    db.prepare("UPDATE campaign_recipients SET status='skipped', error='Campaña finalizada manualmente' WHERE campaign_id=? AND status='pending'").run(c.id)
    set('finished', ", finished_at=strftime('%s','now')")
  } else {
    return res.status(400).json({ error: `No se puede "${action}" una campaña en estado ${c.status}` })
  }
  sseEmit(c.workspace_id, { event: 'campaign-updated', campaignId: c.id })
  res.json(parseCampaign(db.prepare(`${CAMPAIGN_STATS_SQL} WHERE c.id=? GROUP BY c.id`).get(c.id)))
})

app.delete('/api/campaigns/:id', requireAriaAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' })
  if (c.status === 'active') return res.status(400).json({ error: 'Pausá la campaña antes de eliminarla' })
  db.transaction(() => {
    db.prepare('DELETE FROM campaign_recipients WHERE campaign_id=?').run(c.id)
    db.prepare('DELETE FROM campaigns WHERE id=?').run(c.id)
  })()
  res.json({ ok: true })
})

app.get('/api/campaigns/:id/recipients', requireAriaAuth, (req, res) => {
  const c = db.prepare('SELECT id FROM campaigns WHERE id=? AND workspace_id=?').get(req.params.id, req.ariaUser.workspaceId)
  if (!c) return res.status(404).json({ error: 'Campaña no encontrada' })
  res.json(db.prepare('SELECT * FROM campaign_recipients WHERE campaign_id=? ORDER BY rowid').all(c.id))
})

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
async function getDifyAdminToken(attempt = 1) {
  const difyUrl  = process.env.DIFY_URL            || 'https://dify.saludok.com.ar'
  const email    = process.env.DIFY_ADMIN_EMAIL    || 'hernan527@gmail.com'
  const password = process.env.DIFY_ADMIN_PASSWORD || ''
  const passwordB64 = Buffer.from(password).toString('base64')
  const r = await fetch(`${difyUrl}/console/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordB64, language: 'en-US', remember_me: true }),
  })
  // Dify a veces devuelve 500 por una conexión de Postgres recién cerrada del lado
  // del pool (intermitente, no relacionado a credenciales) — reintentar una vez.
  if (!r.ok && attempt < 3) {
    await new Promise(res => setTimeout(res, 500 * attempt))
    return getDifyAdminToken(attempt + 1)
  }
  const cookies = typeof r.headers.getSetCookie === 'function'
    ? r.headers.getSetCookie()
    : [(r.headers.get('set-cookie') || '')]
  // Dify puede mandar las cookies con prefijo __Host- (ej: __Host-access_token) —
  // buscar por sufijo del nombre, no por nombre exacto, y conservar el nombre real
  // recibido para devolverlo tal cual en el Cookie header de las siguientes requests.
  const get = (name) => {
    const c = cookies.find(c => {
      const cookieName = c.split('=')[0]
      return cookieName === name || cookieName.endsWith(`-${name}`)
    })
    if (!c) return null
    const cookieName = c.split('=')[0]
    return { name: cookieName, value: c.slice(cookieName.length + 1).split(';')[0] }
  }
  const accessToken = get('access_token')
  const csrfToken   = get('csrf_token')
  if (!accessToken) throw new Error('Dify login falló — no se recibió access_token')
  return {
    accessToken: accessToken.value, accessTokenName: accessToken.name,
    csrfToken: csrfToken?.value, csrfTokenName: csrfToken?.name,
  }
}

// Actualiza pre_prompt + parámetros del modelo en una app Dify sin pisar el modelo configurado
async function difyUpdateModelConfig(appId, { prePrompt, temperature, topP, datasetId, agentMode, model: forceModel }) {
  // Leer config actual para preservar lo no explicitado — OJO: GET /apps/:id/model-config
  // no existe en Dify (405), la config embebida viene en el detalle de la app.
  const cur = await difyConsoleApi(`/apps/${appId}`)
  const curData = await cur.json().then(d => d?.model_config || {}).catch(() => ({}))
  const model = forceModel || curData?.model || DIFY_AGENT_MODEL
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
  // agent_mode (tools del agente, ej. saveLeadData) — preservar lo ya configurado si no
  // se pasa uno nuevo explícitamente, para no perder la tool al guardar instrucciones/config.
  payload.agent_mode = agentMode ?? curData?.agent_mode ?? { enabled: false, strategy: 'function_call', tools: [] }

  await difyConsoleApi(`/apps/${appId}/model-config`, 'POST', payload)
}

// Llama console API de Dify — cookie + X-CSRFToken para POST/PUT/DELETE
async function difyConsoleApi(path, method = 'GET', body = null) {
  const { accessToken, accessTokenName, csrfToken, csrfTokenName } = await getDifyAdminToken()
  const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `${accessTokenName}=${accessToken}${csrfToken ? `; ${csrfTokenName}=${csrfToken}` : ''}`,
  }
  // Algunos GET del console API de Dify (ej: listar tool-providers) también exigen el
  // header CSRF, no solo los métodos de escritura — mandarlo siempre que haya token.
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  return fetch(`${difyUrl}/console/api${path}`, opts)
}

// Registra (una sola vez por workspace, idempotente) el custom tool "saveLeadData" en Dify,
// con la URL del endpoint ya fija por workspace — así el workspace queda validado del lado
// del servidor y no depende de que el LLM lo mande bien.
async function ensureAriaToolProvider(workspaceId) {
  const cs = db.prepare('SELECT dify_tool_provider_id FROM channel_settings WHERE workspace_id=?').get(workspaceId)
  if (cs?.dify_tool_provider_id) {
    return { providerId: cs.dify_tool_provider_id, providerName: `aria_crm_${workspaceId}`.replace(/-/g, '') }
  }

  const baseUrl = process.env.ARIA_PUBLIC_URL || 'https://aria.saludok.com.ar'
  const providerName = `aria_crm_${workspaceId}`.replace(/-/g, '')
  const schema = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'ARIA CRM Tool', version: '1.0' },
    servers: [{ url: `${baseUrl}/api/tools/${workspaceId}` }],
    paths: {
      '/save-lead-data': {
        post: {
          operationId: 'saveLeadData',
          summary: 'Guarda en el CRM datos de contacto detectados en la conversacion (email, empresa, telefono) o una nota relevante. Usar SIEMPRE que el cliente comparta un dato nuevo.',
          requestBody: {
            content: { 'application/json': { schema: {
              type: 'object',
              required: ['ref'],
              properties: {
                ref:     { type: 'string', description: 'ID interno de contacto - copiarlo EXACTO del membrete [ref:...] al inicio del mensaje del usuario, nunca inventarlo ni omitirlo.' },
                email:   { type: 'string' },
                company: { type: 'string' },
                phone:   { type: 'string' },
                note:    { type: 'string', description: 'Dato o resumen relevante que no entra en los campos anteriores' },
              },
            } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  })

  const addResp = await difyConsoleApi('/workspaces/current/tool-provider/api/add', 'POST', {
    provider: providerName,
    icon: { content: '🧩', background: '#D5F5E3' },
    credentials: { auth_type: 'none' },
    schema_type: 'openapi',
    schema,
    privacy_policy: '',
    labels: [],
  })
  const addData = await addResp.json().catch(() => ({}))
  if (addData.result !== 'success') throw new Error('Error registrando tool provider en Dify: ' + JSON.stringify(addData))

  const providers = await difyConsoleApi('/workspaces/current/tool-providers').then(r => r.json())
  const match = Array.isArray(providers) ? providers.find(p => p.name === providerName) : null
  if (!match) throw new Error('Tool provider creado pero no se encontró en el listado de Dify')

  db.prepare(`
    INSERT INTO channel_settings (workspace_id, dify_tool_provider_id, updated_at) VALUES (?,?,strftime('%s','now'))
    ON CONFLICT(workspace_id) DO UPDATE SET dify_tool_provider_id=excluded.dify_tool_provider_id, updated_at=excluded.updated_at
  `).run(workspaceId, match.id)

  return { providerId: match.id, providerName }
}

// Arma la entrada de agent_mode.tools[] para la tool de ARIA, lista para pasar al
// model-config de un agente agent-chat.
function buildAriaSaveLeadTool({ providerId, providerName }) {
  return {
    provider_id: providerId,
    provider_type: 'api',
    provider_name: providerName,
    tool_name: 'saveLeadData',
    tool_label: 'saveLeadData',
    tool_parameters: {},
    enabled: true, isDeleted: false, notAuthor: false,
  }
}

// ── Integraciones del agente: tools builtin de Dify + tools custom (endpoints propios) ──

// Catálogo curado de tools builtin ya instaladas en Dify, confirmadas contra la API real
// (nombres/ids no son inventados — se verificaron vía /tool-provider/builtin/:name/tools).
const AVAILABLE_BUILTIN_TOOLS = {
  webscraper:  { provider_id: 'webscraper', tool_name: 'webscraper',  label: 'Web Scraper', description: 'Lee el contenido de una URL durante la charla.' },
  wikipedia:   { provider_id: 'langgenius/wikipedia/wikipedia', tool_name: 'wikipedia_search', label: 'Wikipedia', description: 'Busca información general en Wikipedia.' },
  current_time:{ provider_id: 'time', tool_name: 'current_time', label: 'Hora actual', description: 'Sabe la fecha/hora actual (útil para agendar).' },
  code:        { provider_id: 'code', tool_name: 'simple_code', label: 'Code Interpreter', description: 'Ejecuta cálculos o lógica simple en código.' },
}

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'tool'
}

// Registra un endpoint arbitrario del usuario (Excel/Sheets vía API propia, CRM externo, lo que
// sea) como una tool custom de Dify — mismo mecanismo que ensureAriaToolProvider, generalizado.
async function registerCustomTool({ botId, name, description, url, method, params }) {
  const providerName = `custom_${botId.replace(/-/g, '').slice(0, 8)}_${slugify(name)}_${Date.now().toString(36).slice(-4)}`
  const operationId = slugify(name)
  const u = new URL(url)
  const properties = {}
  for (const p of (params || [])) {
    properties[p.name] = { type: p.type || 'string', description: p.description || '' }
  }
  const schema = JSON.stringify({
    openapi: '3.0.0',
    info: { title: name, version: '1.0' },
    servers: [{ url: `${u.protocol}//${u.host}` }],
    paths: {
      [u.pathname]: {
        [(method || 'GET').toLowerCase()]: {
          operationId,
          summary: description || name,
          ...(method === 'GET'
            ? { parameters: Object.keys(properties).map(k => ({ name: k, in: 'query', description: properties[k].description, schema: { type: properties[k].type } })) }
            : { requestBody: { content: { 'application/json': { schema: { type: 'object', properties } } } } }),
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  })

  const addResp = await difyConsoleApi('/workspaces/current/tool-provider/api/add', 'POST', {
    provider: providerName,
    icon: { content: '🔌', background: '#D5E8F5' },
    credentials: { auth_type: 'none' },
    schema_type: 'openapi',
    schema,
    privacy_policy: '', labels: [],
  })
  const addData = await addResp.json().catch(() => ({}))
  if (addData.result !== 'success') throw new Error('Error registrando la integración en Dify: ' + JSON.stringify(addData))

  const providers = await difyConsoleApi('/workspaces/current/tool-providers').then(r => r.json())
  const match = Array.isArray(providers) ? providers.find(p => p.name === providerName) : null
  if (!match) throw new Error('Integración creada pero no se encontró en el listado de Dify')

  return { providerId: match.id, providerName, toolName: operationId }
}

// Arma el agent_mode.tools[] completo de un agente: la tool fija de ARIA (saveLeadData) +
// las builtin que el usuario activó + todas sus tools custom registradas.
function buildFullAgentMode(workspaceId, botId, extraBuiltinKeys, ariaToolProvider) {
  const tools = [buildAriaSaveLeadTool(ariaToolProvider)]
  for (const key of (extraBuiltinKeys || [])) {
    const t = AVAILABLE_BUILTIN_TOOLS[key]
    if (!t) continue
    tools.push({
      provider_id: t.provider_id, provider_type: 'builtin', provider_name: t.provider_id,
      tool_name: t.tool_name, tool_label: t.tool_name, tool_parameters: {},
      enabled: true, isDeleted: false, notAuthor: false,
    })
  }
  const customTools = db.prepare('SELECT * FROM agent_custom_tools WHERE bot_id=? AND dify_provider_id IS NOT NULL').all(botId)
  for (const ct of customTools) {
    tools.push({
      provider_id: ct.dify_provider_id, provider_type: 'api', provider_name: ct.dify_provider_name,
      tool_name: slugify(ct.name), tool_label: ct.name, tool_parameters: {},
      enabled: true, isDeleted: false, notAuthor: false,
    })
  }
  return { enabled: true, strategy: 'function_call', max_iteration: 5, tools }
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

// IA de texto para los agentes internos: la que eligió el owner en Settings (OpenAI/Anthropic + clave),
// y si no eligió, la de las variables del stack (Anthropic primero, después OpenAI).
// Haiku 5.5: el más nuevo y barato de Claude. Llamado directo a Anthropic (sin Dify), no se le manda temperature.
const CLAUDE_INTERNAL_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5'
// Algunos modelos devuelven su razonamiento entre <think>…</think>: se descarta
const stripThink = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim()

function internalAiCreds(workspaceId) {
  const cs = workspaceId && db.prepare('SELECT llm_provider, llm_api_key, llm_model FROM channel_settings WHERE workspace_id=?').get(workspaceId)
  if (cs?.llm_api_key && ['openai', 'anthropic'].includes(cs.llm_provider)) {
    return { provider: cs.llm_provider, apiKey: cs.llm_api_key, model: cs.llm_model || (cs.llm_provider === 'anthropic' ? CLAUDE_INTERNAL_MODEL : 'gpt-4o-mini') }
  }
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: CLAUDE_INTERNAL_MODEL }
  if (process.env.OPENAI_API_KEY)    return { provider: 'openai',    apiKey: process.env.OPENAI_API_KEY,    model: 'gpt-4o-mini' }
  return null
}

async function callLLMDirect({ system, userMsg, workspaceId }) {
  // Para tareas meta (generar textos, análisis) usa siempre OpenAI/Anthropic, nunca Dify
  const ai = internalAiCreds(workspaceId)
  if (!ai) throw new Error('No hay API key de OpenAI o Anthropic configurada (Settings → Plan o variables del stack)')
  if (ai.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ai.model, max_tokens: 1500, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }] }),
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
    return d.choices?.[0]?.message?.content?.trim() || ''
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ai.model, max_tokens: 1500, system, messages: [{ role: 'user', content: userMsg }] }),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
  return stripThink(d.content?.find?.(b => b.type === 'text')?.text || d.content?.[0]?.text)
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
        model: { ...DIFY_AGENT_MODEL, completion_params: {} },
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
        model: { ...DIFY_AGENT_MODEL, completion_params: {} },
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

  const usage = getPlanAndUsage(workspaceId)
  if (usage.agentsLimitReached) {
    return res.status(403).json({ error: `Llegaste al límite de agentes de tu plan (${usage.plan.name}: ${usage.plan.max_agents}) — actualizá tu plan para crear más.` })
  }

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
      // ── Agent Chat (no "chat" simple): soporta tools + memoria de conversación ──
      const createResp = await difyConsoleApi('/apps', 'POST',
        { name: agentName, mode: 'agent-chat', icon: '🤖', icon_background: '#FFEAD5', description })
      const appData = await createResp.json()
      if (!appData.id) throw new Error('Error creando app: ' + JSON.stringify(appData))
      appId = appData.id

      let agentMode = { enabled: false, strategy: 'function_call', tools: [] }
      try {
        const toolProvider = await ensureAriaToolProvider(workspaceId)
        agentMode = { enabled: true, strategy: 'function_call', max_iteration: 5, tools: [buildAriaSaveLeadTool(toolProvider)] }
      } catch (toolErr) {
        console.warn('⚠ No se pudo conectar la tool saveLeadData (agente queda sin ella):', toolErr.message)
      }
      const toolNote = agentMode.enabled
        ? `\n\n## Guardado de datos del contacto\nCada mensaje del usuario empieza con un membrete interno [ref:ID] — nunca lo menciones ni lo repitas al cliente. Cuando el cliente comparta un dato nuevo (email, empresa, teléfono) o algo relevante para el seguimiento, usá la tool saveLeadData copiando ese ID exacto en el parámetro ref. No inventes el ref, no lo omitas.`
        : ''
      await difyConsoleApi(`/apps/${appId}/model-config`, 'POST', {
        pre_prompt: systemPrompt + toolNote,
        opening_statement: '¡Hola! ¿En qué puedo ayudarte hoy?',
        suggested_questions: [], suggested_questions_after_answer: { enabled: false },
        speech_to_text: { enabled: false }, retriever_resource: { enabled: false },
        sensitive_word_avoidance: { enabled: false }, more_like_this: { enabled: false },
        user_input_form: [],
        model: { ...DIFY_AGENT_MODEL, completion_params: { max_tokens: 800 } },
        agent_mode: agentMode,
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

// Defaults reales por template — así un agente de un rubro conocido (ej. brokers de salud)
// no arranca en blanco: ya trae objetivo, tono y reglas de comportamiento pensadas para ese
// rubro. El usuario solo completa los datos de su empresa y genera las instrucciones.
const TEMPLATE_DEFAULTS = {
  broker: {
    tone: 'Profesional y cercano',
    nationality: 'Argentina',
    goals: ['recolectar_datos', 'vender'],
    behavior_notes:
      'Nunca inventes precios ni coberturas exactas de planes — los valores y condiciones cambian seguido y deben confirmarse con un asesor humano antes de cerrar. ' +
      'Antes de recomendar, preguntá de a una cosa por vez: ¿para cuántas personas buscás el plan?, ¿tenés obra social o prepaga actualmente?, ¿qué priorizás (internación, maternidad, odontología, bajo costo)? ' +
      'Si preguntan sobre una enfermedad preexistente o piden un diagnóstico médico, no respondas eso — aclará que un asesor humano te confirma la cobertura exacta y derivá.',
    derivation_mode: 'si_lo_pide',
  },
  travel: {
    tone: 'Entusiasta y resolutivo',
    nationality: 'Argentina',
    goals: ['recolectar_datos', 'vender'],
    behavior_notes:
      'No inventes precios, disponibilidad ni fechas de vuelos/paquetes — son datos que cambian todo el tiempo y los confirma un asesor humano. ' +
      'Antes de armar una propuesta preguntá de a una cosa por vez: ¿destino?, ¿fechas aproximadas?, ¿cuántos viajeros?, ¿con qué presupuesto estás pensando el viaje? ' +
      'Si piden cerrar o pagar, derivá — el cierre de venta y el cobro los hace siempre un asesor.',
    derivation_mode: 'si_lo_pide',
  },
  'concesionaria-directa': {
    tone: 'Profesional y directo',
    nationality: 'Argentina',
    goals: ['recolectar_datos', 'vender'],
    behavior_notes:
      'No inventes precios finales, bonificaciones ni stock real — confirmalo siempre un asesor humano antes de comprometerte. ' +
      'Preguntá de a una cosa por vez: ¿qué modelo le interesa?, ¿0km o usado?, ¿tiene un vehículo para entregar en parte de pago?, ¿cómo prefiere financiarlo? ' +
      'Si pide coordinar un test drive o cerrar la compra, derivá a un vendedor.',
    derivation_mode: 'si_lo_pide',
  },
  'concesionaria-plan': {
    tone: 'Profesional y cercano',
    nationality: 'Argentina',
    goals: ['recolectar_datos', 'resolver_consultas'],
    behavior_notes:
      'No inventes montos de cuota, plazos de adjudicación ni porcentajes — confirmalo siempre un asesor humano, varían por plan y por sorteo/licitación. ' +
      'Preguntá de a una cosa por vez: ¿qué modelo le interesa?, ¿con qué anticipo cuenta?, ¿busca adjudicación por sorteo o licitación? ' +
      'Si pide un número de cuota exacto o quiere inscribirse, derivá a un asesor.',
    derivation_mode: 'si_lo_pide',
  },
}

// Crear borrador: POST bot en Tiledesk + importar flujo de la plantilla
// bot_type='tilebot' (default) → bot interno con flujo JSON importado desde /flows/
// bot_type='external'          → bot externo que llama a /api/bot-webhook (LLM directo en ARIA)
app.post('/api/agents/create-draft', requireAriaAuth, async (req, res) => {
  const { name, description, template_id } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name requerido' })
  try {
    const workspaceId = req.ariaUser.workspaceId

    const usage = getPlanAndUsage(workspaceId)
    if (usage.agentsLimitReached) {
      return res.status(403).json({ error: `Llegaste al límite de agentes de tu plan (${usage.plan.name}: ${usage.plan.max_agents}) — actualizá tu plan para crear más.` })
    }

    // 1. Crear app en Dify — agent-chat (no chat simple): soporta tools + memoria de conversación
    const createResp = await difyConsoleApi('/apps', 'POST', {
      name,
      mode: 'agent-chat',
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
    } catch (dsErr) {
      console.warn('⚠ No se pudo crear dataset Dify (continúa sin KB):', dsErr.message)
    }

    // 4. Registrar/reusar la tool saveLeadData de ARIA para este workspace y conectarla al agente
    let agentMode = { enabled: false, strategy: 'function_call', tools: [] }
    try {
      const toolProvider = await ensureAriaToolProvider(workspaceId)
      agentMode = { enabled: true, strategy: 'function_call', max_iteration: 5, tools: [buildAriaSaveLeadTool(toolProvider)] }
    } catch (toolErr) {
      console.warn('⚠ No se pudo conectar la tool saveLeadData (agente queda sin ella):', toolErr.message)
    }
    await difyUpdateModelConfig(difyAppId, { datasetId: difyDatasetId || undefined, agentMode, model: DIFY_AGENT_MODEL })
    if (difyDatasetId) console.log(`✓ Dify dataset creado: ${difyDatasetId}`)

    // 5. Guardar en ARIA DB — si el template tiene defaults de rubro, el agente no arranca en blanco
    const agentId = randomUUID()
    const tplDefaults = TEMPLATE_DEFAULTS[template_id] || null
    db.prepare(`INSERT INTO dify_agents
      (id, workspace_id, name, description, template_id, dify_app_id, dify_api_key, dify_dataset_id,
       tone, nationality, goals, behavior_notes, derivation_mode)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(agentId, req.ariaUser.workspaceId, name, description || '', template_id || null, difyAppId, difyApiKey, difyDatasetId,
        tplDefaults?.tone || null, tplDefaults?.nationality || null,
        tplDefaults ? JSON.stringify(tplDefaults.goals) : '[]',
        tplDefaults?.behavior_notes || null, tplDefaults?.derivation_mode || 'nunca')

    console.log(`✓ Dify app creada: ${difyAppId} → agent ${agentId}`)
    res.json({ botId: agentId, kbNamespaceId: null, difyAppId, difyDatasetId })
  } catch (e) {
    console.error('create-draft error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Generar instrucciones con LLM (incluye KB de Tiledesk si existe)
const GOAL_LABELS = {
  vender: 'Vender y recomendar productos/servicios',
  resolver_consultas: 'Resolver consultas y preguntas frecuentes',
  gestionar_reclamos: 'Gestionar reclamos (contener, registrar y resolver o escalar a tiempo)',
  recolectar_datos: 'Recolectar datos del contacto (nombre, zona, datos clave) de a uno, sin interrogar',
}

app.post('/api/agents/generate-instructions', requireAriaAuth, async (req, res) => {
  const { agent_name, tone, nationality, company_name, company_description, websites, temperature,
    derivation_notes, bot_id, template_id, goals, goal_success_criteria, behavior_notes } = req.body || {}

  const goalLines = (goals || []).filter(g => g !== 'personalizado').map(g => `  - ${GOAL_LABELS[g] || g}`)
  if ((goals || []).includes('personalizado') && goal_success_criteria) goalLines.push(`  - Personalizado: ${goal_success_criteria}`)
  const goalsSection = goalLines.length ? `\n- Objetivos del agente:\n${goalLines.join('\n')}` : ''
  const behaviorSection = behavior_notes ? `\n- Reglas de comportamiento y límites: ${behavior_notes}` : ''

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
${derivation_notes ? `- Criterios de derivación: ${derivation_notes}` : ''}${goalsSection}${behaviorSection}${kbSection}

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
${derivation_notes ? `- Instrucciones de derivación: ${derivation_notes}` : ''}${goalsSection}${behaviorSection}${kbSection}

El prompt debe incluir:
1. Definición del agente (nombre, rol, perfil, limitaciones)
2. Descripción de la empresa${kbSection ? ' e información de la base de conocimiento' : ''}
3. Objetivos del agente
4. Audiencia dirigida
5. Flujo conversacional (pasos numerados)
6. Reglas y buenas prácticas
7. Reglas de comportamiento y límites claros (si se proveyeron)

Escribí solo el prompt, sin explicaciones ni texto extra. El tono debe ser ${tone.toLowerCase()}, con expresiones propias de ${nationality}.`

  // Instrucción fija de la tool saveLeadData — se agrega siempre, no depende de que el
  // LLM generador la redacte bien (es mecánica, no de estilo).
  const TOOL_INSTRUCTION = `\n\n## Guardado de datos del contacto\nCada mensaje del usuario empieza con un membrete interno [ref:ID] — nunca lo menciones ni lo repitas al cliente. Cuando el cliente comparta un dato nuevo (email, empresa, teléfono) o algo relevante para el seguimiento, usá la tool saveLeadData copiando ese ID exacto en el parámetro ref. No inventes el ref, no lo omitas.`

  try {
    const { text, model, usage } = await callLLM({ messages: [{ role: 'user', content: prompt }], max_tokens: 2048, workspaceId: req.ariaUser?.workspaceId })
    trackLlmUsage(req.ariaUser?.workspaceId, 'generate-instructions', model, usage)
    res.json({ instructions: text + TOOL_INSTRUCTION })
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

// Llama /v1/chat-messages de Dify en modo streaming (obligatorio para apps agent-chat,
// Dify rechaza 'blocking' en ese modo) y devuelve solo el resultado final. Sirve tanto
// para apps 'chat' (event 'message') como 'agent-chat' (event 'agent_message').
async function callDifyChat(apiKey, { query, conversationId, user }) {
  const difyUrl = process.env.DIFY_URL || 'https://dify.saludok.com.ar'
  const r = await fetch(`${difyUrl}/v1/chat-messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: {}, query, response_mode: 'streaming',
      conversation_id: conversationId || '', user: user || 'aria',
    }),
  })
  const raw = await r.text()
  if (!r.ok) {
    let parsed = {}
    try { parsed = JSON.parse(raw) } catch {}
    throw new Error(parsed.message || raw.slice(0, 200))
  }
  let answer = '', convId = null, usage = { input_tokens: 0, output_tokens: 0 }
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue
    let evt
    try { evt = JSON.parse(line.slice(6)) } catch { continue }
    if (evt.conversation_id) convId = evt.conversation_id
    if (evt.event === 'agent_message' || evt.event === 'message') answer += evt.answer || ''
    if (evt.event === 'message_end' && evt.metadata?.usage) {
      usage = { input_tokens: evt.metadata.usage.prompt_tokens || 0, output_tokens: evt.metadata.usage.completion_tokens || 0 }
    }
    if (evt.event === 'error') throw new Error(evt.message || 'Dify stream error')
  }
  // Algunos modelos (p. ej. Claude Haiku 5.5 en apps con herramientas) devuelven su razonamiento
  // entre <think>…</think>: nunca debe llegar al WhatsApp del cliente.
  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '')
  return { answer: answer.trim(), conversationId: convId, usage }
}

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
  const queryText = text || '¡Hola!'

  try {
    const { answer, conversationId } = await callDifyChat(agent.dify_api_key, {
      query: queryText, conversationId: session.conversationId, user: req.ariaUser.workspaceId,
    })
    testSessions.set(botId, { conversationId })

    if (reset) return res.json({ welcome: answer || '¡Hola! ¿En qué puedo ayudarte?', reply: null })
    return res.json({ welcome: null, reply: answer || '(sin respuesta)' })
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
    followup_cadence:        r.followup_cadence,
    followup_intervals:      r.followup_intervals,
    followup_hours_start:    r.followup_hours_start,
    followup_hours_end:      r.followup_hours_end,
    derivation_mode:            r.derivation_mode,
    derivation_score_threshold: r.derivation_score_threshold,
    goals:                   r.goals,
    goal_success_criteria:   r.goal_success_criteria,
    behavior_notes:          r.behavior_notes,
    extra_builtin_tools:     r.extra_builtin_tools,
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
  const { instructions, tone, nationality, company_name, company_description, derivation_notes,
    derivation_mode, derivation_score_threshold, goals, goal_success_criteria, behavior_notes } = req.body || {}
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
      derivation_notes=COALESCE(?,derivation_notes),
      derivation_mode=COALESCE(?,derivation_mode),
      derivation_score_threshold=COALESCE(?,derivation_score_threshold),
      goals=COALESCE(?,goals), goal_success_criteria=COALESCE(?,goal_success_criteria),
      behavior_notes=COALESCE(?,behavior_notes)
      WHERE id=? AND workspace_id=?`)
      .run(instructions||null, tone||null, nationality||null, company_name||null,
        company_description||null, derivation_notes||null, derivation_mode||null,
        derivation_score_threshold ?? null, goals ? JSON.stringify(goals) : null,
        goal_success_criteria || null, behavior_notes || null, botId, req.ariaUser.workspaceId)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/agents/:botId/config', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { temperature, top_p, channels, derivation_users,
    followup_cadence, followup_intervals, followup_hours_start, followup_hours_end, extra_builtin_tools } = req.body || {}
  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
  try {
    const t  = parseFloat(temperature ?? agent.temperature ?? 0.7)
    const tp = parseFloat(top_p ?? agent.top_p ?? 1.0)
    const channelsJson = channels !== undefined ? JSON.stringify(channels) : agent.channels
    const derivationUsersJson = derivation_users !== undefined ? JSON.stringify(derivation_users) : agent.derivation_users
    const builtinToolsJson = extra_builtin_tools !== undefined ? JSON.stringify(extra_builtin_tools) : agent.extra_builtin_tools

    const ariaToolProvider = await ensureAriaToolProvider(req.ariaUser.workspaceId)
    const agentMode = buildFullAgentMode(req.ariaUser.workspaceId, botId, JSON.parse(builtinToolsJson || '[]'), ariaToolProvider)
    await difyUpdateModelConfig(agent.dify_app_id, { prePrompt: agent.system_prompt || '', temperature: t, topP: tp, agentMode })

    db.prepare(`UPDATE dify_agents SET temperature=?, top_p=?, channels=?, derivation_users=?, extra_builtin_tools=?,
      followup_cadence=COALESCE(?,followup_cadence), followup_intervals=COALESCE(?,followup_intervals),
      followup_hours_start=COALESCE(?,followup_hours_start), followup_hours_end=COALESCE(?,followup_hours_end)
      WHERE id=? AND workspace_id=?`)
      .run(t, tp, channelsJson, derivationUsersJson, builtinToolsJson,
        followup_cadence || null, followup_intervals ? JSON.stringify(followup_intervals) : null,
        followup_hours_start || null, followup_hours_end || null,
        botId, req.ariaUser.workspaceId)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Integraciones del agente (tools) ──────────────────────────────────────────
app.get('/api/agents/available-tools', requireAriaAuth, (req, res) => {
  res.json(Object.entries(AVAILABLE_BUILTIN_TOOLS).map(([key, t]) => ({ key, label: t.label, description: t.description })))
})

app.get('/api/agents/:botId/custom-tools', requireAriaAuth, (req, res) => {
  const rows = db.prepare('SELECT id, name, description, url, method, params, created_at FROM agent_custom_tools WHERE bot_id=? AND workspace_id=?')
    .all(req.params.botId, req.ariaUser.workspaceId)
  res.json(rows.map(r => ({ ...r, params: JSON.parse(r.params || '[]') })))
})

app.post('/api/agents/:botId/custom-tools', requireAriaAuth, async (req, res) => {
  const { botId } = req.params
  const { name, description, url, method, params } = req.body || {}
  if (!name || !url) return res.status(400).json({ error: 'name y url son requeridos' })
  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' })
  try {
    const { providerId, providerName } = await registerCustomTool({ botId, name, description, url, method: method || 'GET', params })
    const id = randomUUID()
    db.prepare(`INSERT INTO agent_custom_tools (id, bot_id, workspace_id, name, description, url, method, params, dify_provider_id, dify_provider_name)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, botId, req.ariaUser.workspaceId, name, description || null, url, method || 'GET', JSON.stringify(params || []), providerId, providerName)

    const ariaToolProvider = await ensureAriaToolProvider(req.ariaUser.workspaceId)
    const agentMode = buildFullAgentMode(req.ariaUser.workspaceId, botId, JSON.parse(agent.extra_builtin_tools || '[]'), ariaToolProvider)
    await difyUpdateModelConfig(agent.dify_app_id, { prePrompt: agent.system_prompt || '', temperature: agent.temperature, topP: agent.top_p, agentMode })

    res.json({ id, ok: true })
  } catch (e) {
    console.error('custom-tools create error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/agents/:botId/custom-tools/:toolId', requireAriaAuth, async (req, res) => {
  const { botId, toolId } = req.params
  const tool = db.prepare('SELECT * FROM agent_custom_tools WHERE id=? AND bot_id=? AND workspace_id=?').get(toolId, botId, req.ariaUser.workspaceId)
  if (!tool) return res.status(404).json({ error: 'Integración no encontrada' })
  const agent = db.prepare('SELECT * FROM dify_agents WHERE id=? AND workspace_id=?').get(botId, req.ariaUser.workspaceId)
  try {
    db.prepare('DELETE FROM agent_custom_tools WHERE id=?').run(toolId)
    if (tool.dify_provider_name) {
      await difyConsoleApi('/workspaces/current/tool-provider/api/delete', 'POST', { provider: tool.dify_provider_name }).catch(() => {})
    }
    if (agent) {
      const ariaToolProvider = await ensureAriaToolProvider(req.ariaUser.workspaceId)
      const agentMode = buildFullAgentMode(req.ariaUser.workspaceId, botId, JSON.parse(agent.extra_builtin_tools || '[]'), ariaToolProvider)
      await difyUpdateModelConfig(agent.dify_app_id, { prePrompt: agent.system_prompt || '', temperature: agent.temperature, topP: agent.top_p, agentMode })
    }
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

// ── Agente "Lucas" — calificador silencioso ───────────────────────────────────
// Sistema de tools independiente de BOT_TOOLS: opera solo sobre tablas locales
// (contacts, funnel_stages, tasks, lead_scores) usando contacts.id — el mismo ID
// que ya usan Funnels.jsx y Tasks.jsx. Nunca pega contra Tiledesk.
const QUALIFIER_TOOLS = [
  {
    name: 'add_contact_tag',
    description: 'Asigna al contacto un tag del workspace. Solo tags con criterio configurado y solo si la conversación cumple ese criterio.',
    input_schema: {
      type: 'object',
      properties: { tag: { type: 'string', description: 'Nombre exacto del tag' } },
      required: ['tag'],
    },
  },
  {
    name: 'set_funnel_stage',
    description: 'Mueve el contacto a una etapa del embudo de ventas y/o marca ganado/perdido.',
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
    name: 'fill_contact_fields',
    description: 'Completa SOLO los campos del contacto que están vacíos (nunca sobreescribe datos existentes).',
    input_schema: {
      type: 'object',
      properties: {
        email:   { type: 'string' },
        company: { type: 'string' },
        name:    { type: 'string' },
      },
    },
  },
  {
    name: 'append_note',
    description: 'Agrega un resumen breve de esta conversación a la nota del contacto (no borra lo anterior).',
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'Resumen breve: qué quería, en qué quedó, datos relevantes' } },
      required: ['note'],
    },
  },
  {
    name: 'create_followup_task',
    description: 'Crea una tarea de seguimiento o agendamiento para que un vendedor humano la retome.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string' },
        description: { type: 'string' },
        priority:    { type: 'string', enum: ['low', 'normal', 'high'] },
        due_date:    { type: 'string', description: 'Fecha sugerida YYYY-MM-DD, opcional' },
      },
      required: ['title'],
    },
  },
  {
    name: 'set_lead_score',
    description: 'OBLIGATORIO: llamar siempre al final con la temperatura y score del lead analizado.',
    input_schema: {
      type: 'object',
      properties: {
        temperature: { type: 'string', enum: ['frio', 'tibio', 'caliente'] },
        score:       { type: 'integer', minimum: 0, maximum: 100 },
        reasoning:   { type: 'string', description: '1-2 frases explicando el score' },
      },
      required: ['temperature', 'score'],
    },
  },
]

function tagsWithCriteria(workspaceId) {
  return db.prepare("SELECT id, title, criteria FROM labels WHERE workspace_id=? AND criteria IS NOT NULL AND trim(criteria) != ''").all(workspaceId)
}

function executeQualifierTool(toolName, input, { workspaceId, contactId }) {
  if (toolName === 'add_contact_tag') {
    if (!lucasConfig(workspaceId).smart_tags.enabled) return 'Smart Tags está desactivado en este workspace: no se asignó el tag.'
    const tag = tagsWithCriteria(workspaceId).find(t => t.title.toLowerCase() === String(input.tag || '').trim().toLowerCase())
    if (!tag) return `El tag "${input.tag}" no existe o no tiene criterio configurado: no se asignó.`
    const c = db.prepare('SELECT tags FROM contacts WHERE id=?').get(contactId)
    let tags = []
    try { tags = JSON.parse(c?.tags || '[]') } catch {}
    const has = tags.some(t => (typeof t === 'object' ? (t?.title || t?.id) : t) === tag.title || t === tag.id)
    if (has) return `El contacto ya tenía el tag "${tag.title}".`
    db.prepare("UPDATE contacts SET tags=?, updated_at=strftime('%s','now') WHERE id=?").run(JSON.stringify([...tags, tag.title]), contactId)
    return `Tag "${tag.title}" asignado.`
  }

  if (toolName === 'set_funnel_stage') {
    if (!lucasConfig(workspaceId).opportunities.move) return 'Mover oportunidades está desactivado en este workspace: no se cambió la etapa.'
    const { stage, lead_status = 'open' } = input
    if (!stagesWithCriteria(workspaceId).some(st => st.id === stage)) {
      return `La etapa "${stage}" no tiene criterio configurado: solo podés mover a etapas con criterio. No se cambió la etapa.`
    }
    db.prepare(`
      INSERT INTO funnel_stages (workspace_id, lead_id, stage, lead_status, updated_at)
      VALUES (?,?,?,?,strftime('%s','now'))
      ON CONFLICT(workspace_id, lead_id) DO UPDATE SET
        stage=excluded.stage, lead_status=excluded.lead_status, updated_at=excluded.updated_at
    `).run(workspaceId, contactId, stage, lead_status)
    return `Movido a etapa "${stage}" (${lead_status}).`
  }

  if (toolName === 'fill_contact_fields') {
    const c = db.prepare('SELECT email, company, name FROM contacts WHERE id=?').get(contactId)
    if (!c) return 'Contacto no encontrado.'
    const sets = [], vals = []
    for (const f of ['email', 'company', 'name']) {
      if (!c[f] && input[f]) { sets.push(`${f}=?`); vals.push(input[f]) }
    }
    if (!sets.length) return 'Nada que completar (los campos ya tenían datos).'
    db.prepare(`UPDATE contacts SET ${sets.join(',')}, updated_at=strftime('%s','now') WHERE id=?`).run(...vals, contactId)
    return `Completados: ${sets.join(', ')}.`
  }

  if (toolName === 'append_note') {
    const c = db.prepare('SELECT note FROM contacts WHERE id=?').get(contactId)
    const stamp = new Date().toISOString().slice(0, 10)
    const newNote = c?.note ? `${c.note}\n---\n[${stamp}] ${input.note}` : `[${stamp}] ${input.note}`
    db.prepare("UPDATE contacts SET note=?, updated_at=strftime('%s','now') WHERE id=?").run(newNote, contactId)
    return 'Nota agregada.'
  }

  if (toolName === 'create_followup_task') {
    const { title, description, priority = 'normal', due_date } = input
    const contact = db.prepare('SELECT name FROM contacts WHERE id=?').get(contactId)
    db.prepare(`
      INSERT INTO tasks (id, workspace_id, title, description, lead_id, lead_name, due_date, priority, status)
      VALUES (?,?,?,?,?,?,?,?,'pending')
    `).run(randomUUID(), workspaceId, title, description || null, contactId, contact?.name || null,
      due_date ? Math.floor(new Date(due_date).getTime() / 1000) : null, priority)
    return `Tarea "${title}" creada.`
  }

  if (toolName === 'set_lead_score') {
    const { temperature, score, reasoning } = input
    db.prepare(`
      INSERT INTO lead_scores (workspace_id, contact_id, temperature, score, reasoning, updated_at)
      VALUES (?,?,?,?,?,strftime('%s','now'))
      ON CONFLICT(workspace_id, contact_id) DO UPDATE SET
        temperature=excluded.temperature, score=excluded.score, reasoning=excluded.reasoning, updated_at=excluded.updated_at
    `).run(workspaceId, contactId, temperature, score, reasoning || null)
    return 'Score registrado.'
  }

  return 'Tool desconocida.'
}

// Loop de tool-calling de Lucas — patrón de fetch directo igual al de callLLMWithTools
// (copiado y recortado a propósito, no reutilizado, para no arriesgar el bot conversacional).
// ── Jev (TypeSafe AI): modelo de decisiones estructuradas, barato y rápido ─────
// No genera texto: recibe un estado (la conversación) y preguntas tipadas (choice / score / noul)
// y devuelve respuestas con probabilidades. Se activa con la variable de entorno JEV_API_KEY.
const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
async function jevAsk(state, questions) {
  const r = await fetch(JEV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.JEV_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.JEV_MODEL || 'jev-latest', state: String(state).slice(0, 30000), questions }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.answers) throw new Error(`Jev ${r.status}: ${JSON.stringify(d).slice(0, 200)}`)
  return d.answers
}

// Niveles del score de coincidencia con el cliente ideal (Jev devuelve 0–4 → se lleva a 0–100)
const JEV_FIT_LEVELS = [
  'Ninguna coincidencia: desinterés explícito, pide no ser contactado o no encaja con el cliente ideal',
  'Baja coincidencia: solo está explorando, sin decisor, sin presupuesto ni urgencia',
  'Coincidencia media: interés genuino pero todavía evaluando, sin urgencia clara',
  'Alta coincidencia: pregunta precios o pide cotización y describe un problema concreto',
  'Coincidencia total: urgencia real, involucra decisores y quiere avanzar al siguiente paso',
]

// Lucas con Jev: temperatura, score, etapa y tags se deciden con Jev usando los criterios configurados.
async function jevQualify({ workspaceId, contactId, transcriptText }) {
  const cfg = lucasConfig(workspaceId)
  const questions = {
    temperature: {
      type: 'choice',
      instructions: '¿Qué temperatura de compra tiene este lead según la conversación de WhatsApp?',
      criteria: { caliente: cfg.rating.criteria.caliente, tibio: cfg.rating.criteria.tibio, frio: cfg.rating.criteria.frio },
    },
    fit: {
      type: 'score',
      instructions: cfg.rating.icp?.trim()
        ? { question: '¿Cuánto coincide el lead con el perfil de cliente ideal?', reglas_de_referencia: cfg.rating.icp }
        : '¿Cuánto coincide el lead con un cliente con alta intención de compra?',
      criteria: JEV_FIT_LEVELS,
    },
  }
  const stages = cfg.opportunities.move ? stagesWithCriteria(workspaceId) : []
  if (stages.length) {
    questions.stage = {
      type: 'choice',
      instructions: '¿A qué etapa del embudo corresponde este lead según la conversación?',
      criteria: {
        sin_cambio: 'La conversación no cumple claramente ninguno de los criterios',
        ...Object.fromEntries(stages.map(st => [st.id, `${st.label}: ${st.criteria}`])),
      },
    }
  }
  const tags = cfg.smart_tags.enabled ? tagsWithCriteria(workspaceId) : []
  tags.forEach((t, i) => {
    questions[`tag_${i}`] = { type: 'noul', instructions: `¿La conversación cumple este criterio para el tag "${t.title}"? ${t.criteria}` }
  })

  const a = await jevAsk(`Conversación de WhatsApp entre un negocio y un lead:\n${transcriptText}`, questions)
  const ctx = { workspaceId, contactId }
  const temperature = ['caliente', 'tibio', 'frio'].includes(a.temperature?.choice) ? a.temperature.choice : 'tibio'
  const score = Math.round(((a.fit?.score ?? 2) / (JEV_FIT_LEVELS.length - 1)) * 100)
  executeQualifierTool('set_lead_score', {
    temperature, score,
    reasoning: `Jev: ${temperature} (confianza ${Math.round((a.temperature?.confidence ?? 0) * 100)}%), coincidencia ${score}/100.`,
  }, ctx)
  const moved = a.stage?.choice && a.stage.choice !== 'sin_cambio' && (a.stage.confidence ?? 0) >= 0.5
  if (moved) executeQualifierTool('set_funnel_stage', { stage: a.stage.choice }, ctx)
  const tagged = tags.filter((t, i) => (a[`tag_${i}`]?.noul ?? 0) >= 0.6)
  tagged.forEach(t => executeQualifierTool('add_contact_tag', { tag: t.title }, ctx))
  console.log(`⚡ [Lucas·Jev] ${contactId}: ${temperature}/${score}${moved ? ` → ${a.stage.choice}` : ''}${tagged.length ? ` · tags ${tagged.map(t => t.title).join(', ')}` : ''}`)
  return true
}

async function runQualifierAgent({ workspaceId, contactId, transcriptText }) {
  // Con Jev, las decisiones (temperatura, score, etapa, tags) salen de Jev; la IA de texto queda solo
  // para la nota, los datos del contacto y las tareas — y si falla, las decisiones igual quedan.
  let jevDone = false
  if (process.env.JEV_API_KEY) {
    try { jevDone = await jevQualify({ workspaceId, contactId, transcriptText }) }
    catch (e) { console.warn('⚠ [Lucas] Jev falló, decide la IA de texto:', e.message) }
  }

  // IA elegida en Settings (OpenAI/Anthropic) o la de las variables del stack. Dify no sirve acá:
  // no soporta tools custom inyectadas vía su API pública de chat.
  const ai = internalAiCreds(workspaceId)
  if (!ai) {
    if (jevDone) return
    throw new Error('Lucas: sin IA de texto configurada (Settings → Plan o ANTHROPIC_API_KEY/OPENAI_API_KEY)')
  }
  const { provider, apiKey, model } = ai

  const lucasCfg = lucasConfig(workspaceId)
  const criteriaStages = stagesWithCriteria(workspaceId)
  const stagesText = !lucasCfg.opportunities.move
    ? 'No muevas etapas del embudo (está desactivado): no uses set_funnel_stage.'
    : criteriaStages.length
      ? `Etapas a las que podés mover al contacto con set_funnel_stage (usá el id exacto; solo si la conversación cumple el criterio):\n${criteriaStages.map(st => `- ${st.id} — ${st.label} (${st.funnel}): ${st.criteria}`).join('\n')}`
      : 'Ninguna etapa del embudo tiene criterio configurado: no uses set_funnel_stage.'
  const ratingText = lucasCfg.rating.enabled
    ? `Criterios de temperatura para set_lead_score (usá estos, no otros):
## Caliente
${lucasCfg.rating.criteria.caliente}
## Tibio
${lucasCfg.rating.criteria.tibio}
## Frío
${lucasCfg.rating.criteria.frio}${lucasCfg.rating.icp?.trim() ? `

Score (0–100) = coincidencia con el perfil de cliente ideal. Partí de 50, sumá y restá según estas reglas (solo las que se cumplan en la conversación) y limitá el resultado entre 0 y 100:
${lucasCfg.rating.icp.trim()}` : ''}`
    : ''
  const criteriaTags = lucasCfg.smart_tags.enabled ? tagsWithCriteria(workspaceId) : []
  const tagsText = criteriaTags.length
    ? `Tags que podés asignar con add_contact_tag (solo si la conversación cumple el criterio):\n${criteriaTags.map(t => `- ${t.title}: ${t.criteria}`).join('\n')}`
    : 'No asignes tags: no uses add_contact_tag.'
  let system = `Sos Lucas, un analista de ventas silencioso. Leés una conversación de WhatsApp YA CERRADA entre un bot/vendedor y un lead, y actualizás el CRM usando las tools disponibles. No inventes datos que no estén en la conversación. No hables con el cliente, solo usá las tools. SIEMPRE terminá llamando set_lead_score.

${ratingText}

${stagesText}

${tagsText}`
  if (jevDone) {
    system = `Sos Lucas, un analista de ventas silencioso. Leés una conversación de WhatsApp YA CERRADA y actualizás el CRM con las tools disponibles. La temperatura, el score, la etapa y los tags ya están decididos: no los toques. Solo completá datos vacíos del contacto, dejá una nota breve con el resumen y creá una tarea de seguimiento si hace falta. No inventes datos.`
  }
  const tools = jevDone
    ? QUALIFIER_TOOLS.filter(t => ['fill_contact_fields', 'append_note', 'create_followup_task'].includes(t.name))
    : QUALIFIER_TOOLS
  let currentMessages = [{ role: 'user', content: `Transcript de la conversación:\n${transcriptText}` }]
  const toolContext = { workspaceId, contactId }
  const MAX_ROUNDS = 4
  let scored = false

  try {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 600, system, messages: currentMessages, tools }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
      const toolUses = (d.content || []).filter(b => b.type === 'tool_use')
      if (!toolUses.length || d.stop_reason === 'end_turn') break

      currentMessages.push({ role: 'assistant', content: d.content })
      const toolResults = []
      for (const tu of toolUses) {
        const result = executeQualifierTool(tu.name, tu.input, toolContext)
        if (tu.name === 'set_lead_score') scored = true
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
      }
      currentMessages.push({ role: 'user', content: toolResults })
    } else {
      const openaiTools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: 'system', content: system }, ...currentMessages], tools: openaiTools, tool_choice: 'auto' }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || JSON.stringify(d.error))
      const msg = d.choices?.[0]?.message
      if (!msg?.tool_calls?.length || d.choices?.[0]?.finish_reason === 'stop') break

      currentMessages.push(msg)
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || '{}')
        const result = executeQualifierTool(tc.function.name, args, toolContext)
        if (tc.function.name === 'set_lead_score') scored = true
        currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }
  }

  } catch (e) {
    // Con Jev las decisiones ya quedaron guardadas: que falle la IA de texto no rompe la calificación
    if (!jevDone) throw e
    console.warn('⚠ [Lucas] La IA de texto falló; quedan las decisiones de Jev:', e.message)
  }

  if (!scored && !jevDone) {
    executeQualifierTool('set_lead_score', { temperature: 'tibio', score: 50, reasoning: 'Lucas no determinó un score explícito.' }, toolContext)
  }
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
