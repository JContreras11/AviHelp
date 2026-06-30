"use client";

import { useState } from "react";

// FIX 10 — texto COPIABLE (nombre o id de la donación). Click = copia al portapapeles.
// Mobile-first: área táctil cómoda, feedback "Copiado".
export function CopyableText({
  value, label, mono = false, className = "",
}: { value: string; label?: string; mono?: boolean; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    } catch { /* portapapeles no disponible: silencioso */ }
  }
  return (
    <button type="button" onClick={copiar} title={`Copiar ${label ?? value}`}
      className={`inline-flex items-center gap-1 hover:opacity-80 active:opacity-60 ${mono ? "font-mono" : ""} ${className}`}>
      <span className="truncate">{label ?? value}</span>
      <span className="shrink-0 text-[10px] opacity-60">{copiado ? "✓ copiado" : "⧉"}</span>
    </button>
  );
}

export default CopyableText;
