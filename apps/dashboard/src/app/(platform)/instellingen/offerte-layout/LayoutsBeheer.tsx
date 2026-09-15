'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input, Badge, EmptyState, useDialogen } from '@/components/ui'
import { maakLayout, kopieerLayout, verwijderLayout, setStandaardLayout } from './actions'

type LayoutSoort = 'offerte' | 'interne_begroting'

interface LayoutItem {
  id: string
  naam: string
  beschrijving?: string | null
  primaire_kleur: string
  papier_formaat?: string | null
  papier_orientatie?: string | null
  is_standaard: boolean
  html_template?: string | null
  /** Lay-outs van vóór de splitsing hebben geen soort; dat zijn offerte-lay-outs. */
  soort?: LayoutSoort | null
  created_at: string
}

const SOORTEN: { soort: LayoutSoort; titel: string; uitleg: string }[] = [
  {
    soort: 'offerte',
    titel: 'Offerte',
    uitleg: 'Het document dat naar de opdrachtgever gaat.',
  },
  {
    soort: 'interne_begroting',
    titel: 'Interne begroting',
    uitleg:
      'De begrotingsstaat met uren, arbeid, materiaal, onderaanneming, kostprijs en opslag. '
      + 'Blijft binnen het bedrijf: EVA verstuurt dit document nooit zelf.',
  },
]

export default function LayoutsBeheer({ initial }: { initial: LayoutItem[] }) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [, startT] = useTransition()
  const [layouts, setLayouts] = useState(initial)
  const [showNieuw, setShowNieuw] = useState<LayoutSoort | null>(null)
  const [nieuwNaam, setNieuwNaam] = useState('')

  function handleMaakAan() {
    if (!nieuwNaam.trim() || !showNieuw) return
    const soort = showNieuw
    startT(async () => {
      try {
        const id = await maakLayout({ naam: nieuwNaam.trim(), soort })
        toast.success('Layout aangemaakt')
        setShowNieuw(null)
        setNieuwNaam('')
        router.push(`/instellingen/offerte-layout/${id}`)
      } catch { toast.error('Fout bij aanmaken') }
    })
  }

  function handleKopieer(id: string) {
    startT(async () => {
      try {
        const { id: nieuwId, waarschuwing } = await kopieerLayout(id)
        if (waarschuwing) toast(waarschuwing, { duration: 8000, icon: '⚠️' })
        else toast.success('Layout gekopieerd — met een eigen Word-bestand')
        router.push(`/instellingen/offerte-layout/${nieuwId}`)
      } catch { toast.error('Fout bij kopiëren') }
    })
  }

  async function handleVerwijder(id: string, naam: string) {
    if (!await bevestig({ titel: `Layout "${naam}" verwijderen?`, bevestigLabel: 'Verwijderen', destructief: true })) return
    startT(async () => {
      try {
        await verwijderLayout(id)
        setLayouts(l => l.filter(x => x.id !== id))
        toast.success('Verwijderd')
        router.refresh()
      } catch { toast.error('Fout bij verwijderen') }
    })
  }

  function handleSetStandaard(id: string) {
    startT(async () => {
      try {
        await setStandaardLayout(id)
        setLayouts(l => l.map(x => ({ ...x, is_standaard: x.id === id })))
        router.refresh()
      } catch { toast.error('Fout') }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {SOORTEN.map(({ soort, titel, uitleg }) => {
        // Lay-outs van vóór de splitsing hebben geen soort en horen bij de offerte.
        const vanSoort = layouts.filter(l => (l.soort ?? 'offerte') === soort)
        return (
          <div key={soort} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
                  {titel}
                </h3>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                  {uitleg} Een lay-out bepaalt het Word-sjabloon, de kleuren, het lettertype en de marges.
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={() => { setShowNieuw(soort); setNieuwNaam('') }} style={{ flexShrink: 0 }}>
                + Nieuwe lay-out
              </Button>
            </div>

            {showNieuw === soort && (
              <div style={{ padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Input
                  value={nieuwNaam}
                  onChange={e => setNieuwNaam(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMaakAan()}
                  autoFocus
                  placeholder={soort === 'interne_begroting' ? 'Naam van de lay-out (bv. Begrotingsstaat A3)' : 'Naam van de lay-out (bv. Standaard blauw)'}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" size="sm" onClick={handleMaakAan}>Aanmaken &amp; bewerken</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(null); setNieuwNaam('') }}>Annuleren</Button>
                </div>
              </div>
            )}

            {vanSoort.length === 0 && showNieuw !== soort ? (
              <EmptyState
                title={`Nog geen lay-out voor ${titel.toLowerCase()}`}
                description="Maak een lay-out aan met je eigen Word-sjabloon."
                actions={
                  <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(soort); setNieuwNaam('') }}>
                    + Eerste lay-out aanmaken
                  </Button>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vanSoort.map(l => (
                  <div key={l.id} style={{
                    padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: l.primaire_kleur, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.naam}</span>
                        {l.is_standaard && (
                          <Badge variant="outline" tone="warning" size="sm" style={{ flexShrink: 0 }}>★ Standaard</Badge>
                        )}
                      </div>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>
                        {l.papier_formaat ?? 'A4'} {l.papier_orientatie === 'landscape' ? 'liggend' : 'staand'}
                        {l.html_template ? ' · eigen HTML-template' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {!l.is_standaard && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleSetStandaard(l.id)} title="Instellen als standaard">☆</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleKopieer(l.id)} title="Kopiëren">Kopieer</Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/instellingen/offerte-layout/${l.id}`}>Bewerken</Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleVerwijder(l.id, l.naam)}>Verwijder</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
