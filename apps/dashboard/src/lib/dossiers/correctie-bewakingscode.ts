'use server'

/**
 * dossiers/correctie-bewakingscode.ts
 *
 * De kostengroep "Correcties" (`CO01`) op een dossier: aanmaken in Bouw7 en vastleggen op het
 * dossier. Zie `CORRECTIE_BEWAKINGSCODE` in `components/dossiers/types.ts` voor waarom hij bestaat.
 *
 * OP VERZOEK, NIET AUTOMATISCH
 * Alleen dossiers die een correctie nodig hebben krijgen hem — via de knop in de werkbegroting.
 * Automatisch op elk dossier zou Bouw7 volzetten met lege codes.
 *
 * KOSTENSOORTEN 1, 3 EN 5
 * Precies de soorten waarop de werkbegroting prognose schrijft (`PROGNOSE_KOSTENSOORTEN`): arbeid
 * (met uren), onderaanneming en materiaal. Meer is niet nodig — op deze code wordt nooit geboekt.
 * De correctie zelf gaat daarna als gewone werkbegrotingregel onder `CO01` via "Naar Bouw7".
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { getRechtenBundel, vereisFunctie, GeenToegangError } from '@/lib/auth/rechten'
import { heeftFunctie, kiesKanaal } from '@/lib/auth/rechten-shared'
import { CORRECTIE_BEWAKINGSCODE, CORRECTIE_BEWAKINGSCODE_NAAM } from '@/components/dossiers/types'
import { maakMeerwerkBewakingscodeBouw7 } from '@/app/(platform)/everts-calc/actions/werkbegroting'

/** Mag de ingelogde gebruiker de correctie-kostengroep zien en bewerken? */
export async function magCorrecties(): Promise<boolean> {
  try {
    return heeftFunctie(kiesKanaal(await getRechtenBundel(), 'desktop'), 'dossiers.correcties')
  } catch {
    return false
  }
}

export type CorrectieCodeResultaat =
  | { ok: true; code: string; inBouw7: boolean; waarschuwing?: string }
  | { ok: false; error: string }

/**
 * Zet de correctie-kostengroep op dit dossier en maakt hem in Bouw7 aan.
 *
 * Idempotent: staat hij er al mét Bouw7-hoofdstuk, dan gebeurt er niets. Mislukte de Bouw7-write
 * eerder (hoofdstuk leeg), dan wordt het opnieuw geprobeerd. Mislukt hij nu weer, dan blijft de
 * code toch lokaal staan met een waarschuwing — "Naar Bouw7" in de werkbegroting maakt een
 * ontbrekende code alsnog aan.
 */
export async function voegCorrectieKostengroepToe(dossierId: string): Promise<CorrectieCodeResultaat> {
  try {
    await vereisFunctie('dossiers.correcties', { kanaal: 'desktop' })
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt geen recht op correcties.' }
    throw e
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('dossiers')
    .select('id, bouw7_id, correctie_bewakingscode, correctie_bouw7_chapter_id')
    .eq('id', dossierId)
    .maybeSingle()
  const d = data as {
    id: string; bouw7_id: string | null
    correctie_bewakingscode: string | null; correctie_bouw7_chapter_id: number | null
  } | null
  if (!d) return { ok: false, error: 'Dossier niet gevonden.' }
  if (!d.bouw7_id) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }

  const code = CORRECTIE_BEWAKINGSCODE
  if (d.correctie_bewakingscode === code && d.correctie_bouw7_chapter_id != null) {
    return { ok: true, code, inBouw7: true }
  }

  const res = await maakMeerwerkBewakingscodeBouw7(dossierId, {
    code,
    naam: CORRECTIE_BEWAKINGSCODE_NAAM,
    kostensoort: 1,
    kostensoorten: [1, 3, 5],
    // Niet onder een meerwerk-hoofdstuk: daar telt hij in de bewaking visueel als meerwerk mee.
    zoekHoofdstuk: false,
  })

  const { error } = await supabase
    .from('dossiers')
    .update({
      correctie_bewakingscode: code,
      ...(res.ok
        ? { correctie_bouw7_chapter_id: res.chapterId, correctie_bouw7_security_code_id: res.pslId }
        : {}),
    })
    .eq('id', dossierId)
  if (error) return { ok: false, error: `Opslaan mislukt: ${error.message}` }

  revalidatePath(`/opdrachten/${dossierId}`)
  if (!res.ok) {
    return {
      ok: true, code, inBouw7: false,
      waarschuwing: `De groep staat in EVA, maar Bouw7 weigerde hem: ${res.error}`,
    }
  }
  return { ok: true, code, inBouw7: true, waarschuwing: res.waarschuwing }
}
