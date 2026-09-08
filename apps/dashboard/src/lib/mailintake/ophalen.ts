/**
 * mailintake/ophalen.ts
 *
 * Stap 1 van de pijplijn: berichten en bijlagen uit de postbussen halen en
 * vastleggen. Verder niets — geen AI, geen besluiten. Die scheiding is er omdat
 * dit deel snel en betrouwbaar moet zijn, en het volgende deel traag en duur.
 *
 * Idempotent via de unieke index (postbus_id, internet_message_id). De poll
 * overlapt bewust 30 minuten; dubbel ophalen is daardoor een no-op in plaats van
 * een risico.
 */

import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@everts/database/server'

import { cronLogboek } from '@/lib/cron/logboek'
import {
  haalNieuweBerichten, haalBijlageMeta, haalBijlageBytes, MAX_BIJLAGE_BYTES,
  type GraphBericht,
} from '@/lib/o365/inbox'

import { triageer } from './triage'
import { berichtTekst } from './prompt'
import type { PostbusRij } from './types'

/** Per run per postbus, zodat één volle postbus de andere twee niet blokkeert. */
const MAX_PER_POSTBUS = 10

export interface OphaalResultaat {
  postbus: string
  opgehaald: number
  nieuw: number
  overgeslagen: number
  bijlagen: number
  fout: string | null
}

async function haalNegeerlijst(): Promise<Set<string>> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('mailintake_aliassen').select('patroon').eq('soort', 'negeer').limit(500)
  return new Set((data ?? []).map((r: any) => String(r.patroon).toLowerCase()))
}

/**
 * Slaat één bericht op. Geeft het id terug, of null als het er al stond.
 * De insert gaat via `upsert ... ignoreDuplicates`: dat is de plek waar de
 * overlap van de poll wordt opgevangen.
 */
async function bewaarBericht(
  postbus: PostbusRij,
  bericht: GraphBericht,
  negeerlijst: Set<string>,
): Promise<{ id: string; nieuw: boolean } | null> {
  const supabase = createAdminClient() as any

  // Zonder internetMessageId hebben we geen stabiele sleutel; val terug op een
  // hash van afzender + tijd + onderwerp. Zeldzaam, maar niet onmogelijk.
  const sleutel = bericht.internetMessageId
    ?? '<' + createHash('sha256')
      .update(`${bericht.from ?? ''}|${bericht.ontvangenOp}|${bericht.subject ?? ''}`)
      .digest('hex').slice(0, 32) + '@eva-fallback>'

  const triage = triageer(bericht, negeerlijst)
  const tekst = berichtTekst(bericht)

  const rij = {
    postbus_id: postbus.id,
    graph_message_id: bericht.id,
    internet_message_id: sleutel,
    conversation_id: bericht.conversationId,
    onderwerp: bericht.subject,
    van_naam: bericht.fromNaam,
    van_adres: bericht.from,
    aan: bericht.to,
    cc: bericht.cc,
    ontvangen_op: bericht.ontvangenOp,
    body_tekst: tekst.slice(0, 40_000),
    body_preview: (bericht.bodyPreview ?? '').slice(0, 500),
    is_automatisch_antwoord: triage.isAutomatischAntwoord,
    is_antwoord: triage.isAntwoord,
    heeft_bijlagen: bericht.heeftBijlagen,
    // Wat de goedkope triage al zeker weet, hoeft niet langs het model.
    status: triage.uitgesloten ? 'geen_aanvraag' : 'nieuw',
    soort: triage.uitgesloten ? 'overig_geen_werk' : null,
    soort_vertrouwen: triage.uitgesloten ? 1 : null,
    samenvatting: triage.reden,
    besluit: triage.uitgesloten ? 'geen_aanvraag' : null,
  }

  const { data, error } = await supabase
    .from('mailintake_berichten')
    .upsert(rij, { onConflict: 'postbus_id,internet_message_id', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Bericht opslaan mislukt: ${error.message}`)
  if (!data) return null // stond er al

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: data.id,
    actor: 'systeem',
    actie: triage.uitgesloten ? 'triage_uitgesloten' : 'opgehaald',
    details: { postbus: postbus.sleutel, reden: triage.reden, onderwerp: bericht.subject },
  })

  return { id: data.id, nieuw: true }
}

/** Haalt de bijlagen van één bericht op en zet ze in de bucket. */
async function bewaarBijlagen(
  postbusAdres: string,
  berichtId: string,
  graphBerichtId: string,
  postbusSleutel: string,
): Promise<number> {
  const supabase = createAdminClient() as any
  const meta = await haalBijlageMeta(postbusAdres, graphBerichtId)
  let aantal = 0

  for (const b of meta) {
    // Handtekening-logo's zijn ruis; die kosten opslag en zeggen niets.
    if (b.isInline) continue

    const teGroot = b.grootte > MAX_BIJLAGE_BYTES || b.isItem
    let opslagPad: string | null = null
    let sha: string | null = null

    if (!teGroot) {
      try {
        // Eén bijlage tegelijk in het geheugen: base64 van 25 MB is ~34 MB
        // bovenop de buffer, en dat past niet drie keer in een functie.
        const bytes = await haalBijlageBytes(postbusAdres, graphBerichtId, b.id)
        sha = createHash('sha256').update(bytes).digest('hex')
        const veiligeNaam = b.naam.replace(/[^\w.() -]/g, '_').slice(0, 120)
        opslagPad = `${postbusSleutel}/${berichtId}/${veiligeNaam}`
        const { error } = await supabase.storage
          .from('mail-intake')
          .upload(opslagPad, bytes, { contentType: b.contentType ?? 'application/octet-stream', upsert: true })
        if (error) {
          opslagPad = null
        }
      } catch {
        opslagPad = null
      }
    }

    const { error } = await supabase.from('mailintake_bijlagen').upsert({
      bericht_id: berichtId,
      graph_attachment_id: b.id,
      bestandsnaam: b.naam,
      content_type: b.contentType,
      grootte_bytes: b.grootte,
      is_inline: false,
      sha256: sha,
      opslag_pad: opslagPad,
      te_groot: teGroot,
    }, { onConflict: 'bericht_id,graph_attachment_id', ignoreDuplicates: true })
    if (!error) aantal++
  }

  return aantal
}

/** Haalt één postbus leeg (tot MAX_PER_POSTBUS). */
export async function haalPostbusOp(postbus: PostbusRij): Promise<OphaalResultaat> {
  const supabase = createAdminClient() as any
  const log = cronLogboek(`mailintake-ophalen:${postbus.sleutel}`)
  const uit: OphaalResultaat = { postbus: postbus.sleutel, opgehaald: 0, nieuw: 0, overgeslagen: 0, bijlagen: 0, fout: null }

  try {
    const negeerlijst = await haalNegeerlijst()

    log.stap('berichten ophalen', { adres: postbus.adres })
    const berichten = await haalNieuweBerichten(
      postbus.adres, postbus.map_id, postbus.laatste_ophaal_gelukt_op, MAX_PER_POSTBUS,
    )
    uit.opgehaald = berichten.length

    for (const bericht of berichten) {
      const bewaard = await bewaarBericht(postbus, bericht, negeerlijst)
      if (!bewaard) { uit.overgeslagen++; continue }
      uit.nieuw++

      if (bericht.heeftBijlagen) {
        log.stap('bijlagen ophalen', { onderwerp: (bericht.subject ?? '').slice(0, 60) })
        try {
          uit.bijlagen += await bewaarBijlagen(postbus.adres, bewaard.id, bericht.id, postbus.sleutel)
        } catch (e) {
          // Bijlagen missen is vervelend maar niet fataal; het bericht staat er.
          await supabase.from('mailintake_besluiten').insert({
            bericht_id: bewaard.id, actor: 'systeem', actie: 'bijlagen_mislukt',
            details: { fout: e instanceof Error ? e.message : String(e) },
          })
        }
      }
    }

    // Alleen bij een geslaagde ronde het venster opschuiven. Zou dit ook bij een
    // fout gebeuren, dan slaan we bij een storing stil berichten over.
    const nu = new Date().toISOString()
    await supabase.from('mailintake_postbussen').update({
      laatste_ophaal_op: nu,
      laatste_ophaal_gelukt_op: berichten.length
        ? berichten[berichten.length - 1].ontvangenOp
        : (postbus.laatste_ophaal_gelukt_op ?? nu),
      laatste_fout: null,
    }).eq('id', postbus.id)

    log.klaar({ nieuw: uit.nieuw, overgeslagen: uit.overgeslagen })
    return uit
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e)
    uit.fout = melding
    await supabase.from('mailintake_postbussen').update({
      laatste_ophaal_op: new Date().toISOString(),
      laatste_fout: melding.slice(0, 500),
    }).eq('id', postbus.id)
    log.mislukt(e)
    return uit
  }
}

/** Haalt alle actieve postbussen op. */
export async function haalAllePostbussenOp(): Promise<OphaalResultaat[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('mailintake_postbussen').select('*').eq('actief', true).order('sleutel').limit(20)

  const uit: OphaalResultaat[] = []
  for (const p of (data ?? []) as PostbusRij[]) {
    uit.push(await haalPostbusOp(p))
  }
  return uit
}
