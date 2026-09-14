import { notFound } from 'next/navigation'
import { vereisHandboekLezer } from '@/lib/handboek/auth'
import { haalContacten, haalSectie } from '@/lib/handboek/inhoud'
import { dbSlug } from '@/lib/handboek/paden'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import BlokRenderer from '@/components/handboek/BlokRenderer'
import BlokFocus from '@/components/handboek/mobiel/BlokFocus'
import BelKnop from '@/components/handboek/mobiel/BelKnop'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sectie = await haalSectie(dbSlug(slug, 'situatie'))
  return { title: sectie ? `Wat te doen bij ${sectie.titel.toLowerCase()}` : 'Handboek' }
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

  const stappen = sectie.blokken.filter((b) => b.type === 'stap')
  const overig = sectie.blokken.filter((b) => b.type !== 'stap' && b.type !== 'contact')
  const contactBlokken = sectie.blokken.filter((b) => b.type === 'contact')

  // Alleen de contacten ophalen als deze kaart er een gebruikt; anders is dit
  // een query voor niets op een scherm dat snel moet openen.
  const contacten = contactBlokken.length ? await haalContacten() : []
  const knoppen = contactBlokken
    .map((b) => ({
      blok: b,
      contact: contacten.find((c) => c.id === b.inhoud?.contact_id),
    }))
    .filter((x) => x.contact?.nummer)

  return (
    <>
      <AppHeader title={sectie.titel} sub="Wat te doen bij…" backHref="/m/handboek" />
      {/* minHeight + kolom, zodat de knoppenbalk ook bij een korte kaart
          onderaan blijft plakken (zie MobielStickyFooter). */}
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 24px', flex: 1 }}>
          {sectie.samenvatting && (
            <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
              {sectie.samenvatting}
            </p>
          )}

          {stappen.length > 0 && (
            <ol style={{
                margin: 0, paddingLeft: 24,
                // Expliciet: Tailwind preflight zet `list-style: none` op elke
                // lijst, en een stappenplan zonder nummers is geen stappenplan.
                listStyleType: 'decimal',
              }}>
              {stappen.map((blok) => (
                <BlokRenderer key={blok.id} blok={blok} />
              ))}
            </ol>
          )}

          {overig.length > 0 && (
            <div style={{ marginTop: stappen.length ? 18 : 0 }}>
              {overig.map((blok) => (
                <BlokRenderer key={blok.id} blok={blok} />
              ))}
            </div>
          )}
        </div>

        {knoppen.length > 0 && (
          <MobielStickyFooter>
            {knoppen.map(({ blok, contact }) => (
              <BelKnop key={blok.id} contact={contact!} label={blok.inhoud?.label} />
            ))}
          </MobielStickyFooter>
        )}
      </div>
      <BlokFocus />
    </>
  )
}
