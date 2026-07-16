'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input, Badge, EmptyState } from '@/components/ui'
import { maakSjabloon, kopieerSjabloon, verwijderSjabloon } from './actions'
import { DOCUMENTSOORTEN, documentsoortLabels, heeftTemplate, type DocumentSjabloon, type Documentsoort } from '@/lib/documenten/types'

export default function SjablonenBeheer({ initial }: { initial: DocumentSjabloon[] }) {
  const router = useRouter()
  const [, startT] = useTransition()
  const [sjablonen, setSjablonen] = useState(initial)
  const [showNieuw, setShowNieuw] = useState(false)
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwSoort, setNieuwSoort] = useState<Documentsoort>('bewonersbrief')

  function handleMaakAan() {
    if (!nieuwNaam.trim()) return
    startT(async () => {
      try {
        const id = await maakSjabloon(nieuwNaam.trim(), nieuwSoort)
        toast.success('Sjabloon aangemaakt')
        setShowNieuw(false)
        setNieuwNaam('')
        router.push(`/instellingen/document-sjablonen/${id}`)
      } catch { toast.error('Fout bij aanmaken') }
    })
  }

  function handleKopieer(id: string) {
    startT(async () => {
      try {
        const nieuwId = await kopieerSjabloon(id)
        toast.success('Sjabloon gekopieerd')
        router.push(`/instellingen/document-sjablonen/${nieuwId}`)
      } catch { toast.error('Fout bij kopiëren') }
    })
  }

  function handleVerwijder(id: string, naam: string) {
    if (!confirm(`Sjabloon "${naam}" verwijderen?`)) return
    startT(async () => {
      try {
        await verwijderSjabloon(id)
        setSjablonen(l => l.filter(x => x.id !== id))
        toast.success('Verwijderd')
        router.refresh()
      } catch { toast.error('Fout bij verwijderen') }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
          Een sjabloon koppelt een Word-bestand aan de gegevens uit het dossier. Medewerkers kiezen het
          sjabloon op het Bestanden-tab van een dossier en stellen het document met één klik op.
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowNieuw(true)} style={{ flexShrink: 0 }}>
          + Nieuw sjabloon
        </Button>
      </div>

      {showNieuw && (
        <div style={{ padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input
            value={nieuwNaam}
            onChange={e => setNieuwNaam(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleMaakAan()}
            autoFocus
            placeholder="Naam van het sjabloon (bv. Bewonersbrief start werkzaamheden)"
          />
          <select
            value={nieuwSoort}
            onChange={e => setNieuwSoort(e.target.value as Documentsoort)}
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 13, padding: '8px 10px',
              border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-elevated, #fff)', color: 'var(--fg)',
            }}
          >
            {DOCUMENTSOORTEN.map(s => <option key={s} value={s}>{documentsoortLabels[s]}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={handleMaakAan}>Aanmaken & bewerken</Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(false); setNieuwNaam('') }}>Annuleren</Button>
          </div>
        </div>
      )}

      {sjablonen.length === 0 && !showNieuw ? (
        <EmptyState
          title="Nog geen documentsjablonen"
          description="Maak een sjabloon aan en koppel je eigen Word-bestand met {variabelen}."
          actions={<Button variant="ghost" size="sm" onClick={() => setShowNieuw(true)}>+ Eerste sjabloon aanmaken</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sjablonen.map(s => {
            const compleet = heeftTemplate(s)
            return (
              <div key={s.id} style={{
                padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.naam}</span>
                    <Badge variant="outline" size="sm" style={{ flexShrink: 0 }}>
                      {documentsoortLabels[s.documentsoort] ?? s.documentsoort}
                    </Badge>
                    {!s.actief && <Badge variant="outline" tone="neutral" size="sm">Inactief</Badge>}
                    {/* Zonder template levert opstellen een 422 — dat wil je hier al zien. */}
                    {!compleet && <Badge variant="outline" tone="warning" size="sm">Geen Word-template</Badge>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>
                    {s.velden.length > 0 ? `${s.velden.length} invoerveld${s.velden.length === 1 ? '' : 'en'}` : 'Geen invoervelden'}
                    {s.beschrijving ? ` · ${s.beschrijving}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Button variant="ghost" size="sm" onClick={() => handleKopieer(s.id)} title="Kopiëren">Kopieer</Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/instellingen/document-sjablonen/${s.id}`}>Bewerken</Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleVerwijder(s.id, s.naam)}>Verwijder</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
