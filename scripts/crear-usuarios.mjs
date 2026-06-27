// Crea/actualiza usuarios y su rol. Uso: node scripts/crear-usuarios.mjs
// Lee SUPABASE_URL + SUPABASE_SECRET_KEY de .env.local (apunta al ambiente activo).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const USUARIOS = [
  { email: "jesuscontreras1996102@gmail.com", password: "4v1h3lp", rol: "admin",  nombre: "Jesús Contreras" },
  { email: "bethcontrerasp@gmail.com",        password: "4v1h3lp", rol: "admin",  nombre: "Beth Contreras (médico)" },
];

for (const u of USUARIOS) {
  // ¿Existe ya? (la lista paginada basta para 2 cuentas)
  const { data: list } = await s.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list?.users?.find((x) => x.email === u.email);

  if (!user) {
    const { data, error } = await s.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
    });
    if (error) { console.error("crear", u.email, error.message); continue; }
    user = data.user;
    console.log("creado", u.email);
  } else {
    await s.auth.admin.updateUserById(user.id, { password: u.password });
    console.log("actualizado password", u.email);
  }

  const { error: pe } = await s.from("profiles").upsert({
    id: user.id, email: u.email, nombre: u.nombre, rol: u.rol, activo: true,
  });
  console.log(pe ? `  perfil ERROR: ${pe.message}` : `  perfil rol=${u.rol}`);
}
console.log("listo");
