#!/usr/bin/env node
// ingest-conecta-salud.mjs
// ---------------------------------------------------------------------------
// Mirrors the PUBLIC emergency-needs dataset from the "conecta-salud" project
// (a Vite SPA backed by Supabase) into AviHelp's own database.
//
// This is a public, life-saving humanitarian dataset. The script is:
//   - ADDITIVE  : it never truncates/resets/deletes; it only inserts + updates
//                 rows it owns (fuente='scraper', raw_extraccion.origen='conecta-salud').
//   - IDEMPOTENT: safe to re-run against DEV and PROD. Dedup keys guarantee no
//                 duplicate institutions or insumos across runs.
//
// SOURCE (read-only REST, anon publishable key):
//   base   : https://yruqgiazeqoytayimrba.supabase.co/rest/v1
//   tables : necesidades (~563), hospitales (anon-denied -> we rely on necesidades)
//
// TARGET (our DB): pass the full Postgres connection string via env DB_URL or
//   as the first CLI arg. The same code runs against DEV and PROD.
//
// Usage:
//   node --env-file=.env.local scripts/ingest-conecta-salud.mjs "<postgres-url>"
//   DB_URL="<postgres-url>" node --env-file=.env.local scripts/ingest-conecta-salud.mjs
//   ... add --dry-run to fetch/filter/plan without writing.
// ---------------------------------------------------------------------------

import pg from 'pg';

const { Client } = pg;

const SRC_BASE = 'https://yruqgiazeqoytayimrba.supabase.co/rest/v1';
const SRC_KEY = 'sb_publishable_KB-ViURA2B1m-pVN0kpsng_tCSsg0YI';
const ORIGEN = 'conecta-salud';
const ORIGEN_URL = 'https://conecta-salud-two.vercel.app/';

const DRY_RUN = process.argv.includes('--dry-run');
const DB_URL =
  process.env.DB_URL ||
  process.argv.find((a) => a.startsWith('postgres')) ||
  '';

// --- helpers ---------------------------------------------------------------

// Accent/punct-insensitive normalization for fuzzy name matching + dedup keys.
function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim();
}

// Generic tokens that don't help distinguish one institution from another.
const STOP = new Set([
  'hospital', 'clinica', 'dr', 'dra', 'de', 'del', 'la', 'el', 'los', 'las',
  'y', 'san', 'santa', 'general', 'centro',
]);

function sigTokens(name) {
  return new Set(
    norm(name)
      .split(' ')
      .filter((t) => t.length >= 3 && !STOP.has(t))
  );
}

// Token-containment: returns { score = |inter|/|smaller set|, inter }.
// A match needs a HIGH score AND >=2 shared distinctive tokens, so that pairs
// sharing only geographic tokens (e.g. "Catia La Mar", "Caracas") don't merge.
function matchScore(a, b) {
  const A = sigTokens(a);
  const B = sigTokens(b);
  if (A.size === 0 || B.size === 0) return { score: 0, inter: 0 };
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return { score: inter / Math.min(A.size, B.size), inter };
}

function slugify(s) {
  return norm(s).replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Parse "10", "10 ampollas", "3 cajas" -> { cantidad, unidad }.
function parseCantidad(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { cantidad: null, unidad: null };
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { cantidad: null, unidad: s.slice(0, 60) || null };
  const num = parseFloat(m[1].replace(',', '.'));
  const unit = (m[2] || '').trim();
  return {
    cantidad: Number.isFinite(num) ? num : null,
    unidad: unit ? unit.slice(0, 60) : null,
  };
}

// urgencia (source) -> prioridad (ours: baja|media|alta|critica)
function prioridadFrom(urg) {
  switch (norm(urg)) {
    case 'urgente': return 'critica';
    case 'alta': return 'alta';
    case 'mediana': return 'media';
    case 'baja': return 'baja';
    default: return 'media';
  }
}

// Institution type for freshly created records.
function tipoFrom(name) {
  return /hospital|ambulatorio|cdi|materno|clinica|periferico/.test(norm(name))
    ? 'hospital'
    : 'centro';
}

// Obvious test rows to drop.
const TEST_HOSPITALS = new Set(['pruebas', 'pruebas2', 'prueba', 'test', 'demo', 'xxx']);

async function fetchAll(table, select = '*') {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url = `${SRC_BASE}/${table}?select=${encodeURIComponent(select)}`;
    const res = await fetch(url, {
      headers: {
        apikey: SRC_KEY,
        Authorization: `Bearer ${SRC_KEY}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Source ${table} fetch failed ${res.status}: ${body.slice(0, 200)}`);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

// --- main ------------------------------------------------------------------

async function main() {
  if (!DB_URL && !DRY_RUN) {
    console.error('ERROR: no DB url. Pass a postgres:// url as arg or set DB_URL. (--dry-run to skip)');
    process.exit(1);
  }

  console.log(`\n=== conecta-salud ingest ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
  console.log(`target db: ${DB_URL ? DB_URL.replace(/:[^:@/]+@/, ':****@') : '(none)'}\n`);

  // 1) FETCH ----------------------------------------------------------------
  console.log('Fetching necesidades from conecta-salud ...');
  const necesidades = await fetchAll('necesidades');
  console.log(`  fetched ${necesidades.length} necesidades`);

  // 2) FILTER ---------------------------------------------------------------
  const skip = { deshabilitada: 0, incluido_false: 0, test_hospital: 0, empty_insumo: 0, empty_hospital: 0 };
  const kept = [];
  for (const r of necesidades) {
    if (r.deshabilitada === true) { skip.deshabilitada++; continue; }
    if (r.incluido === false) { skip.incluido_false++; continue; }
    if (!norm(r.insumo)) { skip.empty_insumo++; continue; }
    const h = norm(r.hospital);
    if (!h) { skip.empty_hospital++; continue; }
    if (TEST_HOSPITALS.has(h)) { skip.test_hospital++; continue; }
    kept.push(r);
  }
  console.log('\nFILTER decisions:');
  console.log(`  kept: ${kept.length}`);
  console.log(`  skipped deshabilitada=true : ${skip.deshabilitada}`);
  console.log(`  skipped incluido=false     : ${skip.incluido_false}`);
  console.log(`  skipped test hospital      : ${skip.test_hospital} (PRUEBAS/PRUEBAS2/etc)`);
  console.log(`  skipped empty insumo       : ${skip.empty_insumo}`);
  console.log(`  skipped empty hospital     : ${skip.empty_hospital}`);

  // Group kept needs by source hospital name.
  const bySrcHospital = new Map();
  for (const r of kept) {
    const key = r.hospital.trim();
    if (!bySrcHospital.has(key)) bySrcHospital.set(key, []);
    bySrcHospital.get(key).push(r);
  }
  console.log(`\n  surviving institutions: ${bySrcHospital.size}`);

  if (DRY_RUN && !DB_URL) {
    console.log('\n(dry run, no DB) done.');
    return;
  }

  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // --- capability / constraint detection (DEV and PROD schemas differ) ------
  async function allowedValues(constraint) {
    const r = await client.query(
      `select pg_get_constraintdef(oid) def from pg_constraint where conname=$1`,
      [constraint]
    );
    const def = r.rows[0]?.def || '';
    return new Set([...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]));
  }
  async function columnExists(table, column) {
    const r = await client.query(
      `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
      [table, column]
    );
    return r.rowCount > 0;
  }
  async function tableExists(table) {
    const r = await client.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
      [table]
    );
    return r.rowCount > 0;
  }

  const allowedFuente = await allowedValues('insumos_fuente_check');
  const allowedTipo = await allowedValues('hospitales_tipo_check');
  // Prefer 'scraper' (DEV); fall back to 'import' (PROD) — both mean external bulk import.
  const FUENTE = ['scraper', 'import', 'manual'].find((v) => allowedFuente.has(v)) || 'manual';
  const clampTipo = (t) =>
    allowedTipo.size === 0 || allowedTipo.has(t)
      ? t
      : allowedTipo.has('hospital') ? 'hospital' : [...allowedTipo][0];
  const hasSolicitudes = (await tableExists('solicitudes')) && (await columnExists('insumos', 'solicitud_id'));
  console.log(`schema caps: fuente='${FUENTE}', solicitudes=${hasSolicitudes ? 'yes' : 'no'}, tipos=[${[...allowedTipo].join(',')}]`);

  const stats = {
    inst_matched: 0, inst_created: 0,
    ins_created: 0, ins_updated: 0, ins_skipped: 0,
    sol_created: 0, sol_updated: 0,
  };

  try {
    await client.query('BEGIN');

    // 3) MAP / CREATE institutions -----------------------------------------
    // Load ALL current institutions (incl. ones we created in prior runs).
    const existing = (await client.query('select id, nombre, tipo from hospitales')).rows;

    // STABLE-KEY IDEMPOTENCY: resolver por PROCEDENCIA guardada en insumos
    // (raw_extraccion.hospital_src = nombre ORIGINAL de la fuente). Sobrevive a
    // renombres de la institución (p.ej. migración a siglas), que rompían el
    // match por nombre y provocaban duplicados en cada corrida.
    const provByName = new Map();
    {
      // Si un src quedó ligado a varias instituciones (duplicados de corridas viejas),
      // gana la que tiene MÁS insumos → convergencia determinista hacia una sola.
      const prov = (await client.query(
        `select src, hospital_id from (
           select raw_extraccion->>'hospital_src' as src, hospital_id, count(*) n,
                  row_number() over (partition by raw_extraccion->>'hospital_src'
                                     order by count(*) desc, hospital_id) rn
             from insumos
            where (raw_extraccion->>'origen') = $1 and hospital_id is not null
            group by 1, 2
         ) t where rn = 1`,
        [ORIGEN]
      )).rows;
      for (const r of prov) if (r.src) provByName.set(norm(r.src), r.hospital_id);
    }

    function findInstitution(srcName) {
      // 0) Procedencia (clave estable) — inmune a renombres. Prioridad máxima.
      const provId = provByName.get(norm(srcName));
      if (provId) return existing.find((h) => h.id === provId) || { id: provId, nombre: srcName };
      // 1) Exact normalized-name equality. Dedup de filas propias en re-corrida
      //    (idempotency) para instituciones aún sin insumos (primera corrida).
      const exact = existing.find((h) => norm(h.nombre) === norm(srcName));
      if (exact) return exact;
      // 2) Otherwise fuzzy: high containment + >=2 shared distinctive tokens,
      //    so pairs sharing only geographic tokens don't merge.
      let best = null, bestScore = 0, bestInter = 0;
      for (const h of existing) {
        const { score, inter } = matchScore(srcName, h.nombre);
        if (score > bestScore) { bestScore = score; bestInter = inter; best = h; }
      }
      return bestScore >= 0.72 && bestInter >= 2 ? best : null;
    }

    // srcHospitalName -> hospital_id
    const hospitalId = new Map();

    for (const [srcName, needs] of bySrcHospital) {
      let inst = findInstitution(srcName);
      if (inst) {
        stats.inst_matched++;
        hospitalId.set(srcName, inst.id);
        console.log(`  = matched "${srcName}" -> "${inst.nombre}"`);
        continue;
      }
      // create
      const sample = needs.find((n) => norm(n.ciudad) || norm(n.estado)) || needs[0];
      const ubic = [sample?.ciudad, sample?.estado].map((x) => String(x || '').trim()).filter(Boolean).join(', ') || null;
      const contacto = (needs.find((n) => String(n.contacto || '').trim())?.contacto || null);
      const tipo = clampTipo(tipoFrom(srcName));
      if (DRY_RUN) {
        console.log(`  [dry] would CREATE institution "${srcName}" tipo=${tipo} ubic=${ubic}`);
        const fakeId = 'dry-' + slugify(srcName);
        hospitalId.set(srcName, fakeId);
        existing.push({ id: fakeId, nombre: srcName, tipo });
        stats.inst_created++;
        continue;
      }
      const ins = await client.query(
        `insert into hospitales (nombre, tipo, ubicacion, contacto)
         values ($1,$2,$3,$4) returning id`,
        [srcName, tipo, ubic, contacto ? String(contacto).slice(0, 120) : null]
      );
      const id = ins.rows[0].id;
      hospitalId.set(srcName, id);
      existing.push({ id, nombre: srcName, tipo }); // so later matches see it
      stats.inst_created++;
      console.log(`  + created institution "${srcName}" (${tipo})`);
    }

    // 4) UPSERT insumos -----------------------------------------------------
    for (const [srcName, needs] of bySrcHospital) {
      const hid = hospitalId.get(srcName);

      // Collapse duplicate (hospital + normalized insumo) rows from the source.
      // Keep the most-urgent + max quantity, remember all source ids.
      const merged = new Map(); // normNombre -> aggregated need
      const prioRank = { baja: 1, media: 2, alta: 3, critica: 4 };
      for (const r of needs) {
        const nombre = String(r.insumo).trim();
        const key = norm(nombre);
        const { cantidad, unidad } = parseCantidad(r.cantidad);
        const prioridad = prioridadFrom(r.urgencia);
        const cur = merged.get(key);
        if (!cur) {
          merged.set(key, {
            nombre, cantidad, unidad, prioridad,
            area: String(r.servicio || '').trim().slice(0, 80) || null,
            para: String(r.notas || '').trim().slice(0, 600) || null,
            source_ids: [r.id],
            raw: r,
          });
        } else {
          if ((cantidad ?? 0) > (cur.cantidad ?? 0)) cur.cantidad = cantidad;
          if (prioRank[prioridad] > prioRank[cur.prioridad]) cur.prioridad = prioridad;
          cur.source_ids.push(r.id);
        }
      }

      // Existing rows WE own for this hospital, keyed by normalized name.
      let ownByName = new Map();
      if (!DRY_RUN) {
        const cur = await client.query(
          `select id, nombre from insumos
           where hospital_id = $1 and fuente = $3
             and (raw_extraccion->>'origen') = $2`,
          [hid, ORIGEN, FUENTE]
        );
        for (const row of cur.rows) ownByName.set(norm(row.nombre), row.id);
      }

      for (const [key, m] of merged) {
        const rawProv = {
          origen: ORIGEN,
          origen_url: ORIGEN_URL,
          source_table: 'necesidades',
          source_ids: m.source_ids,
          hospital_src: srcName,
          ciudad_src: m.raw.ciudad || null,
          estado_src: m.raw.estado || null,
          urgencia_src: m.raw.urgencia || null,
          estado_cobertura_src: m.raw.estado_cobertura || null,
          contacto_src: m.raw.contacto || null,
          servicio_src: m.raw.servicio || null,
          ingested_at: new Date().toISOString(),
        };

        const existingId = ownByName.get(key);
        if (DRY_RUN) {
          if (existingId) stats.ins_updated++; else stats.ins_created++;
          continue;
        }
        if (existingId) {
          await client.query(
            `update insumos set
               nombre=$2, cantidad=$3, unidad=$4, prioridad=$5, area=$6,
               para_que_sirve=$7, raw_extraccion=$8, updated_at=now()
             where id=$1`,
            [existingId, m.nombre, m.cantidad, m.unidad, m.prioridad, m.area, m.para, rawProv]
          );
          stats.ins_updated++;
        } else {
          await client.query(
            `insert into insumos
               (hospital_id, nombre, cantidad, unidad, prioridad, estado, fuente, area, para_que_sirve, raw_extraccion)
             values ($1,$2,$3,$4,$5,'solicitado',$9,$6,$7,$8)`,
            [hid, m.nombre, m.cantidad, m.unidad, m.prioridad, m.area, m.para, rawProv, FUENTE]
          );
          stats.ins_created++;
        }
      }
    }

    // 5) SOLICITUDES bundle (one per institution, shareable) ----------------
    // Only when the target schema supports it (DEV has it; older PROD may not).
    // fuente must be one of manual|documento|texto|url|existentes -> use 'url'.
    // origen_url has a partial UNIQUE index, so give each hospital a distinct
    // fragment of the source app URL. Idempotent via unique slug.
    if (!hasSolicitudes) {
      console.log('\n(solicitudes bundle skipped: table/column not present in this schema)');
    } else for (const [srcName] of bySrcHospital) {
      const hid = hospitalId.get(srcName);
      const slug = `conecta-${slugify(srcName)}`;
      const titulo = `Necesidades — ${srcName}`;
      const url = `${ORIGEN_URL}#${slugify(srcName)}`;
      if (DRY_RUN) { stats.sol_created++; continue; }

      // count our insumos for the description
      const cnt = (await client.query(
        `select count(*)::int as n from insumos where hospital_id=$1 and fuente=$3 and (raw_extraccion->>'origen')=$2`,
        [hid, ORIGEN, FUENTE]
      )).rows[0].n;
      const descripcion = `Importado de Conecta Salud (${cnt} insumos). Fuente pública: ${ORIGEN_URL}`;

      const up = await client.query(
        `insert into solicitudes (slug, titulo, descripcion, hospital_id, estado, fuente, origen_url)
         values ($1,$2,$3,$4,'abierta','url',$5)
         on conflict (slug) do update set
           titulo=excluded.titulo, descripcion=excluded.descripcion,
           hospital_id=excluded.hospital_id, updated_at=now()
         returning id, (xmax = 0) as inserted`,
        [slug, titulo, descripcion, hid, url]
      );
      const solId = up.rows[0].id;
      if (up.rows[0].inserted) stats.sol_created++; else stats.sol_updated++;

      // link our insumos to this solicitud
      await client.query(
        `update insumos set solicitud_id=$1
         where hospital_id=$2 and fuente=$4 and (raw_extraccion->>'origen')=$3
           and (solicitud_id is distinct from $1)`,
        [solId, hid, ORIGEN, FUENTE]
      );
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\n(dry run) rolled back, no writes committed.');
    } else {
      await client.query('COMMIT');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }

  // 6) SUMMARY --------------------------------------------------------------
  console.log('\n=== SUMMARY ===');
  console.log(`institutions: matched ${stats.inst_matched}, created ${stats.inst_created}`);
  console.log(`insumos:      created ${stats.ins_created}, updated ${stats.ins_updated}, skipped ${stats.ins_skipped}`);
  console.log(`solicitudes:  created ${stats.sol_created}, updated ${stats.sol_updated}`);

  if (!DRY_RUN) {
    const solSel = hasSolicitudes
      ? `(select count(*) from solicitudes) as solicitudes_total`
      : `null as solicitudes_total`;
    const t = await client.query(
      `select
         (select count(*) from hospitales) as hospitales,
         (select count(*) from insumos) as insumos_total,
         (select count(*) from insumos where fuente=$2 and (raw_extraccion->>'origen')=$1) as insumos_conecta,
         ${solSel}`,
      [ORIGEN, FUENTE]
    );
    console.log('\ndb totals now:', t.rows[0]);
  }

  await client.end();
  console.log('\ndone.');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
