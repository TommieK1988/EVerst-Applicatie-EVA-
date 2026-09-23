/**
 * bezoek/index.ts — zoekt het projectbezoek en levert het `{bezoek.*}`-blok.
 *
 * Een bezoekrapport gaat over precies één ding: een projectbezoek dat de projectleider op de
 * mobiel heeft vastgelegd. Oplevering en kwaliteitsronde waren ooit ook bronnen; ze zijn er
 * in september 2026 uit gehaald (zie de noot bij BezoekSoort in contract.ts).
 *
 * Alleen geladen wanneer het sjabloon om documentsoort `bezoekrapport` vraagt — zelfde
 * patroon als houtrot en kwaliteit, zodat een bewonersbrief geen bezoekgegevens ophaalt.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { parseBezoekOpties, BEZOEK_OPTIES_SLEUTEL } from '../bezoek-opties'
import { LEEG_BEZOEK_BLOK, type BezoekBlok, type BezoekSoort, type Rij } from './contract'
import { bouwBezoekUitProjectbezoek } from './uit-projectbezoek'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type { BezoekBlok } from './contract'
export { LEEG_BEZOEK_BLOK } from './contract'

/** Eén keuzemogelijkheid in de bronkiezer. */
export interface BezoekKeuze {
  soort: BezoekSoort
  id: string
  label: string
  datum: string | null
  /**
   * Volledig tijdstip waarop gesorteerd wordt. Niet `datum`: dat is een kale dag, dus twee
   * bezoeken op één dag stonden in willekeurige volgorde.
   */
  moment: string
}

/**
 * De afgeronde projectbezoeken van een dossier, nieuwste eerst.
 *
 * Begrensd op één dossier en met een expliciete limiet: dit is een keuzelijst, geen export.
 */
export async function getBezoekenVoorDossier(dossierId: string): Promise<BezoekKeuze[]> {
  const { data } = await db()
    .from('projectbezoeken')
    .select('id, volgnummer, datum, locatie, afgerond_op, created_at, projectbezoek_disciplines(kwaliteit_disciplines(naam))')
    .eq('dossier_id', dossierId).eq('status', 'definitief')
    .order('datum', { ascending: false }).limit(50)

  const uit: BezoekKeuze[] = ((data ?? []) as Record<string, unknown>[]).map(r => {
    // De genestelde rijen zijn begrensd door de 50 bezoeken hierboven.
    const namen = ((r.projectbezoek_disciplines ?? []) as
      { kwaliteit_disciplines?: { naam?: string } | null }[])
      .map(d => d.kwaliteit_disciplines?.naam)
      .filter(Boolean) as string[]
    return {
      soort: 'projectbezoek' as const, id: String(r.id),
      label: [`PB-${String(r.volgnummer).padStart(2, '0')}`, r.locatie, namen.join(', ')]
        .filter(Boolean).join(' · '),
      datum: (r.datum as string | null) ?? null,
      moment: String(r.afgerond_op ?? r.created_at ?? r.datum ?? ''),
    }
  })

  const tijd = (k: BezoekKeuze) => Date.parse(k.moment) || 0
  return uit.sort((a, b) => tijd(b) - tijd(a))
}

/**
 * Bouwt het `{bezoek.*}`-blok voor een dossier: het gekozen projectbezoek, of zonder keuze
 * het meest recent afgeronde.
 */
export async function bouwBezoekBlok(
  dossierId: string,
  invoer: Record<string, unknown>,
  opties: { preview?: boolean } = {},
): Promise<BezoekBlok> {
  const keuze = parseBezoekOpties(invoer[BEZOEK_OPTIES_SLEUTEL])

  let id = keuze.bron_soort === 'projectbezoek' ? keuze.bron_id : null
  if (!id) {
    const [nieuwste] = await getBezoekenVoorDossier(dossierId)
    if (!nieuwste) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
    id = nieuwste.id
  }

  return metSjabloonFotos(await bouwBezoekUitProjectbezoek(id, keuze, opties))
}

/**
 * Zet de foto's onder de tagnamen die het sjabloon gebruikt.
 *
 * Het sjabloon vraagt `{%bevinding_foto}`, `{%bevinding_foto_na}` en `{%waarneming_foto}` —
 * eigen namen, zodat het fotokader van dit rapport niet dat van een ander document raakt (zie
 * `documentImageMax`). De adapter levert de foto's echter als `foto`, `foto_na` en
 * `foto_klein`, en niemand legde die twee naast elkaar. Een ontbrekende image-tag geeft geen
 * fout maar een transparante pixel, dus élk bezoekrapport kwam stilletjes zonder bevindings-
 * en overzichtsfoto's uit.
 */
function metSjabloonFotos(blok: BezoekBlok): BezoekBlok {
  const bevinding = (b: Rij): Rij => ({
    ...b,
    bevinding_foto: b.bevinding_foto ?? b.foto ?? '',
    bevinding_foto_na: b.bevinding_foto_na ?? b.foto_na ?? '',
  })
  const waarnemingen = blok.waarnemingen.map(w => ({
    ...w,
    waarneming_foto: w.waarneming_foto ?? w.foto_klein ?? w.foto ?? '',
  }))
  return {
    ...blok,
    alle_bevindingen: blok.alle_bevindingen.map(b => bevinding(b) as typeof b),
    paginas: blok.paginas.map(p => ({
      ...p,
      bevindingen: Array.isArray(p.bevindingen) ? (p.bevindingen as Rij[]).map(bevinding) : p.bevindingen,
    })),
    waarnemingen,
  }
}
