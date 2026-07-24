import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Brand";

export const metadata: Metadata = {
  title: "¿Cómo funciona? — Guía de AviHelp",
  description:
    "Guía completa de AviHelp: cómo usar el chat de Avi, donar, pedir insumos, cargar documentos y encontrar refugios y centros de acopio.",
};

// Página de ayuda PÚBLICA: explica todas las funciones de AviHelp en lenguaje sencillo,
// con enlaces reales a cada parte de la app. Es la "guía completa" a la que apuntan el
// menú, el aviso de bienvenida y el saludo de Avi.

type Accion = { txt: string; href: string };
type Seccion = {
  id: string;
  icon: string;
  titulo: string;
  intro: string;
  puntos: string[];
  acciones: Accion[];
};

const SECCIONES: Seccion[] = [
  {
    id: "avi",
    icon: "💬",
    titulo: "Avi, el asistente",
    intro:
      "Avi es un chat que entiende lo que escribes, dictas o le envías como foto. Es la forma más rápida de usar AviHelp: en vez de buscar entre menús, solo pregúntale.",
    puntos: [
      "Te dice qué insumos faltan y en qué hospitales o refugios.",
      "Te guía para donar, crear una solicitud o cargar una lista.",
      "Si le arrastras o pegas una foto, PDF o audio con una lista, la lee y la organiza por ti.",
    ],
    acciones: [{ txt: "Hablar con Avi", href: "/chat" }],
  },
  {
    id: "donar",
    icon: "💜",
    titulo: "Donar o ofrecer ayuda",
    intro:
      "Donar es paso a paso y no necesitas cuenta. Puedes dar insumos (medicinas, material médico, comida, ropa) u ofrecerte como personal de salud.",
    puntos: [
      "Toma una foto de tu lista, graba una nota de voz o escríbela: Avi detecta los productos y cantidades.",
      "Puedes relacionar tu donación con un hospital que la necesita, o dejarla libre para que el equipo decida.",
      "Eliges dónde la entregas con un mapa de centros cercanos a ti.",
      "Recibes un código para seguir el estado de tu donación hasta que llega.",
    ],
    acciones: [{ txt: "Donar ahora", href: "/donaciones/crear" }],
  },
  {
    id: "refugios",
    icon: "🏥",
    titulo: "Hospitales, refugios y centros de acopio",
    intro:
      "Un mapa con todos los lugares: hospitales y clínicas, refugios y centros de acopio. Filtra por tipo o busca por nombre, zona o parroquia.",
    puntos: [
      "Ve qué pide cada lugar y con qué urgencia.",
      "Encuentra el punto de entrega más cercano para tu donación.",
      "Comparte el enlace ya filtrado para difundir una necesidad.",
    ],
    acciones: [{ txt: "Ver el mapa", href: "/refugios" }],
  },
  {
    id: "solicitudes",
    icon: "📋",
    titulo: "Pedir insumos (solicitudes)",
    intro:
      "Si coordinas un hospital o refugio, crea una solicitud compartible con la lista de lo que necesitas para difundirla en redes o con ONG.",
    puntos: [
      "Carga un documento (foto, PDF, Excel o Word) y Avi extrae las necesidades.",
      "Pega un texto con la lista, o un enlace (URL) de una página y lo importamos.",
      "Agrupa necesidades ya cargadas para compartirlas juntas en un solo enlace.",
    ],
    acciones: [{ txt: "Crear una solicitud", href: "/solicitudes" }],
  },
  {
    id: "documentos",
    icon: "📄",
    titulo: "Cargar documentos",
    intro:
      "El personal verificado puede subir listas de pacientes o insumos. Avi las lee con inteligencia artificial y las deja listas para revisar antes de guardar.",
    puntos: [
      "Sube foto, PDF, Excel/CSV, Word o un QR de lista; también por voz.",
      "Avi detecta si es lista de personas o de insumos y la organiza.",
      "Siempre revisas y corriges los datos antes de guardarlos.",
    ],
    acciones: [{ txt: "Cargar un documento", href: "/documentos" }],
  },
  {
    id: "panel",
    icon: "📊",
    titulo: "Panel de necesidades",
    intro:
      "Una vista general de la emergencia: qué insumos se piden más, dónde hacen más falta y cuántos ya fueron atendidos.",
    puntos: [
      "Insumos por cubrir, críticos pendientes, en tránsito y atendidos de un vistazo.",
      "Filtra por institución o muestra solo los casos graves.",
      "Dona o comparte una necesidad directamente desde el panel.",
    ],
    acciones: [{ txt: "Abrir el panel", href: "/dashboard" }],
  },
];

export default function AyudaPage() {
  return (
    <main className="flex-1 bg-gradient-to-b from-primary/5 via-background to-background px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">¿Cómo funciona AviHelp?</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Plataforma gratuita para <strong className="text-foreground">coordinar ayuda</strong> durante la
            emergencia en Venezuela: ver qué insumos faltan y ubicar hospitales, refugios y
            centros de acopio. Aquí te explicamos cada parte.
          </p>
        </header>

        {/* Índice rápido — salta a cada sección. */}
        <nav aria-label="Secciones" className="mt-6 flex flex-wrap justify-center gap-2">
          {SECCIONES.map((s) => (
            <a key={s.id} href={`#${s.id}`}
              className="rounded-full border bg-card px-3 py-1.5 text-sm transition hover:bg-muted">
              {s.icon} {s.titulo}
            </a>
          ))}
        </nav>

        <div className="mt-8 flex flex-col gap-4">
          {SECCIONES.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 rounded-2xl border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <span aria-hidden>{s.icon}</span>
                <span>{s.titulo}</span>
              </h2>
              <p className="mt-2 text-muted-foreground">{s.intro}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {s.puntos.map((p) => (
                  <li key={p} className="flex gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 text-primary" aria-hidden>✓</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {s.acciones.map((a) => (
                  <Link key={a.href} href={a.href}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                    {a.txt} →
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-8 rounded-2xl border bg-muted/30 p-4 text-sm leading-snug text-muted-foreground">
          <strong className="text-foreground">Descargo de responsabilidad:</strong> gran parte de los datos los
          ingresan voluntarios y la comunidad. AviHelp no garantiza su exactitud ni procesa pagos o bienes — confirma
          siempre llamando al centro antes de trasladar a una persona o insumos.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/chat" className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-muted">
            💬 Empezar con Avi
          </Link>
          <Link href="/" className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-muted">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
