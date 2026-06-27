import { analizarAudio } from "@/app/actions/procesar";

// POST multipart { audio } -> transcribe + analiza (preview, sin guardar). Útil para pruebas.
export async function POST(req: Request) {
  const fd = await req.formData();
  const res = await analizarAudio(fd);
  return Response.json(res, { status: res.ok ? 200 : 422 });
}
