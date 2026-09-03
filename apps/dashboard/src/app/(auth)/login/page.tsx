import { cookies, headers } from 'next/headers'
import { APPARAAT_COOKIE } from '@everts/database/cookies'
import { isMobielVerzoek } from '@/lib/isMobileUA'
import { veiligNextPad } from '@/lib/auth/next-pad'
import DesktopLogin from '@/components/auth/DesktopLogin'
import MobielLogin from '@/components/auth/MobielLogin'

export const metadata = { title: 'Inloggen · EVA' }

/**
 * Inlogpagina. Server-component die op basis van de User-Agent meteen de juiste
 * variant rendert: een aparte mobiele inlogpagina op telefoons en tablets, de
 * desktop-login daarbuiten. Server-side beslist → geen flits van de verkeerde
 * variant.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string; next?: string }>
}) {
  const { fout, next } = await searchParams
  const mobiel = isMobielVerzoek(
    (await headers()).get('user-agent'),
    (await cookies()).get(APPARAAT_COOKIE)?.value,
  )

  // Bestemming waar de bezoeker naartoe wilde (zie lib/auth/next-pad.ts). Hier al
  // gevalideerd, zodat de client-componenten er blind op kunnen vertrouwen.
  const bestemming = veiligNextPad(next) ?? undefined

  return mobiel
    ? <MobielLogin fout={fout} next={bestemming} />
    : <DesktopLogin fout={fout} next={bestemming} />
}
