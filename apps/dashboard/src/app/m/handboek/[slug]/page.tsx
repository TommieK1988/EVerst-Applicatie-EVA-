import { notFound } from 'next/navigation'
import { vereisHandboekLezer } from '@/lib/handboek/auth'
import { haalBijlagen, haalSectie } from '@/lib/handboek/inhoud'
import { getAppVertaler } from '@/i18n/server'
import HandboekHoofdstuk from '@/components/handboek/mobiel/HandboekHoofdstuk'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sectie = await haalSectie(slug)
  if (sectie) return { title: sectie.titel }
  const t = await getAppVertaler('handboek')
  return { title: t('titel') }
}

/**
 * Eén hoofdstuk van het handboek.
 *
 * Een hoofdstuk dat deze medewerker niet mag zien, geeft `notFound()` — niet
 * een lege pagina met alleen de titel. Anders vertelt de pagina alsnog dát er
 * een hoofdstuk "Mobiele telefoon" bestaat waar hij buiten valt.
 *
 * De weergave (en het tijdelijk vertalen) zit in `HandboekHoofdstuk`.
 */
export default async function HandboekHoofdstukPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await vereisHandboekLezer()
  const { slug } = await params

  const sectie = await haalSectie(slug)
  if (!sectie || sectie.soort !== 'hoofdstuk') notFound()

  const bijlagen = await haalBijlagen(sectie.id)

  return <HandboekHoofdstuk sectie={sectie} bijlagen={bijlagen} />
}
