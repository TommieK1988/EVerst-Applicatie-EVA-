'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import {
  FASE_PLAATSINGEN, faseVanDossier, isServicedeskCategorie, SERVICEDESK_CATEGORIEEN,
  type DossierFase,
} from '@/components/dossiers/fase-plaatsing'

/**
 * dossiers/fase-verplaatsen.ts
 *
 * Een bestaand dossier naar een andere fase brengen: Aanvraag, Opdracht of
 * Servicedesk.
 *
 * WAAROM APART VAN `updateDossierSubstatus`
 * Die functie verhuist al tussen Aanvraag en Offerte: kies je daar een substatus uit
 * de andere ladder, dan gaat het dossier mee. Naar Opdracht en naar Servicedesk kan
 * dat niet -- die hebben elk hun eigen substatuskolom, en de check-constraint op
 * `dossiers` eist dat precies de kolom van de hoofdstatus gevuld is. Daarom gaan hier
 * alle vier de kolommen in één update.
 *
 * DIT IS EEN CORRECTIE, GEEN PROCESSTAP
 * De gewone weg naar een opdracht loopt via een offerte op Gewonnen. Die trekt
 * `neemWerkbegrotingOverStil` en `stuurAanneemsomNaarBouw7Intern` mee, en zet de
 * opdrachtdatum. Deze functie doet daar niets van: hij verplaatst het dossier en
 * verder niets. Bedoeld voor "dit is bij de intake als aanvraag ingeschreven en het
 * was een opdracht", niet voor "de klant heeft getekend". De aanroeper hoort dat in
 * de bevestiging te zeggen; `GEVOLGEN_BIJ_OPDRACHT` levert de tekst.
 *
 * WAT WEL MEEKOMT
 * De opdrachtdatum: de databasetrigger `tg_dossier_procesdatums` stempelt die zodra
 * de hoofdstatus op `opdracht` komt.
 */

export type VerplaatsResultaat =
  | { ok: true; bouw7Ok: boolean; bouw7Fout: string | null }
  | { ok: false; fout: string }

/**
 * Verplaatst een dossier naar `doel` en zet de bijbehorende Bouw7-projectstatus.
 *
 * De substatus wordt de openingswaarde van de doelfase. Dat is bewust grof: de
 * ladders van de drie fases delen geen sleutels, dus er is niets om een bestaande
 * positie op te vertalen. Wie halverwege verplaatst, begint in de nieuwe fase
 * vooraan -- en dat is beter dan een gokje dat er plausibel uitziet.
 */
export async function verplaatsDossierNaarFase(
  dossierId: string,
  doel: DossierFase,
): Promise<VerplaatsResultaat> {
  await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const supabase = createAdminClient()
  const plaatsing = FASE_PLAATSINGEN[doel]

  const { data: d, error: leesFout } = await supabase
    .from('dossiers')
    .select('id, hoofdstatus, servicedesk_substatus, bouw7_id, bouw7_categorie_naam')
    .eq('id', dossierId)
    .maybeSingle()

  if (leesFout) return { ok: false, fout: leesFout.message }
  if (!d) return { ok: false, fout: 'Dossier niet gevonden.' }

  const huidig = faseVanDossier(d)
  if (huidig === doel) return { ok: false, fout: `Dit dossier staat al in fase ${plaatsing.fase}.` }

  // ── De categorie beslist over de servicedesk ──────────────────────────────
  // Niet onderhandelbaar: `getDossiersVoorServicedesk` filtert op deze twee namen
  // en `mapBouw7NaarEvaStatus` dwingt ze bij elke sync-ronde terug naar de
  // servicedeskladder. Een verplaatsing die daarmee botst houdt het tot de volgende
  // sync en draait dan terug zonder dat iemand het ziet.
  const servicedeskCategorie = isServicedeskCategorie(d.bouw7_categorie_naam)
  if (doel === 'servicedesk' && !servicedeskCategorie) {
    return {
      ok: false,
      fout: `De categorie moet eerst ${SERVICEDESK_CATEGORIEEN.join(' of ')} zijn; nu staat er ` +
        `${d.bouw7_categorie_naam ? `"${d.bouw7_categorie_naam}"` : 'geen categorie'}. ` +
        'Wijzig die op het Informatie-tabblad en probeer het opnieuw.',
    }
  }
  if (doel !== 'servicedesk' && servicedeskCategorie) {
    return {
      ok: false,
      fout: `Categorie "${d.bouw7_categorie_naam}" hoort bij de servicedesk. Kies eerst een andere ` +
        'categorie -- anders zet de eerstvolgende Bouw7-sync het dossier daar toch weer neer.',
    }
  }

  // Eerst Bouw7, dan EVA. Andersom levert een dossier op dat in EVA verhuisd is
  // terwijl het Bouw7-project achterblijft; dan wint de lees-sync en staat het de
  // volgende ochtend weer terug, zonder spoor van waarom.
  let bouw7Ok = true
  let bouw7Fout: string | null = null
  if (plaatsing.bouw7Via && d.bouw7_id) {
    const { schrijfBouw7Projectstatus } = await import('@/lib/dossiers/bouw7-status')
    const res = await schrijfBouw7Projectstatus(d.bouw7_id, plaatsing.bouw7Via)
    bouw7Ok = res.ok
    bouw7Fout = res.ok ? null : res.error
  } else if (plaatsing.bouw7Via && !d.bouw7_id) {
    bouw7Ok = false
    bouw7Fout = 'Dit dossier staat niet in Bouw7; daar is de projectstatus niet gewijzigd.'
  }

  const { error } = await supabase
    .from('dossiers')
    .update({
      hoofdstatus:           plaatsing.kolommen.hoofdstatus,
      aanvraag_substatus:    plaatsing.kolommen.aanvraag_substatus,
      opdracht_substatus:    plaatsing.kolommen.opdracht_substatus,
      servicedesk_substatus: plaatsing.kolommen.servicedesk_substatus,
      ...(bouw7Ok ? {} : { bouw7_sync_status: 'error', bouw7_sync_fout: bouw7Fout }),
    } as never)
    .eq('id', dossierId)

  if (error) return { ok: false, fout: error.message }

  // De doorlooptijd-per-fase leest uit deze historie; een verplaatsing die er niet
  // in staat maakt de vorige fase kunstmatig lang.
  const { logSubstatusHistorie } = await import('@/lib/dossiers/actions')
  await logSubstatusHistorie(
    dossierId,
    plaatsing.kolommen.servicedesk_substatus
      ?? plaatsing.kolommen.opdracht_substatus
      ?? plaatsing.kolommen.aanvraag_substatus
      ?? 'nieuw',
    'handmatig',
  ).catch(() => {})

  // De actielijsten hangen aan de fase: een dossier dat nu een opdracht is hoort de
  // opdracht-triggers te krijgen.
  const { verwerkDossierTriggers } = await import('@/app/(platform)/taken/actions/sjablonen')
  await verwerkDossierTriggers(dossierId).catch(() => {})

  for (const pad of ['/aanvragen', '/offertes', '/opdrachten', '/servicedesk']) revalidatePath(pad)
  return { ok: true, bouw7Ok, bouw7Fout }
}
