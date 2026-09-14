import React from 'react'
import { Phone } from 'lucide-react'
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
 */
export default function BelKnop({ contact, label }: { contact: Contact; label?: string }) {
  if (!contact.nummer) return null
  const gekozen = label || (contact.naam ? `Bel ${contact.naam}` : `Bel ${contact.rol}`)

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
      <Phone size={19} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {gekozen}
      </span>
    </a>
  )
}
