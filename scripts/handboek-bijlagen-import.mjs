/**
 * Zet de pdf-bijlagen van het handboek in de privé bucket `handboek-bijlagen`.
 *
 * De rijen staan al in `personeelshandboek_bijlagen` (seed-migratie
 * 20260914c); dit script vult alleen het bestand erbij. Waarom geen migratie:
 * binaire bestanden horen niet in SQL, en de bronbestanden staan in OneDrive
 * en niet in de repo.
 *
 * Gebruik:
 *   node scripts/handboek-bijlagen-import.mjs "<map met de pdf's>"
 *
 * Zonder argument wordt de standaardmap van Personeelszaken geprobeerd.
 * Ontbreekt een bestand, dan meldt het script dat en gaat door — de rij blijft
 * dan zonder bestand staan en de app geeft een nette melding in plaats van een
 * kapotte link.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const STANDAARD_MAP =
  'C:/Users/t.kamminga/OneDrive - Everts Groep/Personeelszaken - Documenten/' +
  '05 Personeelsprocedures/01 Personeelshandboek/Brondocumenten nieuwe versie'

const BUCKET = 'handboek-bijlagen'

function laadEnv() {
  const pad = path.join(process.cwd(), 'apps/dashboard/.env.local')
  const tekst = fs.readFileSync(pad, 'utf8')
  const lees = (sleutel) =>
    tekst
      .split(/\r?\n/)
      .find((r) => r.startsWith(`${sleutel}=`))
      ?.slice(sleutel.length + 1)
      .replace(/^["']|["']$/g, '')
  return {
    url: lees('NEXT_PUBLIC_SUPABASE_URL'),
    key: lees('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

const map = process.argv[2] || STANDAARD_MAP
const { url, key } = laadEnv()
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt')

const db = createClient(url, key)

const { data: bijlagen, error } = await db
  .from('personeelshandboek_bijlagen')
  .select('id, titel, bestandsnaam, storage_path, mimetype')
  .order('volgorde')

if (error) throw error

let gelukt = 0
for (const b of bijlagen ?? []) {
  const bron = path.join(map, b.bestandsnaam)
  if (!fs.existsSync(bron)) {
    console.warn(`OVERGESLAGEN  ${b.titel} — niet gevonden: ${bron}`)
    continue
  }

  const bytes = fs.readFileSync(bron)
  const { error: uploadFout } = await db.storage
    .from(BUCKET)
    .upload(b.storage_path, bytes, { contentType: b.mimetype, upsert: true })

  if (uploadFout) {
    console.error(`MISLUKT       ${b.titel} — ${uploadFout.message}`)
    continue
  }

  // De grootte pas na een geslaagde upload wegschrijven: het getal onder de
  // titel in de app hoort bij een bestand dat er ook echt is.
  await db
    .from('personeelshandboek_bijlagen')
    .update({ grootte: bytes.length })
    .eq('id', b.id)

  console.log(`OK            ${b.titel} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`)
  gelukt++
}

console.log(`\n${gelukt} van ${bijlagen?.length ?? 0} bijlagen geüpload.`)
