'use client'

import React, { useEffect, useState } from 'react'
import { Button, Combobox, type ComboboxOption } from '@/components/ui'
import {
  getBewakingscodeKeuze, wijzigInkoopBewakingscode, type BewakingscodeKeuze,
} from '@/lib/inkoopfacturen/goedkeur-scherm'

/**
 * Bewakingscode van een inkoopfactuur bekijken en wijzigen. Het wijzigen schrijft naar de leverbon
 * in Bouw7 (zie `goedkeur-scherm.ts`); kan dat niet, dan staat de reden erbij in plaats van een
 * knop die toch niets doet.
 */

type Props = { inkoopfactuurId: string; onGewijzigd: (nieuw: { code: string; naam: string | null }) => void }

/** Dezelfde code kan in meerdere hoofdstukken staan; de keuze draagt daarom beide. */
const sleutel = (code: string, hoofdstukId: number | null) => `${code}|${hoofdstukId ?? ''}`

export default function BewakingscodeKiezer({ inkoopfactuurId, onGewijzigd }: Props) {
  const [keuze, setKeuze] = useState<BewakingscodeKeuze | null>(null)
  const [laden, setLaden] = useState(false)
  const [gekozen, setGekozen] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState(false)

  // Pas laden op verzoek: het haalt de projectstructuur uit Bouw7 en dat kost een paar seconden.
  useEffect(() => { setKeuze(null); setGekozen(''); setFout(null); setKlaar(false) }, [inkoopfactuurId])

  async function laad() {
    setLaden(true); setFout(null)
    try { setKeuze(await getBewakingscodeKeuze(inkoopfactuurId)) } catch (e) {
      setFout(e instanceof Error ? e.message : 'Laden mislukt')
    }
    setLaden(false)
  }

  async function opslaan() {
    const [code, hs] = gekozen.split('|')
    setBezig(true); setFout(null)
    const res = await wijzigInkoopBewakingscode(inkoopfactuurId, code, hs ? Number(hs) : null)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    const optie = keuze?.opties.find(o => sleutel(o.code, o.hoofdstukId) === gekozen)
    setKlaar(true); setGekozen('')
    await laad()
    onGewijzigd({ code, naam: optie?.naam ?? null })
  }

  const opties: ComboboxOption[] = (keuze?.opties ?? []).map(o => ({
    value: sleutel(o.code, o.hoofdstukId),
    label: o.naam ? `${o.code} · ${o.naam}` : o.code,
    sub: o.hoofdstukNaam ?? undefined,
  }))

  return (
    <div>
      {!keuze && (
        <Button variant="secondary" size="sm" disabled={laden} onClick={laad}>
          {laden ? 'Codes ophalen uit Bouw7…' : 'Bewakingscode wijzigen'}
        </Button>
      )}
      {keuze && (keuze.nietWijzigbaar
        ? <p style={{ fontSize: 12.5, color: 'var(--fg-soft)', margin: 0 }}>{keuze.nietWijzigbaar}</p>
        : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 240, flex: 1 }}>
              <Combobox options={opties} value={gekozen || undefined} onChange={setGekozen}
                placeholder="Kies een bewakingscode" searchPlaceholder="Zoek op code of naam" emptyText="Geen code gevonden" />
            </div>
            <Button size="sm" disabled={bezig || !gekozen} onClick={opslaan}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
          </div>
        ))}
      {keuze && !keuze.nietWijzigbaar && (
        <p style={{ fontSize: 12, color: 'var(--fg-soft)', margin: '4px 0 0' }}>
          {keuze.filterMelding ?? (keuze.opties.length
            ? 'Alleen bewakingscodes met een prognose.'
            : 'Dit project heeft nog geen bewakingscodes met een prognose.')}
        </p>
      )}
      {klaar && <p style={{ fontSize: 12.5, color: '#0f766e', margin: '6px 0 0' }}>Bewakingscode gewijzigd, ook in Bouw7.</p>}
      {fout && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '6px 0 0' }}>{fout}</p>}
    </div>
  )
}
