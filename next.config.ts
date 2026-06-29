import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs es CJS pesado: que corra en Node sin bundlear. (El PDF lo lee unpdf, que ya
  // trae un build serverless de pdfjs y no necesita externalizarse.)
  serverExternalPackages: ["exceljs", "mammoth"],
};

export default nextConfig;
