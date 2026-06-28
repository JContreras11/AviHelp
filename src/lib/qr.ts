import jsQR from "jsqr";

// Decodifica un QR de una imagen (cliente). Devuelve el payload o null si no hay QR.
export async function decodeQR(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return jsQR(data, width, height)?.data ?? null;
}

// Clasifica un archivo por nombre/MIME para enrutarlo al flujo correcto.
// Pura: testeable sin DOM.
export function tipoArchivo(nombre: string, mime: string): "foto" | "pdf" | "excel" | null {
  const n = nombre.toLowerCase();
  if (mime.startsWith("image/")) return "foto";
  if (mime.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv") ||
      n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return "excel";
  return null;
}
