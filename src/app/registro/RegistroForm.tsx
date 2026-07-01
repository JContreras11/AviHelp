"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { solicitarAcceso } from "@/app/actions/usuarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Logo } from "@/components/Brand";

type Institucion = { id: string; nombre: string; tipo: string | null };

const ROLES = [
  { v: "voluntario", l: "🙋 Voluntario/a" },
  { v: "medico", l: "🩺 Personal médico" },
  { v: "ong", l: "🤝 ONG / organización" },
];

const tipoTxt = (t: string | null) =>
  t === "clinica" ? "Clínica" : t === "refugio" ? "Refugio" : t === "centro" ? "Centro de acopio" : "Hospital";

export function RegistroForm({ instituciones }: { instituciones: Institucion[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [rol, setRol] = useState("voluntario");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  const opciones = useMemo(() => {
    return instituciones
      .filter((i) => {
        if (rol === "medico") {
          return i.tipo === "hospital" || i.tipo === "clinica" || !i.tipo;
        } else {
          return i.tipo === "refugio" || i.tipo === "centro";
        }
      })
      .map((i) => ({
        value: i.id,
        label: i.nombre,
        keywords: tipoTxt(i.tipo),
      }));
  }, [instituciones, rol]);

  const selectPlaceholder = useMemo(() => {
    if (rol === "medico") return "Busca tu hospital o clínica…";
    return "Busca tu refugio o centro de acopio…";
  }, [rol]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Escribe un correo válido."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (!hospitalId) { setError("Selecciona la institución a la que perteneces."); return; }
    setCargando(true);
    const supabase = createClient();

    // 1) Crear cuenta. 2) Asegurar sesión (si no requiere confirmación de correo).
    const { data, error: e1 } = await supabase.auth.signUp({ email: email.trim(), password });
    if (e1) {
      setCargando(false);
      setError(e1.message.includes("already") ? "Ese correo ya tiene cuenta. Inicia sesión." : e1.message);
      return;
    }
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e2) {
        setCargando(false);
        setError("Tu cuenta se creó pero requiere confirmar el correo antes de continuar.");
        return;
      }
    }

    // 3) Crear la solicitud de acceso (membresía PENDIENTE) atada a la institución.
    const r = await solicitarAcceso({ hospitalId, rol, nombre, telefono });
    setCargando(false);
    if (!r.ok) { setError(r.error); return; }
    setListo(true);
    router.refresh();
  }

  if (listo) {
    return (
      <div className="w-full max-w-sm flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm text-center">
        <div className="flex flex-col items-center gap-2">
          <Logo size={64} />
          <h1 className="text-xl font-bold">¡Cuenta creada!</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tu acceso quedó <strong className="text-foreground">pendiente de aprobación</strong> por un administrador de AviHelp.
          Mientras tanto ya puedes usar la plataforma como público (buscar personas, ver necesidades y refugios).
        </p>
        <Button size="lg" onClick={() => { window.location.href = "/"; }}>Ir a AviHelp</Button>
      </div>
    );
  }

  return (
    <form onSubmit={registrar} className="w-full max-w-sm flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col items-center gap-2">
        <Logo size={64} />
        <h1 className="text-xl font-bold">Crear cuenta en AviHelp</h1>
        <p className="text-sm text-muted-foreground text-center">
          Para personal de un hospital, refugio, centro u ONG. Un administrador aprobará tu acceso.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">Nombre y apellido
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-12 text-base" placeholder="Tu nombre" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">Correo
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">Contraseña
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" placeholder="mínimo 6 caracteres" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">📞 Teléfono <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
        <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="h-12 text-base" placeholder="+58…" />
      </label>
      <div className="flex flex-col gap-1 text-sm font-medium">Institución a la que perteneces
        <SearchableSelect options={opciones} value={hospitalId} onChange={setHospitalId} placeholder={selectPlaceholder} />
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">¿Cuál es tu rol?
        <select
          value={rol}
          onChange={(e) => {
            setRol(e.target.value);
            setHospitalId(null);
          }}
          className="border rounded-lg h-12 px-2 text-base bg-background w-full"
        >
          {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={cargando}>{cargando ? "Creando cuenta…" : "Crear cuenta"}</Button>
      <p className="text-xs text-muted-foreground text-center">
        ¿Ya tienes cuenta? <Link href="/login" className="text-primary underline font-medium">Inicia sesión</Link>
      </p>
    </form>
  );
}
