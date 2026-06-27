"use client";

import { Button } from "@/components/ui/button";

export function BotonImprimir() {
  return <Button onClick={() => window.print()}>🖨️ Imprimir / Guardar PDF</Button>;
}
