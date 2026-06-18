import { headers } from 'next/headers'
import { isMobileUA } from '@/lib/isMobileUA'
import DesktopLogin from '@/components/auth/DesktopLogin'
import MobielLogin from '@/components/auth/MobielLogin'

export const metadata = { title: 'Inloggen · EVA' }

/**
 * Inlogpagina. Server-component die op basis van de User-Agent meteen de juiste
 * variant rendert: een aparte mobiele inlogpagina op telefoons, de desktop-login
 * daarbuiten. Server-side beslist → geen flits van de verkeerde variant.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>
}) {
  const { fout } = await searchParams
  const mobiel = isMobileUA((await headers()).get('user-agent'))

  return mobiel ? <MobielLogin fout={fout} /> : <DesktopLogin fout={fout} />
}
