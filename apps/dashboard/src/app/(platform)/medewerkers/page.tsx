import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import MedewerkersOverzicht from './MedewerkersOverzicht'

export const metadata: Metadata = { title: 'Medewerkers' }

export default async function MedewerkersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  // Alle kolommen behalve bsn (AVG-gevoelig — alleen op de medewerkerkaart, gemaskeerd)
  const { data } = await supabase
    .from('medewerkers')
    .select(
      'id, voornaam, tussenvoegsel, achternaam, email, telefoon, foto_url, functie, afdeling, ' +
      'extern, actief, uurtarief_verkoop, uurtarief_kostprijs, cao_schaal, cao_document_id, cao_trede, ' +
      'in_dienst_vanaf, uit_dienst_per, adres_straat, adres_postcode, adres_plaats, geboortedatum, ' +
      'werkmaatschappij_id, relatie_id, kleur, ploeg_id, standaard_uursoort_id, gebruiker_type, ' +
      'o365_email, handtekening_url, bouw7_id, bouw7_laatst_sync, bouw7_sync_status, created_at, updated_at'
    )
    .order('achternaam', { ascending: true })

  // Haal user_id op voor layout-beheer
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [layouts, functiesRes, ploegenRes, werkmaatschappijenRes, uursoortenRes, relatiesRes, caoDocumentenRes] = await Promise.all([
    user_id ? laadLayouts(user_id, 'medewerkers') : Promise.resolve([]),
    supabase.from('medewerker_functies').select('id, naam').eq('actief', true).order('volgorde').order('naam'),
    supabase.from('ploegen').select('id, naam'),
    supabase.from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij'),
    supabase.from('planning_uursoorten').select('id, naam'),
    supabase.from('relaties').select('id, naam'),
    supabase.from('cao_documenten').select('id, naam'),
  ])

  const naamMap = (res: { data: { id: string; naam: string }[] | null }) =>
    Object.fromEntries((res.data ?? []).map(r => [r.id, r.naam]))

  return (
    <MedewerkersOverzicht
      medewerkers={data ?? []}
      layouts={layouts}
      user_id={user_id}
      functies={(functiesRes.data ?? []) as { id: string; naam: string }[]}
      lookups={{
        ploegen:            naamMap(ploegenRes),
        werkmaatschappijen: naamMap(werkmaatschappijenRes),
        uursoorten:         naamMap(uursoortenRes),
        relaties:           naamMap(relatiesRes),
        caoDocumenten:      naamMap(caoDocumentenRes),
      }}
    />
  )
}
