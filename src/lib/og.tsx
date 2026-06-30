import { readFileSync } from "node:fs";
import { join } from "node:path";

// Tamaño y tipo estándar para todas las imágenes OpenGraph.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

// Logo de marca (burbuja morada) como data URI, leído de public/ en build/runtime (node).
let logoCache: string | null = null;
function logoDataUri(): string {
  if (logoCache !== null) return logoCache;
  try {
    const svg = readFileSync(join(process.cwd(), "public", "icon.svg"));
    logoCache = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    logoCache = "";
  }
  return logoCache;
}

// Tarjeta OG de marca: fondo degradado morado AviHelp + logo + título corto.
export function BrandOG({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  const logo = logoDataUri();
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background:
          "linear-gradient(135deg, #6d54d6 0%, #9b87f5 55%, #5eead4 130%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      {/* Marca */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={104} height={104} alt="AviHelp" />
        ) : null}
        <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>
          AviHelp
        </span>
      </div>

      {/* Contenido */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {badge ? (
          <span
            style={{
              alignSelf: "flex-start",
              fontSize: 30,
              fontWeight: 700,
              padding: "8px 22px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
            }}
          >
            {badge}
          </span>
        ) : null}
        <span
          style={{
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            display: "flex",
          }}
        >
          {title}
        </span>
        {subtitle ? (
          <span style={{ fontSize: 36, fontWeight: 500, opacity: 0.92 }}>
            {subtitle}
          </span>
        ) : null}
      </div>

      {/* Pie */}
      <span style={{ fontSize: 30, fontWeight: 600, opacity: 0.9 }}>
        avihelp.app · Ayuda humanitaria con IA
      </span>
    </div>
  );
}
