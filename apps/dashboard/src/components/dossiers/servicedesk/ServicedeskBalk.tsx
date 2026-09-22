import { Suspense } from 'react'
import { FACTURATIE_LABELS, servicedeskLadder, type DossierRij } from '../types'
import { MandaatBalk } from './MandaatBalk'

/**
 * De vaste strip boven elke tab van een servicedeskbon: waar staat hij, hoe rekent hij af, en
 * hoeveel van het mandaat is op.
 *
 * Boven de tabinhoud en niet ín een tab, omdat het antwoord op die drie vragen overal even
 * relevant is. Wie op Facturatie kijkt moet net zo goed zien dat het mandaat bijna op is als wie
 * op de Bon staat.
 *
 * De knoppen staan hier bewust níét (op de mandaatknop na, die alleen verschijnt als er iets aan
 * de hand is). Die horen op de Bon-pagina, waar je ze verwacht en waar ruimte is om uit te leggen
 * waarom er eentje uit staat. Zie `BonActies`.
 */
export function ServicedeskBalk({ dossier }: { dossier: DossierRij }) {
  const substatus = dossier.servicedesk_substatus ?? null
  const status = substatus
    ? servicedeskLadder(dossier).find(s => s.key === substatus)
    : undefined

  const methode = dossier.facturatiemethode === 'termijnen' ? 'termijnen' : 'regie'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      padding: '10px 32px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-elev, #fff)',
    }}>
      <Veld label="Status">
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 999,
          background: 'var(--brand-50, #ecfaf0)', color: 'var(--brand-700, #0a5e28)',
          fontSize: 12, fontWeight: 600,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--brand-500, #009439)' }} />
          {status?.label ?? 'Onbekend'}
        </span>
      </Veld>

      <Veld label="Afrekenwijze">
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {FACTURATIE_LABELS[methode]}
        </span>
      </Veld>

      {/* Naar rechts, en pas zichtbaar als er een mandaat is ingevuld. Het ophalen kost een
          Bouw7-ronde, dus achter een Suspense: de balk en de tab eronder staan er meteen. */}
      <div style={{ marginLeft: 'auto' }}>
        <Suspense fallback={null}>
          <MandaatBalk dossierId={dossier.id} />
        </Suspense>
      </div>
    </div>
  )
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--fg-muted)',
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}
