// Skeleton de carga del panel mientras getAnalytics resuelve (perceived performance).
export default function Loading() {
  return (
    <main className="flex-1 px-4 py-8 max-w-6xl mx-auto w-full animate-pulse" aria-busy="true" aria-label="Cargando panel de situación">
      <div className="h-7 w-56 rounded bg-muted mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[320px] rounded-xl border bg-muted/40" />
        ))}
      </div>
    </main>
  );
}
