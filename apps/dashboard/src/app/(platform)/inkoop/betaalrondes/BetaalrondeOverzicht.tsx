'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import { maakBetaalronde, rondBetaalrondeAf } from '@/lib/inkoopfacturen/actions'
import type { BetaalrondeRij } from '@/lib/inkoopfacturen/types'

/**
 * Betaalrondes: welke goedgekeurde inkoopfacturen mogen mee in de eerstvolgende betaling.
 *
 * EVA betaalt niets en koppelt (nog) niet met Exact Online. Een ronde is een bevroren lijst die
 * de administratie in Exact klaarzet. Daarom heeft "afronden" hier een echte betekenis: daarna
 * staat de samenstelling vast, zodat het betaalbestand en de EVA-lijst niet uit elkaar lopen.
 */

function euro(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', vrijgegeven: 'Vrijgegeven', afgerond: 'Afgerond',
}

type Props = {
  rondes: BetaalrondeRij[]
  magBeheren: boolean
  allesZien: boolean
}

export default function BetaalrondeOverzicht({ rondes, magBeheren, allesZien }: Props) {
  const router = useRouter()
  const { bevestig, meld, vraagTekst } = useDialogen()
  const [bezig, setBezig] = useState(false)

  async function nieuw() {
    const naam = await vraagTekst({
      titel: 'Nieuwe betaalronde',
      omschrijving: 'Geef de ronde een naam die de administratie herkent, bijvoorbeeld "Week 37" of "15 september".',
      label: 'Naam',
    })
    if (!naam) return
    setBezig(true)
    const res = await maakBetaalronde(naam, null)
    setBezig(false)
    if (!res.ok) { await meld({ titel: 'Aanmaken mislukt', omschrijving: res.error }); return }
    router.refresh()
  }

  async function afronden(ronde: BetaalrondeRij) {
    const ok = await bevestig({
      titel: `"${ronde.naam}" afronden?`,
      omschrijving:
        `Deze ronde bevat ${ronde.aantal_facturen} facturen voor ${euro(ronde.totaal_incl)}. `
        + 'Na afronden kunnen er geen facturen meer bij of af — de administratie kan hem dan in Exact klaarzetten.',
      bevestigLabel: 'Afronden',
    })
    if (!ok) return
    setBezig(true)
    const res = await rondBetaalrondeAf(ronde.id)
    setBezig(false)
    if (!res.ok) { await meld({ titel: 'Afronden mislukt', omschrijving: res.error }); return }
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: 0, flex: 1 }}>
          Facturen zet je in een ronde vanaf het scherm Inkoopfacturen: selecteer ze daar en kies
          een ronde. Alleen goedgekeurde, nog niet betaalde facturen kunnen mee.
        </p>
        {magBeheren && (
          <Button size="sm" disabled={bezig} onClick={nieuw}>Nieuwe betaalronde</Button>
        )}
      </div>

      {!allesZien && (
        <p style={{ fontSize: 12, color: 'var(--fg-soft)', margin: 0 }}>
          De aantallen en bedragen hieronder tellen alleen de facturen die jij mag zien. Het
          werkelijke rondetotaal kan hoger liggen.
        </p>
      )}

      {rondes.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fg-soft)' }}>Er zijn nog geen betaalrondes.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rondes.map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.naam}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
                {STATUS_LABEL[r.status] ?? r.status} · betaaldatum {datum(r.betaaldatum)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{euro(r.totaal_incl)}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.aantal_facturen} facturen</div>
            </div>
            {magBeheren && r.status !== 'afgerond' && (
              <Button variant="secondary" size="sm" disabled={bezig} onClick={() => afronden(r)}>Afronden</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
