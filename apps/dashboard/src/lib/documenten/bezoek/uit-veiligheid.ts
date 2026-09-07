/**
 * uit-veiligheid.ts — een veiligheidsronde (VCA) als bezoekrapport.
 *
 * Dit is de zwakste van de vier bronnen, en dat is geen implementatiekeuze maar een feit van
 * het datamodel: **er is geen registratie-entiteit voor een veiligheidsronde.** Er is dus
 * geen nummerreeks en geen "moment" met een datum. Het kenmerk wordt daarom synthetisch
 * (`VR-<datum>`) en de datum komt van de gekozen bron.
 *
 * Twee bronnen, die allebei mogen meedoen:
 *
 *  1. **`oplever_punten` met `soort='veiligheid'`.** Die kolom bestaat sinds juli 2026 en de
 *     formulierbouwer schrijft hem, maar tot nu toe leest niets hem uit — dit rapport is de
 *     eerste lezer. `getOplevermomentRapport` is hiervoor onbruikbaar: die filtert hard op
 *     `soort='oplever'`.
 *  2. **Een KAM/VGM-inzending** (`form_templates.is_kam_vgm`). Het uitlezen daarvan is
 *     hetzelfde werk als bij een gewoon formulier, dus dat wordt gedelegeerd.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { opleverPuntStatusLabels } from '@everts/database/platform-types'
import type { OpleverPunt } from '@everts/database/platform-types'
import { datumNL, datumISO, afkappen } from '../format'
import { knipInPaginas } from '../rapport-paginas'
import type { BezoekOpties } from '../bezoek-opties'
import { MAX_BEVINDINGEN } from '../bezoek-opties'
import { leesInzending, naarBlok } from './uit-formulier'
import {
  LEEG_BEZOEK_BLOK, LEGE_BEVINDING, BEZOEK_SOORT_LABELS, bezoekDisclaimer,
  type BezoekBlok, type BezoekBevinding, type Rij,
} from './contract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Statussen die niet in een rapport horen: nog niet beoordeeld, of afgewezen. */
const NIET_ACTIEF = new Set(['nieuw', 'afgewezen'])
const AFGEHANDELD = new Set(['opgelost', 'geaccepteerd'])

const STANDAARD_INLEIDING =
  'Tijdens deze veiligheidsronde is de werkplek beoordeeld op de op dat moment waarneembare '
  + 'veiligheidsrisico’s. Geconstateerde punten worden binnen het project opgevolgd.'

/**
 * @param bronId Id van een KAM/VGM-inzending, of leeg voor alleen de veiligheidspunten van
 *               het dossier.
 */
export async function bouwBezoekUitVeiligheid(
  dossierId: string,
  bronId: string | null,
  keuze: BezoekOpties,
): Promise<BezoekBlok> {
  // ── Veiligheidspunten van dit dossier ──────────────────────────────────
  // Gepagineerd met een stabiele ordening: PostgREST kapt stil af op 1000 rijen.
  const punten = await haalAlleRijen<OpleverPunt>((van, tot) =>
    db()
      .from('oplever_punten')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('soort', 'veiligheid')
      .order('volgnummer')
      .range(van, tot))

  const bruikbaar = punten
    .filter(p => !NIET_ACTIEF.has(p.status))
    .filter(p => !keuze.toon_niet_beoordeeld ? !AFGEHANDELD.has(p.status) : true)

  const puntBevindingen: BezoekBevinding[] = bruikbaar.map((p, i) => ({
    ...LEGE_BEVINDING,
    nummer: `VP-${String(p.volgnummer).padStart(2, '0')}`,
    volgnummer: p.volgnummer,
    titel: p.ruimte ?? '',
    omschrijving: p.omschrijving ?? '',
    omschrijving_kort: afkappen(p.omschrijving ?? '', 220),
    locatie: p.ruimte ?? '',
    groep: 'Veiligheid',
    status: p.status,
    status_label: opleverPuntStatusLabels[p.status] ?? p.status,
    is_open: !AFGEHANDELD.has(p.status),
    is_opgelost: AFGEHANDELD.has(p.status),
    datum: p.created_at ? datumNL(p.created_at) : '',
    hersteldatum: p.deadline ? datumNL(p.deadline) : '',
    volgnummer_hulp: i,
  }))

  // ── Eventueel een KAM/VGM-inzending erbij ──────────────────────────────
  const bron = bronId ? await leesInzending(bronId, keuze) : null

  const bevindingen = [...(bron?.bevindingen ?? []), ...puntBevindingen]
    .map((b, i) => ({ ...b, volgnummer: i + 1 }))
    .slice(0, MAX_BEVINDINGEN)

  if (!bron && bevindingen.length === 0) {
    return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
  }

  const datum = bron?.datum ?? (bruikbaar.length ? datumNL(bruikbaar[bruikbaar.length - 1].created_at) : '')
  // Zonder registratie-entiteit is er geen echt kenmerk; VR-<datum> is een aanduiding, geen
  // nummerreeks. Zie ook de LEESMIJ.
  const kenmerk = bron?.kenmerk ?? `VR-${datumISO(new Date().toISOString())}`

  const open = bevindingen.filter(b => b.is_open).length
  const kengetallen: Rij[] = [
    { label: 'Beoordeelde punten', waarde: bron?.punten.length ?? 0 },
    { label: 'Veiligheidspunten', waarde: bevindingen.length, is_negatief: true },
    { label: 'Nog open', waarde: open, is_negatief: true },
  ].filter(k => Number(k.waarde) > 0)

  const basis = bron
    ? naarBlok(bron, keuze, 'veiligheid', STANDAARD_INLEIDING)
    : { ...LEEG_BEZOEK_BLOK, aanwezig: true, soort: 'veiligheid' as const,
        soort_label: BEZOEK_SOORT_LABELS.veiligheid,
        inleiding: keuze.inleiding || STANDAARD_INLEIDING,
        disclaimer: bezoekDisclaimer('veiligheid'), per_pagina: keuze.per_pagina }

  return {
    ...basis,
    titel: `${BEZOEK_SOORT_LABELS.veiligheid} ${kenmerk}`.trim(),
    kenmerk,
    datum,
    samenvatting_regel: samenvattingsregel(bevindingen.length, open),
    kengetallen,
    heeft_kengetallen: kengetallen.length > 0,
    alle_bevindingen: bevindingen,
    paginas: knipInPaginas(bevindingen, { perPagina: keuze.per_pagina, itemVeld: 'bevindingen' }),
    heeft_bevindingen: bevindingen.length > 0,
    aantal_bevindingen: bevindingen.length,
    aantal_open: open,
  }
}

function samenvattingsregel(totaal: number, open: number): string {
  if (totaal === 0) return 'Er zijn tijdens deze ronde geen veiligheidspunten vastgelegd.'
  const kop = totaal === 1 ? 'Er is 1 veiligheidspunt vastgelegd.' : `Er zijn ${totaal} veiligheidspunten vastgelegd.`
  if (open === 0) return `${kop} Alle punten zijn afgehandeld.`
  return `${kop} Daarvan ${open === 1 ? 'staat er 1 nog open' : `staan er ${open} nog open`}.`
}
