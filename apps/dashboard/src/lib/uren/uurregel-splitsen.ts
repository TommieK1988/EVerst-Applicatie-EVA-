'use server'

// Een urenregel splitsen, of er een regel bij zetten -- door de goedkeurder.
//
// Corrigeren (`corrigeerUurregel`) verandert één regel. Maar een dag die over twee dossiers, twee
// bewakingscodes of twee uursoorten verdeeld had moeten worden is met één regel niet recht te
// zetten: daar zijn er twee voor nodig. Typisch: acht uur op het ene dossier, waarvan er drie
// eigenlijk bij het buurdossier horen; of een hele dag gewerkt terwijl er twee reisuren in zaten.
//
// Twee smaken, één actie:
//   splitsen  (`aftrekken: true`)  -- de nieuwe regel krijgt X uur, de bestaande gaat X omlaag.
//                                     Het dagtotaal blijft gelijk.
//   erbij     (`aftrekken: false`) -- de nieuwe regel komt bovenop de bestaande; voor uren die
//                                     de medewerker vergat (reisuren, een uur meerwerk).
//
// DE VOLGORDE IS BEWUST: EERST AANMAKEN, DAN VERLAGEN. Bouw7 heeft geen transactie over twee
// regels heen. Mislukt het aanmaken, dan is er niets veranderd. Mislukt daarna het verlagen, dan
// verwijderen we de nieuwe regel weer. Andersom -- eerst verlagen -- zou bij een mislukte tweede
// stap uren laten verdwijnen, en uren die weg zijn ziet niemand; dubbele uren vallen op.
//
// WIE MAG. Dezelfde toets als corrigeren (`bewerkrecht`): de regel waar je mee begint moet door
// jou aan te passen zijn. Zo kan een goedkeurder alleen regels maken op een dag van een medewerker
// die hij toch al aan het beoordelen is -- niet uit het niets uren boeken voor wie dan ook.
//
// DE NIEUWE REGEL GAAT DOOR DE KETEN. Hij komt als niet goedgekeurd in Bouw7, met de route die bij
// zijn eigen dossier en uursoort hoort. Eén uitzondering: wordt er gesplitst binnen hetzelfde
// dossier en had de teamleider de oorspronkelijke regel al goedgekeurd, dan neemt het afgesplitste
// deel dat akkoord mee -- de teamleider heeft die uren gezien, ze stonden alleen op één regel.
// Uren die erbij komen heeft hij niet gezien; die beginnen gewoon bij hem.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getBouw7Client } from '@/lib/bouw7/sync'
import {
  vindBewerkbareRegel, maakHourLog, schrijfHourLog, bewaarBeoordeling, leesTeamleiderAkkoord,
  verversUrenVensterLater,
} from './hourlog-schrijven'
import { verwijderUitBouw7 } from './wijzigen-na-indienen'
import { rondUren } from './rekenregel'

export type SplitsInvoer = {
  /** Uren op de nieuwe regel. */
  uren: number
  /** Waar: de uren gaan van de bestaande regel af. Onwaar: ze komen erbij. */
  aftrekken: boolean
  /** Bouw7 hourType-id; weglaten = dezelfde uursoort als de bestaande regel. */
  uursoortHourTypeId?: number
  /** EVA-dossier; weglaten = hetzelfde dossier als de bestaande regel. */
  naarDossierId?: string
  /** Weglaten = dezelfde code als de bestaande regel (alleen op hetzelfde dossier). */
  bewakingscodePslId?: number | null
  opmerking?: string
}

export async function splitsUurregel(
  hourLogId: number,
  invoer: SplitsInvoer,
): Promise<{ ok: true; nieuwId: number } | { ok: false; error: string }> {
  const ik = await vereisSessie()

  const gevonden = await vindBewerkbareRegel(hourLogId, ik.id)
  if (!gevonden.ok) return gevonden
  const bron = gevonden.regel

  const uren = rondUren(Number(invoer.uren))
  if (!(uren > 0 && uren <= 24)) return { ok: false, error: 'Vul voor de nieuwe regel een aantal uren tussen 0 en 24 in.' }
  const rest = rondUren(bron.uren - uren)
  if (invoer.aftrekken && rest <= 0) {
    return {
      ok: false,
      error: `Er staat ${bron.uren} uur op deze regel; bij splitsen moet daar iets van overblijven. Wil je alles verplaatsen, pas dan de regel zelf aan.`,
    }
  }
  if (!bron.bouw7MedewerkerId || !bron.datum) {
    return { ok: false, error: 'Bij deze uurregel ontbreekt de medewerker of de datum in Bouw7.' }
  }

  const supabase = createAdminClient()

  // Uursoort: als Bouw7-id binnen, dus toetsen aan de stamlijst -- een id uit de browser mag geen
  // willekeurige uursoort in Bouw7 kunnen aanwijzen.
  let hourTypeId = bron.uursoortId
  let uursoortNaam = bron.uursoort
  if (invoer.uursoortHourTypeId !== undefined && invoer.uursoortHourTypeId !== bron.uursoortId) {
    const { data: soort } = await supabase
      .from('planning_uursoorten').select('naam')
      .eq('bouw7_id', String(invoer.uursoortHourTypeId)).maybeSingle()
    if (!soort) return { ok: false, error: 'Deze uursoort bestaat niet in EVA.' }
    hourTypeId = invoer.uursoortHourTypeId
    uursoortNaam = soort.naam
  }
  if (!hourTypeId) return { ok: false, error: 'De uursoort van deze regel is onbekend; kies er een.' }

  // Dossier: alleen een dossier dat Bouw7 kent, want daar moet de regel landen. Het hoeft niet van
  // mij te zijn -- waar de uren thuishoren bepaalt het werk, niet mijn rollenlijst.
  let projectId = bron.bouw7ProjectId
  let dossierId = bron.dossierId
  let dossierLabel = [bron.projectNummer, bron.projectNaam].filter(Boolean).join(' · ') || null
  const anderDossier = invoer.naarDossierId !== undefined && invoer.naarDossierId !== bron.dossierId
  if (anderDossier) {
    const { data: doel } = await supabase
      .from('dossiers').select('id, bouw7_id, dossiernummer, titel')
      .eq('id', invoer.naarDossierId!).maybeSingle()
    if (!doel) return { ok: false, error: 'Het gekozen dossier bestaat niet.' }
    const pid = Number(doel.bouw7_id)
    if (!doel.bouw7_id || Number.isNaN(pid)) {
      return { ok: false, error: 'Dit dossier is niet aan Bouw7 gekoppeld; daar kunnen geen uren op.' }
    }
    projectId = pid
    dossierId = doel.id
    dossierLabel = [doel.dossiernummer, doel.titel].filter(Boolean).join(' · ') || null
  }
  if (!projectId) return { ok: false, error: 'Deze regel staat op een project dat EVA niet kent.' }

  // Een bewakingscode hoort bij één project: op een ander dossier gaat de oude niet mee.
  const pslId = invoer.bewakingscodePslId !== undefined ? invoer.bewakingscodePslId
    : anderDossier ? null
    : bron.bouw7PslId

  const client = await getBouw7Client()
  const fout = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Bouw7 is niet bereikbaar.' })

  // 1. De nieuwe regel.
  const nieuw = await maakHourLog(client, {
    projectId,
    employeeId: bron.bouw7MedewerkerId,
    hourTypeId,
    logDate: bron.datum,
    logHours: String(uren),
    pslId,
    comments: invoer.opmerking?.trim() ?? '',
  }).catch(fout)
  if (!nieuw.ok) return { ok: false, error: `De nieuwe regel kon niet worden aangemaakt: ${nieuw.error}` }

  // 2. De bestaande regel verlagen. Lukt dat niet, dan de nieuwe weer weg.
  let voor: Awaited<ReturnType<typeof schrijfHourLog>> | null = null
  if (invoer.aftrekken) {
    voor = await schrijfHourLog(client, hourLogId, { logHours: String(rest) }).catch(fout)
    if (!voor.ok) {
      const reden = voor.error
      try {
        await verwijderUitBouw7([nieuw.id])
      } catch (e) {
        console.error('[uren] afgesplitste regel niet teruggedraaid:', nieuw.id, e)
        return {
          ok: false,
          error: `De oude regel kon niet worden verlaagd (${reden}), en de nieuwe regel van ${uren} uur staat nog in Bouw7. Verwijder die daar, anders tellen de uren dubbel.`,
        }
      }
      return { ok: false, error: `Splitsen is niet gelukt; er is niets veranderd. ${reden}` }
    }
  }

  // 3. Vastleggen wat er gebeurd is. Bouw7 weet niet dat de goedkeurder deze regel maakte.
  const nu = new Date().toISOString()
  if (voor?.ok) {
    await bewaarBeoordeling(hourLogId, bron, {
      gecorrigeerd_op: nu,
      gecorrigeerd_door: ik.id,
      oorspronkelijke_waarden: {
        uren: Number(voor.voor.hours ?? bron.uren),
        bewakingscode: voor.voor.projectSecurityLink?.code ?? null,
        opmerking: voor.voor.comment ?? null,
        uursoort: voor.voor.type?.name ?? null,
        dossier: [bron.projectNummer, bron.projectNaam].filter(Boolean).join(' · ') || null,
      },
      bouw7_status: 'verzonden', bouw7_fout: null,
    })
  }
  const tlAkkoord = invoer.aftrekken && !anderDossier && bron.tlAkkoord
    ? await leesTeamleiderAkkoord(hourLogId)
    : null
  await bewaarBeoordeling(nieuw.id, { medewerkerId: bron.medewerkerId, dossierId, datum: bron.datum }, {
    aangemaakt_op: nu,
    aangemaakt_door: ik.id,
    afgesplitst_van: invoer.aftrekken ? hourLogId : null,
    ...(tlAkkoord ?? {}),
    bouw7_status: 'verzonden', bouw7_fout: null,
  })

  // 4. De medewerker hoort het, net als bij een correctie: het zijn zijn uren.
  if (bron.medewerkerId) {
    const { data: mw } = await supabase
      .from('medewerkers').select('auth_user_id').eq('id', bron.medewerkerId).maybeSingle()
    if (mw?.auth_user_id) {
      const waar = [dossierLabel, uursoortNaam].filter(Boolean).join(', ')
      await maakNotificatie({
        user_id: mw.auth_user_id,
        type: 'uren',
        titel: 'Je uren zijn aangepast',
        body: invoer.aftrekken
          ? `${bron.datum} · ${uren} van je ${bron.uren} uur staan nu op een aparte regel${waar ? ` (${waar})` : ''}.`
          : `${bron.datum} · ${uren} uur toegevoegd${waar ? ` (${waar})` : ''}.`,
        url: '/m/uren',
      }).catch(() => { /* melding is bijzaak */ })
    }
  }

  revalidatePath('/uren')
  await verversUrenVensterLater()
  return { ok: true, nieuwId: nieuw.id }
}
