import React from 'react'
import Link from 'next/link'
import type { UitvoerActie, UitvoerActieSoort } from '@/lib/taken/uitvoeracties'

/**
 * Startknop voor een actie met een doorloop.
 *
 * De vorm komt van de kwaliteitsronde: een volle, gevulde knop over de breedte in plaats van een
 * licht pilletje. Die keuze gold eerst alleen daar, maar geldt net zo goed voor een formulier of
 * een toolbox -- het is werk dat je op locatie doet, en de ingang ernaartoe mag je niet over het
 * hoofd zien. Eén kleur voor alle drie, zodat groen leest als "hier tikken om het werk te doen";
 * het icoon en het label zeggen wélk werk.
 */

const ICOON_PAD: Record<UitvoerActieSoort, string> = {
  formulier: 'M9 13h6m-6 4h6M9 9h1M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z',
  kwaliteit: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  toolbox:   'M12 2L3 7v6c0 5 3.5 8 9 9 5.5-1 9-4 9-9V7l-9-5z',
  opname:    'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2M8.5 11h7M8.5 14.5h7M8.5 18h4',
}

function Icoon({ soort, maat, dikte }: { soort: UitvoerActieSoort; maat: number; dikte: number }) {
  return (
    <svg width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={dikte}>
      <path d={ICOON_PAD[soort]} />
    </svg>
  )
}

export default function TaakUitvoerKnop({ actie }: { actie: UitvoerActie }) {
  return (
    <Link
      href={actie.href}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '13px 16px', borderRadius: 10,
        background: '#009439', color: '#fff',
        fontSize: 15, fontWeight: 700, textDecoration: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icoon soort={actie.soort} maat={17} dikte={2.2} />
      {actie.label}
    </Link>
  )
}

/**
 * Staat op de plek van het afvinkvakje bij een actie met een doorloop. Geen knop: zo'n actie sluit
 * zichzelf zodra de doorloop af is, en handmatig afvinken wordt serverzijdig geweigerd.
 */
export function UitvoerBadge({ actie }: { actie: UitvoerActie }) {
  return (
    <div
      aria-label={actie.badgeUitleg}
      title={actie.badgeUitleg}
      style={{
        width: 22, height: 22, flexShrink: 0, marginTop: 1,
        borderRadius: 6, border: '2px solid var(--border)', background: '#f7f9fa',
        display: 'grid', placeItems: 'center', color: '#8a949b',
      }}
    >
      <Icoon soort={actie.soort} maat={12} dikte={2.2} />
    </div>
  )
}
