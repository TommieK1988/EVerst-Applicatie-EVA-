import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisModuleToegang, getRechtenBundel, heeftFunctie, kiesKanaal } from '@/lib/auth/rechten'
import MedewerkersOverzicht from './MedewerkersOverzicht'
import { haalAlleRijen } from '@/lib/supabase/paginate'

export const metadata: Metadata = { title: 'Medewerkers' }

export default async function MedewerkersPage() {
  await vereisModuleToegang('medewerkers')
  // Tarieven en woonadres/geboortedatum hangen aan een eigen functie, niet aan
  // "mag de medewerkerslijst zien". Zie packages/database/src/rechten-catalogus.ts.
  const set = kiesKanaal(await getRechtenBundel(), 'verzoek')
  const magPersoonsgegevens = heeftFunctie(set, 'medewerkers.persoonsgegevens')
  const magTarieven = heeftFunctie(set, 'medewerkers.tarieven')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  // Alle kolommen behalve bsn (AVG-gevoelig — alleen op de medewerkerkaart, gemaskeerd)
  const { data } = await supabase
    .from('medewerkers')
    .select(
      'id, voornaam, tussenvoegsel, achternaam, email, telefoon, mobiel, foto_url, functie, afdeling, ' +
      'extern, actief, uurtarief_verkoop, uurtarief_kostprijs, cao_schaal, cao_document_id, cao_trede, ' +
      'in_dienst_vanaf, uit_dienst_per, contract_einde, adres_straat, adres_postcode, adres_plaats, geboortedatum, ' +
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
    // Gepagineerd: alleen id+naam voor een opzoeklijst, maar bij afkapping mist een deel van
    // de relaties en toont het scherm een lege naam. Zie lib/supabase/paginate.ts.
    haalAlleRijen<{ id: string; naam: string }>((van, tot) =>
      supabase.from('relaties').select('id, naam').order('id').range(van, tot))
      .then(data => ({ data })),
    supabase.from('cao_documenten').select('id, naam'),
  ])

  const naamMap = (res: { data: { id: string; naam: string }[] | null }) =>
    Object.fromEntries((res.data ?? []).map(r => [r.id, r.naam]))

  return (
    <MedewerkersOverzicht
      // Wissen op de server, niet de kolom verbergen in de tabel: een kolom
      // uitzetten laat de waarde gewoon in de RSC-payload staan.
      medewerkers={(data ?? []).map((m: Record<string, unknown>) => ({
        ...m,
        ...(magPersoonsgegevens ? {} : {
          geboortedatum: null, adres_straat: null, adres_postcode: null, adres_plaats: null,
        }),
        ...(magTarieven ? {} : {
          uurtarief_verkoop: null, uurtarief_kostprijs: null,
          cao_schaal: null, cao_trede: null, cao_document_id: null,
        }),
      }))}
      magPersoonsgegevens={magPersoonsgegevens}
      magTarieven={magTarieven}
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
