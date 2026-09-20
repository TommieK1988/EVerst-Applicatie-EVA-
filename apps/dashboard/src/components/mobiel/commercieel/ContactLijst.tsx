'use client'

/**
 * De mensen bij deze klant, met bel- en mailknopjes per persoon.
 *
 * Mobiel gaat vóór vast: op een telefoonnummer van kantoor krijg je de receptie, op een
 * mobiel nummer de persoon zelf — en dit scherm bestaat om die persoon te bereiken. De
 * primaire contactpersoon staat bovenaan (gesorteerd in de leeslaag).
 */

import React from 'react'
import { Mail, Phone } from 'lucide-react'
import type { KlantContactpersoon } from '@/lib/commercie/klantbeeld-types'
import { GRIJS, OPPERVLAK, RAND, TEKST } from './stijl'

function IconKnop({ href, label, Icon }: { href: string; label: string; Icon: typeof Phone }) {
  return (
    <a
      href={href}
      aria-label={label}
      style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', border: `1px solid ${RAND}`, color: TEKST,
        textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icon size={17} aria-hidden />
    </a>
  )
}

export default function ContactLijst({ personen }: { personen: KlantContactpersoon[] }) {
  return (
    <>
      {personen.map(p => {
        const nummer = p.mobiel || p.telefoon
        const telHref = nummer ? `tel:${nummer.replace(/[^\d+]/g, '')}` : null
        return (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 12px', borderRadius: 12,
              background: OPPERVLAK, border: `1px solid ${RAND}`, marginBottom: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14.5, fontWeight: 600, color: TEKST,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.naam}
                {p.isPrimair && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: GRIJS, marginLeft: 6 }}>
                    primair
                  </span>
                )}
              </div>
              {(p.functie || nummer) && (
                <div style={{
                  fontSize: 12.5, color: GRIJS, marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {[p.functie, nummer].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {telHref && <IconKnop href={telHref} label={`Bel ${p.naam}`} Icon={Phone} />}
            {p.email && <IconKnop href={`mailto:${p.email}`} label={`Mail ${p.naam}`} Icon={Mail} />}
          </div>
        )
      })}
    </>
  )
}
