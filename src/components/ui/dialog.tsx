"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Modal plano sin dependencias (base-ui Dialog causaba freeze del hilo principal
// al abrir sobre tablas grandes). Cierra con Esc o click en backdrop.
// ponytail: modal propio, suficiente para los pocos diálogos de la app.

type DialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

const DialogCtx = React.createContext<{ onOpenChange?: (o: boolean) => void }>({});
// id del título para enlazar aria-labelledby (lectores anuncian el título al abrir).
const DialogLabelCtx = React.createContext<string | undefined>(undefined);

function Dialog({ open = false, onOpenChange, children }: DialogProps) {
  // Bloquea scroll del body mientras está abierto.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange?.(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onOpenChange]);

  if (!open) return null;
  return <DialogCtx.Provider value={{ onOpenChange }}>{children}</DialogCtx.Provider>;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const { onOpenChange } = React.useContext(DialogCtx);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Mueve el foco al panel al abrir (teclado/lector entran al diálogo, no quedan en el trigger).
  const panelRef = React.useRef<HTMLDivElement>(null);
  const labelId = React.useId();
  React.useEffect(() => { if (mounted) panelRef.current?.focus(); }, [mounted]);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => onOpenChange?.(false)}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // [&>*]:min-w-0: contenido ancho no estira el diálogo (desborde horizontal en móvil).
          // max-h + overflow-y-auto: diálogos altos hacen scroll interno (botón Guardar siempre alcanzable).
          "relative z-10 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-xl outline-none [&>*]:min-w-0 sm:max-w-sm",
          className
        )}
        {...props}
      >
        <DialogLabelCtx.Provider value={labelId}>{children}</DialogLabelCtx.Provider>
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2"
            onClick={() => onOpenChange?.(false)}
          >
            <XIcon />
            <span className="sr-only">Cerrar</span>
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const labelId = React.useContext(DialogLabelCtx);
  return <h2 id={labelId} data-slot="dialog-title" className={cn("font-heading text-base leading-none font-medium", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
