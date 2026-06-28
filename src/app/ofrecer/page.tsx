"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { crearOferta } from "@/app/actions/ofertas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Brand";

const TIPOS = [
  { v: "insumo_fisico", l: "📦 Tengo insumos para donar", ph: "Ej: 50 férulas, 20 cajas de guantes M, 10 L de solución salina" },
  { v: "personal_humano", l: "🩺 Soy personal y estoy disponible", ph: "Ej: Médico cirujano, disponible toda la semana en Caracas" },
] as const;

export default function Ofrecer() {
  const [tipo, setTipo] = useState<"insumo_fisico" | "personal_humano">("insumo_fisico");
  const [f, setF] = useState<Record<string, any>>({});
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<{ sugerencias: number } | null>(null);

  async function enviar() {
    setEnviando(true);
    const r = await crearOferta({ ...f, tipo, cantidad: f.cantidad ? Number(f.cantidad) : null });
    setEnviando(false);
    if (!r.ok) { toast.error((r as any).error); return; }
    setOk({ sugerencias: (r as any).sugerencias ?? 0 });
  }

  const ph = TIPOS.find((t) => t.v === tipo)!.ph;

  if (ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center flex flex-col items-center gap-3 rounded-2xl border p-6">
          <Logo size={56} />
          <h1 className="text-xl font-bold">¡Gracias! 💜</h1>
          <p className="text-sm text-muted-foreground">
            Registramos tu oferta. Un coordinador la revisará y te contactará al teléfono que dejaste.
            {ok.sugerencias > 0 && ` Nuestra IA ya sugirió ${ok.sugerencias} posible(s) destino(s).`}
          </p>
          <Link href="/ofrecer"><Button variant="outline" onClick={() => { setOk(null); setF({}); }}>Registrar otra oferta</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-md mx-auto w-full flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <Logo size={56} />
        <h1 className="text-2xl font-bold">Ofrecer ayuda</h1>
        <p className="text-sm text-muted-foreground">¿Tienes insumos o eres personal de salud disponible? Déjanos saber y te conectamos donde más se necesita.</p>
      </header>

      <div className="grid grid-cols-1 gap-2">
        {TIPOS.map((t) => (
          <button key={t.v} onClick={() => setTipo(t.v)}
            className={`rounded-xl border p-3 text-left text-sm font-medium transition ${tipo === t.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}>
            {t.l}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">¿Qué ofreces?
        <textarea value={f.descripcion ?? ""} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={3}
          placeholder={ph} className="border rounded-lg p-2 text-base bg-background min-w-0" />
      </label>

      {tipo === "insumo_fisico" && (
        <label className="flex flex-col gap-1 text-sm font-medium">Cantidad (aprox.)
          <Input type="number" inputMode="numeric" value={f.cantidad ?? ""} onChange={(e) => setF({ ...f, cantidad: e.target.value })} placeholder="50" className="h-11 text-base" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">¿Dónde estás?
        <Input value={f.ubicacion_actual ?? ""} onChange={(e) => setF({ ...f, ubicacion_actual: e.target.value })} placeholder="Ciudad / zona" className="h-11 text-base" />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">Tu nombre
          <Input value={f.contacto_nombre ?? ""} onChange={(e) => setF({ ...f, contacto_nombre: e.target.value })} className="h-11 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Teléfono *
          <Input type="tel" value={f.contacto_telefono ?? ""} onChange={(e) => setF({ ...f, contacto_telefono: e.target.value })} placeholder="0414…" className="h-11 text-base" />
        </label>
      </div>

      <Button size="lg" onClick={enviar} disabled={enviando || !f.descripcion?.trim() || !f.contacto_telefono?.trim()}>
        {enviando ? "Enviando…" : "Enviar oferta"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">AviHelp no procesa pagos ni almacena bienes: solo conecta tu oferta con quien la necesita.</p>
    </main>
  );
}
