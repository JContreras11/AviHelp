"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { registrarDonante } from "@/app/actions/donaciones";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// FIX NEVER-ORPHAN: antes de registrar una donación anónima (con email+teléfono),
// pedimos una contraseña para CREAR cuenta o INICIAR SESIÓN, de modo que la donación
// quede ligada a un usuario real. El donante puede continuar SIN cuenta (onSkip).
// Tras autenticar, las cookies de sesión quedan puestas y la siguiente acción de
// servidor (crear donación) ya verá al usuario logueado.
export function PasswordModal({
  email, nombre, telefono, onAuthed, onSkip, onClose,
}: {
  email: string; nombre?: string; telefono?: string;
  onAuthed: () => void; onSkip: () => void; onClose: () => void;
}) {
  const [modo, setModo] = useState<"crear" | "entrar">("crear");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);

  async function continuar() {
    if (password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres."); return; }
    setCargando(true);
    const sb = createClient();
    if (modo === "crear") {
      const r = await registrarDonante({ email, password, nombre, telefono });
      if (!r.ok) {
        setCargando(false);
        if ((r as any).yaExiste) { setModo("entrar"); toast.message("Ya tienes cuenta — inicia sesión con tu contraseña."); }
        else toast.error(r.error);
        return;
      }
    }
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setCargando(false);
    if (error) {
      toast.error(modo === "entrar" ? "Correo o contraseña incorrectos." : "Cuenta creada, pero no pudimos iniciar sesión. Inténtalo de nuevo.");
      return;
    }
    toast.success("Sesión iniciada. Tu donación quedará a tu nombre.");
    onAuthed();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg pr-8">
            {modo === "crear" ? "💜 Asegura tu donación" : "Inicia sesión"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {modo === "crear"
              ? "Crea una contraseña para tu correo y así podrás seguir tus donaciones en cualquier momento. Es opcional."
              : "Ya tienes una cuenta con este correo. Entra para ligar la donación a tu historial."}
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">Correo
            <Input value={email} readOnly disabled className="h-11 text-base bg-muted/40" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Contraseña
            <Input type="password" autoComplete={modo === "crear" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres" className="h-11 text-base" />
          </label>
          <Button size="lg" onClick={continuar} disabled={cargando} className="w-full">
            {cargando ? "Procesando…" : modo === "crear" ? "Crear cuenta y donar" : "Entrar y donar"}
          </Button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" className="text-primary underline"
              onClick={() => setModo((m) => (m === "crear" ? "entrar" : "crear"))}>
              {modo === "crear" ? "Ya tengo cuenta" : "Crear cuenta nueva"}
            </button>
            <button type="button" className="text-muted-foreground underline" onClick={onSkip}>
              Continuar sin cuenta
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PasswordModal;
