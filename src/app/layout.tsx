import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PWA } from "@/components/PWA";
import { Header } from "@/components/Brand";
import { RolProvider, type Sesion } from "@/lib/rol";
import { getSesion } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RolProvider sesion={sesion}>
          {s && <div className="print:hidden contents"><Header /></div>}
          {children}
        </RolProvider>
        <PWA />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
