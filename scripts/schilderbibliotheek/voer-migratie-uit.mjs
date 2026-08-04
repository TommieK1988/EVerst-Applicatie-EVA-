/**
 * Voert één migratiebestand uit tegen de database en boekt hem in
 * `supabase_migrations.schema_migrations`, zodat het migratieoverzicht klopt.
 *
 *   node scripts/schilderbibliotheek/voer-migratie-uit.mjs <bestand.sql> <naam>
 *
 * Waarom niet via de Supabase MCP: de datamigratie is ~190 KB. Die past niet
 * comfortabel als tool-parameter. Dit script leest het bestand rechtstreeks van
 * schijf en stuurt het in één transactie naar Postgres — mislukt er iets, dan
 * gaat alles terug.
 *
 * `DATABASE_URL` komt uit `apps/dashboard/.env.local` (de pooler op poort 6543).
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * `pg` staat in de node_modules van de hoofdcheckout. Draai je dit script vanuit
 * een git-worktree — waar geen node_modules staat — dan vindt Node het pakket
 * niet via de scriptlocatie. Daarom zoeken we het expliciet op, vanaf de
 * werkmap omhoog.
 */
async function laadPg() {
  try {
    return (await import('pg')).default
  } catch {
    let map = resolve(process.cwd())
    while (true) {
      const kandidaat = join(map, 'node_modules', 'pg', 'package.json')
      if (existsSync(kandidaat)) {
        const pakket = JSON.parse(readFileSync(kandidaat, 'utf8'))
        let ingang = join(map, 'node_modules', 'pg', pakket.main ?? 'lib/index.js')
        // `pg` wijst met "main": "./lib" naar een map; ESM wil een bestand.
        if (statSync(ingang).isDirectory()) ingang = join(ingang, 'index.js')
        return (await import(pathToFileURL(ingang).href)).default
      }
      const ouder = resolve(map, '..')
      if (ouder === map) throw new Error("Pakket 'pg' niet gevonden — draai dit script vanuit een checkout met node_modules")
      map = ouder
    }
  }
}

const pg = await laadPg()

const [, , padSql, naamArg] = process.argv
if (!padSql) {
  console.error('Gebruik: node voer-migratie-uit.mjs <bestand.sql> [naam]')
  process.exit(1)
}

const naam = naamArg ?? basename(padSql, '.sql')

function leesDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const pad of ['apps/dashboard/.env.local', '../everts-platform/apps/dashboard/.env.local']) {
    try {
      const treffer = readFileSync(pad, 'utf8').match(/^DATABASE_URL=(.*)$/m)
      if (treffer) return treffer[1].trim().replace(/^["']|["']$/g, '')
    } catch { /* volgende pad proberen */ }
  }
  throw new Error('DATABASE_URL niet gevonden — zet hem in de omgeving of in apps/dashboard/.env.local')
}

const sql = readFileSync(padSql, 'utf8')
const client = new pg.Client({ connectionString: leesDatabaseUrl(), ssl: { rejectUnauthorized: false } })

// Versiestempel in hetzelfde formaat als de Supabase-CLI: YYYYMMDDHHMMSS.
const nu = new Date()
const versie = [
  nu.getUTCFullYear(),
  String(nu.getUTCMonth() + 1).padStart(2, '0'),
  String(nu.getUTCDate()).padStart(2, '0'),
  String(nu.getUTCHours()).padStart(2, '0'),
  String(nu.getUTCMinutes()).padStart(2, '0'),
  String(nu.getUTCSeconds()).padStart(2, '0'),
].join('')

const start = Date.now()
await client.connect()
try {
  await client.query('begin')
  await client.query(sql)
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, $3) on conflict (version) do nothing`,
    [versie, naam, [sql]],
  )
  await client.query('commit')
  console.log(`OK — ${naam} toegepast in ${((Date.now() - start) / 1000).toFixed(1)}s (versie ${versie})`)
} catch (fout) {
  await client.query('rollback')
  console.error(`MISLUKT — ${naam}: ${fout.message}`)
  if (fout.position) {
    const pos = Number(fout.position)
    console.error('rond:', JSON.stringify(sql.slice(Math.max(0, pos - 200), pos + 200)))
  }
  process.exitCode = 1
} finally {
  await client.end()
}
