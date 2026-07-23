# Guía de usuarios — AviHelp

AviHelp es la plataforma para gestionar la ayuda humanitaria tras la emergencia:
**donaciones, inventario, logística y entrega**, con trazabilidad de punta a punta.

Esta guía explica **qué puede hacer cada rol** y **cómo funciona cada módulo**.

---

## Roles

| Rol | Para quién | Qué puede hacer |
|---|---|---|
| **Administrador** | Coordinación general | Todo: usuarios, instituciones, catálogos, y todos los módulos operativos. |
| **Logística / Centro de acopio** | Voluntarios y responsables de un centro de acopio | Recepción (check-in), inspección, inventario, despacho, camiones y calendario **de su centro**. |
| **Médico / Centro de salud** | Personal de hospital | Ver y gestionar pacientes de su hospital, panel, alertas de vencimiento. |
| **ONG / Aliado** | Organizaciones donantes | Ver estado y panel (solo lectura), coordinar donaciones. |
| **Camionero** | Conductores de transporte | Ver sus entregas asignadas, avanzar el estado, registrar su disponibilidad en el calendario. |
| **Público** | Cualquiera, sin cuenta | Ver el estado general de la emergencia por zona (sin datos sensibles), buscar desaparecidos, ver centros. |

> El rol se asigna en el perfil del usuario (no se edita desde la interfaz). "Logística" = ser
> **miembro de un centro de acopio** (aunque el rol base sea voluntario).

---

## El flujo operativo (de la donación a la entrega)

```
  DONANTE                 CENTRO DE ACOPIO                        HOSPITAL / BENEFICIARIO
  ───────                 ────────────────                        ───────────────────────
  entrega  ──►  1. RECEPCIÓN (Check-in)  ──►  2. INSPECCIÓN  ──►  3. INVENTARIO
  insumos       registra donante + items      corrige/valida       stock disponible
                                                                         │
                                                    4. DESPACHO ◄────────┘
                                                    receptor + camión + camionero
                                                                         │
                                                    5. ENTREGA  ──►  recibido (entregado)
                                                    con evidencia (foto/firma)
```

---

## Módulos

### 1. Recepción / Check-in  (`/checkin` — logística)
Registrar lo que llega al centro de acopio.
1. **Nuevo ingreso** → ingresá la **cédula/RIF del donante** (V/E/J/G/P + número). Si ya existe, se
   autocompleta; si no, se crea. WhatsApp opcional.
2. Marcá las **categorías** que trae (Alimentos, Medicinas e Insumos, Higiene, Ropa, Mobiliario, Recreación).
3. Por cada categoría, en pasos tipo formulario, agregá los **items** (nombre, cantidad, unidad, presentación).
   Podés adjuntar **foto/audio/documento** y la IA (Avi) precarga los productos.
4. Al guardar se crea el ingreso con **ID y fecha/hora**, y cada item entra al inventario como **"por revisar"**.
5. La pestaña **Auditoría** lista los ingresos, filtrable por fecha o ID.

### 2. Inspección / Triage  (`/inspeccion` — logística)
Control de calidad de lo recibido.
- Muestra los items **"por revisar"**.
- Al inspeccionar: elegí **quién inspecciona** (rol + nombre), **corregí cantidades** y **presentaciones
  anidadas** (ej: 18 pacas × 20 kg = 360 unidades), y confirmá el estado: **disponible**, **rechazado** o **dañado**.
- Queda registrado quién inspeccionó y cuándo.

### 3. Inventario  (`/inventario` — logística)
El stock físico del centro.
- Lista con **estatus** (por revisar, disponible, en entrega, entregado, rechazado, dañado).
- **Filtros** por categoría y estatus, búsqueda.
- **Imprimir** el inventario (con fecha).
- Es distinto de las **necesidades** de los hospitales (eso es demanda; esto es lo que hay físicamente).

### 4. Despacho y receptores  (`/despacho` — logística)
- **Receptores/beneficiarios**: alta de a quién se entrega (persona, empresa, refugio, jornada) con
  cédula/RIF, ubicación, prioridad y responsable.
- Asignar un receptor a una **entrega** por su código.

### 5. Camiones y camioneros  (`/camiones` — logística + camioneros)
- Alta de **camiones** (placa, modelo, capacidad) y **camioneros** (conductor, licencia).
- Cada camión muestra si está **lleno o con espacio** (según lo cargado).
- Asignar **camión + camionero** a una entrega por código.
- **Mis entregas** (camionero): el conductor ve sus entregas, **avanza el estado**
  (…→ en camino → recibido) y **captura evidencia** (foto). Al marcar recibido, la donación pasa a **entregada**.

### 6. Calendario  (`/calendario` — logística + camioneros)
Un mismo calendario para dos cosas:
- **Voluntarios**: registrar personas y sus horarios/turnos en el centro (para contar con su presencia).
- **Camioneros**: registrar disponibilidad de conductores.
Vista semanal por centro, con conteo de presencia por día.

### 6b. Voluntarios de salud  (`/voluntarios/registro` público · `/voluntarios` logística)
Reemplaza el Google Form de la fundación.
- **`/voluntarios/registro`** (público, compartible): el voluntario se auto-registra con su perfil completo —
  datos personales, área de conocimiento/especialidad, MPPS/constancia, disponibilidad, transporte, grupo
  sanguíneo, alergias, contacto de emergencia. Queda en estado **pendiente**.
- **`/voluntarios`** (logística): roster para ver/filtrar perfiles, **aprobar** pendientes (→ activo) y
  **agendar turnos** (que aparecen en el cronograma y el calendario).

### 6c. Cronograma médico  (`/cronograma` — logística + hospitales)
La grilla semanal **Días × (Nombre · Especialidad · Turno AM/PM/12/24/48)** — igual al Excel de la fundación.
Imprimible. Se llena agendando turnos desde el roster de voluntarios.

### 7. Vencimientos  (`/vencimientos` — logística + médico)
Alertas de **medicamentos/insumos por vencer**, ordenados por urgencia
(**vencido** / **crítico** ≤15 días / **pronto** ≤60 días) para priorizar su envío a hospitales.

### 8. Gastos y cuentas  (`/gastos` — admin/logística)
- **Cuentas** bancarias (VES/USD) con saldo.
- **Movimientos** (ingresos/egresos) para registrar donaciones monetarias y gastos (ej: compra de carpas),
  vinculables a una categoría — base para la reposición de inventario.

### 9. Categorías y donantes  (`/admin/categorias` — admin)
Catálogo de categorías (editable) y registro de donantes (trazabilidad).

### 10. Estado público  (`/publico` — sin login)
Mapa/lista del **estado crítico por zona** (cuántos hospitales, cuántas necesidades críticas/altas),
**sin exponer datos sensibles** (ni pacientes, ni quién pide, ni contactos). Estilo "Ayuda en Camino".

### Módulos existentes (siguen funcionando)
Chat con Avi (`/chat`), donaciones inteligentes (`/donaciones/crear`), solicitudes compartibles
(`/solicitudes`), desaparecidos/pacientes (`/desaparecidos`), centros/refugios (`/refugios`),
panel/dashboard (`/dashboard`), mis cargas (`/mis-cargas`), notificaciones.

---

## Trazabilidad y confianza al donante
Cada ítem donado queda ligado a su **donante** y, al entregarse, a su **receptor**, **camión**, **camionero**
y **evidencia** (foto/firma). Esto permite mostrarle al donante que su ayuda llegó — clave para recuperar confianza.

## Privacidad
Los **pedidos por hospital** (qué necesita, quién pide) y los **pacientes** NO son públicos: solo los ven
centros de acopio y aliados autenticados. La vista pública solo muestra agregados por zona.
⚠️ Ver `docs/RUNBOOK_ADMIN.md` → "Privacidad pendiente" para 2 rutas heredadas que aún exponen contacto por hospital.
