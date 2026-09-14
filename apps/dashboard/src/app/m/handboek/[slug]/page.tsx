import { notFound } from 'next/navigation'
import { vereisHandboekLezer } from '@/lib/handboek/auth'
import { haalBijlagen, haalSectie } from '@/lib/handboek/inhoud'
import { bijlageUrl, leesbareGrootte } from '@/lib/handboek/bijlagen'
import AppHeader from '@/components/mobiel/AppHeader'
import BlokRenderer from '@/components/handboek/BlokRenderer'
import BlokFocus from '@/components/handboek/mobiel/BlokFocus'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sectie = await haalSectie(slug)
  return { title: sectie?.titel ?? 'Handboek' }
}

/**
 * Eén hoofdstuk van het handboek.
 *
 * Een hoofdstuk dat deze medewerker niet mag zien, geeft `notFound()` — niet
 * een lege pagina met alleen de titel. Anders vertelt de pagina alsnog dát er
 * een hoofdstuk "Mobiele telefoon" bestaat waar hij buiten valt.
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

  return (
    <>
      <AppHeader title={sectie.titel} backHref="/m/handboek" />
      <div style={{ padding: '16px 16px 32px' }}>
        {sectie.samenvatting && (
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {sectie.samenvatting}
          </p>
        )}

        {sectie.blokken.map((blok) => (
          <BlokRenderer key={blok.id} blok={blok} />
        ))}

        {bijlagen.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)',
              textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
            }}>
              Bijlagen
            </div>
            {bijlagen.map((b) => (
              <a
                key={b.id}
                href={bijlageUrl(b.id)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block', marginBottom: 6,
                  padding: '12px', borderRadius: 11,
                  background: 'var(--bg-elev)', border: '1px solid var(--border)',
                  textDecoration: 'none', color: 'var(--fg)',
                }}
              >
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{b.titel}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginTop: 2 }}>
                  {[b.omschrijving, leesbareGrootte(b.grootte)].filter(Boolean).join(' · ')}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
      <BlokFocus />
    </>
  )
}
