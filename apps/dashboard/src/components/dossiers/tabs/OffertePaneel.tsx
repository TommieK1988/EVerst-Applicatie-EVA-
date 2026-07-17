'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  getOffertePaneelData, koppelOffertePdf, ontkoppelOffertePdf,
  type OffertePaneelData,
} from '@/lib/dossiers/offerte-paneel-actions'
import { useDossierReadOnly } from '../DossierReadOnlyContext'

/**
 * Rechterpaneel op de Informatie-tab in de fase Offerte. Toont alleen échte
 * offertes: een in EVA gemaakte offerte (live gerenderd via de
 * pdf-preview-route, incl. briefpapier en CONCEPT-watermerk) of een handmatig
 * gekoppelde PDF. Zonder beide: een lege staat met een koppel-knop.
 */
export default function OffertePaneel({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [data, setData]     = React.useState<OffertePaneelData | null>(null)
  const [actief, setActief] = React.useState<string | null>(null)
  const [bezig, setBezig]   = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const laad = React.useCallback(() => {
    getOffertePaneelData(dossierId)
      .then(d => {
        setData(d)
        // Standaard de nieuwste verzonden versie tonen, anders de nieuwste versie.
        const verzonden = [...d.quotes].reverse().find(q => q.status === 'verzonden')
        setActief((verzonden ?? d.quotes[d.quotes.length - 1])?.id ?? null)
      })
      .catch(() => setData({ quotes: [], pdf: null }))
  }, [dossierId])

  React.useEffect(() => { laad() }, [laad])

  async function uploadPdf(file: File) {
    setBezig(true)
    try {
      const fd = new FormData()
      fd.append('bestand', file)
      const res = await koppelOffertePdf(dossierId, fd)
      if (res.ok) { toast.success('PDF gekoppeld'); laad() }
      else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Koppelen mislukt')
    } finally {
      setBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function verwijderPdf() {
    setBezig(true)
    try {
      const res = await ontkoppelOffertePdf(dossierId)
      if (res.ok) { toast.success('Koppeling verwijderd'); laad() }
      else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally {
      setBezig(false)
    }
  }

  const heeftQuotes = (data?.quotes.length ?? 0) > 0
  const actieveQuote = data?.quotes.find(q => q.id === actief) ?? null

  const koppelKnop = !readOnly && (
    <>
      <input
        ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f) }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={bezig}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
          cursor: bezig ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          background: 'var(--bg-active)', border: '1px solid var(--border)', color: 'var(--fg)',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" /><path d="M4 13v2.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V13" />
        </svg>
        {bezig ? 'Bezig…' : data?.pdf ? 'Andere PDF koppelen' : 'PDF koppelen'}
      </button>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap' }}>Offerte</span>
          {heeftQuotes && data!.quotes.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data!.quotes.map(q => (
                <button key={q.id} onClick={() => setActief(q.id)} title={q.quote_nummer} style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  border: q.id === actief ? 'none' : '1px solid var(--border)',
                  background: q.id === actief ? 'var(--accent)' : 'transparent',
                  color: q.id === actief ? 'white' : 'var(--fg-muted)',
                }}>v{q.versie}{q.status !== 'verzonden' ? ' ✎' : ''}</button>
              ))}
            </div>
          )}
          {heeftQuotes && data!.quotes.length === 1 && (
            <span style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data!.quotes[0].quote_nummer}
            </span>
          )}
          {!heeftQuotes && data?.pdf && (
            <span style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={data.pdf.naam}>
              {data.pdf.naam}
            </span>
          )}
        </div>
        {heeftQuotes ? (
          <Link
            href={`/offertes/${dossierId}/calculatie`}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Openen in Calculatie →
          </Link>
        ) : data?.pdf ? (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {koppelKnop}
            {!readOnly && (
              <button
                onClick={verwijderPdf}
                disabled={bezig}
                style={{
                  padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  cursor: bezig ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                  background: 'transparent', border: '1px solid var(--border)', color: '#d9534f',
                }}
              >
                Ontkoppelen
              </button>
            )}
          </div>
        ) : null}
      </div>

      {actieveQuote && actieveQuote.status !== 'verzonden' && (
        <div style={{ padding: '7px 16px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
          ✎ Concept — nog niet verzonden
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden', background: '#e5e2da' }}>
        {data === null ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--fg-muted)' }}>
            Offerte laden…
          </div>
        ) : actieveQuote ? (
          <iframe
            key={actieveQuote.id}
            src={`/everts-calc/api/quotes/${actieveQuote.id}/pdf-preview`}
            title={`Offerte ${actieveQuote.quote_nummer}`}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        ) : data.pdf ? (
          <iframe
            src={data.pdf.url}
            title={data.pdf.naam}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
            </svg>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6, maxWidth: 280 }}>
              Nog geen offerte voor dit dossier.<br />
              Maak een offerte via de Calculatie-tab, of koppel een bestaande PDF.
            </div>
            {koppelKnop}
          </div>
        )}
      </div>
    </div>
  )
}
