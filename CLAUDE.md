# CLAUDE.md — Manual del proyecto ARIA

## Estilo de respuesta
- Respuestas concisas y directas. Sin preámbulos innecesarios.
- Siempre en español salvo que el código o los logs requieran inglés.
- Ante una tarea clara, ejecutar primero y preguntar solo si hay ambigüedad real.

## Autonomía
- No pedir confirmación para acciones rutinarias: leer archivos, explorar, correr comandos read-only, aplicar cambios pequeños.
- Preguntar solo si la acción es destructiva o hay dos caminos genuinamente distintos.

---

## Estado del proyecto — 2026-04-29

### ✅ Funciona en producción — actualizado 2026-04-30
- Login / registro multi-tenant (workspaces)
- Dashboard con métricas Tiledesk
- Contactos (CRUD completo + labels + tags)
- Embudos (kanban drag & drop)
- Agentes (humanos + bots IA, selector de bot activo)
- Configuración (canales, credenciales, WAHA, QR)
- **WhatsApp round-trip completo** (ver flujo abajo)
- Notificaciones SSE: badge rojo en sidebar + toast flotante cuando llega mensaje WA
- Múltiples sesiones WAHA por workspace
- Conversaciones WAHA nativas (lista de chats + mensajes + envío)
- **Bot externo (`type:"external"`)**: agentes creados en ARIA usan LLM vía `callLLM()` → `/api/bot-webhook`
- **Bot tilebot**: flow JSON `ARIA Agent.json` inyectado en Tiledesk. `gpt_task` usa API key de Tiledesk Integrations → AI
- **KB aislada por agente**: cada bot tiene su propio namespace en Tiledesk KB (`kb_namespace_id` en `agent_metadata`)
- **LLM configurable por workspace**: Settings → Plan → proveedor (OpenAI/Anthropic) + modelo + API key. Solo owner puede configurar.
- **Uso de tokens**: tabla `llm_usage` + endpoint `/api/usage/llm` con filtro de fechas. Solo visible para owner.
- **Wizard**: Step5 tiene toggle "Activar como bot predeterminado en WhatsApp" (ON por defecto). Al guardar llama `setActiveBotId`.
- **Contactos de prueba filtrados**: `test-chat` marca leads con `attributes.aria_test_contact:true`. Contacts y Funnels los excluyen.
- **Labels en ARIA DB**: `/labels` endpoint propio (Tiledesk `/{id}/labels` no funciona en self-hosted, siempre 500).
- **Kanban con etiquetas**: carga labels, muestra con colores, filtro por etiqueta en toolbar.

### ⚠️ Pendiente
- Bot activo por sesión (hoy uno por workspace via `channel_settings.default_bot_id`)
- Actualizar departamento Tiledesk automáticamente cuando cambia bot activo en ARIA
- EvolutionGo: configuración adicional
- Copilot (tab Settings): Q&As → intents
- Flows específicos por tipo de agente (hoy todos usan `ARIA Agent.json`)
- Configurar API key de OpenAI en Tiledesk → Integraciones → AI (para que `gpt_task` del flow funcione)
- `extBotHistory` persistente (hoy se pierde al reiniciar container — ok para MVP)
- **Kanban más complejo** — próxima sesión
- Verificar labels tras Update the stack en Portainer (puede estar corriendo imagen vieja)

---

## Flujo WhatsApp — cómo funciona (bot externo)

```
WhatsApp del cliente
  → WAHA webhook → POST /webhook/waha (ARIA)
    → Tiledesk: crea anon token + crea/reutiliza conv
      → agrega bot_${botId} como participante (bot externo)
        → Tiledesk POST /api/bot-webhook (ARIA)
          → callLLM() [OpenAI/Anthropic según config workspace]
            → respuesta posteada a Tiledesk con token del bot
              → Tiledesk dispara webhook message.create
                → POST /webhook/tiledesk (ARIA)
                  → WAHA POST /api/sendText → WhatsApp del cliente ✅
```

## Flujo tilebot (bot nativo Tiledesk)

```
WhatsApp del cliente
  → WAHA webhook → ARIA → Tiledesk (crea conv)
    → agrega bot_${botId} como participante
      → Tiledesk ejecuta flow JSON (ARIA Agent.json)
        → gpt_task action usa API key de Tiledesk Integrations → AI
          → responde directamente al chat de Tiledesk
            → Tiledesk message.create webhook → ARIA → WAHA → WhatsApp ✅
```

**IMPORTANTE sobre tilebots:**
- `gpt_task` y `askgpt` en el flow usan la API key configurada en Tiledesk → Project Settings → Integrations → AI
- ARIA solo inyecta las instrucciones en el campo `context` del `gpt_task` al importar el flow
- `ARIA Agent.json` es el flow base. `injectInstructions()` reemplaza `context` con las instrucciones generadas

**Reglas críticas (no cambiar sin entender el motivo):**

| Regla | Por qué |
|-------|---------|
| `wa_from` = `msg.chatId` (nunca `msg.from`) | `msg.from` puede ser `@lid` (Linked Device ID de privacidad WA) — no sirve para responder |
| Conv TTL 30 min en wa_conversations | Fuerza nueva conv → historial LLM se limpia → bot empieza fresco |
| Bot se agrega con `bot_${botId}` (no solo botId) en participants | Sin prefijo `bot_`, Tiledesk lo registra como usuario humano y no dispara el webhook externo |
| Webhook Tiledesk filtra `sender === 'system'` | Evita reenviar a WA mensajes de info de grupo ("bot added", etc.) |
| Webhook Tiledesk filtra UUID regex en sender | Evita loop: mensajes del visitante (UUID format) no se reenvían a WA |
| WAHA sendText: `POST /api/sendText` body `{session, chatId, text}` | `/api/{session}/sendText` da 404 en WAHA Pro — el path no lleva sesión |
| Filtrar `status@broadcast` y `@g.us` del webhook WAHA | Evita crear convs Tiledesk para estados WA y grupos |
| requestId: `support-group-{projectId}-{hexUUID}` | Otro formato cuelga Tiledesk indefinidamente |
| `signinAnonymously` para token de visitante | `/requests/simple` cuelga |
| `sender` explícito en POST de mensaje | Sin sender, Tiledesk cuelga |

---

## LLM en ARIA — arquitectura

### `callLLM({ system, messages, max_tokens, workspaceId })`
Función en `server/index.js` que unifica llamadas a LLM:
1. Lee config del workspace: `channel_settings.llm_provider / llm_api_key / llm_model`
2. Si no hay config → usa env: `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`
3. Soporta `provider: 'openai'` (formato OpenAI) y `provider: 'anthropic'` (formato Anthropic)
4. Registra uso en `llm_usage` via `trackLlmUsage()`

**Usos de `callLLM()` en ARIA** (no en Tiledesk):
- `POST /api/agents/generate-instructions` — genera instrucciones del agente
- `POST /api/agents/playground` — playground de prueba
- `POST /api/ai/suggest` — sugerencia de respuesta para agente humano
- `POST /api/bot-webhook` — respuesta del bot externo a WA

### LLM configurable (Settings → Plan → solo owner)
- Proveedor: OpenAI o Anthropic
- Modelo: depende del proveedor (gpt-4o-mini, gpt-4o, claude-haiku-*, etc.)
- API Key: se guarda en `channel_settings.llm_api_key` (enmascarada en GET)
- Endpoint GET: `/api/llm/config` — devuelve `{configured, provider, model, api_key: "sk-...***"}`
- Endpoint PUT: `/api/llm/config` — body `{provider, api_key, model}` (solo owner)

### Tokens — seguimiento
- Tabla: `llm_usage (id, workspace_id, endpoint, model, input_tokens, output_tokens, created_at)`
- Endpoint: `GET /api/usage/llm?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Respuesta: `{total: {total_input, total_output, total_calls}, byEndpoint: [{endpoint, model, calls, input, output}]}`

---

## Agentes — flujo y KB

### Wizard de creación (AgentWizard.jsx)
- **Step 1**: Elegir template → `create-draft` → crea bot en Tiledesk + namespace KB + importa `ARIA Agent.json`
  - Respuesta incluye `{botId, kbNamespaceId}`
- **Step 2**: Agregar contenido a KB (URLs, FAQs, texto). Usa `kbNamespaceId` del bot (exclusivo, no compartido)
- **Step 3**: Generar instrucciones con LLM (incluye KB del namespace del bot)
- **Step 4**: Info del agente (nombre, tono, empresa)
- **Step 5**: Playground + Finalizar

### KB aislada por agente
- Cada bot tiene su propio namespace en Tiledesk KB (`agent_metadata.kb_namespace_id`)
- Se crea en `create-draft` via `POST /{projectId}/kb/namespace`
- Bots legacy sin namespace: `POST /api/agents/:botId/ensure-kb-namespace` crea uno al vuelo
- `generate-instructions` usa solo el namespace del bot (no todos)
- `bot-webhook` lee KB solo del namespace del bot

### Flow `ARIA Agent.json` (`/root/aria/flows/ARIA Agent.json`)
Flow limpio para todos los agentes:
- `start` (`\start`) → intent `welcome`
- `welcome` → `gpt_task` (saludo) + `reply {{gpt_reply}}`
- `defaultFallback` → `gpt_task` con `{{last_user_text}}` + `reply {{gpt_reply}}`
- `context` en `gpt_task` = placeholder que `injectInstructions()` reemplaza con instrucciones generadas
- `max_tokens`: 200 en welcome, 512 en defaultFallback

### `injectInstructions(flow, instructions, welcomeMsg)`
Recorre los intents del flow:
- Reemplaza `context` de cualquier `gpt_task` que ya tenga context (no vacío)
- Actualiza el mensaje de texto en el intent `welcome` si se pasa `welcomeMsg`

---

## API ARIA — Endpoints propios

### Auth
| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login ARIA. Body: `{email, password}`. Resp: `{token, user}` |
| POST | `/api/auth/register` | Registro + crea workspace + proyecto Tiledesk |
| GET | `/api/auth/me` | Info del usuario autenticado |

### Workspace
| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/workspace` | Info del workspace + miembros |
| GET | `/api/workspace/members` | Lista de miembros |
| POST | `/api/workspace/invite` | Invitar miembro (solo owner/admin). Body: `{email, role}` |
| GET | `/api/workspace/teams` | Lista de equipos |
| POST | `/api/workspace/teams` | Crear equipo |
| PUT | `/api/workspace/teams/:id` | Actualizar equipo |
| DELETE | `/api/workspace/teams/:id` | Eliminar equipo |

### Canales (WAHA)
| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/channels/settings` | Configuración WAHA/Evo del workspace |
| PUT | `/api/channels/settings` | Guardar config |
| GET | `/api/channels/instances` | Lista de instancias (sesiones) |
| POST | `/api/channels/instances` | Crear instancia |
| GET | `/api/channels/instances/:id/qr` | QR para conectar WA |
| POST | `/api/channels/instances/:id/restart` | Reiniciar sesión WAHA |
| DELETE | `/api/channels/instances/:id` | Eliminar instancia |
| POST | `/api/channels/instances/:id/logout` | Cerrar sesión WA |

### Agentes (Bots)
| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/api/agents/create-draft` | Crea bot + namespace KB + importa flow. Resp: `{botId, kbNamespaceId}` |
| POST | `/api/agents/generate-instructions` | Genera instrucciones. Body incluye `bot_id` para leer KB del bot |
| POST | `/api/agents/playground` | Chat directo con LLM |
| POST | `/api/agents/:botId/test-chat` | Test real via Tiledesk. Body: `{projectId, text?, reset?}` |
| PUT | `/api/agents/:botId/finalize` | Guardar agente completo |
| GET | `/api/agents/metadata` | Metadata de agentes del workspace (incluye `kb_namespace_id`) |
| POST | `/api/agents/:botId/ensure-kb-namespace` | Crea namespace KB si no tiene. Body: `{projectId}` |

### Labels (etiquetas — NO usar Tiledesk labels, están rotas)
| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/labels` | Lista etiquetas del workspace |
| POST | `/api/labels` | Crear etiqueta. Body: `{title, color}` |
| PUT | `/api/labels/:id` | Editar etiqueta |
| DELETE | `/api/labels/:id` | Eliminar etiqueta |
| PUT | `/api/agents/:botId/instructions` | Actualizar instrucciones (tilebot: re-inyecta flow) |
| PUT | `/api/agents/:botId/config` | Config técnica (temperature, channels, derivation_users) |
| PUT | `/api/agents/:botId/active` | Activar/desactivar. Body: `{active: bool}` |
| GET | `/api/agents/:botId/files` | Archivos adjuntos |
| POST | `/api/agents/:botId/files` | Subir archivo (multipart, max 3) |
| DELETE | `/api/agents/:botId/files/:fileId` | Eliminar archivo |
| POST | `/api/agents/:botId/ensure-kb-namespace` | Crea namespace KB si no tiene. Body: `{projectId}` |

### LLM / Uso
| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/llm/config` | Config LLM del workspace (key enmascarada). Solo owner |
| PUT | `/api/llm/config` | Guardar config LLM. Body: `{provider, api_key, model}`. Solo owner |
| GET | `/api/usage/llm` | Uso de tokens. Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` |

### Conversaciones WAHA (inbox)
| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/waha/sessions` | Sesiones activas del workspace |
| GET | `/api/waha/chats` | Lista de chats |
| GET | `/api/waha/chats/:chatId/messages` | Mensajes de un chat |
| POST | `/api/waha/send` | Enviar texto. Body: `{session, chatId, text}` |
| POST | `/api/waha/chats/:chatId/read` | Marcar como leído |
| POST | `/api/waha/send-file` | Enviar archivo |
| POST | `/api/waha/send-voice` | Enviar audio |

### Tareas / Mensajes programados / IA
| Método | Path | Descripción |
|--------|------|-------------|
| GET/POST | `/api/tasks` | CRUD tareas |
| PUT/DELETE | `/api/tasks/:id` | Actualizar/eliminar |
| GET/POST | `/api/scheduled-messages` | Mensajes programados |
| DELETE | `/api/scheduled-messages/:id` | Cancelar |
| POST | `/api/ai/suggest` | Sugerir respuesta IA al agente humano |
| GET | `/api/events?token=JWT` | SSE: emite `event: new-message` |

### Webhooks (reciben llamadas externas)
| Método | Path | Quién llama |
|--------|------|-------------|
| POST | `/webhook/waha` | WAHA — mensajes WA + eventos sesión |
| POST | `/webhook/tiledesk` | Tiledesk — message.create (reenvía a WA) |
| POST | `/api/bot-webhook` | Tiledesk — bot externo (LLM + responde) |

### Proxy Tiledesk
| Método | Path | Descripción |
|--------|------|-------------|
| `*` | `/api/tiledesk/*` | Proxy autenticado a Tiledesk |

---

## Modelos de datos — SQLite (`/data/aria.db`)

```
labels:            id, workspace_id, title, color, created_at  ← Tiledesk labels no funciona en self-hosted
workspaces:        id, name, tiledesk_project_id, created_at
users:             id, email, password_hash, name, workspace_id, role (owner/admin/member)
invites:           id, workspace_id, email, token, used, expires_at
funnels:           id, workspace_id, name, stages (JSON), sort_order
funnel_stages:     workspace_id, lead_id, stage, lead_status (open/won/lost)
channel_settings:  workspace_id, waha_url, waha_key, evo_url, evo_key, default_bot_id,
                   cw_url, cw_token, cw_account_id,
                   llm_provider, llm_api_key, llm_model  ← nuevo
channel_instances: id, workspace_id, provider, instance_name, session_name, phone_number, status
wa_conversations:  id, workspace_id, session_name, wa_from, request_id, closed, updated_at
agent_metadata:    bot_id, workspace_id, bot_type (external|tilebot), tone, nationality,
                   company_name, template_id, active, instructions, temperature, top_p,
                   channels (JSON), derivation_users (JSON),
                   kb_namespace_id  ← nuevo (namespace de Tiledesk KB exclusivo del bot)
agent_files:       id, bot_id, workspace_id, filename, size, path
llm_usage:         id, workspace_id, endpoint, model, input_tokens, output_tokens, created_at  ← nuevo
tasks:             id, workspace_id, title, description, lead_id, assignee_id, due_date, status, priority
scheduled_messages: id, workspace_id, chat_id, session_name, text, send_at, sent
teams:             id, workspace_id, name, description, leader_id, leader_name
team_members:      team_id, user_id
```

---

## Cómo hacer un deploy

```bash
# 1. Editar código en /root/aria/
# 2. Build
docker build -t aria:latest /root/aria/

# 3. Portainer → stack aria → Update the stack
# NUNCA: docker stack deploy (desincroniza con Portainer)
```

**Ver logs:**
```bash
docker ps --format "{{.Names}}" | grep aria
docker logs <nombre> --tail 50 -f
```

**Ver/editar DB:**
```bash
docker run --rm -v aria_aria_data:/data alpine sh -c \
  "apk add --quiet sqlite && sqlite3 /data/aria.db '<query>'"
```

---

## Variables de entorno (Portainer — YAML del stack)

| Variable | Valor / Uso |
|----------|-------------|
| `WAHA_URL` | https://waha.saludok.com.ar |
| `WAHA_KEY` | 127-char key |
| `TILEDESK_URL` | http://tilrdefinitivo_server:3000 |
| `ARIA_PUBLIC_URL` | https://aria.saludok.com.ar |
| `ANTHROPIC_API_KEY` | Fallback si no hay config LLM en DB |
| `OPENAI_API_KEY` | Fallback preferido (se usa antes que Anthropic) |
| `JWT_SECRET` | string largo |

**Nota:** La config LLM primaria se guarda en DB (`channel_settings`), no en env vars. Los env vars son fallback.

---

## Tiledesk — endpoints confirmados

- `POST /auth/signinAnonymously` → `{token, user._id}` — token anónimo de visitante
- `POST /{id}/requests/{requestId}/messages` → crea conv + mensaje (requiere `sender: anonUserId`)
- `POST /{id}/requests/{requestId}/participants` → `{member: "bot_{botId}"}` dispara webhook externo o `\start` tilebot
- `GET /{id}/project_users` → agentes humanos
- `GET /{id}/bots` → bots (`type:"tilebot"` o `type:"external"`)
- `GET/POST /{id}/subscriptions` → webhooks (`event: "message.create"`)
- `GET/POST /{id}/leads` → contactos
- `POST /{id}/bots/importjson/:botId` → importar flow JSON (multipart, campo `uploadFile`)
- `GET /{id}/departments` / `PUT /{id}/departments/:deptId` → routing de bots
- `POST /{id}/kb/namespace` → crear namespace KB. Body: `{name}`. Resp: `{_id, ...}`
- `GET /{id}/kb/namespace/all` → listar todos los namespaces del proyecto
- `POST /{id}/kb/` → crear contenido KB. Body: `{type, name, source?, content, namespace}`
- `GET /{id}/kb/?namespace=&direction=&sortField=&limit=` → listar contenido
- `DELETE /{id}/kb/:contentId` → eliminar contenido

**Bots activos en proyecto `69eabffa7e9f2100135f831d`:**
- `69ee0b38ae8dc40013ed1076` → QualiBot Pro (tilebot, legacy)
- `69e58c49e16ed20013e81524` → 24/7 Customer Service (tilebot, legacy)
- `69e81fc05db463001304344e` → Luana (tilebot, legacy)

**Admin Tiledesk:** soporte@saludok.com.ar / Rolling2570@

---

## Arquitectura — decisiones clave

| Decisión | Motivo |
|----------|--------|
| `ARIA Agent.json` como flow base (reemplaza ChatGPT Task.json) | ChatGPT Task.json era un demo de rating (Design Studio), no un chat agent real |
| KB namespace por bot (no uno global) | Evita que todos los bots vean el mismo contenido KB |
| `ensure-kb-namespace` para bots legacy | Crea namespace al vuelo en primera visita a tab KB sin romper bots existentes |
| `callLLM()` unificado | Permite cambiar proveedor/modelo sin tocar código. Lee config de DB, fallback a env |
| `llm_usage` para tracking | El dueño del workspace ve cuánto consume antes de que sea muy caro |
| LLM config solo para owner | Evitar que miembros cambien el proveedor/key |
| Bot externo (`type:"external"`) | LLM con historial real, nunca abandona la conv |
| Tilebots usan API key de Tiledesk Integrations | `gpt_task`/`askgpt` son acciones nativas de Tiledesk. ARIA solo inyecta instrucciones en `context` |
| `extBotHistory` Map en memoria | OK para MVP. Se pierde al reiniciar container |
| `injectInstructions()` solo modifica `gpt_task` con context no vacío | Evita inyectar en gpt_task que tengan context="" (welcome por ejemplo podría no tener) |
| Deploy vía Portainer únicamente | Solo `docker build`, nunca `docker stack deploy` |
| DB SQLite con `mkdirSync` al inicio | `/data` puede no existir en contenedor nuevo |
| ARIA necesita red `tiledesk_net` | Sin esa red, Tiledesk es inalcanzable |
| URLs siempre sin trailing slash | WAHA responde 401 con doble barra |

---

## Cómo actualizar este archivo

Claude actualiza las secciones de estado y decisiones al final de cada sesión, o cuando el usuario lo pide con "guardá el contexto" o "actualizá el manual".
