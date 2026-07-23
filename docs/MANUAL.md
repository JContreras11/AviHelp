# Manual de AviHelp — guía de todas las pantallas

**AviHelp** es la plataforma para gestionar la ayuda humanitaria tras una emergencia:
donaciones, inventario, logística, transporte, voluntarios y entrega — con trazabilidad de punta a punta.

Este manual explica **cada URL del sistema**: qué es, quién puede entrar y cómo se usa.

- **Producción:** https://avihelp.vercel.app
- **Formulario público de voluntarios:** https://avihelp.vercel.app/voluntarios/registro

---

## 1. Roles y accesos

| Rol | Para quién | Qué puede hacer |
|---|---|---|
| **Administrador** | Coordinación general | Todo: usuarios, instituciones, catálogos y todos los módulos. |
| **Logística** | Voluntarios/responsables de un centro de acopio (o miembros de hospital) | Recepción, inspección, inventario, despacho, camiones, calendario, voluntarios, gastos, vencimientos. |
| **Médico** | Personal de hospital | Ver/gestionar pacientes, panel, vencimientos. |
| **ONG / Aliado** | Organizaciones donantes | Ver estado y panel; coordinar donaciones. |
| **Camionero** | Conductores de transporte | Ver sus entregas asignadas y avanzar su estado; registrar disponibilidad. |
| **Público** | Cualquiera, sin cuenta | Ver estado por zona, buscar desaparecidos, registrarse como voluntario, donar. |

> El rol se asigna en el perfil (no se edita desde la interfaz). "Logística" = ser **miembro de un
> centro/hospital**. Cada pantalla se protege sola: si no tenés permiso, te devuelve al inicio o al login.

**Cómo se lee cada ficha:** 🌐 = público (sin cuenta) · 🔑 = requiere sesión · 🏭 = logística ·
🛠️ = administrador.

---

## 2. Mapa rápido de URLs

| Grupo | URL | Acceso |
|---|---|---|
| **Entrada** | `/` · `/login` · `/registro` | 🌐 |
| **Ayuda/Chat** | `/chat` · `/ayuda` | 🌐 |
| **Donaciones** | `/donaciones/crear` · `/donaciones` · `/mis-donaciones` · `/donaciones/recibir/<código>` | 🔑 |
| **Acopio** | `/checkin` · `/inspeccion` · `/inventario` · `/despacho` · `/vencimientos` · `/gastos` | 🏭 |
| **Transporte** | `/camiones` · `/calendario` · `/cronograma` | 🏭 |
| **Voluntarios** | `/voluntarios/registro` (🌐) · `/voluntarios` (🏭) | mixto |
| **Comunidad** | `/solicitudes` (🔑) · `/desaparecidos` · `/refugios` · `/publico` (🌐) | mixto |
| **Documentos** | `/documentos` · `/mis-cargas` · `/notificaciones` | 🔑 |
| **Panel** | `/dashboard` | 🔑 |
| **Admin** | `/admin/categorias` · `/admin/instituciones` · `/admin/usuarios` · `/admin/triage` · `/admin/log` | 🛠️ |
| **Compartir/Imprimir** | `/solicitud/<slug>` · `/compartir/hospital/<id>` · `/print/hospital/<id>` · `/donaciones/<código>` · `/necesidad/<id>` | 🌐/🔑 |

---

## 3. Entrada y cuenta

### `/` — Inicio 🌐
Página de bienvenida con **Avi**, el asistente. Cualquiera puede preguntar qué insumos faltan, a quién
buscar o cómo donar. Es la puerta de entrada del público.

### `/login` — Entrar 🌐
Correo + contraseña. Acceso solo para personal autorizado. Tras entrar, el menú muestra las secciones
según tu rol.

### `/registro` — Crear cuenta 🌐
Registro de una cuenta nueva (queda pendiente de aprobación por un admin en `/admin/usuarios`).

### `/chat` — Avi (asistente) 🌐
Chat con IA: preguntá "¿qué insumos faltan?", "buscar a una persona", "¿cómo dono?". Muestra necesidades
de hospitales y orienta al donante.

### `/ayuda` — Guía de uso 🌐
Explicación general de cómo funciona AviHelp, paso a paso, para cualquier usuario.

---

## 4. Donaciones (aportar ayuda)

### `/donaciones/crear` — Donar (paso a paso) 🔑
Flujo guiado para registrar una donación, **una decisión por pantalla**, acompañado por Avi.
- Podés subir **foto / audio / texto** y la IA extrae los productos y cantidades.
- Soporta donación **mixta** (varios productos distintos).
- Avi recomienda **a qué centro/hospital** llevarla y el **área** que la necesita (match automático).
- Si estás logueado, no te pide nombre/teléfono (los toma de tu perfil).
- Toda donación queda ligada a un **centro/refugio** y genera una notificación al centro.

### `/donaciones` — Donaciones (módulo unificado) 🔑
Vista central de donaciones: donar, ver tus donaciones y (para acopio) el seguimiento de despacho.

### `/mis-donaciones` — Mis donaciones 🔑
Lista de las donaciones que hiciste, con su estado; podés cancelar las que aún no salieron.

### `/donaciones/recibir/<código>` — Confirmar recepción 🔑
El personal del hospital/centro **confirma que recibió** una entrega, con foto, hora y lugar. Cierra el
ciclo de la donación (queda "recibida/entregada").

### `/ofrecer` — (redirige) 
Ruta antigua; ahora lleva al módulo de Donaciones. No se usa directamente.

---

## 5. Acopio (operación del centro) 🏭

### `/checkin` — Recepción (check-in)
Registrar lo que **llega** al centro de acopio.
1. **Donante**: cédula/RIF (V/E/J/G/P + número). Si ya existe, se autocompleta; si no, se crea. WhatsApp opcional.
2. **Categorías**: marcá las que trae (Alimentos, Medicinas e Insumos, Higiene, Ropa, Mobiliario, Recreación).
3. **Detalle**: por cada categoría, en pasos tipo formulario, agregá los ítems (nombre, cantidad, unidad,
   presentación). Podés adjuntar **foto/audio/documento** para que la IA precargue los productos.
4. Al guardar se crea el ingreso con **ID + fecha/hora**; cada ítem entra al inventario como **"por revisar"**.
5. Pestaña **Auditoría**: lista de recepciones, filtrable por fecha o ID.

### `/inspeccion` — Inspección / Triage
Control de calidad de lo recibido.
- Muestra los ítems **"por revisar"**.
- Al inspeccionar: elegí **quién inspecciona** (rol + nombre), **corregí cantidades** y **presentaciones
  anidadas** (ej. 18 pacas × 20 = 360 unidades), y confirmá el estado: **disponible**, **rechazado** o **dañado**.
- Queda registrado el inspector y la fecha.

### `/inventario` — Inventario de stock
El stock físico del centro (lo que hay para entregar; distinto de las *necesidades* de los hospitales).
- Lista con **estatus** (por revisar, disponible, en entrega, entregado, rechazado, dañado).
- **Filtros** por categoría y estatus + búsqueda.
- Botón **Imprimir** (con fecha y filtro aplicado).

### `/despacho` — Receptores y despacho
- Alta de **beneficiarios/receptores** (a quién se entrega): cédula/RIF, ubicación, prioridad, responsable.
- Asignar un receptor a una **entrega** por su código.

### `/vencimientos` — Alertas de vencimiento
Lista de **medicamentos/insumos por vencer**, ordenados por urgencia:
**vencido** (rojo) · **crítico** ≤15 días (naranja) · **pronto** ≤60 días (amarillo). Para priorizar su envío.

### `/gastos` — Gastos y cuentas
Manejo del **dinero** de la operación.
- **Cuentas** bancarias (VES/USD) con saldo.
- **Movimientos** (ingresos/egresos): donaciones monetarias y gastos (ej. compra de carpas), con su categoría.
- El saldo se recalcula automáticamente.

---

## 6. Transporte y agenda 🏭

### `/camiones` — Camiones y camioneros
- Alta de **camiones** (placa, capacidad) y **camioneros** (conductor, licencia).
- Cada camión muestra si está **lleno o con espacio** según lo cargado.
- Asignar **camión + camionero** a una entrega por código.
- Sección **"Mis entregas"** (camionero): el conductor ve sus entregas, **avanza el estado**
  (…→ en camino → recibido) y **captura evidencia** (foto). Al marcar recibido, la donación queda **entregada**.

### `/calendario` — Calendario
Un mismo calendario para dos cosas, en vista semanal por centro:
- **Voluntarios**: registrar personas y sus turnos/horarios (para contar con su presencia).
- **Camioneros**: registrar la disponibilidad de conductores.

### `/cronograma` — Cronograma médico
La **grilla semanal** de turnos: **Días × (Nombre · Especialidad · Turno AM/PM/12/24/48h)** — igual al
formato de Excel de la fundación. **Imprimible**. Se llena agendando turnos desde el roster de voluntarios.

---

## 7. Voluntarios de salud

### `/voluntarios/registro` — Formulario de registro 🌐
Formulario **público** (reemplaza el Google Form). El voluntario se registra con su perfil completo:
- **Datos personales**: nombre, cédula, edad, teléfono, estado de residencia, contacto de emergencia.
- **Perfil profesional**: área de conocimiento (Médico Especialista/General, Enfermería, Rescatista,
  Psicólogo…), especialidad, MPPS/matrícula, o adjuntar constancia.
- **Disponibilidad**: entre semana / fin de semana, frecuencia, duración de turnos, transporte, cómo se postula.
- **Datos de salud**: grupo sanguíneo, alergias.
Queda en estado **pendiente**. Es el link para difundir y reclutar.

### `/voluntarios` — Roster de voluntarios 🏭
Lista de todos los postulados. Filtrar por área/estado, ver el detalle, **aprobar** los pendientes
(→ activo) y **agendar turnos** (que aparecen en el cronograma y el calendario).

---

## 8. Comunidad y difusión

### `/solicitudes` — Solicitudes 🔑
Paquetes de necesidades de un hospital que se pueden **agrupar y compartir** (link público) para difundir
en redes/chats de ONGs. Desde acá se crean y se ve su estado (abierta/en progreso/cubierta/cerrada).

### `/desaparecidos` — Personas desaparecidas 🌐
Búsqueda pública de personas (damnificados/desaparecidos): nombre, edad, foto, contacto. Pensada para
difusión y reunificación.

### `/refugios` — Centros de atención 🌐
Directorio de centros/refugios que albergan personas, con su ubicación y qué reciben. Vista pública.

### `/publico` — Estado de la emergencia 🌐
Mapa/lista del **estado crítico por zona** (cuántos hospitales, cuántas necesidades críticas/altas),
**sin datos sensibles** (ni pacientes, ni quién pide, ni contactos). Estilo "Ayuda en Camino". Es la
vista pública para difundir la situación.

---

## 9. Documentos y notificaciones 🔑

### `/documentos` — Cargar documentos
Subir listas de pacientes o insumos (foto/PDF/Excel). La IA (Avi) las lee y las deja listas para revisar
antes de guardar. Solo personal verificado.

### `/mis-cargas` — Mis cargas
Galería de lo que subiste, con zoom, y la información extraída de cada carga (insumos/personas editables).

### `/notificaciones` — Notificaciones
Bandeja de avisos (donaciones que llegan, cambios de estado, etc.). El campanita del menú lleva acá.

---

## 10. Panel

### `/dashboard` — Panel de necesidades 🔑
Tablero en vivo: cuántos insumos por cubrir, críticos pendientes, en tránsito, atendidos; qué se pide más
y en qué zona. Al tocar una institución se ven y atienden sus pedidos (y sus pacientes).

---

## 11. Administración 🛠️

### `/admin/categorias` — Categorías y donantes
Catálogo editable de categorías (Alimentos, Medicinas…) y registro de donantes (trazabilidad). Solo admin.

### `/admin/instituciones` — Instituciones
Alta y gestión de hospitales, centros de acopio y refugios, y sus relaciones. Solo admin.

### `/admin/usuarios` — Usuarios
Gestión de usuarios: rol, aprobar registros pendientes, cambiar contraseña, "ver como" (impersonar). Solo admin.

### `/admin/triage` — Triage logístico
Tablero de **conciliación en vivo**: cada necesidad activa con sus entregas en curso y sus banderas
(crítica sin cobertura, discrepancia de ubicación, estancada, rechazada). Admin o coordinador de hospital.

### `/admin/log` — Bitácora
Registro de auditoría: quién hizo qué y cuándo (cada creación/edición/eliminación). Solo admin.

---

## 12. Enlaces compartibles e impresión

### `/solicitud/<slug>` — Solicitud pública 🌐
Página compartible de una solicitud (por link/QR) para difundir en redes. Muestra el hospital y su lista
de insumos. La crea el hospital al querer publicarla.

### `/compartir/hospital/<id>` — Hospital compartible 🌐
Página compartible con las necesidades de un hospital y el contacto del responsable.
> ⚠️ Expone contacto por hospital públicamente; ver `docs/RUNBOOK_ADMIN.md` (privacidad pendiente).

### `/print/hospital/<id>` — Imprimir insumos 🔑
Versión imprimible de la lista de insumos requeridos por un hospital.

### `/donaciones/<código>` — Seguimiento público de donación 🌐
Con el código de una donación, cualquiera (ej. el donante) ve el estado y la evidencia de que su ayuda
llegó. Genera confianza.

### `/necesidad/<id>` — Detalle de una necesidad 🔑
Vista de una necesidad puntual de un hospital, para donarla o darle seguimiento.

---

## 13. Glosario

- **Necesidad / Insumo**: lo que un hospital **pide** (demanda).
- **Inventario**: lo que **hay físicamente** en el centro de acopio (oferta).
- **Ingreso / Check-in**: una recepción de donaciones de un donante.
- **Entrega**: el envío de ayuda hacia un hospital/receptor, con su ciclo y evidencia.
- **Solicitud**: paquete de necesidades compartible por link.
- **Cronograma**: la grilla de turnos médicos (días × personas × turno).
- **Logística**: quien opera un centro de acopio (o es miembro de hospital).

---

*Para el paso a paso de pruebas ver `docs/CHECKLIST_APROBACION.md`. Para limpieza de datos y despliegue
ver `docs/RUNBOOK_ADMIN.md`. Guía corta por rol en `docs/GUIA_USUARIOS.md`.*
