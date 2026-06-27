"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Brand";

export default function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setCargando(false);
    if (error) { setError("Correo o contraseña incorrectos."); return; }
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-primary/5 to-background">
      <form onSubmit={entrar} className="w-full max-w-sm flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <Logo size={64} />
          <h1 className="text-xl font-bold">Entrar a AviHelp</h1>
          <p className="text-sm text-muted-foreground text-center">Acceso solo para personal autorizado.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">Correo
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Contraseña
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</Button>
        <p className="text-xs text-muted-foreground text-center">¿Necesitas acceso? Pídelo al equipo de AviHelp.</p>
      </form>
    </main>
  );
}
