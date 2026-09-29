import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { DossierRij } from '@/components/dossiers/types'
import { haalAlleRijen } from '@/lib/supabase/paginate'

/**
 * Hoe ver terug een planitem nog telt. Wie vorige week op een project stond, moet het dossier
 * nog kunnen terugvinden (uren nakijken, foto's, oplevering); oudere inzet niet meer.
 */
const TERUGKIJK_DAGEN = 14

type Naam = { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

/**
 * Dossiers waarop een medewerker is ingepland (Medewerkerplanning), vanaf twee weken terug en
 * alles wat nog komt. Voor de mobiele dossierlijst: een monteur heeft zelden een projectrol,
 * maar moet het dossier van zijn werk wel kunnen openen.
 *
 * Zelfde slanke vorm als `getMijnDossiers(…, lean=true)`, zodat de lijst hem op dezelfde manier
 * kan tonen (status-badge, actief-check, klant- en projectleidernaam).
 */
export async function getIngeplandeDossiers(medewerkerId: string): Promise<DossierRij[]> {
  const supabase = createAdminClient()
  const grens = new Date(Date.now() - TERUGKIJK_DAGEN * 24 * 60 * 60 * 1000).toISOString()

  // Per medewerker blijft dit ruim onder de 1000, maar de planning groeit met de tijd mee —
  // daarom toch gepagineerd.
  const items = await haalAlleRijen<{ planning_activiteiten: { dossier_id: string } | null }>((van, tot) =>
    supabase
      .from('planning_items')
      .select('id, planning_activiteiten!inner ( dossier_id )')
      .eq('medewerker_id', medewerkerId)
      .gte('eind_dt', grens)
      .order('id')
      .range(van, tot))

  const ids = [...new Set(items.map(i => i.planning_activiteiten?.dossier_id).filter((id): id is string => !!id))]
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('dossiers')
    .select(`
      id, dossiernummer, titel, hoofdstatus,
      aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
      gearchiveerd, updated_at, verwacht_startdatum, verwacht_einddatum,
      relaties!klant_id ( naam ),
      projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam )
    `)
    .in('id', ids)
    .order('updated_at', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map(row => {
    const { relaties, projectleider, ...rest } = row as typeof row & {
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
