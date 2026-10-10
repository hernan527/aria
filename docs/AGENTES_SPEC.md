# Especificación de los agentes — Tobías, Axel y Lucas (y Dashboard)

Lo que pidió el usuario pantalla por pantalla (octubre 2026). Es la referencia para no tener que
volver a explicarlo: cualquier cambio en estas páginas tiene que respetar esto.
Entre corchetes, decisiones de implementación que no vinieron del usuario.

---

## Tobías — Gestor de campañas (`/campaigns`, `src/pages/Campaigns.jsx`)

**Encabezado:** "Tobías" + BETA · "Gestor de campañas" · "Va a buscar a los que se enfriaron y los trae
de vuelta, uno por uno." · chips "Reactiva leads fríos", "Personaliza cada mensaje con IA" ·
**switch** para activar/pausar Tobías (pausado = ninguna campaña envía).

**Pestañas:** CAMPAÑAS · RESUMEN DE VENTAS · REPORTES.

### Campañas
- Lista con filtros de estado: Todas, Borradores, Programadas, Activas, Pausadas, Finalizadas.
- Vacío: ícono megáfono + "No hay campañas" + "Comienza creando tu primera campaña."
- Botón "+ Nueva Campaña" → modal "Elegí cómo querés crearla":
  - **Creación guiada (Recomendado)** — "Paso a paso con todo el control: audiencia, mensaje, ritmo,
    respuesta y programación."
  - **Creación simple** — "Una sola pantalla con lo esencial. Ideal para lanzar rápido con valores
    recomendados."

### Creación guiada — 9 pasos, barra de avance horizontal arriba ("Paso N de 9 · Título")
Pie de cada paso: izquierda "Atrás" (en el paso 1 "✕ Cancelar"), derecha "Siguiente".

1. **Información general** — "Nombre de la campaña" (placeholder "Ej: Reactivación, oportunidades
   perdidas, Q3"); "Descripción (Opcional)" long text (placeholder "Describí brevemente el objetivo de
   esta campaña"); subtítulo **Estrategia comercial** + "La estrategia representa la intención comercial
   de la campaña. Define la audiencia base, los filtros disponibles y especializa la generación del
   mensaje con IA." Lista single-select en tarjetas:
   1. Reactivar conversaciones — Contactos con historial que dejaron de responder
   2. Recuperar oportunidades — Oportunidades marcadas como perdidas que valen otro intento
   3. Venta cruzada — Clientes actuales que podrían sumar otro servicio o producto
   4. Presentar producto — Dar a conocer un producto o servicio nuevo a contactos existentes
   5. Recordar cotización — Cotizaciones enviadas que quedaron sin respuesta o definición
   6. Agendar una reunión — Coordina llamadas o citas comerciales con tus contactos
   7. Solicitar documentación — Pide información o documentos pendientes a clientes
   8. Objetivo personalizado — Define tu propio objetivo desde cero → al elegirla se despliega debajo
      "Escribí tu objetivo" (placeholder "Ej: invitar a la demo del módulo de facturación"), ayuda
      "Este texto queda como objetivo de la campaña y orienta la generación del mensaje con IA."
2. **Programación** — "Decidí cuándo debe comenzar la campaña. El ritmo de envío que configuraste se
   aplica a partir de este momento." Opciones:
   - Comenzar ahora → avanza solo al paso 3.
   - Programar → campos Fecha y Hora.
   - Recurrente → "Frecuencia" (Diaria / Semanal / Mensual), "Cada corrida a partir de las:" (09:30),
     "Días" L M X J V S D (multiselect), "Finaliza el (opcional):" fecha + "Vacío = la serie corre
     indefinidamente hasta que la pauses." Debajo, **medidor de seguridad de la línea**: dona con el
     puntaje y "SPAM" en el centro, nivel (Seguro/…) + "· N envío(s) por semana a cada contacto" +
     texto (p.ej. "Frecuencia saludable. Bajo riesgo para la línea."). Texto final: "En cada corrida se
     busca la audiencia de nuevo con los filtros que elegiste y se excluye a quien todavía tiene un
     mensaje en cola. Cada corrida se ve como una campaña propia, con sus métricas."
3. **Audiencia** — "Filtrá tu base de contactos" + "Definí condiciones para acotar a quién alcanzar.
   Al ejecutar, Tobías busca sobre tus contactos y te muestra el universo resultante." Botón con ícono
   refrescar "Objetivo: <estrategia> · Cambiar" (se cambia ahí mismo). Igual para todas las estrategias.
   **Filtros (opcional)** — "Condiciones sobre tus contactos (conversaciones, estado de la oportunidad,
   tags, última interacción…). Sin filtros, se considera toda tu base elegible." Filas: campo
   (Última interacción / Estado de la oportunidad / Etapa de la oportunidad / Tag) + operador ("hace
   más de (días)" / "hace menos de (días)", …) + valor + tacho. Entre filas, conector Y/O. Botón que
   busca y muestra en verde "Se encontraron N contactos. Continuá para revisarlos o depurarlos con IA."
4. **Vista previa** — "Resultado": "Hoy tu filtro devolvió N contactos. La serie vuelve a correr este
   filtro en cada corrida, así que esta lista es solo una vista previa." Contenedor: personita + número
   grande "contactos del filtro" + a la derecha embudo "Filtros". Switch "Depurar cada corrida con IA" —
   "En cada corrida Tobías analiza los contactos que devuelva el filtro según tu objetivo <estrategia>
   y deja solo los que valen la pena." Si da 0: "La búsqueda no devolvió contactos. Volvé al paso
   anterior y probá con otros filtros." **AGREGAR A MANO** — "Sumá contactos puntuales por fuera del
   filtro." Lista de todos los contactos (incluidos los fuera del filtro) con casillas; "No hay
   seleccionados".
5. **Línea y ritmo** — "Línea y ritmo de envío" + "Elegí desde qué número sale la campaña y a qué ritmo.
   Un ritmo controlado protege tu número de bloqueos de WhatsApp." "¿Desde qué número sale?":
   "Último número que le escribió al contacto" (Recomendado; "cada número recibe el mensaje desde la
   última línea con la que venía hablando, para no romper el hilo") / "Un número específico" (ícono
   celular; "Enviar toda la campaña desde una misma línea"). "Ritmo de envío (goteo)" (reloj):
   Conservador (Recomendado) 15 msg/30 min · Equilibrado 40 msg/30 min · Rápido 100 msg/30 min
   (deshabilitado) · Personalizada (deshabilitada). "Horario de envío" (reloj): "Enviar solo entre"
   desde/hasta + días L–D. Advertencia amarilla: "WhatsApp penaliza los envíos masivos y repetitivos.
   Tobías aplica calentamiento progresivo y pausas aleatorias de forma automática para reducir el
   riesgo de bloqueo. Recomendamos que la audiencia no sea un número grande."
6. **Mensaje** — "Configurá el mensaje" + "Escribí una plantilla con variables o dejá que la IA lo
   genere a partir de unos ajustes guiados." Botones "Asistido por IA" / "Plantilla".
   - IA: Tono (Cercano, Profesional, Directo, Entusiasta, con íconos) · Longitud (Breve 1 línea, Medio
     2-3 líneas, Detallado 4+ líneas) · "Instrucciones adicionales (opcional)" (placeholder "Ej: Menciona
     que tenemos una promoción vigente hasta fin de mes").
   - Plantilla: campo "Mensaje" con texto de ejemplo "Hola {{nombre}} 👋 Notamos que hace un tiempo no
     conversamos. Tenemos novedades que creemos te van a interesar. ¿Te gustaría que te contemos más?";
     "Variables disponibles (Click para insertar)": {{nombre}} {{nombre_pila}} {{apellido}}
     {{teléfono}} {{email}} {{notas}}.
   - En ambos: "Adjunto (opcional)" — "+ Agregar imagen o PDF", "JPG o PNG hasta 5.0 MB · PDF hasta
     50.0 MB. Se envía junto al mensaje".
7. **Vista previa del mensaje** — "Vista previa · Así se verá tu mensaje en WhatsApp." Fondo de
   WhatsApp con burbuja verde.
8. **¿Qué pasa cuando responden?** — "Cuando un contacto responde, ese es el momento de mayor valor.
   Definí quién continúa la conversación." Tarjetas una sobre otra: "Derivar a su último vendedor"
   (Recomendado, personita) · "Asignar a su último Agente IA" · "Enviar al proceso de asignación"
   (Próximamente).
9. **Revisá y lanzá** — "Este es el resumen final. Podés volver a cualquier paso para ajustar antes de
   iniciar." Contenedor grande con avión de papel + número + "contactos recibirán esta campaña".
   Estrellita IA + "N créditos se consumirán". Lista de los 9 pasos como botones con su resumen y
   "Editar" a la derecha: vuelve a ese paso y se sigue avanzando con los valores ya cargados.

### Creación simple — una sola pantalla
"Nueva campaña · Simple" + "Elegís lo esencial; Tobías se encarga del resto con los ajustes
recomendados." "Nombre de la campaña" (placeholder "Ej: Reactivación rápida") · "Objetivo" dropdown
(las 7 estrategias, sin personalizado) · Filtros (igual que la guiada) · "N contactos recibirán la
campaña" · lista con íconos y "Auto": Mensaje · Generado por IA, personalizado por contacto / Ritmo ·
Conservador · protege la línea de bloqueos / Línea · El último número que habló con cada contacto /
Al responder · Deriva a su último vendedor / Programación · Comenzar ahora · "Adjunto (opcional)" ·
botones "Cancelar" (izq.) y "Crear campaña" (der.). La campaña aparece en la lista.

### Resumen de Ventas
"Resultados de ventas": Tasa de respuesta (N respuestas de M entregados) · Conversaciones reactivadas
(próximamente · lo detecta el clasificador de intención) · Derivadas a vendedor (leads listos para
cierre) · Tiempo medio de 1ª respuesta (desde el envío hasta que responden). Fila: Campañas activas
ahora · Programadas ahora · Contactos alcanzados · Mensajes enviados. "Embudo de reactivación" ("De
entregado a respuesta: X%"): Contactados (100%) · Entregados (% entregado) · Respondieron (% de
entregados) · Derivados a vendedor (% de respuestas) · Reactivados y Oportunidades (Detección con IA ·
próximamente).

### Reportes
"Campañas" dropdown para elegir una. Vacío: "Seleccioná una campaña para ver su reporte · Elegí una
campaña del listado para cargar sus métricas y destinatarios."

---

## Axel — Auditor comercial (`/auditor`, `src/pages/Axel.jsx`)

**Encabezado:** "Axel" · "Auditor comercial" · "Mira vender a tu equipo y te dice, sin vueltas, por qué
se te escapan las ventas." · chips "Auditoría por vendedor", "Fugas del proceso".

**Pestañas:** Reportes y Métricas · Análisis Profundo · Configuración.

### Reportes y Métricas → sub-pestañas Vendedores · Métricas del Equipo · Desempeño
**Vendedores:** arriba campo Buscar + fechas desde/hasta [+ botón Buscar]; a la derecha el total de
vendedores del listado y botón ✨ "Análisis Profundo (N)" (N = vendedores tildados). Columnas: Vendedor ·
Convers. · Oport. · 1ª resp. · Sin resp. >48h [el umbral sale de Configuración] · SLA venc. ·
Cumplimiento. (Métricas del Equipo y Desempeño: falta especificar.)

### Análisis Profundo
"Análisis profundo" + badge IA + "Análisis semántico bajo demanda, organizado por variable. Cada
análisis queda guardado en base de datos y se exporta como .txt." Vacío: "Todavía no hay análisis
guardados. Seleccioná un vendedor desde la tabla para crear uno." Botón "Nuevo análisis" → fechas
desde/hasta; "Agregá cualquier pregunta sin que exista como dimensión configurada — se analiza junto a
las demás, sobre los vendedores y el rango seleccionados" (placeholder "Ej: ¿Cómo se relaciona con mis
reglas?"); "Los datos duros para el rango de fechas se inyectan automáticamente: la IA interpreta, no
calcula. Un análisis por vendedor."; botón "Ejecutar análisis".

### Configuración (botón "Guardar configuración" al final)
- **Ejecución programada** (reloj + switch) — "Programá qué días el agente analiza automáticamente a
  todos los vendedores." Si está activo: dropdown Todos los días / Semanal / Mensual. Diario → a la
  derecha "Todos los días"; Semanal → 7 cuadrados L M X J V S D multiselect + en rojo suave "Elegí al
  menos un día de la semana". [Mensual → día del mes; corre a las 8:00.]
- **Métricas duras · pipeline determinístico** (ícono base de datos) — "Afecta el cálculo de tiempos,
  SLA y reglas de proceso. No involucra IA." 4 campos horizontales: Inicio horario laboral (hora,
  09:00) · Fin horario laboral (hora, 18:00) · SLA 1ª respuesta (número, 7200 [segundos]) ·
  Inactividad "en riesgo" (h) (número, 48). Debajo "Días laborables" L–D multiselect.
- **Variables del análisis profundo** — "Variables permanentes que el agente evalúa en cada análisis.
  La regla es la instrucción que se le da al agente (no una descripción): escribila como un criterio
  claro de qué debería hacer el vendedor." Botón "+ Agregar variable" → recuadro numerado (1, 2, …) con
  "Etiqueta" (placeholder "Nueva dimensión", sugiere las disponibles), "Entidad" (Conversaciones /
  Tareas / Oportunidades) y "Regla de evaluación" (placeholder "Describí las señales que indican alta
  intención de compra").

---

## Lucas — Analista de conversaciones (`/lucas`, `src/pages/Lucas.jsx`)

**Encabezado:** "Lucas" · "Analista de conversaciones" · "Le pone un número a cada chat. Ves quién está
caliente y dónde se te enfría el embudo." · chips "Score de cada lead", "Temperatura del embudo".

**Pestañas:** Reportes y Métricas · Configuración.

### Reportes y Métricas
- Arriba, horizontal: "Período" [fecha] "hasta" [fecha] [botón Filtrar con ícono].
- Fila de 3: (personita) Conversaciones creadas en el período, con % de variación vs. período anterior
  (verde ▲ sube, rojo ▼ baja, amarillo ▬ igual) · (pulgar arriba) Leads calientes, "X% del total" ·
  (torta) Score promedio, con % de variación.
- Fila de 2: (termómetro) "Distribución por temperatura · Cómo se clasifican los leads" — Caliente
  (rojo), Tibio (amarillo), Frío (verde), con cantidad y % · (barras) "Volumen de leads por día ·
  Estado actual de leads (temperatura + score promedio diario)": gráfico X = días del período, Y = 0…,
  referencias Score prom. (violeta), Frío (verde), Caliente, Tibio.
- (megáfono) "Calidad por origen · Qué canal trae los mejores leads — dónde conviene invertir". Vacío:
  "No hay datos de origen disponibles. Los datos aparecen cuando los contactos llegan por anuncios de
  Click to WhatsApp."
- Fila de 2: (pulgar) "Leads calientes recientes · Conversaciones con mayor temperatura" (vacío: "No hay
  leads calientes recientes") · (etiqueta) "Smart Tags · Tags configuradas y cantidad de contactos
  asignados" (vacío: "No hay Smart Tags configuradas").

### Configuración — cada sección con un disquete a la derecha que guarda solo esa sección
- **Ejecución programada** (reloj + switch) — "Programá el agente para analizar automáticamente todos
  los contactos cada día a una hora específica."
- **Oportunidades** (tiro al blanco):
  - Switch "Mover oportunidades" — ✨ "El agente moverá automáticamente las oportunidades entre etapas
    según los criterios configurados en cada pipeline." Nota: "Configurá los criterios de las etapas en
    la sección de Embudos > Configurar > Etapa. Solo las etapas con criterio serán consideradas por la
    IA."
  - Switch "Crear oportunidades automáticamente" — lista de canales (vacío: "No hay canales
    disponibles."). Nota: "Las oportunidades se crearán automáticamente cuando se cree una conversación
    nueva desde el canal seleccionado."
- **Smart Tags (etiquetado inteligente)** (etiqueta + switch) — "El agente de análisis etiquetará
  automáticamente los contactos según los criterios configurados en cada tag." Nota: "Configurá los
  criterios de los tags en la sección de Contactos > Tags. Solo los tags con criterio serán considerados
  por la IA."
- **Calificación** (gráfico en alza + switch):
  - "Temperatura · Qué tanto interés demuestra el cliente en comprar." Tres campos long text editables,
    precargados (una línea por regla): **Caliente** (pulgar), **Tibio** (sol), **Frío** (copo). Los
    textos por defecto están en `LUCAS_DEFAULT_RATING` (server/index.js).
  - "Scoring · Coincidencia con el perfil de cliente ideal." Long text editable precargado con la tabla
    de puntos (+20 pregunta precios … −30 desinterés explícito), en `LUCAS_DEFAULT_SCORING`.
    [Lucas parte de 50, suma/resta las reglas que se cumplen y limita a 0–100.]

---

## Dashboard principal (`/`, `src/pages/Dashboard.jsx`)
"Dashboard" · "Resumen operativo y comercial de tu subcuenta".
- **Configuración inicial** (5 pasos): dona con "N/5" adentro + "Configuración inicial N/5" +
  "Completá estos pasos para maximizar el potencial de tu IA" + % completo. Pasos con su estado:
  1. Creá tu cuenta
  2. Crear tu primer Agente IA — Configurá un asistente inteligente para tu negocio.
  3. Conectar canales de comunicación — Creá tu primer número de WhatsApp para comenzar a conversar.
  4. Crear tu primer embudo de ventas — Definí las etapas y comenzá a gestionar oportunidades.
  5. Invitá a tu equipo de ventas — Compartí el acceso con tu equipo para trabajar en conjunto.
  [Cada paso pendiente lleva a su pantalla; el estado lo calcula /api/onboarding.]
- Debajo: "Desde" [fecha] "hasta" [fecha] + botón "Filtrar" con ícono.
- **Fila 1** (3 recuadros, número grande + % de variación chiquito vs. período anterior):
  (conversación) "Conversaciones activas · Con mensajes en el período" · (pulgar arriba) "Leads
  calientes · N tibios en conversación" · (relojito) "Primera respuesta · Mediana del período".
- **Fila 2** (3 secciones): (relojito) "Tiempo de respuesta · Promedio" · (copa) "Cierres del período",
  comentario dinámico ("Sin ventas registradas" si no hay) + número + % · (teléfono) "Contactabilidad",
  comentario dinámico "Sobre N conversaciones" + número + %.
  [Contactabilidad = % de conversaciones del período con ida y vuelta; tiempos con registro de mensajes.]
- **Fila 3** (2 secciones): izquierda (embudo) "Embudo comercial · Avance de las oportunidades abiertas
  por etapa y cierres del período", con dos recuadros remarcados "Ganadas en el período" y "Perdidas en
  el período" (cantidad + %), y abajo la lista por etapa; vacío: "No hay oportunidades abiertas en tus
  embudos. Creá oportunidades desde las conversaciones o el embudo." Derecha: (relojito) "Velocidad de
  atención · Tiempos de respuesta y contactabilidad del período", 3 recuadros: "Primera respuesta"
  (total grande + "Asesores:" / "Asesores IA:") · "Tiempo de respuesta" (valor + "Promedio durante la
  conversación" + "N con intercambio real") · "Contactabilidad" (valor + "N con intercambio real de M").
  Debajo, lista de conversaciones con respuesta (vacío: "No hay conversaciones con respuesta en este
  período.") y "Conversaciones creadas por día": Total del período · Promedio diario · Día pico + gráfico
  de barras ("Cada barra es la cantidad de conversaciones nuevas creadas ese día.").
- **Priorización con IA** (estrellita) "Temperatura y score de tus conversaciones activas". Vacío: estrellita
  + "Activá el análisis con IA" + "Configurá un agente de análisis para calificar automáticamente tus
  leads por temperatura y score de cierre" + link "Ir a Agentes".
- **Impacto de Aria** (ícono IA) · "Trabajo que la IA hizo por tu equipo en el período". Vacío: "Aún no hay
  actividad de IA registrada en este período. Configurá agentes de IA para automatizar la atención y el
  análisis." [Con datos: respuestas de agentes IA, leads calificados por Lucas, mensajes de Tobías,
  análisis de Axel.]
- (Resto del dashboard: en especificación.)

---

## Pendiente de especificar
- Axel: sub-pestañas "Métricas del Equipo" y "Desempeño".
- Dashboard principal: lo que va debajo del filtro de fechas.
