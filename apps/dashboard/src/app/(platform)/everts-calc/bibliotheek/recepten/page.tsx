import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import BiblioteekBeheer from '@/components/everts-calc/bibliotheek/BiblioteekBeheer'
import { getBibliotheekItems } from '@/lib/everts-calc/services/bibliotheek'

export const metadata: Metadata = { title: 'Recepten bibliotheek' }

export default async function ReceptenPage() {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [items, layouts] = await Promise.all([
    getBibliotheekItems(),
    user_id ? laadLayouts(user_id, 'everts-calc-recepten') : Promise.resolve([]),
  ])

  return <BiblioteekBeheer items={items} layouts={layouts} user_id={user_id} />
}
