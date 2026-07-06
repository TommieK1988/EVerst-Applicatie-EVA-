'use client'

import React, { useState, useTransition, useRef } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Badge, Card, CardBody, EmptyState } from '@/components/ui'
import type { CaoDocument, CaoLoonschaal, Bedrijfsgegevens } from '@everts/database/platform-types'
import {
  uploadCaoDocument,
  extraheerLoonschalen,
  verwijderCaoDocument,
  upsertLoonschaal,
  verwijderLoonschaal,
  getCaoSignedUrl,
} from './actions'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

function formatEuro(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

type CaoMetSchalen = CaoDocument & { schalen: CaoLoonschaal[] }

// ── Loonschaal rij ────────────────────────────────────────────────────────────
function LoonschaalRij({
  rij,
  cao_id,
  onUpdated,
  onVerwijderd,
}: {
  rij: CaoLoonschaal
  cao_id: string
  onUpdated: (r: CaoLoonschaal) => void
  onVerwijderd: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [schaal, setSchaal]   = useState(rij.schaal)
  const [trede, setTrede]     = useState(rij.trede)
  const [bruto, setBruto]     = useState(rij.bruto_maand != null ? String(rij.bruto_maand) : '')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await upsertLoonschaal(cao_id, { schaal, trede, bruto_maand: bruto ? parseFloat(bruto) : null }, rij.id)
      if (!result.ok) { toast.error(result.error); return }
      onUpdated({ ...rij, schaal, trede, bruto_maand: bruto ? parseFloat(bruto) : null })
      setEditing(false)
    })
  }

  function del() {
    startTransition(async () => {
      const result = await verwijderLoonschaal(rij.id)
      if (!result.ok) { toast.error(result.error); return }
      onVerwijderd(rij.id)
    })
  }

  const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-ui)', fontSize: 12 }

  if (editing) {
    return (
      <tr>
        <td style={tdStyle}><Input inputSize="sm" style={{ width: 60 }} value={schaal} onChange={e => setSchaal(e.target.value)} /></td>
        <td style={tdStyle}><Input inputSize="sm" style={{ width: 60 }} value={trede} onChange={e => setTrede(e.target.value)} /></td>
        <td style={tdStyle}><Input inputSize="sm" style={{ width: 100 }} type="number" value={bruto} onChange={e => setBruto(e.target.value)} placeholder="bijv. 2500" /></td>
        <td style={{ ...tdStyle, display: 'flex', gap: 4 }}>
          <Button variant="primary" size="sm" onClick={save} disabled={isPending}>OK</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>×</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="cao-rij">
      <td style={{ ...tdStyle, fontWeight: 600 }}>{rij.schaal}</td>
      <td style={{ ...tdStyle }}>{rij.trede}</td>
      <td style={{ ...tdStyle }}>{formatEuro(rij.bruto_maand)}</td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button onClick={() => setEditing(true)} variant="ghost" size="sm">Bewerk</Button>
          <Button onClick={del} disabled={isPending} variant="outline" size="sm">×</Button>
        </div>
      </td>
    </tr>
  )
}

// ── Enkel CAO document ────────────────────────────────────────────────────────
function CaoDocumentKaart({
  doc,
  wmNaam,
  onVerwijderd,
}: {
  doc: CaoMetSchalen
  wmNaam?: string
  onVerwijderd: (id: string) => void
}) {
  const [status, setStatus]   = useState(doc.extractie_status)
  const [schalen, setSchalen] = useState<CaoLoonschaal[]>(doc.schalen)
  const [showSchalen, setShowSchalen] = useState(false)
  const [isPending, startTransition]  = useTransition()

  // Nieuw rij toevoegen state
  const [showNieuw, setShowNieuw] = useState(false)
  const [nieuwSchaal, setNieuwSchaal] = useState('')
  const [nieuwTrede, setNieuwTrede]   = useState('')
  const [nieuwBruto, setNieuwBruto]   = useState('')

  // PDF inzien: privaat bucket → verse signed URL ophalen en openen.
  function handlePdfOpenen() {
    startTransition(async () => {
      const result = await getCaoSignedUrl(doc.id)
      if (!result.ok) { toast.error(result.error); return }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    })
  }

  function handleExtraheer() {
    if (!doc.pdf_url) { toast.error('Geen PDF beschikbaar'); return }
    startTransition(async () => {
      setStatus('bezig')
      toast.loading('AI analyseert CAO PDF…', { id: 'cao-extract' })
      const result = await extraheerLoonschalen(doc.id)
      toast.dismiss('cao-extract')
      if (!result.ok) { toast.error(result.error); setStatus('fout'); return }
      setSchalen(result.regels?.map((r, i) => ({
        id: `tmp-${i}`, cao_id: doc.id,
        schaal: r.schaal, trede: r.trede, bruto_maand: r.bruto_maand,
        volgorde: i, created_at: new Date().toISOString(),
      })) ?? [])
      setStatus('gereed')
      setShowSchalen(true)
      toast.success(`${result.regels?.length ?? 0} loonregels geëxtraheerd`)
    })
  }

  function handleVerwijder() {
    startTransition(async () => {
      const result = await verwijderCaoDocument(doc.id)
      if (!result.ok) { toast.error(result.error); return }
      onVerwijderd(doc.id)
      toast.success('CAO gedeactiveerd')
    })
  }

  function saveNieuw() {
    startTransition(async () => {
      const result = await upsertLoonschaal(doc.id, { schaal: nieuwSchaal, trede: nieuwTrede, bruto_maand: nieuwBruto ? parseFloat(nieuwBruto) : null, volgorde: schalen.length })
      if (!result.ok) { toast.error(result.error); return }
      setNieuwSchaal(''); setNieuwTrede(''); setNieuwBruto('')
      setShowNieuw(false)
      window.location.reload()
    })
  }

  const statusBadge = (s: string | null) => {
    const map: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'error' }> = {
      pending: { label: 'Wacht op extractie', tone: 'neutral' },
      bezig:   { label: 'Bezig…', tone: 'warning' },
      gereed:  { label: `${schalen.length} regels`, tone: 'success' },
      fout:    { label: 'Fout', tone: 'error' },
    }
    const s2 = s ?? 'pending'
    const info = map[s2] ?? map.pending
    return (
      <Badge variant="outline" tone={info.tone} size="sm">
        {info.label}
      </Badge>
    )
  }

  // Unieke schalen voor groepering
  const schelenUniek = [...new Set(schalen.map(s => s.schaal))].sort()

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--bg-elev)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{doc.naam}</div>
            {wmNaam && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(31,122,58,0.08)', borderRadius: 4, padding: '2px 6px' }}>
                {wmNaam}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            {statusBadge(status)}
            {doc.bestandsnaam && (
              <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{doc.bestandsnaam}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {doc.pdf_url && (
            <Button onClick={handlePdfOpenen} variant="ghost" size="sm" disabled={isPending}>
              PDF openen
            </Button>
          )}
          {doc.pdf_url && status !== 'bezig' && (
            <Button onClick={handleExtraheer} variant="ghost" size="sm" disabled={isPending}>
              {status === 'gereed' ? '↻ Opnieuw inlezen' : 'Loonschalen inlezen'}
            </Button>
          )}
          {schalen.length > 0 && (
            <Button onClick={() => setShowSchalen(s => !s)} variant="ghost" size="sm">
              {showSchalen ? 'Verbergen' : `${schalen.length} regels tonen`}
            </Button>
          )}
          <Button onClick={handleVerwijder} disabled={isPending} variant="outline" size="sm">
            Deactiveren
          </Button>
        </div>
      </div>

      {/* Loonschalen tabel */}
      {showSchalen && (
        <div style={{ padding: '16px 18px', background: 'var(--bg)' }}>
          {/* Overzicht per schaal */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {schelenUniek.map(schaal => {
              const treden = schalen.filter(s => s.schaal === schaal).sort((a, b) => a.volgorde - b.volgorde)
              return (
                <Card key={schaal} style={{ minWidth: 140 }}>
                  <div style={{ background: 'var(--bg-elev)', padding: '5px 10px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Schaal {schaal}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {treden.map(t => (
                        <tr key={t.id}>
                          <td style={{ padding: '4px 10px', fontSize: 11, color: 'var(--fg-muted)', borderBottom: '1px solid var(--border)' }}>Trede {t.trede}</td>
                          <td style={{ padding: '4px 10px', fontSize: 11, color: 'var(--fg)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{formatEuro(t.bruto_maand)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )
            })}
          </div>

          {/* Volledige bewerkbare tabel */}
          <details>
            <summary style={{ fontSize: 10, color: 'var(--fg-muted)', cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}>
              Alle regels bewerken ({schalen.length})
            </summary>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Schaal', 'Trede', 'Bruto/maand', ''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schalen.sort((a, b) => a.volgorde - b.volgorde || a.schaal.localeCompare(b.schaal) || a.trede.localeCompare(b.trede)).map(rij => (
                    <LoonschaalRij
                      key={rij.id}
                      rij={rij}
                      cao_id={doc.id}
                      onUpdated={updated => setSchalen(prev => prev.map(s => s.id === updated.id ? updated : s))}
                      onVerwijderd={id => setSchalen(prev => prev.filter(s => s.id !== id))}
                    />
                  ))}
                  {showNieuw && (
                    <tr>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <Input inputSize="sm" style={{ width: 60 }} value={nieuwSchaal} onChange={e => setNieuwSchaal(e.target.value)} placeholder="A" autoFocus />
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <Input inputSize="sm" style={{ width: 60 }} value={nieuwTrede} onChange={e => setNieuwTrede(e.target.value)} placeholder="1" />
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <Input inputSize="sm" style={{ width: 100 }} type="number" value={nieuwBruto} onChange={e => setNieuwBruto(e.target.value)} placeholder="2500" />
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button variant="primary" size="sm" onClick={saveNieuw} disabled={isPending || !nieuwSchaal || !nieuwTrede}>OK</Button>
                          <Button variant="ghost" size="sm" onClick={() => setShowNieuw(false)}>×</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!showNieuw && (
              <Button onClick={() => setShowNieuw(true)} variant="ghost" size="sm" style={{ marginTop: 8 }}>+ Rij toevoegen</Button>
            )}
          </details>
        </div>
      )}
      <style>{`.cao-rij:hover td { background: var(--bg-active); }`}</style>
    </Card>
  )
}

// ── Hoofd component ───────────────────────────────────────────────────────────
export default function CaoBeheer({
  initial,
  werkmaatschappijen,
}: {
  initial: CaoMetSchalen[]
  werkmaatschappijen: Pick<Bedrijfsgegevens, 'id' | 'naam'>[]
}) {
  const [docs, setDocs]                   = useState<CaoMetSchalen[]>(initial)
  const [showNieuw, setShowNieuw]         = useState(false)
  const [naam, setNaam]                   = useState('')
  const [wmId, setWmId]                   = useState('')
  const [uploading, setUploading]         = useState(false)
  const fileRef                           = useRef<HTMLInputElement>(null)

  const wmMap = Object.fromEntries(werkmaatschappijen.map(w => [w.id, w.naam]))

  async function handleUpload(file: File) {
    if (!naam.trim()) { toast.error('Geef eerst een naam op'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('naam', naam.trim())
      formData.append('bestand', file)
      if (wmId) formData.append('werkmaatschappij_id', wmId)

      const result = await uploadCaoDocument(formData)
      if (!result.ok) { toast.error(result.error); return }

      toast.success('CAO geüpload — klik op "Loonschalen inlezen" om AI te starten')
      setNaam('')
      setWmId('')
      setShowNieuw(false)
      window.location.reload()
    } finally {
      setUploading(false)
    }
  }

  const activeDocs = docs.filter(d => d.actief)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div />
        {!showNieuw && (
          <Button onClick={() => setShowNieuw(true)} variant="ghost" size="sm">
            + CAO uploaden
          </Button>
        )}
      </div>

      {/* Upload form */}
      {showNieuw && (
        <Card style={{ marginBottom: 16 }}>
          <CardBody style={{ padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: werkmaatschappijen.length > 1 ? '1fr 1fr auto' : '1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Naam van de CAO</label>
              <Input
                value={naam}
                onChange={e => setNaam(e.target.value)}
                placeholder="bijv. CAO Bouw & Infra 2025–2026"
                autoFocus
              />
            </div>
            {werkmaatschappijen.length > 1 && (
              <div>
                <label style={labelStyle}>Werkmaatschappij</label>
                <select className="eva-input" style={{ width: '100%' }} value={wmId} onChange={e => setWmId(e.target.value)}>
                  <option value="">— Organisatiebreed —</option>
                  {werkmaatschappijen.map(w => (
                    <option key={w.id} value={w.id}>{w.naam}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>PDF-bestand</label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              />
              <Button
                type="button"
                variant="primary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !naam.trim()}
              >
                {uploading ? 'Uploaden…' : 'PDF kiezen & uploaden'}
              </Button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowNieuw(false)}>Annuleren</Button>
          </div>
          </CardBody>
        </Card>
      )}

      {/* Bestaande CAO's */}
      {activeDocs.length === 0 && !showNieuw ? (
        <EmptyState
          title="Nog geen CAO-documenten"
          description="Upload een CAO-PDF om loonschalen te beheren."
          size="sm"
          tone="neutral"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeDocs.map(doc => (
            <CaoDocumentKaart
              key={doc.id}
              doc={doc}
              wmNaam={doc.werkmaatschappij_id ? wmMap[doc.werkmaatschappij_id] : undefined}
              onVerwijderd={id => setDocs(prev => prev.map(d => d.id === id ? { ...d, actief: false } : d))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
