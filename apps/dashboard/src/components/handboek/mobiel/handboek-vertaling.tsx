'use client'

import React, { useState } from 'react'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import { VertaalLabel } from '@/components/vertalen/VertaalbareTekst'
import type { Blok } from '@/lib/handboek/types'

/**
 * Tijdelijk vertalen van een handboekpagina in EVA Mobiel.
 *
 * Alle teksten van één pagina gaan in één bundel naar de vertaler, en er staat
 * één "Automatisch vertaald · Toon origineel"-label bovenaan waarmee de héle
 * pagina terug naar het Nederlands gaat. Dat is bewust: het handboek bevat
 * veiligheidsafspraken, en het origineel moet altijd één tik weg zijn.
 *
 * Alleen de weergave wordt vertaald; de blokken zelf (ids, anker, volgorde)
 * blijven gelijk, zodat zoekresultaten nog steeds op het juiste blok landen.
 * Op kantoor (taal `nl`) doet dit niets.
 */
export function usePaginaVertaling(teksten: (string | null | undefined)[]) {
  const vertalingen = useVertalingen(teksten)
  const [origineel, setOrigineel] = useState(false)
  const kaart = new Map(vertalingen.map((v) => [v.origineel, v.tekst]))
  const vertaald = vertalingen.some((v) => v.vertaald)

  function vt<T extends string | null | undefined>(tekst: T): T {
    if (!tekst || origineel) return tekst
    return (kaart.get(tekst) ?? tekst) as T
  }

  const label = vertaald
    ? <VertaalLabel origineel={origineel} wissel={() => setOrigineel((o) => !o)} />
    : null

  return { vt, label }
}

/** Alle teksten in de blokken van een sectie, voor één vertaalverzoek. */
export function blokTeksten(blokken: Blok[]): string[] {
  const uit: string[] = []
  for (const b of blokken) {
    const i = b.inhoud ?? {}
    if (typeof i.tekst === 'string') uit.push(i.tekst)
    if (typeof i.toelichting === 'string') uit.push(i.toelichting)
    if (typeof i.bijschrift === 'string') uit.push(i.bijschrift)
    if (typeof i.label === 'string') uit.push(i.label)
    for (const item of i.items ?? []) if (typeof item === 'string') uit.push(item)
    for (const kop of i.kolommen ?? []) if (typeof kop === 'string') uit.push(kop)
    for (const rij of i.rijen ?? []) for (const cel of rij ?? []) if (typeof cel === 'string') uit.push(cel)
  }
  return uit
}

/** Hetzelfde blok met vertaalde teksten; id, type en overige velden blijven gelijk. */
export function vertaalBlok(blok: Blok, vt: <T extends string | null | undefined>(t: T) => T): Blok {
  const i = blok.inhoud
  if (!i) return blok
  const nieuw = { ...i }
  if (typeof i.tekst === 'string') nieuw.tekst = vt(i.tekst)
  if (typeof i.toelichting === 'string') nieuw.toelichting = vt(i.toelichting)
  if (typeof i.bijschrift === 'string') nieuw.bijschrift = vt(i.bijschrift)
  if (typeof i.label === 'string') nieuw.label = vt(i.label)
  if (Array.isArray(i.items)) nieuw.items = i.items.map((x: string) => vt(x))
  if (Array.isArray(i.kolommen)) nieuw.kolommen = i.kolommen.map((x: string) => vt(x))
  if (Array.isArray(i.rijen)) nieuw.rijen = i.rijen.map((r: string[]) => (r ?? []).map((x) => vt(x)))
  return { ...blok, inhoud: nieuw }
}
