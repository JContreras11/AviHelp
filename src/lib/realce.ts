// Realce de documentos en el cliente antes de mandar al OCR.
// Objetivo: legibilidad de listas escritas a mano SIN destruir fotos de cédulas
// o carteles (por eso NO hacemos blanco/negro duro: solo bajamos tamaño y
// estiramos contraste). El "modo escáner B/N" fuerte queda como mejora futura.

const MAX_LADO = 2000; // px: acelera subida y análisis sin perder texto

export async function realzarImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // 1) percentiles 2%/98% de luminancia para auto-niveles (estira contraste).
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      hist[lum]++;
    }
    const total = (d.length / 4);
    const lo = percentil(hist, total, 0.02);
    const hi = percentil(hist, total, 0.98);
    const rango = Math.max(1, hi - lo);

    // 2) aplica estiramiento + leve gamma para resaltar trazos oscuros.
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let n = (v - lo) / rango;          // 0..1
      n = Math.min(1, Math.max(0, n));
      n = Math.pow(n, 0.9);              // gamma <1: aclara medios, resalta texto
      lut[v] = (n * 255) | 0;
    }
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]];
    }
    ctx.putImageData(img, 0, 0);

    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // si algo falla, usa el original
  }
}

function percentil(hist: Uint32Array, total: number, p: number): number {
  let acc = 0; const objetivo = total * p;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= objetivo) return v; }
  return 255;
}
