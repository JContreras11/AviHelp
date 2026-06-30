"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { tengoDonaciones } from "@/app/actions/ofertas";

// FIX 9 — entrada "Donar" del nav. Si el usuario YA tiene donaciones, se convierte en un
// DROPDOWN con caret (acceso rápido a "Mis donaciones" + "Donar de nuevo"). Si no, es un
// enlace normal. Aditivo: no altera el resto del nav.
export function DonarNav({ label, className = "", onNavigate }: { label: string; className?: string; onNavigate?: () => void }) {
  const [tiene, setTiene] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { tengoDonaciones().then(setTiene).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!tiene) {
    return <Link href="/donaciones/crear" onClick={onNavigate} className={className}>{label}</Link>;
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`flex items-center gap-1 ${className}`}>
        {label} <ChevronDown className="size-3.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-44 rounded-xl border bg-card shadow-lg z-50 p-1">
          <Link href="/donaciones/crear" onClick={() => { setOpen(false); onNavigate?.(); }} className="block px-3 py-2 text-sm rounded-md hover:bg-muted">💜 Donar de nuevo</Link>
          <Link href="/donaciones" onClick={() => { setOpen(false); onNavigate?.(); }} className="block px-3 py-2 text-sm rounded-md hover:bg-muted">📋 Mis donaciones</Link>
        </div>
      )}
    </div>
  );
}

export default DonarNav;
