// URL pública de una foto en el bucket 'fotos' de Supabase Storage.
export function urlFoto(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/fotos/${path}`;
}
