"use client";

import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";

// QR de la URL ACTUAL (la vista pública de difusión). Imprimible para pegar físicamente.
export function QrSticker({ titulo }: { titulo: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(window.location.href); }, []);
  if (!url) return null;

  function imprimir() {
    window.print();
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border p-4 bg-card print:border-0">
      <p className="text-sm font-medium text-center">{titulo}</p>
      <QRCodeCanvas value={url} size={200} marginSize={2} className="rounded-lg" />
      <p className="text-xs text-muted-foreground text-center break-all">{url}</p>
      <Button size="sm" variant="outline" onClick={imprimir} className="print:hidden">🖨️ Imprimir QR</Button>
    </div>
  );
}
