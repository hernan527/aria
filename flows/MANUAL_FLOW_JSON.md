# Manual completo: ARIA + Tiledesk

Este archivo documenta todo el proyecto ARIA: qué es, por qué existe, cómo funciona la
arquitectura, cómo se generan agentes con IA, y cómo se usa la API de Tiledesk.

Está escrito para que cualquier IA (Claude u otra) pueda retomar el trabajo desde cero
sin perder contexto — especialmente útil cuando aparece el rate limit y hay que empezar
una nueva sesión.

---

## PARTE 1 — Visión del proyecto

### Qué es ARIA

ARIA es un SaaS de agentes de WhatsApp construido encima de Tiledesk (self-hosted).
El cliente final nunca sabe que Tiledesk existe. ARIA es la capa de producto que hace
accesible lo que Tiledesk tiene adentro.

**El anzuelo de venta:** "Deployá tu agente de WhatsApp en 5 minutos, desde una plantilla,
sin código, con tus datos en tu propia infraestructura."

**La motivación real del creador:** Aurelia (competidor) guarda todas las conversaciones
de sus clientes en sus propios servidores. ARIA nació porque eso no está bien — el cliente
tiene que ser dueño de sus propios datos de conversación.

### Stack técnico

```
ARIA Frontend (React + Vite + TailwindCSS)
       ↓
ARIA Server (Node.js / Express + SQLite)
       ↓
Tiledesk self-hosted  ←→  OpenAI (gpt-4.1 / gpt-4o)
       ↓
WAHA (WhatsApp HTTP API) — multi-sesión
```

- ARIA corre en Docker, deploy vía Portainer (nunca `docker stack deploy` directo).
- SQLite en `/data/aria.db` — multi-tenant por `workspace_id`.
- El proxy `/api/tiledesk/*` en el server reescribe hacia Tiledesk con token de admin.
- WAHA maneja las sesiones de WhatsApp; cada sesión es una "bandeja" diferente.

### MVP definido

```
Agents (crear desde plantilla) → Copilot (configurar KB) → Conversations (ver/responder) → Canales (conectar WhatsApp)
```

### Competidores directos

| Producto | Diferencia con ARIA |
|---|---|
| Aurelia | SaaS cerrado, guardan tus conversaciones |
| Landbot | Sin motor de IA propio, más visual que funcional |
| Voiceflow | Potente pero caro, sin self-hosted |
| Botpress | Open source pero complejo de operar |
| Tiledesk Cloud | El mismo motor pero sin la capa de producto de ARIA |

**Argumento para mostrarle a Tiledesk:**
> "Tiledesk es el mejor backend para agentes conversacionales. ARIA es el frontend
> que lo hace accesible. Juntos compiten con Aurelia — self-hosted, datos del cliente
> en su propia infraestructura. Si son inteligentes, lo ponen en su marketplace."

---

## PARTE 2 — Por qué Tiledesk es más poderoso que n8n para esto

n8n es un pegador de APIs — no tiene nada propio. Tiledesk tiene todo el dominio
de conversaciones adentro, Y ADEMÁS tiene APIs para cada pieza.

### Webhooks de Tiledesk — 20+ eventos

Tiledesk avisa en tiempo real de todo lo que pasa:

| Evento | Cuándo se dispara |
|---|---|
| `request.create` | Nueva conversación iniciada |
| `request.update` | Conversación actualizada |
| `request.close` | Conversación cerrada |
| `message.create` | Cualquier mensaje (enviado o recibido) |
| `message.create.request.channel.whatsapp` | Solo mensajes de WhatsApp |
| `lead.create` | Nuevo contacto creado |
| `faqbot.create/update/delete` | Cambios en bots |
| `event.emit.NOMBRE` | Eventos personalizados que vos disparás |
| `operator.select` | **El más poderoso**: intercepta la asignación *antes* de que pase, decidís vos la lógica (skills, horarios, etc.) |

### Realtime API — WebSocket

Conexión en tiempo real a `wss://tilellm.saludok.com.ar/rtmv3/api/`.
Sirve para dashboards en vivo, métricas de agentes conectados, carga actual.

### Bot externo — Bring Your Own LLM

El tipo `external` de bot te permite apuntar a cualquier endpoint propio.
Tiledesk manda el mensaje del usuario, vos respondés con JSON.
Podés poner Gemini, Mistral, un modelo fine-tuned, o cualquier lógica propia.

### Dentro del flow, automatización sin n8n

El action type `webrequestv2` dentro de un flow puede llamar a cualquier API externa:
tu CRM, tu ERP, Google Sheets, Slack, lo que sea. Sin n8n en el medio.

Y el action type `code` ejecuta JavaScript arbitrario dentro del bot.

### Resumen: lo que Tiledesk tiene que n8n no tiene

- Motor de conversaciones con historial por contacto
- CRM de leads/contactos integrado
- Canal de WhatsApp nativo (vía WAHA o Evolution)
- Knowledge Base con RAG propio (`askgptv2`)
- GPT nativo en los flows (`gpt_task`)
- Handoff a humano con lógica de routing (`operator.select`)
- SDK móvil para iOS y Android

n8n sirve para orquestar lo que no está en Tiledesk (sistemas externos legacy, etc.).
Pero para el núcleo del agente conversacional, Tiledesk lo tiene todo.

---

## PARTE 3 — Cómo funciona la creación de agentes en ARIA

### El wizard de 5 pasos

```
Paso 0: Elegir plantilla (lead-qualifier, faq, travel, broker, concesionaria-directa, concesionaria-plan)
Paso 1: Datos básicos (nombre, tono, nacionalidad)
Paso 2: Base de conocimiento (empresa, descripción, sitios web, archivos)
Paso 3: Datos técnicos (temperatura, top_p, canales, derivación)
Paso 4: Loader — Claude genera instrucciones + las inyecta en Tiledesk
Paso 5: Instrucciones editables + playground con el bot real
```

### Lo que pasa internamente en el Paso 4

1. Claude genera el system prompt a partir de los datos del formulario.
2. ARIA llama a `PUT /api/agents/:botId/instructions` con las instrucciones.
3. El server hace `INSERT OR IGNORE` en `agent_metadata` (crea fila si no existe).
4. El server llama a `loadFlow(template_id)` — carga el JSON de `/flows/`.
5. `injectInstructions()` reemplaza el `context` del `gpt_task` principal.
6. `importFlowToBot()` hace `POST /{projectId}/bots/importjson/{botId}` a Tiledesk.
7. El bot en Tiledesk ya tiene las instrucciones — el playground del Paso 5 lo usa en tiempo real.

### La función injectInstructions (lógica clave)

Solo inyecta en el `gpt_task` que tiene `context` no vacío (el nodo conversacional principal).
Los `gpt_task` de extracción (extraer nombre/email/teléfono del transcript) tienen `context: ""`
y no se tocan — para que sigan haciendo solo extracción.

```javascript
if (action._tdActionType === 'gpt_task' && instructions
    && action.context && action.context.trim().length > 0) {
  return { ...action, context: instructions }
}
```

### La tabla agent_metadata en SQLite

```sql
bot_id          TEXT PRIMARY KEY
workspace_id    TEXT
tone            TEXT
nationality     TEXT
company_name    TEXT
template_id     TEXT
active          INTEGER (0/1)
instructions    TEXT
temperature     REAL
top_p           REAL
channels        TEXT (JSON array)
derivation_users TEXT (JSON array)
updated_at      INTEGER
```

---

## PARTE 4 — Flujos Tiledesk: formato JSON para generación con IA

Este manual le enseña a una IA cómo generar un flujo de bot Tiledesk
(`tilebot`) completo en formato JSON, desde cero, a partir de una descripción en lenguaje
natural.

---

## 1. Estructura raíz del JSON

```json
{
  "name": "Nombre del bot",
  "type": "tilebot",
  "subtype": "chatbot",
  "language": "es",
  "webhook_enabled": false,
  "attributes": {
    "variables": {
      "gpt_reply": "gpt_reply"
    }
  },
  "intents": [ ... ]
}
```

- `type` siempre es `"tilebot"` y `subtype` siempre es `"chatbot"` para bots con IA.
- `attributes.variables` declara las variables del flujo. Siempre incluir al menos `gpt_reply`.
- `intents` es el array de bloques/nodos del flujo.

---

## 2. Estructura de un intent (bloque/nodo)

```json
{
  "webhook_enabled": false,
  "enabled": true,
  "intent_display_name": "nombre_legible",
  "intent_id": "uuid-v4-único",
  "question": "",
  "language": "es",
  "actions": [ ... ],
  "attributes": {
    "position": { "x": 0, "y": 0 }
  },
  "agents_available": false
}
```

Reglas importantes:
- `intent_id`: UUID v4 único por intent. Formato: `"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"`.
- `question`: Solo se usa en `"start"` (valor `"\\start"`) y en intents con trigger de texto.
  Para bloques internos (a los que solo se llega desde otros bloques), dejar vacío `""`.
- `intent_display_name`: Nombre legible. Puede contener espacios.
- Los intents se referencian entre sí con el formato `"#intent_id"`.

---

## 3. El intent `start` — obligatorio en todo flujo

```json
{
  "intent_display_name": "start",
  "intent_id": "UUID-1",
  "question": "\\start",
  "actions": [
    {
      "_tdActionType": "intent",
      "intentName": "#UUID-del-siguiente-bloque",
      "_tdActionId": "UUID-accion"
    }
  ],
  "attributes": { "readonly": true }
}
```

- Es el punto de entrada. Se dispara automáticamente cuando inicia una conversación.
- Su única acción suele ser `intent` (redirección al bloque de bienvenida).

---

## 4. Tipos de acción (`_tdActionType`)

Cada acción necesita siempre `_tdActionId` (UUID único) y `_tdActionType`.

---

### 4.1 `reply` — Enviar mensaje al usuario

```json
{
  "_tdActionType": "reply",
  "_tdActionId": "UUID",
  "attributes": {
    "disableInputMessage": false,
    "commands": [
      { "type": "wait", "time": 500 },
      {
        "type": "message",
        "message": {
          "type": "text",
          "text": "Hola! Soy Luana. ¿En qué te puedo ayudar?",
          "attributes": {
            "attachment": { "type": "template", "buttons": [] }
          }
        }
      }
    ]
  }
}
```

Para agregar botones de respuesta rápida, incluirlos en `buttons`:

```json
{
  "uid": "UUID-del-boton",
  "type": "action",
  "value": "Quiero información",
  "action": "#UUID-del-intent-destino",
  "show_echo": true
}
```

Múltiples mensajes: alternar `wait` y `message` en el array `commands`.

---

### 4.2 `gpt_task` — Llamar a GPT (el cerebro del agente)

```json
{
  "_tdActionType": "gpt_task",
  "_tdActionId": "UUID",
  "context": "Sos Luana, asistente virtual de Premedic Argentina. Tu objetivo es...",
  "question": "{{lastUserText}}",
  "assignReplyTo": "gpt_reply",
  "model": "gpt-4.1",
  "temperature": 0.7,
  "max_tokens": 256,
  "history": true,
  "formatType": "none",
  "preview": [],
  "trueIntent": "#UUID-del-siguiente-bloque"
}
```

Campos clave:
- `context`: El system prompt. Aquí va toda la personalidad, objetivos y reglas del agente.
- `question`: Casi siempre `"{{lastUserText}}"` (último mensaje del usuario).
- `history`: `true` para que el bot recuerde la conversación. `false` para llamadas puntuales.
- `assignReplyTo`: Variable donde se guarda la respuesta. Usar `"gpt_reply"` por convención.
- `trueIntent`: A dónde ir después (siempre requerido aunque no haya condición).
- `model`: Recomendado `"gpt-4.1"` para el nodo principal. `"gpt-4o"` para extracción.

**Patrón "responder hasta que esté listo":**
En el `context` del `gpt_task` principal, terminar con:
> "Cuando hayas recopilado toda la información necesaria, respondé ÚNICAMENTE con la palabra 'listo', sin nada más."

Luego usar `jsoncondition` para detectar esa palabra y avanzar.

---

### 4.3 `jsoncondition` — Bifurcación lógica

```json
{
  "_tdActionType": "jsoncondition",
  "_tdActionId": "UUID",
  "groups": [
    {
      "type": "expression",
      "conditions": [
        {
          "type": "condition",
          "operand1": "gpt_reply",
          "operator": "contains",
          "operand2": { "type": "const", "value": "listo" }
        }
      ]
    }
  ],
  "stopOnConditionMet": true,
  "trueIntent": "#UUID-si-es-verdad",
  "falseIntent": "#UUID-si-es-falso"
}
```

Operadores disponibles: `"contains"`, `"equal"`, `"not_equal"`, `"starts_with"`, `"exists"`.

**Uso más común:** detectar si el bot dijo una palabra clave como `"done"` o `"listo"`.

---

### 4.4 `ai_condition` — Bifurcación con lenguaje natural

```json
{
  "_tdActionType": "ai_condition",
  "_tdActionId": "UUID",
  "instructions": "El usuario dijo: {{lastUserText}}",
  "model": "gpt-4.1",
  "intents": [
    {
      "label": "UUID-label-1",
      "prompt": "si el usuario quiere hablar con un humano",
      "conditionIntentId": "#UUID-destino-humano"
    },
    {
      "label": "UUID-label-2",
      "prompt": "si el usuario tiene una queja",
      "conditionIntentId": "#UUID-destino-queja"
    }
  ],
  "fallbackIntent": "#UUID-si-ninguna-condicion",
  "errorIntent": "#UUID-si-error"
}
```

Más flexible que `jsoncondition` pero más costoso (llama a GPT).
Ideal para detectar intención del usuario con ambigüedad.

---

### 4.5 `intent` — Saltar a otro bloque

```json
{
  "_tdActionType": "intent",
  "_tdActionId": "UUID",
  "intentName": "#UUID-del-destino"
}
```

El bloque más simple. Solo redirige a otro intent.

---

### 4.6 `replacebotv3` — Derivar a agente humano

```json
{
  "_tdActionType": "replacebotv3",
  "_tdActionId": "UUID",
  "useSlug": false,
  "blockName": "",
  "botId": ""
}
```

- `botId` vacío = pasa a la cola general de agentes humanos disponibles.
- Con `botId` de otro bot = transfiere a ese bot específico.
- Este es el mecanismo de "handoff" (derivación).

**Patrón típico antes del handoff:**
1. `reply` → "Te estoy conectando con un asesor..."
2. `replacebotv3` → transferencia

---

### 4.7 `leadupdate` — Actualizar datos del contacto (CRM)

```json
{
  "_tdActionType": "leadupdate",
  "_tdActionId": "UUID",
  "update": {
    "fullname": "{{gpt_reply}}",
    "email": "{{userEmail}}",
    "phone": "{{userPhone}}"
  }
}
```

Campos disponibles: `fullname`, `email`, `phone`, `company`, `notes`.
Usar variables `{{nombre_variable}}` para insertar valores capturados.

---

### 4.8 `capture_user_reply` — Guardar respuesta textual del usuario

```json
{
  "_tdActionType": "capture_user_reply",
  "_tdActionId": "UUID"
}
```

Detiene el flujo y espera que el usuario escriba algo. El texto queda en `{{lastUserText}}`.
Usar antes de un `gpt_task` que necesita procesar una respuesta puntual.

---

### 4.9 `webrequestv2` — Llamar a una API externa

```json
{
  "_tdActionType": "webrequestv2",
  "_tdActionId": "UUID",
  "method": "POST",
  "url": "https://mi-api.com/endpoint",
  "headersString": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{api_token}}"
  },
  "jsonBody": {
    "nombre": "{{userFullname}}",
    "email": "{{userEmail}}"
  },
  "bodyType": "json",
  "assignResultTo": "api_result",
  "assignStatusTo": "api_status",
  "assignErrorTo": "api_error",
  "settings": { "timeout": 20000 }
}
```

---

### 4.10 `email` — Enviar un email

```json
{
  "_tdActionType": "email",
  "_tdActionId": "UUID",
  "to": "destino@ejemplo.com",
  "text": "Nuevo lead: {{userFullname}}, {{userEmail}}, {{userPhone}}"
}
```

---

### 4.11 `close` — Cerrar conversación

```json
{
  "_tdActionType": "close",
  "_tdActionId": "UUID"
}
```

---

### 4.12 `askgptv2` — Consultar la Knowledge Base (RAG)

```json
{
  "_tdActionType": "askgptv2",
  "_tdActionId": "UUID",
  "question": "{{lastUserText}}",
  "namespace": "ID-del-namespace-KB",
  "model": "gpt-4o",
  "assignReplyTo": "kb_reply",
  "max_tokens": 256,
  "temperature": 0.7,
  "top_k": 5,
  "history": false,
  "citations": false,
  "trueIntent": "#UUID-si-encontro-respuesta",
  "falseIntent": "#UUID-si-no-encontro"
}
```

Busca en la base de conocimiento de Tiledesk y genera una respuesta con RAG.

---

## 5. Variables del sistema disponibles en `{{...}}`

| Variable | Descripción |
|---|---|
| `{{lastUserText}}` | Último mensaje del usuario |
| `{{userFullname}}` | Nombre completo del contacto |
| `{{userEmail}}` | Email del contacto |
| `{{userPhone}}` | Teléfono del contacto |
| `{{chat_url}}` | URL de la conversación actual |
| `{{transcript}}` | Transcripción completa de la conversación |
| `{{gpt_reply}}` | Última respuesta del bot (si se usó assignReplyTo) |
| `{{NOMBRE_VARIABLE}}` | Cualquier variable definida en `attributes.variables` |

---

## 6. Patrón completo: Agente conversacional simple con handoff

Este es el flujo mínimo funcional para un agente que responde con GPT y puede derivar:

```
[start] → [bienvenida] → [loop-gpt] ←──────┐
                              │               │
                         ¿gpt_reply          │
                         contiene "humano"?  │
                              │ Sí           │ No (volver a escuchar)
                              ▼              │
                         [aviso-handoff]─────┘ (si falso, vuelve al loop)
                              │
                              ▼
                         [replacebotv3]
```

En JSON, los intents serían:

1. **start** → action `intent` → `#UUID-bienvenida`
2. **bienvenida** → action `reply` (mensaje inicial) + `intent` → `#UUID-loop-gpt`
3. **loop-gpt** → action `gpt_task` (context=system prompt, trueIntent=`#UUID-condicion`)
4. **condicion** → action `jsoncondition` (gpt_reply contains "humano", trueIntent=`#UUID-handoff`, falseIntent=`#UUID-loop-gpt`)
5. **aviso-handoff** → action `reply` ("Te conecto con un asesor...") + `intent` → `#UUID-transferencia`
6. **transferencia** → action `replacebotv3`

---

## 7. Patrón completo: Calificador de leads (más complejo)

```
[start] → [bienvenida] → [loop-gpt] ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
                                │                              │
                           ¿gpt_reply                         │
                           contains "done"?                   │
                                │ Sí           Falso → (volver al loop)
                                ▼
                         [extraer-nombre]  ← gpt_task sin history, sin context
                                │              question: "Extraé el nombre de {{transcript}}"
                                ▼
                         [guardar-nombre]  ← leadupdate fullname={{gpt_reply}}
                                │
                                ▼
                         [extraer-email]
                                │
                                ▼
                         [guardar-email]   ← leadupdate email={{gpt_reply}}
                                │
                                ▼
                         [mensaje-final]   ← reply "¡Gracias! Un asesor te contactará pronto."
                                │
                                ▼
                         [handoff]         ← replacebotv3
```

La clave del patrón: el `gpt_task` del loop tiene en su `context` la instrucción de responder
"done" cuando recopiló todo. Los bloques de extracción usan `gpt_task` con `history: false`
y `context: ""` — solo extraen, no conversan.

---

## 8. Reglas que la IA debe seguir al generar un flow

1. **Todos los UUIDs deben ser únicos** en todo el documento. Generar v4 frescos.
2. **El intent `start` es obligatorio** y debe tener `"question": "\\start"`.
3. **Los intents de "loop" no tienen `question`** — se llega a ellos solo desde otros bloques.
4. **`trueIntent` en `gpt_task`** siempre apunta al bloque siguiente, incluso si no hay condición.
5. **`replacebotv3` con `botId: ""`** deriva a cualquier agente humano disponible.
6. **No mezclar historia**: el `gpt_task` conversacional usa `history: true`. Los de extracción usan `history: false`.
7. **`attributes.variables`** en la raíz debe declarar todas las variables usadas con `assignReplyTo`.
8. **Idioma**: si el bot es en español, `"language": "es"` en la raíz y en cada intent.
9. **`attributes.position`** en cada intent es solo visual (para el editor). Poner coordenadas progresivas para que el flujo sea legible.

---

## 9. Prompt base para pedirle a Claude que genere un flow

```
Generá un flow JSON completo para Tiledesk (tipo tilebot) con la siguiente descripción:

[DESCRIPCIÓN DEL AGENTE]

Reglas:
- Formato JSON válido, sin comentarios ni texto extra
- type: "tilebot", subtype: "chatbot", language: "es"
- intent "start" obligatorio con question "\\start"
- Todos los UUIDs v4 únicos
- El agente principal usa gpt_task con history: true y context = system prompt completo
- Incluir derivación a humano (replacebotv3 con botId: "") si el usuario lo pide
- Si el agente recopila datos: incluir bloques de extracción con gpt_task history: false
  y leadupdate para guardar cada campo
- Responder SOLO con el JSON, nada más
```

---

## 10. Cómo importar el flow generado a Tiledesk

```
POST /{projectId}/bots/importjson/{botId}
Content-Type: multipart/form-data
campo: uploadFile = <el JSON como archivo>

Parámetros query opcionales:
  ?replace=true   → borra los intents existentes antes de importar
  ?overwrite=true → sobreescribe intents con mismo nombre
```

Flujo completo en ARIA:
1. `POST /tiledesk/{projectId}/bots` → crear bot vacío (type: tilebot, subtype: chatbot)
2. Claude genera el JSON del flow
3. `POST /tiledesk/{projectId}/bots/importjson/{botId}?replace=true` → importar
4. El bot está listo en Tiledesk — el cliente no sabe que existe Tiledesk.

---

## PARTE 5 — Estado actual del proyecto y tareas pendientes

### Última sesión: 2026-04-26

#### Lo que está funcionando

- Wizard de 5 pasos completo (plantilla → datos → técnico → generación → playground)
- Claude genera el system prompt en el Paso 4
- Las instrucciones se inyectan en Tiledesk ANTES de llegar al Paso 5
- El playground del Paso 5 usa el bot real de Tiledesk (no Claude directo)
- Agente "Probarlo" desde la lista de Agents
- Settings → Copilot conectado a la Knowledge Base real de Tiledesk (RAG)
- Chat WAHA multi-sesión (múltiples números de WhatsApp)
- Deploy: `docker build -t aria:latest .` → Update stack en Portainer

#### Archivos clave

| Archivo | Descripción |
|---|---|
| `src/pages/AgentWizard.jsx` | Wizard de creación, Steps 1-5, Playground |
| `src/pages/AgentDetail.jsx` | Detalle del agente, tabs: instrucciones / config / adjuntos |
| `src/pages/Agents.jsx` | Lista de bots + agentes humanos |
| `src/pages/Settings.jsx` | Copilot (KB), Canales, Workspace |
| `src/pages/Conversations.jsx` | Bandeja WAHA multi-sesión |
| `server/index.js` | Todo el backend: proxy Tiledesk, endpoints ARIA, SQLite |
| `src/lib/api.js` | Todas las llamadas al backend desde el frontend |
| `flows/*.json` | Plantillas de flujos Tiledesk (QualiBot Pro, 24/7, etc.) |
| `flows/MANUAL_FLOW_JSON.md` | Este archivo |

#### Endpoints del server que más importan

```
POST /api/agents/create-draft          → crea bot en Tiledesk + importa plantilla base
POST /api/agents/generate-instructions → Claude genera el system prompt
PUT  /api/agents/:botId/instructions   → inyecta instrucciones en Tiledesk
PUT  /api/agents/:botId/finalize       → guarda metadata final + re-inyecta
POST /api/agents/:botId/test-chat      → conversación de prueba con el bot real
GET  /api/agents/metadata              → metadata de todos los bots del workspace
PUT  /api/agents/:botId/config         → guarda temperatura/canales/derivación
PUT  /api/agents/:botId/active         → activa/desactiva bot
```

#### Credenciales Tiledesk (self-hosted en tilellm stack)

```
URL:   https://tilellm.saludok.com.ar
Admin: soporte@saludok.com.ar / Rolling2570@
Project ID: 69e370cb5bc2640012bb33fd
```

#### Bots existentes en Tiledesk

```
69e58c49e16ed20013e81524 → "24/7 Customer Service"
69e58d5de16ed20013e81581 → "QualiBot Pro"
69e81fc05db463001304344e → "Luana"
```

### Tareas pendientes (en orden de prioridad)

#### 1. Endpoint `/agents/generate-flow` — flujo completo generado por IA
Actualmente Claude solo genera el system prompt (el `context` del `gpt_task` principal).
El siguiente nivel: Claude genera el JSON **completo del flow** — intents, condiciones,
extracción de datos, handoff — a partir de una descripción libre en lenguaje natural.
El manual en PARTE 4 ya documenta todo lo que Claude necesita saber para hacerlo.

Implementación:
- Nuevo endpoint en server: `POST /api/agents/generate-flow`
- Prompt a Claude: incluir el contenido de PARTE 4 como contexto + descripción del usuario
- Respuesta: JSON del flow listo para `importjson`
- En el wizard: modo "avanzado" donde el usuario describe libremente y se genera el flow completo

#### 2. Outbound webhook — mensajes de agente Tiledesk → WhatsApp vía WAHA
Cuando un agente humano responde en Tiledesk, el mensaje tiene que llegar a WhatsApp.
Requiere: webhook `message.create` de Tiledesk → ARIA → `POST /api/{session}/sendText` en WAHA.
El endpoint de WAHA ya existe. Falta configurar la suscripción webhook en Tiledesk.

#### 3. Módulos de RRHH y otros verticales
Crear más plantillas de flow JSON para casos de uso específicos:
- RRHH: screening de candidatos, scheduling de entrevistas
- Salud: triaje de síntomas, agendamiento de turnos
- Educación: onboarding de alumnos, FAQs académicas
- E-commerce: seguimiento de pedidos, soporte post-venta

Cada módulo = un JSON en `/flows/` + una entrada en `TEMPLATE_META` en `Agents.jsx`.

#### 4. Marketplace de agentes
Interfaz donde el usuario elige un módulo, describe su empresa en 2 líneas, y el agente
queda configurado. Sin wizard de 5 pasos — directo a funcionar.

#### 5. EvolutionGo — configuración pendiente
El usuario proveerá detalles. Es una alternativa/complemento a WAHA para WhatsApp.

### Cómo funciona el playground de ARIA (test-chat)

Confirmado por la documentación oficial de Tiledesk:

> "The first message you send to a conversation also creates request and corresponding
> conversation if they do not exist." — request_id pattern: `support-group-{UUID}`

**Flujo correcto para iniciar una sesión de prueba:**

```
1. POST /{projectId}/requests/support-group-{UUID}/messages
   body: { text: "start" }
   → Tiledesk crea la request automáticamente (no hace falta endpoint especial)

2. POST /{projectId}/requests/support-group-{UUID}/participants
   body: { id: botId, type: "bot" }
   → Tiledesk dispara \start INTERNAMENTE al bot
   → Bot procesa intent "start" → envía welcome message
   → El \start NO es un mensaje del usuario, es una señal interna de Tiledesk

3. Poll GET /{projectId}/requests/support-group-{UUID}/messages
   → Buscar mensajes desde índice 1 (índice 0 = el "start" del usuario)
   → Filtrar: type="text", sender!="system", text no vacío
   → Esos son los mensajes de bienvenida del bot
```

**Flujo para mensajes siguientes:**

```
1. GET mensajes actuales → contar total (beforeCount)
2. POST /{projectId}/requests/support-group-{UUID}/messages
   body: { text: userText }
3. Poll desde beforeCount + 1 → nuevo mensaje del bot = reply
```

**Lo que NO funciona / errores comunes:**
- Mandar el mensaje del usuario ANTES de agregar el bot → el bot no procesa ese mensaje
- Usar `/requests/simple` → funciona pero innecesario, el patrón `support-group-UUID` es el oficial
- Contar mensajes incorrectamente → el polling arranca desde el índice equivocado y devuelve mensajes viejos
- Filtrar por `sender !== visitorId` → el "start" inicial puede tener cualquier sender; mejor filtrar por `sender !== "system"` y `type === "text"`

**Estado en el server:**
- `testSessions` Map en memoria: `botId → { requestId, msgCount }`
- Se pierde al reiniciar el contenedor (no persiste en SQLite — es intencional, las sesiones de prueba son efímeras)

**En el frontend (Playground component):**
- Al montar: llama `test-chat` con `{ reset: true }` → crea sesión → muestra welcome
- Input deshabilitado mientras inicia ("Iniciando conversación...")
- Al enviar mensaje: llama `test-chat` con `{ text }` → muestra reply
- "Nueva conv.": llama `test-chat` con `{ reset: true }` → sesión nueva

---

### Decisiones de arquitectura que no deben olvidarse

| Decisión | Motivo |
|---|---|
| Solo `docker build`, nunca `docker stack deploy` | Portainer gestiona el stack |
| ARIA necesita red `tiledesk_net` en compose | Sin ella, Tiledesk es inalcanzable |
| `injectInstructions` solo en `gpt_task` con `context` no vacío | Los nodos de extracción tienen `context: ""` y no deben tocarse |
| `INSERT OR IGNORE` antes del `UPDATE` en `/instructions` | El bot puede ser draft sin fila en `agent_metadata` todavía |
| Playground usa `support-group-{UUID}` oficial, no `/requests/simple` | Documentado: primer POST crea la request automáticamente |
| `\start` lo dispara Tiledesk internamente al agregar el bot | No es un mensaje de usuario — es una señal interna del motor de Tiledesk |
| `testSessions` Map en memoria, no SQLite | Las sesiones de prueba son efímeras; reiniciar el contenedor las borra (correcto) |
| URLs de providers sin trailing slash | WAHA responde 401 con doble barra |
| SQLite necesita `mkdirSync` al inicio | `/data` puede no existir en contenedor nuevo |
