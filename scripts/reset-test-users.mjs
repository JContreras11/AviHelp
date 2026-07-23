// Resetea el password de los usuarios de prueba e2e-* a uno conocido (solo DEV).
// Uso: node scripts/reset-test-users.mjs
// Lee NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY de .env.local.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Carga simple de .env.local
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}

const PASSWORD = "Avi!Test2607";
const EMAILS = [
  "e2e-admin@avihelp.test",
  "e2e-voluntario@avihelp.test",
  "e2e-medico@avihelp.test",
  "e2e-ong@avihelp.test",
];

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await s.auth.admin.listUsers({ perPage: 200 });
if (error) { console.error("ERROR listUsers:", error.message); process.exit(1); }

for (const email of EMAILS) {
  const u = data.users.find((x) => x.email === email);
  if (!u) { console.log("FALTA (crear manualmente):", email); continue; }
  const r = await s.auth.admin.updateUserById(u.id, { password: PASSWORD });
  console.log(r.error ? `ERROR ${email}: ${r.error.message}` : `ok ${email}`);
}
console.log(`\nPassword de todos: ${PASSWORD}`);
