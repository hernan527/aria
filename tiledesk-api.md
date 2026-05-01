# Tiledesk API — Referencia completa para ARIA

Extraído directamente de la imagen Docker `tiledesk/tiledesk-server:latest`.  
Base URL interna (dentro de Docker): `http://tilrdefinitivo_server:3000`  
Base URL via proxy ARIA: `POST /api/tiledesk/{path}` → Tiledesk `/{path}`

---

## Autenticación

Todo pedido lleva el header:
```
Authorization: <token>        ← token JWT de Tiledesk (sin "Bearer")
```

El proxy de ARIA inyecta el token admin automáticamente. Desde el frontend nunca se envía el token de Tiledesk directamente.

### Obtener token
```
POST /auth/signin
Body: { email, password }
Response: { token, _id, ... }
```

### Registrar usuario
```
POST /auth/signup
Body: { email, password, firstname, lastname }
```

### Reset contraseña
```
PUT /auth/requestresetpsw       Body: { email }
PUT /auth/resetpsw/:id          Body: { newPassword }
GET /auth/checkpswresetkey/:id
```

---

## Proyectos

```
GET    /projects                  Lista proyectos del usuario autenticado
POST   /projects                  Crear proyecto — Body: { name }
GET    /projects/:projectid       Detalle de proyecto
PUT    /projects/:projectid       Actualizar (rol admin)
PATCH  /projects/:projectid       Actualización parcial
DELETE /projects/:projectid       Eliminar (rol owner)
GET    /projects/:projectid/users/availables   Agentes disponibles en este momento
GET    /projects/all              Todos los proyectos (admin global)
```

**Campos de proyecto devueltos:** `_id`, `name`, `activeOperators`, `settings`, `plan`, `language`, `timezone`

---

## Contactos (Leads)

Endpoint base: `/:projectid/leads`  
Rol mínimo: `agent`

### Schema real del modelo Lead
```
fullname        String     Nombre completo
email           String     Email (indexado)
phone           String     Teléfono (top-level, NO en attributes)
company         String     Empresa (top-level)
note            String     Notas (top-level, NO "notes")
streetAddress   String     Dirección
city            String     Ciudad
region          String     Provincia/Estado
zipcode         String     Código postal
country         String     País
tags            [String]   Etiquetas — array de strings (NO attributes.labels)
attributes      Object     SOLO datos del widget (browser, sourcePage, ipAddress, etc.)
lead_id         String     UUID único del lead
status          Number     100=normal, 1000=eliminado (soft-delete)
createdAt       Date       Timestamp automático
```

### Endpoints

```
GET    /:projectid/leads                     Lista contactos
  Params: limit, page, full_text, email, tags, status, sort, direction
  Response: { perPage, count, leads: [...] }

GET    /:projectid/leads/csv                 Exportar CSV
GET    /:projectid/leads/:leadid             Detalle de contacto

POST   /:projectid/leads                     Crear contacto
  Body: { lead_id?, fullname, email, attributes? }
  ⚠ Solo acepta fullname, email, attributes. phone/company/note se agregan via PUT.

PUT    /:projectid/leads/:leadid             Actualizar contacto (acepta TODOS los campos)
  Body: { fullname?, email?, phone?, company?, note?, streetAddress?,
          city?, region?, zipcode?, country?, tags?, attributes? }

PATCH  /:projectid/leads/:leadid/attributes  Merge parcial de attributes
  Body: { key: value, ... }   ← solo afecta keys enviadas, el resto queda intacto

PUT    /:projectid/leads/:leadid/tag         Agregar tags sin reemplazar
  Body: ["tag1", "tag2"]

DELETE /:projectid/leads/:leadid/tag/:tag    Quitar un tag

DELETE /:projectid/leads/:leadid             Soft-delete (status=1000)
DELETE /:projectid/leads/:leadid/physical    Eliminar físico (rol owner)
```

### Patrón correcto desde ARIA

**Crear**: `POST` solo con `fullname + email + attributes`, luego `PUT` inmediato para agregar `phone`, `company`, `note`, `streetAddress`, `tags`.

**Actualizar**: `PUT` con todos los campos a modificar. Incluir `attributes` con los datos del widget ya existentes para no borrarlos.

**Tags**: usar el campo top-level `tags` (array de strings). NO usar `attributes.labels`.

---

## Conversaciones (Requests)

Endpoint base: `/:projectid/requests`  
Rol mínimo: `guest` (lectura), `agent` (escritura)

### Campos principales del modelo Request
```
request_id      String     ID amigable de la conversación
first_text      String     Primer mensaje
status          Number     Constantes: UNASSIGNED=100, ASSIGNED=150, CLOSED=1000
priority        String     "low" | "medium" | "high" | "urgent"
lead            ObjectId   → Lead (contacto)
department      ObjectId   → Department
participantsAgents [ObjectId]  Agentes en la conv
snapshot        Object     Agentes/bots disponibles al momento de la conv
sourcePage      String     URL de origen
attributes      Object     Datos libres
tags            [Object]   Tags de la conversación
notes           [Object]   Notas internas
```

### Endpoints

```
POST   /:projectid/requests/simple          Crear conversación simple
  Body: { first_text (required), departmentid?, lead_id?, ... }

GET    /:projectid/requests                 Listar conversaciones
  Params: status, lead_id, department, limit, page, sort, direction,
          full_text, startDate, endDate, tags, assigned_to

GET    /:projectid/requests/count           Contar por estado
GET    /:projectid/requests/csv             Exportar CSV
GET    /:projectid/requests/:requestid      Detalle

PATCH  /:projectid/requests/:requestid      Actualización parcial
  Body: { first_text?, subject?, priority?, attributes?, ... }

PATCH  /:projectid/requests/:requestid/attributes  Merge de attributes

PUT    /:projectid/requests/:requestid/close       Cerrar conversación
PUT    /:projectid/requests/:requestid/reopen      Reabrir
PUT    /:projectid/requests/:requestid/assign      Asignar agente
  Body: { id_agent }
PUT    /:projectid/requests/:requestid/agent       Cambiar agente
PUT    /:projectid/requests/:requestid/assignee    Cambiar asignado
PUT    /:projectid/requests/:requestid/departments Cambiar departamento
  Body: { departmentid }

PUT    /:projectid/requests/:requestid/tag         Agregar tag
  Body: ["tag"]
DELETE /:projectid/requests/:requestid/tag/:tag_id Quitar tag

POST   /:projectid/requests/:requestid/participants    Agregar participante
PUT    /:projectid/requests/:requestid/participants    Actualizar participantes
DELETE /:projectid/requests/:requestid/participants/:id Quitar participante

POST   /:projectid/requests/:requestid/notes           Agregar nota interna
DELETE /:projectid/requests/:requestid/notes/:noteid   Borrar nota

POST   /:projectid/requests/:requestid/followers       Agregar follower
PUT    /:projectid/requests/:requestid/followers       Actualizar followers
DELETE /:projectid/requests/:requestid/followers/:id   Quitar follower

POST   /:projectid/requests/:requestid/email/send      Enviar por email

DELETE /:projectid/requests/:requestid                 Eliminar
```

---

## Mensajes

```
GET    /:projectid/requests/:requestid/messages     Mensajes de una conv
POST   /:projectid/requests/:requestid/messages     Enviar mensaje
  Body: { text, type?, metadata? }

GET    /:projectid/messages                         Mensajes del proyecto
```

---

## Bots / Agentes IA (faq_kb)

`/bots` y `/faq_kb` apuntan al **mismo router**.  
Endpoint base: `/:projectid/bots`  
Rol mínimo: `agent` (GET), `admin` (POST/PUT/DELETE)

```
GET    /:projectid/bots                    Lista todos los bots
GET    /:projectid/bots/:id                Detalle
PUT    /:projectid/bots/:id                Actualizar bot
PATCH  /:projectid/bots/:id/attributes     Merge de attributes
DELETE /:projectid/bots/:id               Eliminar

POST   /:projectid/bots                    Crear bot
  Body: {
    name, description?, language?,
    welcome_msg?,
    type: "tilebot",        ← para que aparezca en "Flujos/IA"
    subtype: "chatbot"
  }

POST   /:projectid/bots/fork/:id           Clonar bot existente
GET    /:projectid/bots/exportjson/:id     Exportar bot como JSON (intents incluidos)
POST   /:projectid/bots/importjson/:id     Importar JSON al bot
  Content-Type: multipart/form-data, campo: uploadFile

PUT    /:projectid/bots/:id/publish        Publicar bot
GET    /:projectid/bots/:id/published      Obtener versión publicada
GET    /:projectid/bots/:id/jwt            JWT del bot
PUT    /:projectid/bots/:id/language/:lang Cambiar idioma
POST   /:projectid/bots/:id/training       Entrenar bot
```

**Bots existentes en el proyecto `69e370cb5bc2640012bb33fd`:**
- `69e58c49e16ed20013e81524` → "24/7 Customer Service"
- `69e58d5de16ed20013e81581` → "QualiBot Pro"
- `69e81fc05db463001304344e` → "Luana"

---

## Intents (faq)

`/intents` y `/faq` apuntan al **mismo router**.  
Endpoint base: `/:projectid/intents`  
Rol mínimo: `agent` (GET), `admin` (escritura)

```
GET    /:projectid/intents                Lista intents (de todos o filtrado por bot)
  Params: faq_kb_id (filtrar por bot), limit, page, full_text
GET    /:projectid/intents/:id            Detalle de intent
GET    /:projectid/intents/csv            Exportar CSV

POST   /:projectid/intents                Crear intent
  Body: { intent_display_name, id_faq_kb, answer?, question? }

PUT    /:projectid/intents/:id            Actualizar intent
DELETE /:projectid/intents/:id           Eliminar intent

POST   /:projectid/intents/uploadcsv      Importar CSV
  Content-Type: multipart/form-data, campo: uploadFile

PATCH  /:projectid/intents/:id/attributes Merge de attributes
POST   /:projectid/intents/ops_update     Bulk update de intents
```

---

## Labels (etiquetas con color)

Las labels definen la paleta de colores/nombres. Los contactos y conversaciones usan **strings** que coinciden con el `title` de la label.

Endpoint base: `/:projectid/labels`

```
GET    /:projectid/labels                 Lista labels del proyecto
  Response: array de { _id, title, color, ... }

POST   /:projectid/labels                 Crear label (rol admin)
  Body: { title, color }

DELETE /:projectid/labels                 Eliminar todas las labels del proyecto
DELETE /:projectid/labels/:lang           Eliminar por lang
PATCH  /:projectid/labels/:lang/default   Actualizar label por lang

GET    /:projectid/labels/default         Labels por defecto del sistema
GET    /:projectid/labels/default/:lang   Label default específica
POST   /:projectid/labels/default/clone   Clonar labels default al proyecto
```

⚠ No hay PUT individual por `_id`. Para editar una label, usar `PATCH /:lang/default` o recrearla.

---

## Tags (en conversaciones — diferente a labels)

Son tags de texto libre en requests/conversaciones.  
Endpoint base: `/:projectid/tags`

```
GET    /:projectid/tags           Lista tags del proyecto
GET    /:projectid/tags/:tagid    Detalle
POST   /:projectid/tags           Crear tag — Body: { tag, color? }
PUT    /:projectid/tags/:tagid    Actualizar tag
DELETE /:projectid/tags/:tagid    Eliminar tag
```

---

## Departamentos

```
GET    /:projectid/departments             Lista departamentos
GET    /:projectid/departments/allstatus   Incluye inactivos
GET    /:projectid/departments/:id         Detalle
GET    /:projectid/departments/:id/operators  Agentes del departamento

POST   /:projectid/departments             Crear (rol admin)
  Body: { name, members?: [userId], routing?: "assigned"|"unassigned" }

PUT    /:projectid/departments/:id         Actualizar (rol admin)
DELETE /:projectid/departments/:id         Eliminar (rol admin)
```

**Departamento por defecto del proyecto:** `69e370cb5bc2640012bb3401` → "Default Department"

---

## Agentes / Miembros del proyecto (project_users)

```
GET    /:projectid/project_users           Lista agentes/miembros
GET    /:projectid/project_users/me        Mi perfil en el proyecto
GET    /:projectid/project_users/:id       Detalle de un miembro
GET    /:projectid/project_users/users/search  Buscar agentes

POST   /:projectid/project_users/invite    Invitar por email (rol admin)
  Body: { email, role: "agent"|"admin" }
POST   /:projectid/project_users           Crear project_user
PUT    /:projectid/project_users           Actualizar mi perfil (availability, etc.)
PUT    /:projectid/project_users/:id       Actualizar cualquier miembro (rol admin)
PUT    /:projectid/project_users/:id/restore  Restaurar miembro eliminado
DELETE /:projectid/project_users/:id       Eliminar miembro (rol admin)
```

---

## Segmentos (filtros de contactos)

```
GET    /:projectid/segments           Lista segmentos
GET    /:projectid/segments/:id       Detalle
POST   /:projectid/segments           Crear segmento con filtros
PUT    /:projectid/segments/:id       Actualizar
DELETE /:projectid/segments/:id       Eliminar
```

Se pueden usar en `GET /leads?segment=:id` para filtrar contactos.

---

## Webhooks

```
GET    /:projectid/webhooks                    Lista webhooks por bot
GET    /:projectid/webhooks/:chatbot_id        Webhook de un bot
GET    /:projectid/webhooks/id/:webhook_id     Webhook por ID

POST   /:projectid/webhooks                    Crear webhook
  Body: { secret?, targeturl, name, ... }
PUT    /:projectid/webhooks/:chatbot_id        Actualizar
PUT    /:projectid/webhooks/:chatbot_id/regenerate  Regenerar secret
PUT    /:projectid/webhooks/update/:webhook_id Actualizar por webhook_id
DELETE /:projectid/webhooks/:chatbot_id        Eliminar
DELETE /:projectid/webhooks/delete/:webhook_id Eliminar por webhook_id

POST   /:projectid/webhooks/preload/:webhook_id    Precargar evento
DELETE /:projectid/webhooks/preload/:webhook_id    Cancelar precarga
```

---

## Usuarios (cuenta global)

```
GET    /users                     Mi perfil de usuario
PUT    /users                     Actualizar mi perfil — Body: { firstname, lastname, ... }
PUT    /users/changepsw           Cambiar contraseña — Body: { currentpsw, newpsw }
DELETE /users                     Soft-delete de cuenta
DELETE /users/physical            Borrado físico
```

---

## Analytics

```
GET    /:projectid/publicanalytics/*    Analytics públicos (sin auth)

Métricas disponibles:
  GET /:projectid/analytics/messages/count?start=&end=
```

---

## Knowledge Base (KB)

```
GET    /:projectid/kb                  Lista artículos de KB
POST   /:projectid/kb                  Crear artículo (rol admin)
PUT    /:projectid/kb/:id              Actualizar artículo
DELETE /:projectid/kb/:id              Eliminar artículo

GET    /:projectid/kb/unanswered       Preguntas sin respuesta (rol admin)
GET    /:projectid/kb/answered         Preguntas respondidas (rol admin)
GET    /:projectid/kbsettings          Configuración de KB
```

---

## Roles en Tiledesk

| Rol | Descripción |
|-----|-------------|
| `guest` | Visitante/cliente — solo lectura limitada |
| `agent` | Agente — lee y responde conversaciones |
| `admin` | Administrador — gestiona bots, labels, departamentos |
| `owner` | Dueño — puede borrar físico, cambiar plan |

---

## Variables de entorno del servidor Tiledesk

Las más relevantes para configurar la instancia:

```
DATABASE_URI               MongoDB connection string
CACHE_REDIS_HOST/PORT      Redis para caché
TILEDESK_ADMIN_EMAIL       Email del admin
DEFAULT_FULLTEXT_INDEX_LANGUAGE  Idioma para full-text search ("none" = cualquiera)
MONGOOSE_SYNCINDEX         "true" para sincronizar índices al arrancar
MONGOOSE_DEBUG             "true" para logging de queries MongoDB
LOAD_DOTENV_SUBFOLDER      Carga .env desde confenv/.env
JSON_BODY_LIMIT            Límite del body (default: 10mb aprox)
```

---

## Proyecto ARIA activo

```
projectId:    69e370cb5bc2640012bb33fd
Admin TD:     soporte@saludok.com.ar / Rolling2570@
Tiledesk URL: https://tilellm.saludok.com.ar
Proxy ARIA:   /api/tiledesk/{path} → Tiledesk /{path}
```

---

## Notas de implementación en ARIA

1. **Crear contacto** requiere POST + PUT encadenado (phone/company/note/streetAddress solo via PUT)
2. **Tags de contacto** → campo `lead.tags` (array string). NO usar `attributes.labels`.
3. **Tags de conversación** → campo `request.tags` (objetos con color, endpoint `/tags`)
4. **Labels** → definen colores visuales; el string del tag debe coincidir con `label.title`
5. **DELETE /leads/:id** → soft-delete (status=1000), no borra datos
6. **`/bots` y `/faq_kb`** son aliases del mismo router
7. **`/intents` y `/faq`** son aliases del mismo router
8. **El token de auth** va sin "Bearer" — es el JWT directo de Tiledesk
9. **`attributes`** en leads es solo para datos del widget (browser, sourcePage, ip) — los campos editables van top-level
