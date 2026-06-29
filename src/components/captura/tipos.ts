import type { DocumentoAnalizado } from "@/lib/ai/vision";
import type { ExifMeta } from "@/lib/exif";

export type EstadoItem = "pendiente" | "analizando" | "listo" | "guardando" | "guardado" | "error";

export type ColaItem = {
  id: string;
  fuente: "foto" | "voz" | "audio" | "pdf" | "excel" | "docx" | "qr";
  nombre: string;
  thumb?: string; // dataURL para foto
  estado: EstadoItem;
  // entrada
  file?: File;
  audio?: Blob;
  texto?: string;
  url?: string; // QR / fuente externa: enlace a la lista
  notas?: string; // texto libre que el usuario añade para enriquecer la búsqueda
  gps?: { lat: number; lng: number };
  // resultado del análisis (editable)
  preview?: DocumentoAnalizado;
  foto?: string | null;
  exif?: ExifMeta;
  confianza: number;
  modelo?: string;
  error?: string;
};
