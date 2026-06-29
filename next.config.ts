import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs) y exceljs son CJS pesados: que corran en Node sin bundlear (evita romper el worker).
  // pdfjs-dist también externo: pdf-parse carga su build legacy en runtime (no bundlear el .mjs).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "exceljs"],
};

export default nextConfig;
