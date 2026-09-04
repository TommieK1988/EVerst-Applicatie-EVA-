import { createAdminClient } from '@everts/database/server'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import AppHeader from '@/components/mobiel/AppHeader'
import ScanScherm from '@/components/mobiel/materieel/ScanScherm'

export const metadata = { title: 'Materieel scannen' }
export const dynamic = 'force-dynamic'

/**
 * Sticker scannen op de telefoon.
 *
 * `?koppelAan=<id>` zet het scherm in koppelmodus: de gescande sticker gaat aan
 * dat object vast in plaats van een nieuw paspoort te openen.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ koppelAan?: string }>
}) {
  const medewerker = await vereisMaterieelToegang('lezen', '/m')
  const rechten = await getEffectieveRechten(medewerker)
  const magToevoegen = heeftModuleToegang(rechten, 'materieelbeheer', 'schrijven')

  const { koppelAan } = await searchParams
  let koppelAanNaam: string | null = null
  if (koppelAan) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createAdminClient() as any)
      .from('materieel_objecten').select('omschrijving').eq('id', koppelAan).maybeSingle()
    koppelAanNaam = (data as { omschrijving: string } | null)?.omschrijving ?? null
  }

  return (
    <>
      <AppHeader
        title="Scannen"
        sub={koppelAanNaam ? 'Sticker koppelen' : 'QR-sticker op materieel'}
        backHref={koppelAan ? `/m/materieel/${koppelAan}` : '/m/materieel'}
      />
      <ScanScherm
        magToevoegen={magToevoegen}
        koppelAanId={koppelAan ?? null}
        koppelAanNaam={koppelAanNaam}
      />
    </>
  )
}
