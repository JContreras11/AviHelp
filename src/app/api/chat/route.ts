import { preguntar } from "@/app/actions/chat";

export async function POST(req: Request) {
  const { pregunta, pendiente } = await req.json();
  return Response.json(await preguntar(pregunta ?? "", pendiente ?? null));
}
