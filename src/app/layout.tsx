import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PWA } from "@/components/PWA";
import { Header } from "@/components/Brand";
import { RolProvider, type Sesion } from "@/lib/rol";
import { Providers } from "@/components/Providers";
import { getSesion } from "@/lib/supabase/server";
import "./globals.css";

// Tipografía moderna estilo startup: Inter (UI/texto) + JetBrains Mono (código).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AviHelp — Ayuda humanitaria con IA",
  description: "Registra personas e insumos en emergencias con una foto o tu voz.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#9b87f5",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const s = await getSesion();
  const sesion: Sesion = s
    ? { rol: s.rol as Sesion["rol"], email: s.email, nombre: s.nombre }
    : { rol: "publico", email: null, nombre: null };
  return (
    <html
      lang="es"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RolProvider sesion={sesion}>
          <Providers>
            {s && <div className="print:hidden contents"><Header /></div>}
            {children}
          </Providers>
        </RolProvider>
        <PWA />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
