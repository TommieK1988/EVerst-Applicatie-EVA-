'use client'

/**
 * Bellen, mailen en navigeren met één tik.
 *
 * Staat bovenaan het klantbeeld omdat dit vaak de reden is dat je het scherm opent. Een knop
 * zonder gegeven wordt uitgegrijsd in plaats van weggelaten: een rij die van plek verspringt
 * afhankelijk van wat er ingevuld is, tik je op de tast mis.
 *
 * `tel:` en `mailto:` laat het toestel zelf afhandelen. Voor de route gebruiken we een
 * gewone maps-URL met het adres als zoekterm; dat opent op iOS en Android de kaart-app en
 * werkt ook in een browser.
 */

import React from 'react'
import { Mail, MapPin, Phone } from 'lucide-react'
import { GRIJS, OPPERVLAK, RAND, TEKST } from './stijl'

function Knop({
  href, label, Icon,
}: {
  href: string | null
  label: string
  Icon: typeof Phone
}) {
  const uit = !href
  const stijl: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
    padding: '11px 6px', borderRadius: 12,
    background: OPPERVLAK, border: `1px solid ${RAND}`,
    color: uit ? GRIJS : TEKST, opacity: uit ? 0.45 : 1,
    fontSize: 12, fontWeight: 600, textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
  }

  const inhoud = <><Icon size={19} aria-hidden /><span>{label}</span></>

  if (uit) {
    return <div style={stijl} aria-disabled="true">{inhoud}</div>
  }
  return <a href={href} style={stijl}>{inhoud}</a>
}

export default function ContactKnoppen({
  telefoon, email, adres,
}: {
  telefoon: string | null
  email: string | null
  adres: string | null
}) {
  // Spaties en streepjes in een telefoonnummer breken sommige toestellen; tel: wil ze niet.
  const telHref = telefoon ? `tel:${telefoon.replace(/[^\d+]/g, '')}` : null

  return (
    <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0' }}>
      <Knop href={telHref} label="Bellen" Icon={Phone} />
      <Knop href={email ? `mailto:${email}` : null} label="Mailen" Icon={Mail} />
      <Knop
        href={adres ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}` : null}
        label="Route"
        Icon={MapPin}
      />
    </div>
  )
}
