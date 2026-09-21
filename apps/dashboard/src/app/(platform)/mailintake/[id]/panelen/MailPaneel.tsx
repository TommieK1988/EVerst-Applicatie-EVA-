'use client'

/**
 * De linkerkolom van het behandelscherm: de mail zoals hij binnenkwam.
 *
 * De tekst wordt als **platte tekst** gerenderd, nooit als HTML. Dat is bewust: in
 * klantmail zitten tracking-pixels en remote content, en de tekst is bij het ophalen
 * al gestript. Wie hier ooit `dangerouslySetInnerHTML` neerzet, haalt die
 * bescherming weg.
 */

import React from 'react'

import { Badge, Card } from '@/components/ui'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
const kop = { fontSize: 13, fontWeight: 600, marginBottom: 6 } as const

function bytes(n: number | null): string {
  if (!n) return ''
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`
}

export interface MailBijlage {
  id: string
  bestandsnaam: string
  content_type: string | null
  grootte_bytes: number | null
  opslag_pad: string | null
  te_groot: boolean
}

/** Is dit een plaatje waar een voorbeeld van te tonen valt? */
function isAfbeelding(b: MailBijlage): boolean {
  const type = (b.content_type ?? '').toLowerCase()
  if (type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp)$/i.test(b.bestandsnaam)
}

/**
 * Voorbeelden van de meegestuurde plattegronden en foto's.
 *
 * Een bestandsnaam als "BG.png" zegt niets; het plaatje zegt meteen of het een
 * plattegrond is of een foto van een lekkage. De links zijn kortlopend en worden
 * per bijlage opgevraagd, dus ze worden pas geladen als het paneel in beeld komt.
 */
function Afbeeldingen({
  bijlagen, onOpenBijlage, haalUrl,
}: {
  bijlagen: MailBijlage[]
  onOpenBijlage: (id: string) => void
  haalUrl: (id: string) => Promise<string | null>
}) {
  const [urls, setUrls] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    let weg = false
    void (async () => {
      for (const b of bijlagen) {
        if (!b.opslag_pad) continue
        const url = await haalUrl(b.id).catch(() => null)
        if (weg) return
        if (url) setUrls(vorig => ({ ...vorig, [b.id]: url }))
      }
    })()
    return () => { weg = true }
    // De lijst verandert niet tijdens de levensduur van dit scherm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div style={kop}>Meegestuurde afbeeldingen</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
        {bijlagen.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpenBijlage(b.id)}
            title={`${b.bestandsnaam} — openen`}
            style={{
              padding: 0, border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--surface-2, var(--bg))', cursor: 'pointer',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}
          >
            {urls[b.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[b.id]}
                alt={b.bestandsnaam}
                style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <span style={{ ...klein, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                laden…
              </span>
            )}
            <span style={{
              ...klein, padding: '3px 5px', textAlign: 'left',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {b.bestandsnaam}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function MailPaneel({
  bericht, bijlagen, groepsMails = [], onOpenBijlage, haalBijlageUrl,
}: {
  bericht: {
    onderwerp: string | null
    van_naam: string | null
    van_adres: string | null
    ontvangen_op: string
    aan: string[] | null
    cc: string[] | null
    body_tekst: string | null
    postbus?: { naam?: string | null } | null
  }
  bijlagen: MailBijlage[]
  /**
   * De andere mails over dezelfde klus. EVA heeft ze als geheel gelezen, dus ze
   * horen ook als geheel in beeld: anders kijkt de behandelaar naar een formulier
   * dat gevuld is uit tekst die hij nergens ziet staan.
   */
  groepsMails?: {
    id: string
    onderwerp: string | null
    ontvangenOp: string
    vanNaam: string | null
    vanAdres: string | null
    bodyTekst: string | null
    aantalBijlagen: number
  }[]
  onOpenBijlage: (id: string) => void
  /** Kortlopende link naar één bijlage; gebruikt voor de voorbeelden. */
  haalBijlageUrl: (id: string) => Promise<string | null>
}) {
  return (
    <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={kop}>{bericht.onderwerp ?? '(geen onderwerp)'}</div>
        <div style={zacht}>{bericht.van_naam ?? ''} &lt;{bericht.van_adres ?? 'onbekend'}&gt;</div>
        <div style={klein}>
          {new Date(bericht.ontvangen_op).toLocaleString('nl-NL')} · {bericht.postbus?.naam}
        </div>
        {bericht.aan?.length ? <div style={klein}>Aan: {bericht.aan.join(', ')}</div> : null}
        {bericht.cc?.length ? <div style={klein}>Cc: {bericht.cc.join(', ')}</div> : null}
      </div>

      <div style={{
        whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5,
        maxHeight: 420, overflowY: 'auto', padding: 10, borderRadius: 6,
        background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)',
      }}>
        {bericht.body_tekst || '(lege mail)'}
      </div>

      {groepsMails.length > 0 && (
        <div>
          <div style={kop}>
            Ook over deze klus
            <span style={{ ...klein, fontWeight: 400 }}>
              {' '}— meegelezen bij het invullen
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groepsMails.map(m => (
              <details
                key={m.id}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 9px' }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                  {m.onderwerp ?? '(geen onderwerp)'}
                  <span style={{ ...klein, display: 'block' }}>
                    {m.vanNaam ?? m.vanAdres ?? 'onbekend'} ·{' '}
                    {new Date(m.ontvangenOp).toLocaleString('nl-NL')}
                    {m.aantalBijlagen > 0 && ` · ${m.aantalBijlagen} bijlage${m.aantalBijlagen === 1 ? '' : 'n'}`}
                  </span>
                </summary>
                <div style={{
                  whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, marginTop: 6,
                  maxHeight: 260, overflowY: 'auto',
                }}>
                  {m.bodyTekst || '(lege mail)'}
                </div>
                <a
                  href={`/mailintake/${m.id}`}
                  style={{ fontSize: 12, color: 'hsl(var(--primary))' }}
                >
                  Deze mail openen
                </a>
              </details>
            ))}
          </div>
        </div>
      )}

      {bijlagen.some(isAfbeelding) && (
        <Afbeeldingen
          bijlagen={bijlagen.filter(isAfbeelding)}
          onOpenBijlage={onOpenBijlage}
          haalUrl={haalBijlageUrl}
        />
      )}

      {bijlagen.length > 0 && (
        <div>
          <div style={kop}>Bijlagen</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bijlagen.map(bij => (
              <div key={bij.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <button
                  onClick={() => onOpenBijlage(bij.id)}
                  disabled={!bij.opslag_pad}
                  style={{
                    background: 'none', border: 'none', padding: 0, textAlign: 'left',
                    color: bij.opslag_pad ? 'hsl(var(--primary))' : 'var(--fg-muted)',
                    cursor: bij.opslag_pad ? 'pointer' : 'default',
                    textDecoration: bij.opslag_pad ? 'underline' : 'none',
                  }}
                >
                  {bij.bestandsnaam}
                </button>
                <span style={klein}>{bytes(bij.grootte_bytes)}</span>
                {bij.te_groot && <Badge tone="warning">niet gelezen</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
