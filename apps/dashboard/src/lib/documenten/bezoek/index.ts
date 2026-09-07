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
import { LEEG_BEZOEK_BLOK, type BezoekBlok, type BezoekSoort } from './contract'
import { bouwBezoekUitOplevering } from './uit-oplevering'
import { bouwBezoekUitFormulier } from './uit-formulier'
import { bouwBezoekUitVeiligheid } from './uit-veiligheid'
import { kwaliteitNaarBezoek } from './uit-kwaliteit'

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
}

/**
 * Alle bezoeken van een dossier, nieuwste eerst. Voedt de picker in de genereermodal.
 *
 * Elke query is begrensd op één dossier en heeft een expliciete limiet: dit is een keuzelijst,
 * geen export.
 */
export async function getBezoekenVoorDossier(dossierId: string): Promise<BezoekKeuze[]> {
  const supabase = db()
  const [inspecties, momenten, inzendingen] = await Promise.all([
    supabase.from('kwaliteit_inspecties')
      .select('id, inspectienummer, datum, werkzaamheden_omschrijving')
      .eq('dossier_id', dossierId).order('datum', { ascending: false }).limit(50),
    supabase.from('oplever_momenten')
      .select('id, titel, type, opgeleverd_op, created_at')
      .eq('dossier_id', dossierId).order('created_at', { ascending: false }).limit(50),
    supabase.from('form_inzendingen')
      .select('id, template_id, status, ingediend_op, aangemaakt_op')
      .eq('dossier_id', dossierId).in('status', ['ingediend', 'goedgekeurd'])
      .order('ingediend_op', { ascending: false }).limit(50),
  ])

  const uit: BezoekKeuze[] = []

  for (const r of (inspecties.data ?? []) as Record<string, unknown>[]) {
    uit.push({
      soort: 'kwaliteit', id: String(r.id),
      label: [r.inspectienummer, r.werkzaamheden_omschrijving].filter(Boolean).join(' · ') || 'Kwaliteitsronde',
      datum: (r.datum as string | null) ?? null,
    })
  }
  for (const r of (momenten.data ?? []) as Record<string, unknown>[]) {
    uit.push({
      soort: 'oplevering', id: String(r.id),
      label: String(r.titel ?? r.type ?? 'Oplevering'),
      datum: (r.opgeleverd_op as string | null) ?? (r.created_at as string | null) ?? null,
    })
  }

  // Formuliernamen in één keer erbij; anders is dit een query per inzending.
  const inzRijen = (inzendingen.data ?? []) as Record<string, unknown>[]
  if (inzRijen.length) {
    const ids = [...new Set(inzRijen.map(r => String(r.template_id)))]
    const { data: templates } = await supabase
      .from('form_templates').select('id, naam, is_kam_vgm').in('id', ids)
    const perId = new Map<string, { naam: string; kam: boolean }>(
      ((templates ?? []) as Record<string, unknown>[])
        .map(t => [String(t.id), { naam: String(t.naam ?? 'Formulier'), kam: t.is_kam_vgm === true }]),
    )
    for (const r of inzRijen) {
      const t = perId.get(String(r.template_id))
      uit.push({
        // Een KAM/VGM-formulier ís een veiligheidsronde; dat hoeft de opsteller niet te weten.
        soort: t?.kam ? 'veiligheid' : 'formulier',
        id: String(r.id),
        label: t?.naam ?? 'Formulier',
        datum: (r.ingediend_op as string | null) ?? (r.aangemaakt_op as string | null) ?? null,
      })
    }
  }

  return uit.sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
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

  // Niets gekozen → het meest recente bezoek van dit dossier.
  if (!soort || !id) {
    const lijst = await getBezoekenVoorDossier(dossierId)
    if (lijst.length === 0) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
    soort = lijst[0].soort
    id = lijst[0].id
  }

  return bouwVoorBron(dossierId, soort, id, keuze, kwaliteitBlok, opties)
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
    case 'kwaliteit':
      // Het rekenwerk zit al in bouwKwaliteitBlok; dit is alleen de remap.
      return kwaliteitNaarBezoek(kwaliteitBlok, keuze)
    case 'oplevering':
      return bouwBezoekUitOplevering(id, keuze, opties)
    case 'veiligheid':
      return bouwBezoekUitVeiligheid(dossierId, id, keuze)
    case 'formulier':
      return bouwBezoekUitFormulier(id, keuze)
    default:
      return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
  }
}
