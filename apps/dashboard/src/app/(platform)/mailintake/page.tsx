import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'

import { laadLayouts } from '@/app/actions/layouts'
import { vereisRecht } from '@/lib/auth/rechten'
// Niet `rechten.mailintake === 'beheren'`: die vergelijking mist de beheerder,
// die via isBeheerder overal doorkomt. vereisRecht gebruikt dezelfde helper,
// dus anders kom je wel op de pagina maar staat alles op alleen-lezen.
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { getPostvakRijen, getPostvakTellers, getAiStoring, type PostvakTab } from '@/lib/mailintake/data'

import Postvak from './Postvak'

export const metadata: Metadata = { title: 'Postvak' }
export const dynamic = 'force-dynamic'

const GELDIGE_TABS = ['te_behandelen', 'verwerkt', 'geen_aanvraag', 'genegeerd', 'mislukt', 'alles']

export default async function MailintakePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { rechten } = await vereisRecht('mailintake', 'lezen')
  const params = await searchParams
  const tab = (GELDIGE_TABS.includes(params.tab ?? '') ? params.tab : 'te_behandelen') as PostvakTab

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    /* geen sessie */
  }

  const [rijen, tellers, layouts, storing] = await Promise.all([
    getPostvakRijen(tab),
    getPostvakTellers(),
    user_id ? laadLayouts(user_id, 'mailintake') : [],
    getAiStoring(),
  ])

  return (
    <Postvak
      rijen={rijen}
      tellers={tellers}
      storing={storing}
      actieveTab={tab}
      layouts={layouts}
      user_id={user_id}
      magSchrijven={heeftModuleToegang(rechten, 'mailintake', 'schrijven')}
      magBeheren={heeftModuleToegang(rechten, 'mailintake', 'beheren')}
    />
  )
}
