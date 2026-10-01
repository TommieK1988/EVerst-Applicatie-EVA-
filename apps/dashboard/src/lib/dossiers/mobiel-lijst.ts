import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { DossierRij } from '@/components/dossiers/types'
import { haalAlleRijen } from '@/lib/supabase/paginate'

type Naam = { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

/** Rol-kolommen waarop een dossier aan een medewerker hangt (zelfde zes als `getMijnDossiers`). */
const ROL_KOLOMMEN = [
  'project_manager_id', 'teamleider_id', 'werkvoorbereider_id',
  'calculator_id', 'uitvoerder_id', 'controller_id',
] as const

/**
 * Wat níet op de telefoon hoort: elk dossier dat is afgesloten of financieel gereed is. Als
 * PostgREST-filters, zodat Directie (alle dossiers) niet eerst de hele tabel binnenhaalt.
 *
 * Elke regel is een `or` met een ontsnapping voor NULL: `kolom.not.in.(…)` alleen zou een
 * dossier zonder die substatus ook wegfilteren (NULL NOT IN … is NULL, dus onwaar).
 *
 * - Bouw7 07 (afgesloten) en 08 (afgewezen);
 * - aanvraag afgewezen/vervallen (niet bij servicedesk: die bonnen staan altijd op aanvraag·nieuw);
 * - offerte verloren/vervallen/gewonnen (gewonnen leeft verder als opdracht);
 * - opdracht financieel gereed/afgesloten;
 * - servicedesk vervallen/financieel gereed.
 */
const NIET_AFGESLOTEN = [
  'bouw7_projectstatus_naam.is.null,and(bouw7_projectstatus_naam.not.like.07*,bouw7_projectstatus_naam.not.like.08*)',
  'hoofdstatus.neq.aanvraag,servicedesk_substatus.not.is.null,aanvraag_substatus.is.null,aanvraag_substatus.not.in.(afgewezen,vervallen)',
  'hoofdstatus.neq.offerte,offerte_substatus.is.null,offerte_substatus.not.in.(verloren,vervallen,gewonnen)',
  'hoofdstatus.neq.opdracht,opdracht_substatus.is.null,opdracht_substatus.not.in.(financieel_gereed,financieel_afgesloten)',
  'servicedesk_substatus.is.null,servicedesk_substatus.not.in.(vervallen,financieel_gereed)',
] as const

/**
 * De lopende dossiers voor de mobiele dossierlijst.
 *
 * - `alle`: elk lopend dossier (Directie, functie `dossiers.alle_zien`);
 * - anders: elk lopend dossier waar de medewerker een projectrol op heeft — in élke fase,
 *   dus ook offertes en servicedeskbonnen.
 *
 * Gepagineerd: voor Directie zijn dit er honderden, en dat groeit.
 */
export async function getMobieleDossiers(
  medewerkerId: string,
  { alle }: { alle: boolean },
): Promise<DossierRij[]> {
  const supabase = createAdminClient()

  const rijen = await haalAlleRijen<Record<string, unknown>>((van, tot) => {
    let q = supabase
      .from('dossiers')
      .select(`
        id, dossiernummer, titel, hoofdstatus,
        aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
        bouw7_projectstatus_naam, bouw7_categorie_naam,
        gearchiveerd, updated_at, verwacht_startdatum, verwacht_einddatum,
        relaties!klant_id ( naam ),
        projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam )
      `)
      .or('gearchiveerd.is.null,gearchiveerd.eq.false')
    for (const f of NIET_AFGESLOTEN) q = q.or(f)
    if (!alle) q = q.or(ROL_KOLOMMEN.map(k => `${k}.eq.${medewerkerId}`).join(','))
    return q
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id')
      .range(van, tot)
  })

  return rijen.map(row => {
    const { relaties, projectleider, ...rest } = row as Record<string, unknown> & {
      relaties: { naam: string | null } | null
      projectleider: Naam | null
    }
    const pl = projectleider
    return {
      ...rest,
      klant_naam: relaties?.naam ?? null,
      projectleider_naam: pl ? [pl.voornaam, pl.tussenvoegsel, pl.achternaam].filter(Boolean).join(' ') || null : null,
    } as unknown as DossierRij
  })
}
