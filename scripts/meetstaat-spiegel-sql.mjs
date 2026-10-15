#!/usr/bin/env node
/**
 * Eenmalige overzetting van bestaande meetstaten naar de eigen tabellen (fase 1a).
 *
 * Gebruikt exact dezelfde vertaling als de app (apps/dashboard/src/lib/meetstaat/spiegel.ts),
 * zodat de overzetting en de spiegel bij elke opslag niet uit elkaar kunnen lopen.
 *
 * Invoer (stdin): JSON-array van { project_id, dossier_id, object_id, data } — het resultaat van
 *
 *   select s.project_id, d.id as dossier_id, d.object_id, s.data
 *   from calculatie_snapshots s
 *   join dossiers d on d.everts_calc_project_id = s.project_id
 *   where jsonb_typeof(s.data->'meetstaten') = 'array' and jsonb_array_length(s.data->'meetstaten') > 0;
 *
 * Uitvoer (stdout): SQL met upserts, toe te passen via de Supabase MCP.
 *
 *   node scripts/meetstaat-spiegel-sql.mjs < snapshots.json > overzetting.sql
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import maakJiti from 'jiti'

// jiti laadt het TypeScript-bestand van de app direct; geen aparte build nodig.
const jiti = maakJiti(fileURLToPath(import.meta.url), { interopDefault: true })
const { spiegelRijen } = jiti('../apps/dashboard/src/lib/meetstaat/spiegel.ts')

const lit = v => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  return `'${String(v).replace(/'/g, "''")}'`
}

function upsert(tabel, rijen, conflict, bijwerken) {
  if (rijen.length === 0) return ''
  const kolommen = Object.keys(rijen[0])
  const waarden = rijen.map(r => `(${kolommen.map(k => lit(r[k])).join(', ')})`).join(',\n  ')
  const set = bijwerken.map(k => `${k} = excluded.${k}`).join(', ')
  return `insert into public.${tabel} (${kolommen.join(', ')}) values\n  ${waarden}\n` +
    `on conflict (${conflict}) do ${set ? `update set ${set}` : 'nothing'};\n\n`
}

const snapshots = JSON.parse(readFileSync(0, 'utf8'))
const nu = new Date().toISOString()
const alles = { meetstaten: [], delen: [], regels: [], gebruik: [] }
for (const s of snapshots) {
  const r = spiegelRijen(s.data, { projectId: s.project_id, dossierId: s.dossier_id, objectId: s.object_id ?? null, nu })
  for (const k of Object.keys(alles)) alles[k].push(...r[k])
}

// Delen kunnen per snapshot dubbel voorkomen; de laatste wint, net als bij de upsert in de app.
alles.delen = [...new Map(alles.delen.map(d => [d.id, d])).values()]

let sql = '-- Overzetting bestaande meetstaten (gegenereerd door scripts/meetstaat-spiegel-sql.mjs)\n\n'
sql += upsert('meetstaten', alles.meetstaten, 'id', ['naam', 'code', 'dossier_id', 'object_id'])
// Eerst de bovenste delen, dan de subdelen: de verwijzing naar parent_id moet al bestaan.
sql += upsert('gebouw_delen', alles.delen.filter(d => !d.parent_id), 'id', ['naam', 'volgorde'])
sql += upsert('gebouw_delen', alles.delen.filter(d => d.parent_id), 'id', ['naam', 'volgorde', 'parent_id'])
sql += upsert('meetstaat_regels', alles.regels, 'id', [])
sql += upsert('meetstaat_gebruik', alles.gebruik, 'meetstaat_id, project_id, scenario_id', [])
process.stdout.write(sql)
process.stderr.write(
  `${alles.meetstaten.length} meetstaten, ${alles.delen.length} delen, ` +
  `${alles.regels.length} regels, ${alles.gebruik.length} keer gebruikt\n`,
)
