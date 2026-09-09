'use server'

/**
 * Mailen over uitvragen: de prijsaanvraag zelf en de rappel erop.
 *
 * Volgt de verzendflow van `verstuurBestelling`: concept ophalen → gebruiker past aan → versturen via
 * Graph namens de ingelogde medewerker → pas ná een geslaagde verzending de administratie bijwerken.
 * Die volgorde is essentieel. Andersom ("vast bijwerken, dan mailen") staat er een `aangevraagd_op` op
 * een uitvraag die nooit is verstuurd, en zit je te wachten op een offerte die niemand kan sturen.
 *
 * TESTEN ZONDER EXTERNE PARTIJEN TE MAILEN: zet `MAIL_OMLEIDEN_NAAR` in `.env.local`. Alle
 * geadresseerden worden dan vervangen door dat ene adres en het onderwerp krijgt een [TEST]-voorvoegsel
 * met de oorspronkelijke ontvangers erin. Bewust alléén hier en niet in `verstuurMailNamensMedewerker`:
 * dat is de gedeelde verzendlaag van offertes, bestellingen en opleveringen, en die pas je niet aan
 * voor een test.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie, getCurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import { vulMailTekst, netteRegel } from '@/lib/mail/sjabloontekst'
import { getMailSjabloonTekst } from '@/lib/mail/sjabloon-bron'
import { bouwUitvraagMailHtml, type UitvraagMailRegel } from '@/lib/mail/uitvraag-mail'

/** dd-mm-jjjj uit een ISO-datum. */
function nlDatum(iso?: string | null): string {
  if (!iso) return ''
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso
}

function splitsAdressen(v?: string | null): string[] {
  return (v ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
}

function werkadresVan(d: {
  werkadres_straat?: string | null; werkadres_huisnummer?: string | null
  werkadres_postcode?: string | null; werkadres_stad?: string | null
} | null): string | null {
  if (!d) return null
  // LET OP: de kolom heet `werkadres_stad`, niet `werkadres_plaats`. Met de verkeerde naam faalt de
  // hele select stilzwijgend — dezelfde valkuil die eerder de bestellingsmail leeg maakte.
  return [
    [d.werkadres_straat, d.werkadres_huisnummer].filter(Boolean).join(' '),
    [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null
}

/** Omleiding voor testen; leeg in productie. */
function omleiding(): string | null {
  const v = (process.env.MAIL_OMLEIDEN_NAAR ?? '').trim()
  return v.includes('@') ? v : null
}

/**
 * Verstuurt één mail namens de medewerker, met de testomleiding erin verwerkt.
 * Gooit bij mislukking (net als de onderliggende Graph-laag), zodat elke aanroeper zelf beslist of
 * dat één regel of één partij raakt.
 */
async function verstuur(
  medewerkerId: string,
  input: { to: string[]; cc: string[]; onderwerp: string; bodyHtml: string },
): Promise<void> {
  const naar = omleiding()
  const { verstuurMailNamensMedewerker } = await import('@/lib/o365/mail')
  await verstuurMailNamensMedewerker(medewerkerId, {
    to: naar ? [naar] : input.to,
    cc: naar ? [] : input.cc,
    subject: naar
      ? `[TEST → ${[...input.to, ...input.cc].join(', ')}] ${input.onderwerp}`
      : input.onderwerp,
    bodyHtml: input.bodyHtml,
  })
}

/* ─── concept voor één uitvraag ───────────────────────────────────── */

export type UitvraagMailConcept = {
  to: string
  onderwerp: string
  bericht: string
  /** False = geen bekend adres; het venster wijst de gebruiker er dan op. */
  heeftAdres: boolean
  relatieId: string | null
  partijNaam: string
  /** 'uitvraag' bij de eerste mail, 'rappel' zodra er al is uitgevraagd. */
  soort: 'uitvraag' | 'rappel'
}

export async function getUitvraagMailConcept(uitvraagId: string): Promise<UitvraagMailConcept> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: uv } = await db
    .from('dossier_uitvragen')
    .select('*, relaties(id, naam, email)')
    .eq('id', uitvraagId)
    .maybeSingle()
  if (!uv) throw new Error('Uitvraag niet gevonden.')

  const { data: dossier } = await db
    .from('dossiers')
    .select('dossiernummer, titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', uv.dossier_id)
    .maybeSingle()

  // Al eerder gemaild → dit wordt een rappel, met de tekst en het adres van die vorige keer.
  const soort: 'uitvraag' | 'rappel' = uv.aangevraagd_op ? 'rappel' : 'uitvraag'
  const bron = await getMailSjabloonTekst(soort === 'rappel' ? 'uitvraag_rappel' : 'uitvraag')

  const vars: Record<string, string> = {
    'partij.naam': uv.partij_naam ?? '',
    'discipline': uv.discipline ?? '',
    'onderdeel': uv.discipline ?? '',
    'dossier.nummer': dossier?.dossiernummer ?? '',
    'dossier.titel': dossier?.titel ?? '',
    'dossier.werkadres': werkadresVan(dossier) ?? '',
    'dossier.plaats': dossier?.werkadres_stad ?? '',
    'reactie.uiterlijk': nlDatum(uv.reactie_uiterlijk),
  }

  // Prefill: het adres van de vórige mail wint van het algemene adres. Grote leveranciers hebben per
  // regio een andere contactpersoon; zonder dit belandt de rappel op info@ en verdwijnt hij.
  const eerder: string[] = Array.isArray(uv.laatst_gemaild_naar) ? uv.laatst_gemaild_naar : []
  const to = eerder.length > 0 ? eerder.join('; ') : (uv.relaties?.email ?? '')

  return {
    to,
    onderwerp: netteRegel(vulMailTekst(bron.onderwerp, vars)),
    bericht: vulMailTekst(bron.tekst, vars),
    heeftAdres: !!to,
    relatieId: uv.relatie_id ?? null,
    partijNaam: uv.partij_naam ?? '',
    soort,
  }
}

/* ─── versturen: één uitvraag ─────────────────────────────────────── */

export type VerstuurResultaat = { ok: true; soort: 'uitvraag' | 'rappel' } | { ok: false; error: string }

export async function verstuurUitvraagMail(
  uitvraagId: string,
  input: { to: string; cc?: string; onderwerp: string; bericht: string },
): Promise<VerstuurResultaat> {
  await vereisSessie()
  const medewerker = await getCurrentMedewerker().catch(() => null)
  if (!medewerker) return { ok: false, error: 'Geen ingelogde medewerker gevonden om namens te versturen.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: uv } = await db
    .from('dossier_uitvragen')
    .select('id, dossier_id, discipline, status, aangevraagd_op, rappels, reactie_uiterlijk')
    .eq('id', uitvraagId)
    .maybeSingle()
  if (!uv) return { ok: false, error: 'Uitvraag niet gevonden.' }
  // Ook mailen valt onder "bewerken": over een afgesloten dossier hoor je niets meer uit te vragen.
  await assertDossierBewerkbaar(uv.dossier_id)

  const to = splitsAdressen(input.to)
  if (to.length === 0) return { ok: false, error: 'Vul een e-mailadres in.' }

  const { data: dossier } = await db
    .from('dossiers')
    .select('dossiernummer, titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', uv.dossier_id)
    .maybeSingle()

  const isRappel = !!uv.aangevraagd_op
  const regel: UitvraagMailRegel = {
    project: [dossier?.dossiernummer, dossier?.titel].filter(Boolean).join(' — '),
    discipline: uv.discipline,
    aangevraagdOp: nlDatum(uv.aangevraagd_op),
    reactieUiterlijk: nlDatum(uv.reactie_uiterlijk),
  }

  try {
    await verstuur(medewerker.id, {
      to,
      cc: splitsAdressen(input.cc),
      onderwerp: input.onderwerp,
      bodyHtml: bouwUitvraagMailHtml({
        soort: isRappel ? 'rappel' : 'uitvraag',
        bericht: input.bericht,
        regels: [regel],
        werkadres: werkadresVan(dossier),
      }),
    })
  } catch (e) {
    // Mail mislukt → de uitvraag blijft ongewijzigd, zodat hij gewoon opnieuw te versturen is.
    return { ok: false, error: `Mail versturen mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}` }
  }

  const nu = new Date()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const velden: Record<string, any> = {
    laatst_gemaild_naar: to,
    updated_at: nu.toISOString(),
  }
  if (isRappel) {
    velden.rappels = (uv.rappels ?? 0) + 1
    velden.laatst_gerappelleerd_op = nu.toISOString()
  } else {
    // Lokale datum, niet toISOString: dat zou 's avonds een dag terugschuiven.
    const mm = String(nu.getMonth() + 1).padStart(2, '0')
    const dd = String(nu.getDate()).padStart(2, '0')
    velden.aangevraagd_op = `${nu.getFullYear()}-${mm}-${dd}`
    if (uv.status === 'ingetrokken' || uv.status === 'afgevallen') velden.status = 'open'
  }

  await db.from('dossier_uitvragen').update(velden).eq('id', uitvraagId)
  for (const sectie of ['aanvragen', 'offertes', 'opdrachten']) {
    revalidatePath(`/${sectie}/${uv.dossier_id}/uitvraag`)
  }
  return { ok: true, soort: isRappel ? 'rappel' : 'uitvraag' }
}

/* ─── versturen: rappels in bulk ──────────────────────────────────── */

export type RappelOpdracht = {
  relatieId: string | null
  partijNaam: string
  uitvraagIds: string[]
  to: string
  cc?: string
}

export type RappelUitkomst = {
  partijNaam: string
  ok: boolean
  aantal: number
  error?: string
  /** Mail is de deur uit, maar de administratie kon niet worden bijgewerkt. */
  waarschuwing?: string
}

/**
 * Maximaal aantal partijen per verzendronde. Graph throttelt `/me/sendMail` (circa 30 berichten per
 * minuut per postbus); honderden mails in één klik levert 429's op die er als willekeurige
 * mislukkingen uitzien.
 */
const MAX_PARTIJEN = 20

/**
 * Eén rappelmail per partij, met al hun openstaande uitvragen erin gebundeld.
 *
 * Per partij afgerond: mail versturen → meteen die regels bijwerken → door naar de volgende. Er is
 * geen transactie over Graph heen, dus dit is het enige eerlijke model: klapt partij 4 van 7 eruit,
 * dan zijn 1-3 écht verstuurd én bijgewerkt en blijven 4-7 onaangeraakt en opnieuw te proberen.
 * Nooit eerst alles bijwerken en dan mailen — dan lijkt er gerappelleerd terwijl er niets weg is.
 */
export async function verstuurRappels(
  opdrachten: RappelOpdracht[],
  tekst: { onderwerp: string; bericht: string },
): Promise<{ ok: true; uitkomsten: RappelUitkomst[] } | { ok: false; error: string }> {
  await vereisSessie()
  const medewerker = await getCurrentMedewerker().catch(() => null)
  if (!medewerker) return { ok: false, error: 'Geen ingelogde medewerker gevonden om namens te versturen.' }
  if (opdrachten.length === 0) return { ok: false, error: 'Selecteer minimaal één partij.' }
  if (opdrachten.length > MAX_PARTIJEN) {
    return { ok: false, error: `Maximaal ${MAX_PARTIJEN} partijen per keer; verstuur in porties.` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const uitkomsten: RappelUitkomst[] = []

  // Bewust sequentieel en niet Promise.all: parallel afvuren loopt tegen de Graph-throttling aan.
  for (const opdracht of opdrachten) {
    const to = splitsAdressen(opdracht.to)
    if (to.length === 0) {
      uitkomsten.push({ partijNaam: opdracht.partijNaam, ok: false, aantal: opdracht.uitvraagIds.length, error: 'Geen e-mailadres.' })
      continue
    }

    // De regels opnieuw uit de database lezen in plaats van de client te geloven: die stuurt alleen
    // ids, en tussen het openen van het venster en het verzenden kan er een offerte zijn binnengekomen.
    const { data: rijen } = await db
      .from('dossier_uitvragen')
      .select('id, dossier_id, discipline, aangevraagd_op, reactie_uiterlijk, rappels, status, dossiers(dossiernummer, titel)')
      .in('id', opdracht.uitvraagIds.slice(0, 200))
      .eq('status', 'open')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actueel = (rijen ?? []) as any[]
    if (actueel.length === 0) {
      uitkomsten.push({ partijNaam: opdracht.partijNaam, ok: false, aantal: 0, error: 'Niets meer openstaand.' })
      continue
    }

    const regels: UitvraagMailRegel[] = actueel.map(r => ({
      project: [r.dossiers?.dossiernummer, r.dossiers?.titel].filter(Boolean).join(' — '),
      discipline: r.discipline,
      aangevraagdOp: nlDatum(r.aangevraagd_op),
      reactieUiterlijk: nlDatum(r.reactie_uiterlijk),
    }))

    const vars: Record<string, string> = { 'partij.naam': opdracht.partijNaam, 'aantal': String(actueel.length) }

    try {
      await verstuur(medewerker.id, {
        to,
        cc: splitsAdressen(opdracht.cc),
        onderwerp: netteRegel(vulMailTekst(tekst.onderwerp, vars)),
        bodyHtml: bouwUitvraagMailHtml({
          soort: 'rappel',
          bericht: vulMailTekst(tekst.bericht, vars),
          regels,
        }),
      })
    } catch (e) {
      uitkomsten.push({
        partijNaam: opdracht.partijNaam, ok: false, aantal: actueel.length,
        error: e instanceof Error ? e.message : 'onbekende fout',
      })
      continue
    }

    // Mail is weg. Lukt het bijwerken niet, dan is dat een waarschuwing en geen fout: de gebruiker mag
    // niet gaan denken dat hij opnieuw moet versturen.
    let waarschuwing: string | undefined
    try {
      const nu = new Date().toISOString()
      for (const r of actueel) {
        await db.from('dossier_uitvragen').update({
          rappels: (r.rappels ?? 0) + 1,
          laatst_gerappelleerd_op: nu,
          laatst_gemaild_naar: to,
          updated_at: nu,
        }).eq('id', r.id)
      }
      for (const sectie of ['aanvragen', 'offertes', 'opdrachten']) {
        for (const id of new Set(actueel.map(r => r.dossier_id))) {
          revalidatePath(`/${sectie}/${id}/uitvraag`)
        }
      }
    } catch {
      waarschuwing = 'Verstuurd, maar niet vastgelegd in EVA.'
    }

    uitkomsten.push({ partijNaam: opdracht.partijNaam, ok: true, aantal: actueel.length, waarschuwing })
  }

  return { ok: true, uitkomsten }
}
