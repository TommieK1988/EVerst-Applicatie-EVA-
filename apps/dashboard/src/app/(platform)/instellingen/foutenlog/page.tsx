import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { laadLayouts } from '@/app/actions/layouts'
import FoutenLogOverzicht, { type FoutRij } from './FoutenLogOverzicht'

export const metadata: Metadata = { title: 'Foutenlog' }
export const dynamic = 'force-dynamic'

/** Ruim boven wat je ooit handmatig doorneemt; voorkomt dat de pagina omvalt bij een storm. */
const MAX_RIJEN = 1000

export default async function FoutenLogPage() {
  // Stacktraces kunnen klantgegevens bevatten — alleen beheerders.
  await vereisModuleToegang('instellingen', 'beheren')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessie = (await createServerClient()) as any
    const { data: { user } } = await sessie.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // geen sessie: de tabel werkt ook zonder opgeslagen kolomindeling
  }

  const [foutenRes, layouts] = await Promise.all([
    admin
      .from('fout_logboek')
      .select('*')
      .order('laatst_op', { ascending: false })
      .limit(MAX_RIJEN),
    user_id ? laadLayouts(user_id, 'fouten-log') : [],
  ])

  const rijen = (foutenRes.data ?? []) as Array<Record<string, unknown>>

  // Namen los ophalen i.p.v. via een join: er lopen twee foreign keys naar `medewerkers`
  // (medewerker_id en opgelost_door), en dan heeft PostgREST een expliciete hint nodig.
  // Een kleine lookup is hier eenvoudiger en breekt niet als de constraint hernoemd wordt.
  const ids = [...new Set(rijen.flatMap(r => [r.medewerker_id, r.opgelost_door]).filter(Boolean))] as string[]
  const namen = new Map<string, string>()
  if (ids.length) {
    const { data } = await admin
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .in('id', ids)
    for (const m of (data ?? []) as Array<Record<string, string | null>>) {
      namen.set(m.id as string, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '))
    }
  }

  const fouten: FoutRij[] = rijen.map(r => ({
    ...(r as unknown as FoutRij),
    medewerker_naam: r.medewerker_id ? namen.get(r.medewerker_id as string) ?? null : null,
    opgelost_door_naam: r.opgelost_door ? namen.get(r.opgelost_door as string) ?? null : null,
  }))

  return <FoutenLogOverzicht fouten={fouten} layouts={layouts} user_id={user_id} />
}
