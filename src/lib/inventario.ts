// Constantes del inventario. Fuera de "use server" (un archivo server solo
// puede exportar funciones async), reutilizable por UI y acciones.
export const ESTATUS_INVENTARIO = [
  "por_revisar", "rechazado", "danado", "disponible", "en_entrega", "entregado",
] as const;
export type EstatusInventario = (typeof ESTATUS_INVENTARIO)[number];
