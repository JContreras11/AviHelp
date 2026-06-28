import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs) y exceljs son CJS pesados: que corran en Node sin bundlear (evita romper el worker).
  serverExternalPackages: ["pdf-parse", "exceljs"],
};

export default nextConfig;
