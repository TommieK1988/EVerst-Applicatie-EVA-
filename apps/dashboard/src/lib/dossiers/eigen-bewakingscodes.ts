/**
 * dossiers/eigen-bewakingscodes.ts
 *
 * De bewakingscodes die EVA zelf heeft uitgedeeld op een dossier: die van de stelposten in de
 * opdracht en die van het goedgekeurde meerwerk.
 *
 * WAAROM EVA HIER DE BRON IS EN NIET DE BOUW7-SNAPSHOT
 * De werkbegroting leest zijn kostengroepen uit `athena_control`, en die momentopname wordt twee
 * keer per dag ververst. Een code die zojuist is uitgedeeld — bij het aanwijzen van een stelpost,
 * of bij akkoord op meerwerk — staat er daardoor uren niet in, precies wanneer de calculator hem
 * wil vullen. Erger nog: een bewakingscode zonder budget en zonder boekingen komt in de
 * project-control-respons niet altijd voor, waardoor hij er ook later niet vanzelf in verschijnt.
 * Uit onze eigen tabellen lezen is direct én volledig.
 *
 * De omschrijving gaat mee als codenaam: dat is dezelfde naam waarmee de code in Bouw7 is
 * aangemaakt, zodat de kostengroep-identiteit (code + omschrijving) aan beide kanten gelijk is.
 *
 * Dit is de kale lezer. `werkbegroting-codes.ts` is de server-action-variant mét sessiecontrole
 * voor clientschermen; server-side lezers (zoals de bewakingscode-kiezer van de planning) roepen
 * deze functie rechtstreeks aan.
 */

import { createAdminClient } from '@everts/database/server'

/** Eén door EVA uitgedeelde bewakingscode, met waar hij vandaan komt. */
export type EigenBewakingscode = {
  code: string
  naam: string
  soort: 'stelpost' | 'meerwerk'
}

/** Statussen waarin meerwerk daadwerkelijk uitgevoerd wordt en dus begroot moet worden. */
const GOEDGEKEURD = ['akkoord', 'voltooid']

export async function leesEigenBewakingscodes(dossierId: string): Promise<EigenBewakingscode[]> {
  const supabase = createAdminClient()

  const [stelpostRes, meerwerkRes] = await Promise.all([
    supabase
      .from('opdracht_onderdelen')
      .select('bewakingscode, omschrijving, volgnummer')
      .eq('dossier_id', dossierId)
      .eq('soort', 'stelpost')
      .eq('in_opdracht', true)
      .not('bewakingscode', 'is', null)
      .order('volgnummer', { ascending: true }),
    // Alleen goedgekeurd meerwerk: een aangevraagde regel gaat misschien niet door, en die als
    // kostengroep tonen zou werk suggereren dat nog niet is opgedragen.
    supabase
      .from('meerwerk_regels')
      .select('bewakingscode, omschrijving, volgnummer, status')
      .eq('dossier_id', dossierId)
      .in('status', GOEDGEKEURD)
      .not('bewakingscode', 'is', null)
      .order('volgnummer', { ascending: true }),
  ])

  const uit: EigenBewakingscode[] = []
  const gezien = new Set<string>()
  const voegToe = (soort: EigenBewakingscode['soort']) =>
    (r: { bewakingscode: string | null; omschrijving: string | null }) => {
      const code = (r.bewakingscode ?? '').trim()
      if (!code || gezien.has(code.toUpperCase())) return
      gezien.add(code.toUpperCase())
      uit.push({ code, naam: (r.omschrijving ?? '').trim() || code, soort })
    }

  ;((stelpostRes.data ?? []) as { bewakingscode: string | null; omschrijving: string | null }[])
    .forEach(voegToe('stelpost'))
  ;((meerwerkRes.data ?? []) as { bewakingscode: string | null; omschrijving: string | null }[])
    .forEach(voegToe('meerwerk'))

  return uit
}
