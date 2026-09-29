import type { ReactNode } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { getServicedeskAfronding } from '@/lib/dossiers/servicedesk-afronden'

/**
 * Wat de buitendienst vanaf de telefoon op een servicedeskbon zette, zichtbaar voor kantoor.
 *
 *  - `gereed`: de laatste gereedmelding (werkzaamheden + handtekening voor akkoord) — op Bon › Informatie.
 *  - `pakbonnen`: de pakbonfoto's — op Inkoop, naast de inkooporders, want daar vraag je je af
 *    welke facturen er nog komen.
 *
 * Toont niets als er niets is: een lege kaart op elke bon zonder melding is alleen ruis.
 */
const fmtMoment = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })

export default async function ServicedeskAfrondingKaart({ dossierId, deel }: {
  dossierId: string
  deel: 'gereed' | 'pakbonnen'
}) {
  const afronding = await getServicedeskAfronding(dossierId).catch(() => null)
  if (!afronding) return null

  if (deel === 'gereed') {
    const g = afronding.gereedmelding
    if (!g) return null
    return (
      <Wrapper>
        <Card style={{ maxWidth: 820 }}>
          <CardHeader>Gereed gemeld vanaf locatie</CardHeader>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
              {g.gemeldDoorNaam ?? 'Onbekend'} · {fmtMoment(g.gemeldOp)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--fg)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {g.uitgevoerdeWerkzaamheden}
            </div>
            {g.handtekeningUrl && (
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--neutral-500)', marginBottom: 4 }}>
                  Afgetekend{g.getekendDoor ? ` door ${g.getekendDoor}` : ''}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.handtekeningUrl} alt="Handtekening voor akkoord"
                  style={{ height: 96, maxWidth: 320, objectFit: 'contain', background: '#fafafa', border: '1px solid var(--border)', borderRadius: 8 }}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </Wrapper>
    )
  }

  const { pakbonnen } = afronding
  if (pakbonnen.length === 0) return null
  return (
    <Wrapper>
      <Card style={{ maxWidth: 820 }}>
        <CardHeader>Pakbonnen van de buitendienst ({pakbonnen.length})</CardHeader>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--neutral-500)', lineHeight: 1.5 }}>
            Hier hoort nog een inkoopfactuur bij, tenzij die al hieronder bij de orders staat.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
            {pakbonnen.map(p => (
              <a key={p.id} href={p.fotoUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', textDecoration: 'none', minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.fotoUrl} alt={p.opmerking ?? 'Pakbon'}
                  style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                />
                {p.opmerking && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginTop: 4, wordBreak: 'break-word' }}>
                    {p.opmerking}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginTop: 2 }}>
                  {p.geuploadDoorNaam ?? 'Onbekend'} · {fmtMoment(p.geuploadOp)}
                </div>
              </a>
            ))}
          </div>
        </CardBody>
      </Card>
    </Wrapper>
  )
}

/** Zelfde paginamarge als de tabs eromheen, zonder dubbele ruimte eronder. */
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px) 0' }}>
      {children}
    </div>
  )
}
