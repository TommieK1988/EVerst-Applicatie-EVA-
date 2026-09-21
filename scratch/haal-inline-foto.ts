/**
 * Eenmalige controle: pikt de nieuwe zeef de ingesloten foto's van een bestaand
 * bericht alsnog op?
 *
 *   npx tsx scratch/haal-inline-foto.ts <bericht-id>
 *
 * Schrijft alleen naar `mailintake_bijlagen` en de bucket -- geen dossier, geen
 * Bouw7, geen AI-kosten.
 */
import fs from 'node:fs'
import path from 'node:path'

// Geen dotenv in deze monorepo; .env.local met de hand inlezen.
const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Geef een bericht-id mee.')

  const { createAdminClient } = await import('@everts/database/server')
  const supabase = createAdminClient()

  const voor = await supabase.from('mailintake_bijlagen')
    .select('bestandsnaam').eq('bericht_id', id)
  console.log(`vooraf: ${voor.data?.length ?? 0} bijlagen`)

  const { haalBijlagenOpnieuwOp } = await import('../apps/dashboard/src/lib/mailintake/ophalen')
  const aantal = await haalBijlagenOpnieuwOp(id)
  console.log(`opnieuw opgehaald: ${aantal}`)

  const na = await supabase.from('mailintake_bijlagen')
    .select('bestandsnaam, is_inline, grootte_bytes, content_type, opslag_pad')
    .eq('bericht_id', id).order('bestandsnaam')

  const { beoordeelBijlage } = await import('../apps/dashboard/src/lib/mailintake/bijlagen-filter')
  for (const b of na.data ?? []) {
    const o = beoordeelBijlage({
      bestandsnaam: b.bestandsnaam, contentType: b.content_type,
      grootteBytes: b.grootte_bytes, isInline: Boolean(b.is_inline),
    })
    const kb = Math.round((b.grootte_bytes ?? 0) / 1024)
    console.log(
      `  ${b.is_inline ? 'inline ' : 'bijlage'} ${b.bestandsnaam.padEnd(34)} ${String(kb).padStart(6)} kB` +
      `  map=${o.mee ? 'ja ' : 'nee'} lezen=${o.meelezen ? 'ja ' : 'nee'}  ${o.reden ?? ''}` +
      `${b.opslag_pad ? '' : '  [NIET OPGESLAGEN]'}`,
    )
  }
}

void main().catch(e => { console.error(e); process.exit(1) })
