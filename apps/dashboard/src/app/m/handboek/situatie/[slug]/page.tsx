import { notFound } from 'next/navigation'
import { vereisHandboekLezer } from '@/lib/handboek/auth'
import { haalContacten, haalSectie } from '@/lib/handboek/inhoud'
import { dbSlug } from '@/lib/handboek/paden'
import { getAppVertaler } from '@/i18n/server'
import HandboekSituatie, { type SituatieBelKnop } from '@/components/handboek/mobiel/HandboekSituatie'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sectie = await haalSectie(dbSlug(slug, 'situatie'))
  const t = await getAppVertaler('handboek')
  return { title: sectie ? t('situatieMetaTitel', { titel: sectie.titel.toLowerCase() }) : t('titel') }
}

/**
 * Eén "Wat te doen bij…"-kaart.
 *
 * Dit scherm wordt geopend op het slechtste moment van de dag, met één hand,
 * mogelijk met handschoenen aan. Daarom: genummerde stappen in grote letters,
 * veel witruimte, en de belknop als vaste balk onderaan zodat je er niet naar
 * hoeft te zoeken.
 *
 * De contact-blokken worden bewust uit de tekstflow gehaald en onderaan als
 * belknop gezet; `BlokRenderer` rendert ze daarom zelf niet.
 *
 * De weergave (en het tijdelijk vertalen) zit in `HandboekSituatie`.
 */
export default async function HandboekSituatiePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await vereisHandboekLezer()
  const { slug } = await params

  const sectie = await haalSectie(dbSlug(slug, 'situatie'))
  if (!sectie || sectie.soort !== 'situatie') notFound()

  const contactBlokken = sectie.blokken.filter((b) => b.type === 'contact')

  // Alleen de contacten ophalen als deze kaart er een gebruikt; anders is dit
  // een query voor niets op een scherm dat snel moet openen.
  const contacten = contactBlokken.length ? await haalContacten() : []
  const knoppen: SituatieBelKnop[] = contactBlokken
    .map((b) => ({
      blokId: b.id,
      label: b.inhoud?.label as string | undefined,
      contact: contacten.find((c) => c.id === b.inhoud?.contact_id),
    }))
    .filter((x): x is SituatieBelKnop => !!x.contact?.nummer)

  return <HandboekSituatie sectie={sectie} knoppen={knoppen} />
}
