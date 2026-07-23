# Checklist de aprobación manual — AviHelp

Guion para **probar y aprobar** cada funcionalidad, rol por rol. Marcá ✅/❌ y anotá.
La suite automática (`pnpm e2e`) ya cubre login, render y permisos; esto es la validación humana de los flujos.

**Antes de empezar:**
- App corriendo: `pnpm dev` → http://localhost:3000
- Usuarios de prueba (password `Avi!Test2607`): `e2e-admin`, `e2e-voluntario` (logística), `e2e-medico`, `e2e-ong` — todos `@avihelp.test`.
- DEV limpio de movimiento (instituciones/usuarios intactos). Para resetear: `./scripts/clean.sh dev transaccional`.

---

## A. Logística (entrar como `e2e-voluntario`)

### A1. Recepción / Check-in  `/checkin`
- [ ] Botón "Nuevo ingreso" / pestaña Registrar.
- [ ] Ingresar cédula donante (Tipo V + número). Si no existe, pide nombre/apellido.
- [ ] Repetir con la MISMA cédula → debe autocompletar el donante (no duplica). ✅ trazabilidad.
- [ ] Elegir centro + categoría(s) (Alimentos, Medicinas…).
- [ ] Agregar ítems (nombre, cantidad, unidad, presentación). Probar adjuntar **foto** → la IA precarga productos.
- [ ] Registrar → aparece **ID + fecha/hora** de la recepción.
- [ ] Pestaña **Auditoría**: la recepción aparece; filtrar por fecha/ID.

### A2. Inspección  `/inspeccion`
- [ ] El ítem recién ingresado aparece como **"por revisar"**.
- [ ] Inspeccionar: elegir inspector (rol + nombre), **corregir cantidad** y presentación anidada (ej. 18 × 20 = 360).
- [ ] Confirmar como **disponible** (probar también rechazado/dañado en otro ítem).
- [ ] Queda registrado inspector + fecha.

### A3. Inventario  `/inventario`
- [ ] El ítem inspeccionado aparece como **disponible**.
- [ ] Filtrar por categoría y estatus; buscar por nombre.
- [ ] **Imprimir** → vista con fecha y filtro.

### A4. Despacho  `/despacho`
- [ ] Crear un **receptor/beneficiario** (cédula/RIF, ubicación, prioridad, responsable).
- [ ] Asignar receptor a una entrega por código.

### A5. Camiones  `/camiones`
- [ ] Crear un **camión** (placa, capacidad) y un **camionero**.
- [ ] Ver indicador **lleno / con espacio** del camión.
- [ ] Asignar camión + camionero a una entrega por código.
- [ ] (Como camionero) ver "Mis entregas", **avanzar estado** hasta **recibido**, capturar **foto** de evidencia.

### A6. Calendario  `/calendario`
- [ ] Pestaña **Voluntarios**: agregar persona + turno (día/hora) en un centro.
- [ ] Pestaña **Camioneros**: registrar disponibilidad.
- [ ] Navegar semanas; ver conteo de presentes por día; hoy resaltado.

### A7. Vencimientos  `/vencimientos`
- [ ] Lista de próximos a vencer, ordenados; badges vencido/crítico/pronto.

### A8. Voluntarios de salud  `/voluntarios/registro` (público) + `/voluntarios` (logística)
- [ ] En `/voluntarios/registro` (sin login): llenar el formulario completo (datos personales, área,
      MPPS, disponibilidad, transporte, grupo sanguíneo, alergias) → enviar → confirmación.
- [ ] Como logística en `/voluntarios`: el voluntario aparece como **pendiente**; aprobarlo (→ activo).
- [ ] Agendar un turno del voluntario (día + turno AM/PM/24 + centro).

### A9. Cronograma médico  `/cronograma`
- [ ] La grilla semanal muestra Días × Nombre · Especialidad · Turno (el turno agendado en A8).
- [ ] Imprimir la grilla.

---

## B. Administración (entrar como `e2e-admin`)

### B1. Categorías y donantes  `/admin/categorias`
- [ ] Crear/editar/desactivar una categoría.
- [ ] Ver donantes registrados.

### B2. Gastos y cuentas  `/gastos`
- [ ] Crear una **cuenta** (VES o USD) con saldo inicial.
- [ ] Registrar un **ingreso** y un **egreso**; verificar el **saldo** recalculado.

### B3. Existente
- [ ] Panel `/dashboard`, usuarios `/admin/usuarios`, instituciones `/admin/instituciones` siguen funcionando.

---

## C. Permisos (control de acceso)
- [ ] `e2e-medico` NO puede entrar a `/checkin`, `/inventario`, `/despacho`, `/camiones` (rebota).
- [ ] `e2e-ong` NO puede entrar a los módulos de logística.
- [ ] `e2e-voluntario` NO puede entrar a `/admin/categorias` (solo admin).
- [ ] Sin login: `/inventario` → manda a `/login`; `/publico` sí carga.

---

## D. Público (sin login)
- [ ] `/publico` muestra estado por zona (críticos/altos) SIN nombres de pacientes ni contactos.
- [ ] `/refugios` y `/desaparecidos` cargan.

---

## E. Trazabilidad de punta a punta (el flujo completo)
1. [ ] Check-in de una donación de un donante identificado.
2. [ ] Inspección → disponible en inventario.
3. [ ] Despacho a un receptor, cargado en un camión con camionero.
4. [ ] Camionero marca **recibido** con foto.
5. [ ] La donación queda **entregada** y ligada a: donante → ítem → receptor → camión → camionero → evidencia.

---

## Anotaciones
| Ítem | Resultado | Nota |
|---|---|---|
|  |  |  |
