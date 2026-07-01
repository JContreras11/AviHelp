import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PWA } from "@/components/PWA";
import { Header } from "@/components/Brand";
import { RolProvider, type Sesion } from "@/lib/rol";
import { Providers } from "@/components/Providers";
import { ChatProvider } from "@/lib/chat-store";
import { ChatWidget } from "@/components/ChatWidget";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { Bienvenida } from "@/components/Bienvenida";
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
  // Dominio de producción para que og:image y enlaces relativos resuelvan absolutos.
  metadataBase: new URL("https://avihelp.app"),
  title: {
    default: "AviHelp — Donaciones Inteligentes con Chatbot de IA",
    template: "%s | AviHelp"
  },
  description: "AviHelp es un chatbot inteligente con IA que te ayuda a donar insumos de manera medida y precisa a hospitales y refugios en emergencias.",
  manifest: "/manifest.webmanifest",
  keywords: [
    "donar insumos",
    "ayuda humanitaria",
    "donaciones inteligentes",
    "chatbot ia",
    "avihelp",
    "insumos medicos",
    "hospitales venezuela",
    "refugios",
    "emergencia humanitaria",
    "voluntariado medico"
  ],
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "AviHelp",
    title: "AviHelp — Donaciones Inteligentes con Chatbot de IA",
    description: "AviHelp es un chatbot inteligente con IA que te ayuda a donar insumos de manera medida y precisa a hospitales y refugios en emergencias.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AviHelp — Donaciones Inteligentes con Chatbot de IA",
    description: "AviHelp es un chatbot inteligente con IA que te ayuda a donar insumos de manera medida y precisa a hospitales y refugios en emergencias.",
  },
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
    ? { rol: s.rol as Sesion["rol"], email: s.email, nombre: s.nombre, hospitalIds: s.hospitalIds, centroIds: s.centroIds, impersonando: s.impersonando }
    : { rol: "publico", email: null, nombre: null };
  return (
    <html
      lang="es"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RolProvider sesion={sesion}>
          <Providers>
            <ChatProvider>
              {s?.impersonando && <ImpersonationBanner nombre={s.nombre} rol={s.rol} />}
              <div className="print:hidden contents"><Header /></div>
              {/* Onboarding "¿Cómo funciona?": primera sesión de TODOS (incl. público). */}
              <Bienvenida loggedIn={!!s} />
              {children}
              <ChatWidget />
            </ChatProvider>
          </Providers>
        </RolProvider>
        <PWA />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
