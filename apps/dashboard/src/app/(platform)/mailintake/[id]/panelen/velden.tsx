'use client'

/**
 * De gedeelde bouwstenen van het behandelscherm: de veldopmaak en het
 * zekerheidsbadge dat achter elk voorgevuld veld staat.
 *
 * Stonden eerder in het behandelscherm zelf, maar de panelen hadden ze allemaal
 * met de hand overgeschreven -- met licht afwijkende randen en kleuren tot gevolg.
 */

import React from 'react'

import { Badge } from '@/components/ui'
import { FormField, type VeldToon } from '@/components/ui/form-field'
import { VELD_BETROUWBAAR } from '@/lib/mailintake/types'

export const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
export const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
/**
 * Sectielabel boven een kolom of kaart.
 *
 * De DS-norm voor een card-header: 11px, 700, UPPERCASE, tracking 0,10em. Stond
 * hier op 13px/600 in gewone schrijfwijze en week daarmee af van elke andere kop
 * in EVA.
 */
export const kop = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.10em',
  textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: 6,
} as const

/** Invoerveld: radius md (6px) en padding op het 4px-raster, conform de spec. */
export const veldStijl: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13.5,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
}

/**
 * Percentage-badge achter een veld. Onder de 80% is het nakijken waard.
 *
 * De DS-`Badge` en niet een eigen pilletje: die had hier eigen kleuren met
 * losse hex-terugvallen, en week daarmee af van elke andere badge in EVA.
 */
export function Zekerheid({ score }: { score: number | undefined }) {
  if (score == null || score === 0) return null
  const goed = score >= VELD_BETROUWBAAR
  return (
    <Badge
      tone={goed ? 'success' : 'warning'}
      variant="solid"
      title={goed ? 'EVA is hier zeker van' : 'Controleer dit veld'}
    >
      {Math.round(score * 100)}%
    </Badge>
  )
}

/**
 * De labelregel van een veld, op een vaste hoogte.
 *
 * `Zekerheid` rendert niets als het model over dit veld niets zei. Zonder vaste
 * hoogte werd de labelregel daardoor per bericht een paar pixels hoger of lager, en
 * schoof alles eronder mee -- een van de redenen dat het scherm leek te verspringen
 * tussen twee mails. Met een vaste regelhoogte mag de badge gerust wegblijven.
 */
function Labelregel({ label, score }: { label: React.ReactNode; score?: number }) {
  return (
    <span className="inline-flex h-4 items-center gap-1.5">
      {label}
      <Zekerheid score={score} />
    </span>
  )
}

/**
 * Eén veld in het voorstel: label, zekerheid, invoer.
 *
 * Bouwt op `FormField` uit het design system, zodat labelgrootte, -kleur en
 * -afstand gelijk zijn aan elk ander formulier in EVA. Het was hier met de hand
 * nagemaakt en week daardoor net af.
 */
export function Veld({
  label, score, toon, toonUitleg, children,
}: {
  label: string
  score?: number
  /** De toestand van dit veld als kleur; zie `FormField`. Standaard kleurloos. */
  toon?: VeldToon
  /** Waarom die kleur, in gewone taal. Komt in de hovertekst. */
  toonUitleg?: string
  children: React.ReactNode
}) {
  return (
    <FormField upper tone={toon} toneTitle={toonUitleg} label={<Labelregel label={label} score={score} />}>
      {children}
    </FormField>
  )
}
