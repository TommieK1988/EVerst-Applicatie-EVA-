/**
 * bezoek/index.ts — kiest de bron en levert het `{bezoek.*}`-blok.
 *
 * De opsteller kiest geen documentsoort maar een *bezoek*; welke module dat bezoek heeft
 * vastgelegd is voor hem een implementatiedetail. Deze module vertaalt die keuze naar de
 * juiste adapter, en zoekt zelf het meest recente bezoek op als er niets is gekozen.
 *
 * Alleen geladen wanneer het sjabloon om documentsoort `bezoekrapport` vraagt — zelfde
 * patroon als houtrot en kwaliteit, zodat een bewonersbrief geen inspectiegegevens ophaalt.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { parseBezoekOpties, BEZOEK_OPTIES_SLEUTEL, type BezoekOpties } from '../bezoek-opties'
import { LEEG_BEZOEK_BLOK, type BezoekBlok, type BezoekSoort, type Rij } from './contract'
import { kwaliteitNaarBezoek } from './uit-kwaliteit'
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
 * Alle bezoeken van een dossier, nieuwste eerst. Voedt de picker in de genereermodal.
 *
 * Elke query is begrensd op één dossier en heeft een expliciete limiet: dit is een keuzelijst,
 * geen export.
 */
export async function getBezoekenVoorDossier(dossierId: string): Promise<BezoekKeuze[]> {
  const supabase = db()
  // Geen oplevermomenten: een oplevering is geen bezoek en heeft haar eigen rapport (zie de
  // noot bij BezoekSoort in contract.ts).
  const [bezoeken, inspecties] = await Promise.all([
    supabase.from('projectbezoeken')
      .select('id, volgnummer, datum, locatie, afgerond_op, created_at, projectbezoek_disciplines(kwaliteit_disciplines(naam))')
      .eq('dossier_id', dossierId).eq('status', 'definitief')
      .order('datum', { ascending: false }).limit(50),
    supabase.from('kwaliteit_inspecties')
      .select('id, inspectienummer, datum, werkzaamheden_omschrijving, created_at')
      .eq('dossier_id', dossierId).order('datum', { ascending: false }).limit(50),
  ])

  const uit: BezoekKeuze[] = []

  // Een projectbezoek is de brede ingang: het kan meerdere onderdelen tegelijk bevatten en is
  // daarom vrijwel altijd de bron die de opsteller bedoelt.
  for (const r of (bezoeken.data ?? []) as Record<string, unknown>[]) {
    // De genestelde rijen zijn begrensd door de 50 bezoeken hierboven.
    const namen = ((r.projectbezoek_disciplines ?? []) as
      { kwaliteit_disciplines?: { naam?: string } | null }[])
      .map(d => d.kwaliteit_disciplines?.naam)
      .filter(Boolean) as string[]
    uit.push({
      soort: 'projectbezoek', id: String(r.id),
      label: [`PB-${String(r.volgnummer).padStart(2, '0')}`, r.locatie, namen.join(', ')]
        .filter(Boolean).join(' · '),
      datum: (r.datum as string | null) ?? null,
      moment: String(r.afgerond_op ?? r.created_at ?? r.datum ?? ''),
    })
  }

  for (const r of (inspecties.data ?? []) as Record<string, unknown>[]) {
    uit.push({
      soort: 'kwaliteit', id: String(r.id),
      label: [r.inspectienummer, r.werkzaamheden_omschrijving].filter(Boolean).join(' · ') || 'Kwaliteitsronde',
      datum: (r.datum as string | null) ?? null,
      moment: String(r.created_at ?? r.datum ?? ''),
    })
  }
  const tijd = (k: BezoekKeuze) => Date.parse(k.moment) || 0
  return uit.sort((a, b) => tijd(b) - tijd(a))
}

/**
 * De bron wanneer de opsteller niets heeft gekozen: het meest recente **projectbezoek**, en
 * pas als dat er niet is een kwaliteitsronde. Die module is geparkeerd; een oude concept-
 * inspectie mag een vers projectbezoek niet verdringen.
 */
function standaardBron(lijst: BezoekKeuze[]): BezoekKeuze | null {
  return lijst.find(k => k.soort === 'projectbezoek') ?? lijst[0] ?? null
}

/**
 * Bouwt het `{bezoek.*}`-blok voor een dossier.
 *
 * `kwaliteitBlok` wordt door de contextbouwer meegegeven omdat die het toch al bouwt voor de
 * `{kwaliteit.*}`-tags; zo wordt een kwaliteitsronde niet twee keer geladen.
 */
export async function bouwBezoekBlok(
  dossierId: string,
  invoer: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kwaliteitBlok: any,
  opties: { preview?: boolean } = {},
): Promise<BezoekBlok> {
  const keuze = parseBezoekOpties(invoer[BEZOEK_OPTIES_SLEUTEL])

  let soort = keuze.bron_soort
  let id = keuze.bron_id

  // Niets gekozen → het meest recente projectbezoek van dit dossier (zie standaardBron).
  if (!soort || !id) {
    const bron = standaardBron(await getBezoekenVoorDossier(dossierId))
    if (!bron) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
    soort = bron.soort
    id = bron.id
  }

  return metSjabloonFotos(await bouwVoorBron(dossierId, soort, id, keuze, kwaliteitBlok, opties))
}

/**
 * Zet de foto's onder de tagnamen die het sjabloon gebruikt.
 *
 * Het sjabloon vraagt `{%bevinding_foto}`, `{%bevinding_foto_na}` en `{%waarneming_foto}` —
 * eigen namen, zodat het fotokader van dit rapport niet dat van een ander document raakt (zie
 * `documentImageMax`). De adapters leveren de foto's echter als `foto`, `foto_na` en
 * `foto_klein`, en niemand legde die twee naast elkaar. Een ontbrekende image-tag geeft geen
 * fout maar een transparante pixel, dus élk bezoekrapport kwam stilletjes zonder bevindings-
 * en overzichtsfoto's uit. Eén vertaling hier dekt alle drie de bronnen.
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

async function bouwVoorBron(
  dossierId: string,
  soort: BezoekSoort,
  id: string,
  keuze: BezoekOpties,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kwaliteitBlok: any,
  opties: { preview?: boolean },
): Promise<BezoekBlok> {
  switch (soort) {
    case 'projectbezoek':
      return bouwBezoekUitProjectbezoek(id, keuze, opties)
    case 'kwaliteit':
      // Het rekenwerk zit al in bouwKwaliteitBlok; dit is alleen de remap.
      return kwaliteitNaarBezoek(kwaliteitBlok, keuze)
    default:
      return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
  }
}
