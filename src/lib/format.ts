// Helpers de formato/datos compartidos (sin dependencias).

// ¿La cédula es un valor real y no basura del OCR (ej "25F", "F", "12" = edad+sexo)?
// Cédula venezolana real: 6+ dígitos, o prefijo V/E/J/G/P. Si no, no es cédula.
export function cedulaReal(c?: string | null): string | null {
  if (!c) return null;
  const s = String(c).trim();
  if (/^[VEJGP]-?\d{5,}/i.test(s)) return s;
  const digitos = s.replace(/\D/g, "");
  return digitos.length >= 6 ? s : null;
}

// "hace 3 d", "hace 5 h", "hace 2 min", "ahora".
export function hace(fecha?: string | null): string {
  if (!fecha) return "—";
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

// Fecha+hora local corta para detalle/impresión.
export function fechaHora(fecha?: string | null): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "—";
  // Siempre hora de Venezuela (Caracas, UTC-4), no la del servidor (UTC).
  return d.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });
}

// Descarga client-side de filas como CSV (Excel-friendly).
export function descargarCSV(nombre: string, columnas: { header: string; valor: (r: any) => any }[], filas: any[]) {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columnas.map((c) => esc(c.header)).join(",");
  const body = filas.map((r) => columnas.map((c) => esc(c.valor(r))).join(",")).join("\n");
  // BOM para que Excel respete acentos.
  const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
