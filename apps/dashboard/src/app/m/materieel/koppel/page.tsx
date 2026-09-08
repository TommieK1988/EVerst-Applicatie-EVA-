import { redirect } from 'next/navigation'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { codeLabel } from '@/lib/materieel/qr'
import { getZonderSticker, telZonderSticker } from '@/lib/materieel/zoeken'
import AppHeader from '@/components/mobiel/AppHeader'
import KoppelLijst from '@/components/mobiel/materieel/KoppelLijst'

export const metadata = { title: 'Sticker koppelen' }
export const dynamic = 'force-dynamic'

/**
 * Een gescande sticker aan bestaand materieel hangen.
 *
 * Komt hier vandaan: je scant een verse sticker, EVA kent hem niet, en het
 * object staat al in de lijst (ingevoerd door kantoor of uit een import). Zonder
 * dit scherm was de enige uitweg "nieuw materieel aanmaken" — en dan sta je een
 * dubbele in de database te maken.
 *
 * Vereist 'schrijven': een sticker koppelen is een mutatie.
 */
export default async function KoppelPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  await vereisMaterieelToegang('schrijven', '/m')
  const { code } = await searchParams
  if (!code?.trim()) redirect('/m/materieel/scan')

  const [lijst, totaal] = await Promise.all([
    getZonderSticker(null, 50),
    telZonderSticker(),
  ])

  return (
    <>
      <AppHeader title="Sticker koppelen" sub={codeLabel(code)} backHref="/m/materieel/scan" />
      <KoppelLijst code={code} start={lijst} totaal={totaal} />
    </>
  )
}
