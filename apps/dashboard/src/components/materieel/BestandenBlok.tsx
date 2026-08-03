'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, useDialogen } from '@/components/ui'
import Modal, { modalInput, modalLabel } from './Modal'
import { uploadDocument, verwijderDocument, zetHoofdfoto } from '@/app/(platform)/materieelbeheer/bestand-actions'
import {
  MATERIEEL_DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, isAfbeelding, leesbareGrootte,
  type MaterieelDocumentRij, type MaterieelDocumentType,
} from '@/lib/materieel/types'

const kop: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 6,
}
const linkKnop: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  color: 'var(--brand-700, var(--accent))', fontSize: 12, fontWeight: 600,
}

/** Icoon per bestandssoort — puur visueel houvast in de lijst. */
function bestandsIcoon(d: MaterieelDocumentRij): string {
  if (isAfbeelding(d)) return '🖼️'
  if (d.mimetype === 'application/pdf') return '📄'
  if (d.type === 'factuur') return '🧾'
  return '📎'
}

export default function BestandenBlok({ objectId, documenten }: {
  objectId: string
  documenten: MaterieelDocumentRij[]
}) {
  const router = useRouter()
  const [modal, setModal] = React.useState(false)
  const [bezig, setBezig] = React.useState(false)
  const [voorbeeld, setVoorbeeld] = React.useState<MaterieelDocumentRij | null>(null)
  const { bevestig } = useDialogen()

  const fotos = documenten.filter(isAfbeelding)
  const overige = documenten.filter((d) => !isAfbeelding(d))

  async function verwijder(d: MaterieelDocumentRij) {
    if (!await bevestig({ titel: `"${d.bestandsnaam ?? 'Dit bestand'}" verwijderen?`, bevestigLabel: 'Verwijderen', destructief: true })) return
    setBezig(true)
    const res = await verwijderDocument(d.id, objectId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Verwijderd')
    setVoorbeeld(null)
    router.refresh()
  }

  async function maakHoofdfoto(d: MaterieelDocumentRij) {
    setBezig(true)
    const res = await zetHoofdfoto(objectId, d.id)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Hoofdfoto ingesteld')
    router.refresh()
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={kop}>Foto&apos;s &amp; documenten</h3>
        <button onClick={() => setModal(true)} style={linkKnop}>+ Uploaden</button>
      </div>

      {documenten.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '6px 0' }}>
          Nog geen foto&apos;s of documenten. Upload de handleiding, het CE-document of een foto van het object.
        </p>
      )}

      {/* Fotogrid */}
      {fotos.length > 0 && (
        <div className="materieel-fotogrid" style={{ display: 'grid', gap: 8, marginBottom: overige.length > 0 ? 14 : 0 }}>
          {fotos.map((d) => (
            <button
              key={d.id}
              onClick={() => setVoorbeeld(d)}
              title={d.bestandsnaam ?? ''}
              style={{
                position: 'relative', aspectRatio: '1 / 1', padding: 0, cursor: 'pointer',
                border: `1px solid ${d.is_hoofdfoto ? 'var(--brand-500, #16a34a)' : 'var(--border)'}`,
                borderRadius: 8, overflow: 'hidden', background: 'var(--bg-subtle)',
              }}
            >
              {d.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={d.url} alt={d.bestandsnaam ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 22 }}>🖼️</span>}
              {d.is_hoofdfoto && (
                <span style={{
                  position: 'absolute', left: 4, bottom: 4,
                  fontSize: 9, fontWeight: 700, color: 'white',
                  background: 'var(--brand-500, #16a34a)', padding: '1px 6px', borderRadius: 4,
                }}>Hoofdfoto</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Documentenlijst */}
      {overige.map((d) => (
        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{bestandsIcoon(d)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.bestandsnaam ?? 'Bestand'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                {[DOCUMENT_TYPE_LABELS[d.type], leesbareGrootte(d.grootte), d.door_naam].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {d.url && (
              <a href={d.url} target="_blank" rel="noreferrer" style={{ ...linkKnop, textDecoration: 'none' }}>Openen</a>
            )}
            <button onClick={() => verwijder(d)} disabled={bezig} style={{ ...linkKnop, color: 'var(--fg-muted)' }}>×</button>
          </div>
        </div>
      ))}

      {modal && (
        <UploadModal
          objectId={objectId}
          onSluit={() => setModal(false)}
          onKlaar={() => { setModal(false); router.refresh() }}
        />
      )}

      {voorbeeld && (
        <Modal titel={voorbeeld.bestandsnaam ?? 'Foto'} onSluit={() => setVoorbeeld(null)} breedte={720}>
          {voorbeeld.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={voorbeeld.url} alt={voorbeeld.bestandsnaam ?? ''} style={{ width: '100%', borderRadius: 8 }} />
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {!voorbeeld.is_hoofdfoto && (
              <Button variant="primary" disabled={bezig} onClick={() => maakHoofdfoto(voorbeeld)}>Als hoofdfoto</Button>
            )}
            {voorbeeld.url && (
              <a href={voorbeeld.url} target="_blank" rel="noreferrer"><Button variant="secondary">Openen</Button></a>
            )}
            <Button variant="secondary" disabled={bezig} onClick={() => verwijder(voorbeeld)}>Verwijderen</Button>
          </div>
        </Modal>
      )}

      <style>{`
        .materieel-fotogrid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
        @media (max-width: 640px) {
          .materieel-fotogrid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); }
        }
      `}</style>
    </section>
  )
}

/* ── Upload ── */

function UploadModal({ objectId, onSluit, onKlaar }: {
  objectId: string; onSluit: () => void; onKlaar: () => void
}) {
  const [type, setType] = React.useState<MaterieelDocumentType>('foto')
  const [bestanden, setBestanden] = React.useState<File[]>([])
  const [bezig, setBezig] = React.useState(false)
  const [sleep, setSleep] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function verstuur() {
    if (bestanden.length === 0) { toast.error('Kies eerst een bestand'); return }
    setBezig(true)
    let fouten = 0
    for (const file of bestanden) {
      const fd = new FormData()
      fd.set('bestand', file)
      // Een afbeelding is altijd een foto, ongeacht de gekozen soort.
      fd.set('type', file.type.startsWith('image/') ? 'foto' : type)
      const res = await uploadDocument(objectId, fd)
      if (!res.ok) { fouten++; toast.error(`${file.name}: ${res.error}`) }
    }
    setBezig(false)
    if (fouten < bestanden.length) toast.success(`${bestanden.length - fouten} bestand(en) geüpload`)
    if (fouten === 0) onKlaar()
  }

  return (
    <Modal titel="Foto's of documenten uploaden" onSluit={onSluit} breedte={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={modalLabel}>Soort (voor niet-afbeeldingen)</label>
          <select value={type} onChange={(e) => setType(e.target.value as MaterieelDocumentType)} style={modalInput}>
            {MATERIEEL_DOCUMENT_TYPES.filter((t) => t !== 'foto').map((t) => (
              <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
            Afbeeldingen worden automatisch als foto opgeslagen.
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setSleep(true) }}
          onDragLeave={() => setSleep(false)}
          onDrop={(e) => {
            e.preventDefault(); setSleep(false)
            setBestanden((b) => [...b, ...Array.from(e.dataTransfer.files)])
          }}
          style={{
            border: `2px dashed ${sleep ? 'var(--brand-500, var(--accent))' : 'var(--border)'}`,
            background: sleep ? 'var(--brand-50, var(--bg-subtle))' : 'var(--bg-subtle)',
            borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>📎</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Sleep bestanden hierheen of klik om te kiezen</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
            Foto&apos;s, PDF, Word of Excel · max. 50 MB per bestand
          </div>
          <input
            ref={inputRef} type="file" multiple hidden
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
            onChange={(e) => setBestanden((b) => [...b, ...Array.from(e.target.files ?? [])])}
          />
        </div>

        {bestanden.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bestanden.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 8px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <button onClick={() => setBestanden((b) => b.filter((_, j) => j !== i))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 15 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="primary" disabled={bezig || bestanden.length === 0} onClick={verstuur}>
            {bezig ? 'Bezig met uploaden…' : `Uploaden${bestanden.length > 0 ? ` (${bestanden.length})` : ''}`}
          </Button>
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}
