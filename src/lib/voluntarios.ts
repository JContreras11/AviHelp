// LANE V — Constantes y tipos del módulo de VOLUNTARIOS (personal de salud).
// Viven aquí (y no en el archivo "use server") porque un archivo de server actions
// SOLO puede exportar funciones async. Replican EXACTAMENTE las opciones del
// Google Form "PERSONAL DE SALUD VOLUNTARIO" de la Fundación Agua Verde.

// ── Perfil profesional y académico ──
export const AREAS_CONOCIMIENTO = [
  "Médico Especialista",
  "Médico General",
  "Licenciado en Enfermería",
  "Técnico en enfermería",
  "Rescatista",
  "Psicólogo",
  "Otro",
] as const;

// ── Logística y disponibilidad ──
export const DISPONIBILIDAD = ["Entre semana", "Fines de semana"] as const;
export const FRECUENCIA = ["Días fijos en la semana", "Por jornadas puntuales"] as const;
export const DURACION_TURNO = ["12 horas", "24 horas", "48 horas"] as const;
export const POSTULACION = ["De forma individual", "En grupo / Con un equipo"] as const;

// ── Datos de salud ──
export const GRUPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// ── Cronograma médico (Excel real: Días | Nombre | Especialidad | Turno) ──
export const TURNOS_CRONOGRAMA = ["AM", "PM", "12", "24", "48"] as const;
export type TurnoCronograma = (typeof TURNOS_CRONOGRAMA)[number];

// Hora de arranque y duración (horas) de cada turno del cronograma, para derivar
// inicio/fin en la tabla `agenda` (así el /calendario de LANE T también los pinta).
export const TURNO_HORARIO: Record<TurnoCronograma, { horaInicio: number; horas: number }> = {
  AM: { horaInicio: 7, horas: 6 },   // 07:00–13:00
  PM: { horaInicio: 13, horas: 6 },  // 13:00–19:00
  "12": { horaInicio: 7, horas: 12 },
  "24": { horaInicio: 7, horas: 24 },
  "48": { horaInicio: 7, horas: 48 },
};

// Estados de Venezuela para "Estado donde vive actualmente" (select searchable).
export const ESTADOS_VENEZUELA = [
  "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo",
  "Cojedes", "Delta Amacuro", "Distrito Capital", "Falcón", "Guárico", "La Guaira",
  "Lara", "Mérida", "Miranda", "Monagas", "Nueva Esparta", "Portuguesa", "Sucre",
  "Táchira", "Trujillo", "Yaracuy", "Zulia",
] as const;

export const ESTADOS_VOLUNTARIO = ["pendiente", "activo", "inactivo"] as const;
export type EstadoVoluntario = (typeof ESTADOS_VOLUNTARIO)[number];

// ── Tipos ──
export type Voluntario = {
  id: string;
  nombre: string;
  cedula: string | null;
  edad: number | null;
  telefono: string | null;
  estado_residencia: string | null;
  contacto_emergencia: string | null;
  area_conocimiento: string | null;
  especialidad: string | null;
  mpps: string | null;
  constancia_path: string | null;
  disponibilidad: string | null;
  frecuencia: string | null;
  duracion_turno: string | null;
  transporte_propio: boolean | null;
  postulacion: string | null;
  grupo_sanguineo: string | null;
  alergias: string | null;
  user_id: string | null;
  centro_id: string | null;
  estado: EstadoVoluntario;
  created_at: string;
  updated_at: string;
};

// Payload del auto-registro público (mismos campos del Google Form).
export type VoluntarioPayload = {
  nombre: string;
  cedula: string;
  edad: number | null;
  telefono: string;
  estado_residencia: string;
  contacto_emergencia: string;
  area_conocimiento: string;
  especialidad?: string | null;
  mpps?: string | null;
  disponibilidad: string;
  frecuencia: string;
  duracion_turno: string;
  transporte_propio: boolean | null;
  postulacion: string;
  grupo_sanguineo: string;
  alergias: string;
};

// Fila del cronograma (agenda tipo='voluntario' + join a voluntarios).
export type FilaCronograma = {
  id: string;
  inicio: string;
  fin: string | null;
  estado: string;
  turno: string | null;
  especialidad: string | null;
  persona_nombre: string | null;
  voluntario_id: string | null;
  voluntario?: { nombre: string | null; especialidad: string | null; area_conocimiento: string | null } | null;
  centro?: { nombre: string | null } | null;
};
