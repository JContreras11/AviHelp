# Graph Report - src  (2026-07-23)

## Corpus Check
- 154 files · ~89,228 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 848 nodes · 2316 edges · 49 communities (40 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Auditoria y CRUD
- Chat Avi (flujos)
- Ofertas y Entregas (match)
- DataTable generica
- Compartir publico / OG
- Admin usuarios / impersonar
- Auth y Login
- IA vision (foto/audio/texto)
- Notificaciones
- Detalle entidades / cards
- Procesar cargas
- Analytics
- Refugios / centros
- Layout raiz
- Listas y filtros
- Ingesta documentos
- DocCard / campos
- Chat UI
- Crear solicitud
- Instituciones (hospitales)
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 138 edges
2. `getScope()` - 71 edges
3. `cn()` - 53 edges
4. `registrarLog()` - 49 edges
5. `getSesion()` - 40 edges
6. `Button()` - 32 edges
7. `useRol()` - 26 edges
8. `Input()` - 20 edges
9. `guardar()` - 15 edges
10. `crearOfertasMixtas()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `RootLayout()` --calls--> `getSesion()`  [EXTRACTED]
  app/layout.tsx → lib/supabase/server.ts
- `NotificacionesPage()` --calls--> `getSesion()`  [EXTRACTED]
  app/notificaciones/page.tsx → lib/supabase/server.ts
- `CentrosPage()` --calls--> `createAdminClient()`  [EXTRACTED]
  app/refugios/page.tsx → lib/supabase/server.ts
- `getAnalytics()` --calls--> `createAdminClient()`  [EXTRACTED]
  app/actions/analytics.ts → lib/supabase/server.ts
- `buscarRegistros()` --calls--> `createAdminClient()`  [EXTRACTED]
  app/actions/buscar.ts → lib/supabase/server.ts

## Import Cycles
- None detected.

## Communities (49 total, 9 thin omitted)

### Community 0 - "Auditoria y CRUD"
Cohesion: 0.06
Nodes (90): listarLog(), registrarLog(), buscarRegistros(), actualizarHospital(), actualizarInsumo(), actualizarPersona(), cambiarEstadoInsumo(), CAMPOS_CENTRO (+82 more)

### Community 1 - "Chat Avi (flujos)"
Cohesion: 0.06
Nodes (68): client, comoLlegarLugar(), construirResultados(), esCancelacion(), gatherDonacion(), gatherSolicitud(), mergeItems(), norm() (+60 more)

### Community 2 - "Ofertas y Entregas (match)"
Cohesion: 0.06
Nodes (53): codigoUnico(), crearEntregaParaOferta(), genCodigo(), getDonacionPublica(), sugerirMatches(), notificarInstitucion(), avisarCentro(), CAMPOS (+45 more)

### Community 3 - "DataTable generica"
Cohesion: 0.06
Nodes (48): Col, DataTable(), Dir, Facet, renderCell(), ServerCtl, sortKeyOf(), valueOf() (+40 more)

### Community 4 - "Compartir publico / OG"
Cohesion: 0.09
Nodes (34): obtenerSolicitudPublica(), OG(), cargar(), CompartirHospital(), generateMetadata(), PRIO, ESTADO_LABEL, OG() (+26 more)

### Community 5 - "Admin usuarios / impersonar"
Cohesion: 0.14
Nodes (27): adminRealId(), impersonar(), actualizarUsuario(), aprobarRegistro(), cambiarPasswordUsuario(), crearUsuario(), eliminarUsuario(), exigirAdmin() (+19 more)

### Community 6 - "Auth y Login"
Cohesion: 0.15
Nodes (19): PasswordModal(), Bienvenida(), PASOS, DonarModal(), iconoLugar(), MapaRefugios, MapaRuta, mapsUrl() (+11 more)

### Community 7 - "IA vision (foto/audio/texto)"
Cohesion: 0.12
Nodes (25): extraerDonacion(), analizarAudio(), analizarImagen(), analizarVoz(), POST(), analizarDocumento(), analizarTexto(), Categoria (+17 more)

### Community 8 - "Notificaciones"
Cohesion: 0.14
Nodes (18): listarNotificaciones(), marcarLeida(), marcarTodasLeidas(), tengoDonaciones(), NotificacionesPage(), DonarNav(), LINKS, Nav() (+10 more)

### Community 9 - "Detalle entidades / cards"
Cohesion: 0.16
Nodes (21): getHospital(), getInsumo(), getPersona(), hospitalesDeCentro(), ICONO, PILL, ResultadoCards(), ResultadoChat (+13 more)

### Community 10 - "Procesar cargas"
Cohesion: 0.18
Nodes (19): EXIF_VACIO, guardar(), guardarDocumento(), normCedula(), procesarDocumento(), ProcesarResult, procesarTexto(), POST() (+11 more)

### Community 11 - "Analytics"
Cohesion: 0.14
Nodes (18): ACTIVO, Analytics, ATENDIDO, cuenta(), Demanda, getAnalytics(), GRAVE, HospitalStat (+10 more)

### Community 12 - "Refugios / centros"
Cohesion: 0.16
Nodes (17): LugarEntrega, CentrosPage(), metadata, InsumoDonable, Centro, CentroModal(), comoLlegar(), MapaRuta (+9 more)

### Community 13 - "Layout raiz"
Cohesion: 0.13
Nodes (15): dejarDeImpersonar(), inter, metadata, mono, RootLayout(), viewport, ImpersonationBanner(), Providers() (+7 more)

### Community 14 - "Listas y filtros"
Cohesion: 0.21
Nodes (17): aplicarOrden(), areasInsumo(), Args, like(), listarCentros(), listarHospitales(), listarInsumos(), listarPersonas() (+9 more)

### Community 15 - "Ingesta documentos"
Cohesion: 0.22
Nodes (15): analizarDOCX(), analizarExcel(), analizarLista(), analizarPDF(), analizarURL(), docxATexto(), excelATexto(), EXIF_VACIO (+7 more)

### Community 16 - "DocCard / campos"
Cohesion: 0.17
Nodes (12): CAT_LABEL, DocCard(), emparejar(), enumOpts(), ESTADOS, norm(), PRIORIDADES, SEXO_OPTS (+4 more)

### Community 17 - "Chat UI"
Cohesion: 0.26
Nodes (12): ChatPanel(), conLinks(), inline(), mensajePorFlow(), renderRich(), ChatWidget(), mensajePorFlow(), AviIntent (+4 more)

### Community 18 - "Crear solicitud"
Cohesion: 0.15
Nodes (8): Carga, CrearSolicitud(), Hosp, Modo, MODOS, Need, HelpTip(), Textarea()

### Community 19 - "Instituciones (hospitales)"
Cohesion: 0.24
Nodes (11): getRelacionesHospitalRefugio(), Hospital, HospitalForm(), Instituciones(), porZona(), DialogHeader(), Centroide, CENTROIDES (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.24
Nodes (7): listarHospitalesSelect(), Captura(), pdfAPaginasPNG(), decodeQR(), tipoArchivo(), percentil(), realzarImagen()

### Community 21 - "Community 21"
Cohesion: 0.30
Nodes (9): CargaConEntidades, misCargas(), MisCargasPage(), CAT, categoriaDe(), MisCargas(), PERSONA_TIPOS, PILL (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (9): contarTodo(), Home(), ChatHero(), CHIPS, CARDS, Counts, HomeCards(), ORDEN (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.26
Nodes (8): listarDesaparecidos(), DesaparecidosPage(), metadata, Desaparecidos(), norm(), Persona, Img(), urlFoto()

### Community 24 - "Community 24"
Cohesion: 0.27
Nodes (10): HospFiltro, HospitalOpt, hospitalOptions(), HospitalSelect(), sufijo(), matches(), norm(), SearchableOption (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (6): Accion, metadata, Seccion, SECCIONES, Header(), Logo()

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (9): transcribirVoz(), ChatCtx, ChatProvider(), Ctx, Msg, saludoInicial(), tipRandom(), TIPS (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.27
Nodes (8): listarConciliacion(), TriagePage(), Entrega, EST_ENT, Fila, norm(), PRIO, Triage()

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (8): DonarBoton(), CHIPS, Insumo, LandingPublico(), presentacionDe(), PRIO, PRIO_LABEL, PRIO_PILL

### Community 29 - "Community 29"
Cohesion: 0.36
Nodes (6): institucionesPublicas(), RegistroPage(), Institucion, RegistroForm(), ROLES, tipoTxt()

### Community 30 - "Community 30"
Cohesion: 0.32
Nodes (4): BotonImprimir(), PrintHospital(), PRIO_ORD, cedulaReal()

### Community 31 - "Community 31"
Cohesion: 0.43
Nodes (6): PWA(), contarPendientes(), encolar(), leer(), Pendiente, sincronizar()

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (5): LogPage(), ACCION, ENTIDAD, LogViewer(), Row

### Community 33 - "Community 33"
Cohesion: 0.43
Nodes (6): esc(), MapaRefugios(), Pin, pinHtml(), tipHtml(), TIPO_LABEL

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (4): SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionResult, Window

### Community 35 - "Community 35"
Cohesion: 0.53
Nodes (4): ImagenProcesada, procesarImagen(), ExifMeta, leerExif()

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (4): ItemCant, match(), r, r2

## Knowledge Gaps
- **193 isolated node(s):** `Demanda`, `client`, `RespuestaChat`, `ResultadoChat`, `PendienteChat` (+188 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Auditoria y CRUD` to `Chat Avi (flujos)`, `Ofertas y Entregas (match)`, `Compartir publico / OG`, `Admin usuarios / impersonar`, `Notificaciones`, `Detalle entidades / cards`, `Procesar cargas`, `Analytics`, `Refugios / centros`, `Listas y filtros`, `Ingesta documentos`, `Instituciones (hospitales)`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 27`, `Community 29`, `Community 30`, `Community 35`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Why does `cn()` connect `DataTable generica` to `Community 24`, `Crear solicitud`, `Instituciones (hospitales)`, `Auth y Login`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `Button()` connect `Auth y Login` to `Auditoria y CRUD`, `Community 32`, `Ofertas y Entregas (match)`, `DataTable generica`, `Compartir publico / OG`, `Admin usuarios / impersonar`, `Notificaciones`, `Detalle entidades / cards`, `Analytics`, `Refugios / centros`, `Listas y filtros`, `DocCard / campos`, `Crear solicitud`, `Instituciones (hospitales)`, `Community 20`, `Community 21`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `Demanda`, `client`, `RespuestaChat` to the rest of the system?**
  _193 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auditoria y CRUD` be split into smaller, more focused modules?**
  _Cohesion score 0.05881188118811881 - nodes in this community are weakly interconnected._
- **Should `Chat Avi (flujos)` be split into smaller, more focused modules?**
  _Cohesion score 0.05648148148148148 - nodes in this community are weakly interconnected._
- **Should `Ofertas y Entregas (match)` be split into smaller, more focused modules?**
  _Cohesion score 0.06448412698412699 - nodes in this community are weakly interconnected._