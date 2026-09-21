import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { INTAKE_PLAATSINGEN, type IntakeFase } from './types'

/**
 * mailintake/fase.ts
 *
 * Zet een zojuist aangemaakt dossier in de gekozen fase.
 *
 * WAAROM DIT NA `maakAanvraag` GEBEURT EN NIET ERIN
 * `maakAanvraag` is het gedeelde pad voor élke nieuwe aanvraag in EVA -- de
 * aanvraagmodal, de intake, de scripts. Het zet altijd Aanvraag/Nieuw neer en het
 * Bouw7-project op "01. Offerte". Daar een fase-argument in bouwen zou betekenen
 * dat iedere aanroeper er iets van moet vinden, en dat de Bouw7-push twee vormen
 * krijgt. Eén stap erna is eerlijker: het dossier bestaat, en wat er daarna mee
 * gebeurt is een verplaatsing die je ook met de hand had kunnen doen.
 *
 * WAT HIER NIET GEBEURT
 * Terugdraaien. Lukt de Bouw7-write niet, dan blijft het dossier in EVA staan waar
 * de behandelaar het wilde hebben en komt de fout terug -- hij landt op
 * `bouw7_sync_status` en in het besluitenlog. Dat is bewust, maar niet vrijblijvend:
 * blijft Bouw7 op "01. Offerte" staan, dan trekt de eerstvolgende lees-sync het
 * dossier terug naar de aanvraagfase. Vandaar dat de uitkomst hard wordt gemeld en
 * niet als toast verdwijnt.
 */

export type FaseResultaat =
  | { ok: true; bouw7Ok: boolean; bouw7Fout: string | null }
  | { ok: false; fout: string }

/**
 * Verplaatst het dossier naar `fase`. Doet niets bij `aanvraag` -- daar staat het al.
 *
 * De kolommen komen uit `INTAKE_PLAATSINGEN`, dezelfde tabel die het scherm toont en
 * waartegen de terugleescontrole vergelijkt. Alle vier de substatuskolommen gaan in
 * één update mee: de check-constraint op `dossiers` eist dat precies de kolom van de
 * hoofdstatus gevuld is, dus ze los bijwerken zou halverwege een ongeldige rij geven.
 */
export async function zetFaseNaAanmaken(
  dossierId: string,
  fase: IntakeFase,
  bouw7Id: string | null,
): Promise<FaseResultaat> {
  if (fase === 'aanvraag') return { ok: true, bouw7Ok: true, bouw7Fout: null }

  const plaatsing = INTAKE_PLAATSINGEN[fase]
  const supabase = createAdminClient()

  // Eerst Bouw7, dan EVA. Andersom zou een mislukte write een dossier opleveren dat
  // in EVA al verhuisd is terwijl het Bouw7-project achterblijft -- en dan wint de
  // lees-sync en staat het de volgende ochtend weer terug, zonder dat iemand weet
  // waarom.
  let bouw7Ok = true
  let bouw7Fout: string | null = null
  if (plaatsing.bouw7Via && bouw7Id) {
    const { schrijfBouw7Projectstatus } = await import('@/lib/dossiers/bouw7-status')
    const res = await schrijfBouw7Projectstatus(bouw7Id, plaatsing.bouw7Via)
    bouw7Ok = res.ok
    bouw7Fout = res.ok ? null : res.error
  } else if (plaatsing.bouw7Via && !bouw7Id) {
    bouw7Ok = false
    bouw7Fout = 'Het dossier staat nog niet in Bouw7; de projectstatus is niet gezet.'
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

  // De actielijsten hangen aan de fase: een dossier dat als opdracht binnenkomt
  // hoort de opdracht-triggers te krijgen, niet die van een aanvraag.
  const { verwerkDossierTriggers } = await import('@/app/(platform)/taken/actions/sjablonen')
  await verwerkDossierTriggers(dossierId).catch(() => {})

  return { ok: true, bouw7Ok, bouw7Fout }
}
