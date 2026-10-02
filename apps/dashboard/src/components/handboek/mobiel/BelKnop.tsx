'use client'

import React from 'react'
import { Phone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Contact } from '@/lib/handboek/types'

/**
 * Belknop onder een "Wat te doen bij"-kaart.
 *
 * Het nummer komt uit `personeelshandboek_contacten` → `medewerkers`, niet uit
 * de handboektekst. Verandert er iemand van 06-nummer of draagt hij de rol
 * over, dan klopt de knop vanzelf nog.
 *
 * `tel:` opent de kiezer met het nummer al ingevuld; bellen doet de gebruiker
 * zelf. De spaties en streepjes gaan eruit, want sommige Android-kiezers
 * struikelen daarover.
 *
 * De tekst mag over twee regels lopen: in het Pools en Tamil is "Bel …" een
 * stuk langer, en een afgekapte belknop is erger dan een hogere.
 */
export default function BelKnop({ contact, label }: { contact: Contact; label?: string }) {
  const t = useTranslations('handboek')
  if (!contact.nummer) return null
  const gekozen = label || t('belNaam', { naam: contact.naam || contact.rol })

  return (
    <a
      href={`tel:${contact.nummer.replace(/[\s-]/g, '')}`}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        padding: '15px 14px', borderRadius: 12,
        background: '#009439', color: '#fff', textDecoration: 'none',
        fontSize: 16, fontWeight: 800,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Phone size={19} style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0, whiteSpace: 'normal', textAlign: 'center', overflowWrap: 'anywhere' }}>
        {gekozen}
      </span>
    </a>
  )
}
