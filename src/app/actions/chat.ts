"use server";

import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/server";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://avihelp.app", "X-Title": "AviHelp" },
});
const MODEL = process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash-lite";

// Chatbot RAG sobre datos estructurados: parsea -> consulta Postgres -> redacta.
export async function preguntar(pregunta: string): Promise<{ respuesta: string; fuentes: any[] }> {
  if (!pregunta?.trim()) return { respuesta: "Hazme una pregunta.", fuentes: [] };

  // 1) Extraer filtros de búsqueda de la pregunta.
  const f = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Extrae filtros de búsqueda de la pregunta del usuario sobre una base de personas e insumos en una emergencia. " +
          'Responde SOLO JSON: {"entidad":"personas|insumos","nombre":string|null,"ubicacion":string|null,' +
          '"estado":"vivo|herido|desaparecido|detenido|fallecido"|null,"insumo":string|null}',
      },
      { role: "user", content: pregunta },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  let filtros: any = {};
  try { filtros = JSON.parse(f.choices[0]?.message?.content ?? "{}"); } catch {}

  // 2) Consultar la base.
  const supabase = createAdminClient();
  let fuentes: any[] = [];
  if (filtros.entidad === "insumos") {
    let q = supabase.from("insumos").select("*, hospitales(nombre)").limit(15);
    if (filtros.insumo) q = q.ilike("nombre", `%${filtros.insumo}%`);
    fuentes = (await q).data ?? [];
  } else {
    let q = supabase.from("personas").select("nombre,cedula,edad,sexo,ubicacion,estado_salud,descripcion_fisica,telefono_contacto,notas").limit(15);
    if (filtros.nombre) q = q.ilike("nombre", `%${filtros.nombre}%`);
    if (filtros.ubicacion) q = q.ilike("ubicacion", `%${filtros.ubicacion}%`);
    if (filtros.estado) q = q.eq("estado_salud", filtros.estado);
    fuentes = (await q).data ?? [];
  }

  // 3) Redactar respuesta con el contexto recuperado.
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Eres Avi, la asistente de AviHelp en una emergencia humanitaria. Cálida pero concisa. Responde en español, " +
          "SOLO con la información de los datos provistos. Si no hay coincidencias, dilo y sugiere reformular. " +
          "Incluye estado, ubicación y teléfono de contacto si existen. NO inventes.",
      },
      { role: "user", content: `Pregunta: ${pregunta}\n\nDatos encontrados (JSON):\n${JSON.stringify(fuentes)}` },
    ],
    temperature: 0.2,
  });

  return { respuesta: r.choices[0]?.message?.content ?? "Sin respuesta.", fuentes };
}
