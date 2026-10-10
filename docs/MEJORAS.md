# ARIA — Qué mejorar y qué la haría más valiosa

Notas de octubre 2026, después de construir Tobías, Axel, Lucas y el Dashboard nuevo. Ordenado por
impacto: primero lo que hoy puede hacer perder ventas o plata, después lo que suma valor.

---

## 1. Mejoras urgentes (confiabilidad)

1. **Probar todo en vivo antes de venderlo.** Lucas, Tobías, Axel, el Dashboard y Jev están construidos
   pero no corrieron con datos reales. Hacer una ronda de prueba con conversaciones propias y revisar
   los logs.
2. **Alertas cuando la IA se queda sin crédito.** Hoy, si OpenAI o Anthropic se quedan sin saldo, los
   bots dejan de responder en silencio. ARIA debería detectar los errores de crédito (429 / "credit
   balance too low") y avisar al owner por WhatsApp y con un banner rojo en el Dashboard.
3. **Respaldo automático entre proveedores.** Si falla un proveedor (OpenAI, Anthropic), que el bot
   reintente con el otro en vez de dejar al cliente sin respuesta.
4. **Deploy más seguro.** El servicio corre `aria:latest` y Swarm no la vuelve a leer sin "Force
   update", y una vez el stack quedó caído sin que nadie lo notara. Conviene etiquetar cada imagen con
   versión (`aria:2026-10-10`) y tener un monitor que avise si ARIA está caída.
5. **Backups de la base.** Toda la información vive en un solo archivo SQLite (`aria2_aria_data`).
   Backup diario automático fuera del servidor.
6. **Seguridad de credenciales.** Hay contraseñas en texto plano en los CLAUDE.md y en el código (admin
   de Dify, Tiledesk, base de datos). Pasarlas a variables de entorno o secrets y cambiarlas.
7. **Formato de WhatsApp.** Algunos modelos responden con `**negrita**` de Markdown; WhatsApp usa
   `*negrita*`. Convertirlo antes de enviar.

## 2. Mejoras de producto (hacerla más fácil)

1. **Unificar la creación de agentes.** Hoy hay dos caminos (Wizard y QuickCreate) parcialmente
   duplicados. Uno solo, guiado como el de campañas de Tobías.
2. **Un solo lugar para "la IA".** Elegir proveedor y modelo hoy está repartido entre Dify, ARIA y
   variables del stack. Una pantalla con qué modelo usa cada cosa (bots, Lucas, Tobías, Axel,
   embeddings, audio), su costo y el saldo disponible.
3. **Consumo y costo visibles.** Mostrar cuánto se gastó en IA por día, por agente y por conversación, y
   cuánto queda, para no enterarse del saldo cero por el error.
4. **Onboarding de verdad.** La "Configuración inicial" ya marca 5 pasos; sumarle un recorrido guiado
   (conectar WhatsApp con QR, crear el primer agente con una plantilla del rubro, probarlo en el
   playground) para que una cuenta nueva quede andando en 10 minutos.
5. **EvolutionGo a la par de WAHA.** Varias cosas solo funcionan con WAHA (historial para Lucas,
   adjuntos de Tobías, inbox). Igualar los dos canales o elegir uno.
6. **Inbox para vendedores.** Las conversaciones derivadas a humanos merecen una bandeja propia con
   prioridad por score de Lucas, SLA visible (de Axel) y sugerencia de respuesta (Copilot).

## 3. Lo que la haría más valiosa (diferenciales)

1. **Copilot del vendedor.** Sugerir la próxima respuesta al vendedor humano con el contexto de la
   charla, el estilo del vendedor y la información de la empresa (FAQ, productos, archivos). Ya existe
   una versión básica en Conversaciones; falta la configuración y que aprenda el estilo.
2. **Cierre dentro del chat.** Que el bot pueda generar un link de pago (MercadoPago) o agendar una
   reunión real (Google Calendar) para ventas simples, en vez de siempre derivar.
3. **Lucas que aprende de los resultados.** Comparar sus calificaciones con lo que terminó pasando
   (ganada/perdida) y ajustar criterios: "los leads que marcaste tibios y preguntaron X terminaron
   comprando".
4. **Detección de intención en vivo.** Hoy Lucas califica cuando la conversación cierra. Con Jev, que es
   barato y rápido, se puede calificar mensaje a mensaje y avisar al vendedor en el momento en que un
   lead se calienta.
5. **Reactivación inteligente.** Tobías podría elegir solo el mejor momento y el mejor mensaje por
   contacto según lo que funcionó antes (qué horario, qué tono, qué estrategia tuvo más respuestas).
6. **Reporte semanal automático al dueño.** Un resumen por WhatsApp o mail: ventas, leads calientes sin
   atender, vendedores con SLA vencido y qué recomienda Axel. Que el valor llegue sin entrar a la app.
7. **Calidad por origen completa.** Con el origen de los anuncios Click to WhatsApp ya capturado, cruzar
   con el gasto en Meta Ads y mostrar el costo por lead caliente y por venta de cada anuncio.
8. **Integraciones de CRM bidireccionales.** HubSpot hoy es solo ARIA → HubSpot. Ida y vuelta, y sumar
   otros CRMs del mercado local.
9. **Plantillas por rubro.** Agentes, criterios de Lucas, estrategias de Tobías y variables de Axel
   preconfigurados por industria (salud, seguros, inmobiliarias, autos). Acorta el tiempo hasta el
   primer resultado.

## 4. Costos de IA (para que el negocio cierre)

- **Bots:** gpt-4o-mini es hoy el mejor equilibrio precio/calidad. Medir si un modelo nano alcanza
  para preguntas simples y usar el más caro solo cuando hace falta (ruteo por complejidad).
- **Decisiones:** usar Jev para todo lo que es sí/no o clasificar (temperatura, derivar, depurar,
  intención); es mucho más barato que un modelo de texto.
- **Embeddings:** text-embedding-3-small cuesta casi nada; no vale la pena cambiarlo.
- **Límites por plan:** cada plan de ARIA debería tener un tope de consumo de IA alineado con lo que
  se cobra, para que ningún cliente genere pérdida.
