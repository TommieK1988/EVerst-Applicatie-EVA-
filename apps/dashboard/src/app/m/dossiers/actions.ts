'use server'

/**
 * Server-actions voor het mobiele dossier.
 *
 * LET OP — elke export in dit bestand moet `async function` zijn. Een type, constante of
 * synchrone functie komt hier door `tsc` heen en valt pas om bij de build (zie
 * `feedback_use_server_geen_sync_exports`). Types horen in `components/dossiers/types`.
 *
 * De statuswijziging staat hier apart van `lib/dossiers/actions.ts` omdat hij een eigen
 * poort heeft: op de desktop bepaalt het niveau op Dossiers wie de status zet, op mobiel
 * de functie `dossiers.status_wijzigen`. Die staat standaard uit. Zou de mobiele knop de
 * gedeelde action rechtstreeks aanroepen, dan was het verbergen van de knop de enige
 * beveiliging — en een server-action is als kale RPC aanroepbaar, dus dat is er geen.
 */

import { vereisFunctie, GeenToegangError } from '@/lib/auth/rechten'
import { updateDossierSubstatus, updateServicedeskSubstatus } from '@/lib/dossiers/actions'
import type { DossierSubstatus } from '@/components/dossiers/types'

type Uitkomst =
  | { ok: true; bouw7?: { ok: boolean; error?: string } }
  | { ok: false; error: string; conflict?: { bouw7Label: string } }

/** Eén poort voor alle acties hieronder; het kanaal is expliciet mobiel. */
async function poort(): Promise<string | null> {
  try {
    await vereisFunctie('dossiers.status_wijzigen', { kanaal: 'mobiel' })
    return null
  } catch (e) {
    if (e instanceof GeenToegangError) {
      return 'Je mag de status van een dossier niet wijzigen in de app.'
    }
    throw e
  }
}

/**
 * Aanvraag-, offerte- of opdrachtstatus zetten vanaf de telefoon. Zelfde weg als de
 * desktop: EVA bijwerken én terugschrijven naar Bouw7. Botst dat met de tweede
 * Bouw7-app, dan komt het conflict terug naar het scherm — dat legt de keuze voor.
 */
export async function wijzigSubstatusMobiel(
  dossierId: string,
  substatus: DossierSubstatus,
  opties?: { forceerBouw7?: boolean },
): Promise<Uitkomst> {
  const geweigerd = await poort()
  if (geweigerd) return { ok: false, error: geweigerd }

  try {
    const res = await updateDossierSubstatus(dossierId, substatus, {
      schrijfBouw7: true,
      forceerBouw7: opties?.forceerBouw7 === true,
    })
    return res.ok ? { ok: true, bouw7: res.bouw7 } : res
  } catch (e) {
    // Een afgesloten dossier is overal alleen-lezen; `assertDossierBewerkbaar` gooit dan.
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

/**
 * De uitweg bij een conflict: de stand uit Bouw7 overnemen in EVA en niets overschrijven.
 * Eén lichte `GET /project/{id}`, niet de hele projectlijst.
 */
export async function volgBouw7SubstatusMobiel(
  dossierId: string,
  sectie: 'aanvraag' | 'offerte',
): Promise<{ ok: boolean; error?: string }> {
  const geweigerd = await poort()
  if (geweigerd) return { ok: false, error: geweigerd }

  const { ververseSubstatussenActie } = await import(
    '@/app/(platform)/instellingen/integraties/actions'
  )
  const res = await ververseSubstatussenActie(sectie, dossierId)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

/** Servicedesk heeft een eigen kolom en geen Bouw7-tegenhanger; aparte weg dus. */
export async function wijzigServicedeskSubstatusMobiel(
  dossierId: string,
  substatus: string,
): Promise<Uitkomst> {
  const geweigerd = await poort()
  if (geweigerd) return { ok: false, error: geweigerd }

  try {
    const res = await updateServicedeskSubstatus(dossierId, substatus)
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Bijwerken mislukt' }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}
