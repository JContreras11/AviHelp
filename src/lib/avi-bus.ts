// Bus de invocación de Avi: cualquier página puede abrir el chat de Avi con un
// mensaje prellenado + una pista de flujo. Pub/sub mínimo, sin dependencias.
// SSR-safe: el Set vive a nivel de módulo y nunca toca `window`.

export type AviIntent = {
  message?: string;
  flow?: "solicitud" | "donacion" | "persona" | "general";
  attachments?: File[];
};

type AviListener = (intent: AviIntent) => void;

const listeners = new Set<AviListener>();

// Abre Avi (notifica a todos los suscriptores) con la intención dada.
export function openAvi(intent: AviIntent): void {
  for (const cb of listeners) {
    try {
      cb(intent);
    } catch {
      // un suscriptor roto no debe tumbar a los demás
    }
  }
}

// Suscribe un callback a las invocaciones de Avi. Devuelve un desuscriptor.
export function subscribeAvi(cb: AviListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
