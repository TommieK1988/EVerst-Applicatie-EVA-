'use client'

/**
 * Modal om één document op te stellen: invoervelden links, live PDF-preview rechts,
 * en onderin de acties (PDF / Word / mailen).
 *
 * De preview draait via /api/documenten/preview en wordt bewust NIET bij elke
 * toetsaanslag ververst — elke render is een Graph-conversie. Handmatig verversen
 * of bij het verlaten van een veld.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { X, RefreshCw, FileText, Download, Mail, Pencil } from 'lucide-react'
import { mailDocument, getMailVoorstel } from '@/app/(platform)/documenten/actions'
import { documentsoortLabels, type DocumentSjabloon, type DocumentVeld } from '@/lib/documenten/types'

interface Props {
  dossierId: string
  sjabloon: DocumentSjabloon
  /** Invoer van een eerder opgesteld document (knop "Opnieuw opstellen"). */
  beginInvoer?: Record<string, unknown>
  onSluit: () => void
  onKlaar: () => void
}

export default function DocumentGenereerModal({ dossierId, sjabloon, beginInvoer, onSluit, onKlaar }: Props) {
  const [invoer, setInvoer] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {}
    for (const v of sjabloon.velden ?? []) {
      const eerder = beginInvoer?.[v.sleutel]
      start[v.sleutel] = eerder != null ? String(eerder) : (v.standaard ?? '')
    }
    return start
  })
  // Wat de preview toont: pas bijgewerkt bij "verversen"/blur, niet per toetsaanslag.
  const [previewInvoer, setPreviewInvoer] = useState(invoer)
  const [previewKey, setPreviewKey] = useState(0)
  const [archiveren, setArchiveren] = useState(true)
  const [mailOpen, setMailOpen] = useState(false)
  const [mail, setMail] = useState({ to: '', cc: '', onderwerp: '', bodyHtml: '' })
  const [bezig, startT] = useTransition()
  const [download, setDownload] = useState<'pdf' | 'docx' | null>(null)

  const previewUrl = useMemo(() => {
    const p = new URLSearchParams({
      sjabloon_id: sjabloon.id,
      dossier_id: dossierId,
      invoer: JSON.stringify(previewInvoer),
      _k: String(previewKey),
    })
    return `/api/documenten/preview?${p.toString()}`
  }, [sjabloon.id, dossierId, previewInvoer, previewKey])

  useEffect(() => {
    if (!mailOpen) return
    getMailVoorstel(dossierId, sjabloon.id)
      .then(v => setMail(m => ({ ...m, to: m.to || v.to, onderwerp: m.onderwerp || v.onderwerp, bodyHtml: m.bodyHtml || v.bodyHtml })))
      .catch(() => { /* voorstel is een gemak, geen vereiste */ })
  }, [mailOpen, dossierId, sjabloon.id])

  const ontbreekt = (sjabloon.velden ?? []).filter(v => v.verplicht && !String(invoer[v.sleutel] ?? '').trim())

  function ververs() {
    setPreviewInvoer(invoer)
    setPreviewKey(k => k + 1)
  }

  async function haalPdfOp() {
    if (ontbreekt.length) {
      toast.error(`Vul eerst in: ${ontbreekt.map(v => v.label).join(', ')}`)
      return
    }
    setDownload('pdf')
    try {
      const res = await fetch('/api/documenten/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sjabloon_id: sjabloon.id, dossier_id: dossierId, invoer, archiveren }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      triggerDownload(blob, bestandsnaamUitHeader(res.headers.get('Content-Disposition')) ?? 'document.pdf')

      const gearchiveerd = res.headers.get('X-Archief-Status') === 'ok'
      toast.success(archiveren && gearchiveerd
        ? 'Document opgesteld en in SharePoint gezet'
        : 'Document opgesteld')
      onKlaar()
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err))
    } finally {
      setDownload(null)
    }
  }

  /**
   * Stelt het document op, zet het in de dossiermap en opent het in Word Online.
   *
   * Het tabblad wordt SYNCHROON bij de klik geopend en pas daarna gevuld: een
   * window.open() ná een await wordt door popup-blockers geweigerd.
   */
  async function bewerkInWord() {
    if (ontbreekt.length) {
      toast.error(`Vul eerst in: ${ontbreekt.map(v => v.label).join(', ')}`)
      return
    }
    const tab = window.open('', '_blank')
    setDownload('docx')
    try {
      const res = await fetch('/api/documenten/word-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sjabloon_id: sjabloon.id, dossier_id: dossierId, invoer }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.webUrl) throw new Error(json.error ?? `HTTP ${res.status}`)

      if (tab) tab.location.href = json.webUrl
      else window.open(json.webUrl, '_blank')   // popup geblokkeerd → alsnog proberen
      toast.success('Document staat in de dossiermap en opent in Word')
      onKlaar()
    } catch (err) {
      tab?.close()
      toast.error(String(err instanceof Error ? err.message : err))
    } finally {
      setDownload(null)
    }
  }

  function verstuur() {
    startT(async () => {
      const r = await mailDocument({
        dossierId,
        sjabloonId: sjabloon.id,
        invoer,
        to: mail.to.split(/[;,]/),
        cc: mail.cc ? mail.cc.split(/[;,]/) : [],
        onderwerp: mail.onderwerp,
        bodyHtml: mail.bodyHtml,
        archiveren,
      })
      if (r.ok) {
        toast.success('Document verstuurd')
        onKlaar()
        onSluit()
      } else {
        toast.error(r.fout ?? 'Versturen mislukt')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-6">
      <div className="flex h-full max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Kop */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-neutral-200 px-5 py-3">
          <FileText className="h-4 w-4 text-neutral-400" />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-neutral-800">{sjabloon.naam}</div>
            <div className="text-[11px] text-neutral-400">{documentsoortLabels[sjabloon.documentsoort] ?? sjabloon.documentsoort}</div>
          </div>
          <button onClick={onSluit} className="ml-auto rounded p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Invoer */}
          <div className="w-[340px] flex-shrink-0 overflow-y-auto border-r border-neutral-200 p-4">
            {(sjabloon.velden ?? []).length === 0 ? (
              <p className="text-[12.5px] text-neutral-500">
                Dit sjabloon heeft geen invoervelden — alles komt uit het dossier.
              </p>
            ) : (
              <div className="space-y-3">
                {(sjabloon.velden ?? []).map(veld => (
                  <VeldInvoer
                    key={veld.sleutel}
                    veld={veld}
                    waarde={invoer[veld.sleutel] ?? ''}
                    onChange={w => setInvoer(s => ({ ...s, [veld.sleutel]: w }))}
                    onBlur={ververs}
                  />
                ))}
              </div>
            )}

            <label className="mt-5 flex items-center gap-2 text-[12px] text-neutral-600">
              <input type="checkbox" checked={archiveren} onChange={e => setArchiveren(e.target.checked)} />
              Opslaan in de SharePoint-dossiermap
            </label>
          </div>

          {/* Preview */}
          <div className="flex flex-1 flex-col overflow-hidden bg-neutral-100">
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2">
              <span className="text-[11px] text-neutral-500">Voorbeeld</span>
              <button onClick={ververs}
                className="ml-auto flex items-center gap-1.5 rounded border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50">
                <RefreshCw className="h-3 w-3" /> Verversen
              </button>
            </div>
            <iframe key={previewKey} src={previewUrl} className="w-full flex-1 border-0" title="Documentvoorbeeld" />
          </div>
        </div>

        {/* Mailpaneel */}
        {mailOpen && (
          <div className="flex-shrink-0 space-y-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <div className="flex gap-2">
              <input value={mail.to} onChange={e => setMail(m => ({ ...m, to: e.target.value }))}
                placeholder="Aan (meerdere adressen met ; scheiden)"
                className="flex-1 rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px]" />
              <input value={mail.cc} onChange={e => setMail(m => ({ ...m, cc: e.target.value }))}
                placeholder="Cc" className="w-56 rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px]" />
            </div>
            <input value={mail.onderwerp} onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))}
              placeholder="Onderwerp" className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px]" />
            <textarea value={mail.bodyHtml} onChange={e => setMail(m => ({ ...m, bodyHtml: e.target.value }))}
              rows={3} placeholder="Bericht" className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px]" />
            <p className="text-[11px] text-neutral-500">Het document gaat als PDF-bijlage mee, verstuurd vanaf jouw Outlook.</p>
          </div>
        )}

        {/* Acties */}
        <div className="flex flex-shrink-0 items-center gap-2 border-t border-neutral-200 px-5 py-3">
          {ontbreekt.length > 0 && (
            <span className="text-[11.5px] text-amber-700">Nog invullen: {ontbreekt.map(v => v.label).join(', ')}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={bewerkInWord} disabled={download !== null}
              title="Zet het document in de dossiermap en opent het in Word Online"
              className="flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-60">
              <Pencil className="h-3.5 w-3.5" /> {download === 'docx' ? 'Bezig…' : 'Bewerken in Word'}
            </button>
            <button onClick={haalPdfOp} disabled={download !== null}
              className="flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-60">
              <Download className="h-3.5 w-3.5" /> {download === 'pdf' ? 'Bezig…' : 'PDF'}
            </button>
            {mailOpen ? (
              <button onClick={verstuur} disabled={bezig}
                className="flex items-center gap-1.5 rounded bg-brand-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                <Mail className="h-3.5 w-3.5" /> {bezig ? 'Versturen…' : 'Versturen'}
              </button>
            ) : (
              <button onClick={() => setMailOpen(true)}
                className="flex items-center gap-1.5 rounded bg-brand-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-brand-700">
                <Mail className="h-3.5 w-3.5" /> Mailen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VeldInvoer({ veld, waarde, onChange, onBlur }: {
  veld: DocumentVeld
  waarde: string
  onChange: (v: string) => void
  onBlur: () => void
}) {
  const cls = 'w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand-500/30'
  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-medium text-neutral-600">
        {veld.label}{veld.verplicht && <span className="text-red-500"> *</span>}
      </label>
      {veld.type === 'meerregelig' ? (
        <textarea value={waarde} onChange={e => onChange(e.target.value)} onBlur={onBlur} rows={4} className={cls} />
      ) : veld.type === 'keuze' ? (
        <select value={waarde} onChange={e => { onChange(e.target.value) }} onBlur={onBlur} className={cls}>
          <option value="">— kies —</option>
          {(veld.opties ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : veld.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
          <input type="checkbox" checked={waarde === 'true'} onChange={e => { onChange(String(e.target.checked)); onBlur() }} />
          Ja
        </label>
      ) : (
        <input
          type={veld.type === 'datum' ? 'date' : veld.type === 'getal' ? 'number' : 'text'}
          value={waarde} onChange={e => onChange(e.target.value)} onBlur={onBlur} className={cls}
        />
      )}
      {veld.hint && <p className="mt-1 text-[10.5px] text-neutral-400">{veld.hint}</p>}
    </div>
  )
}

/** Haalt de bestandsnaam uit Content-Disposition (de route zet hem url-encoded). */
function bestandsnaamUitHeader(header: string | null): string | null {
  if (!header) return null
  const m = header.match(/filename="([^"]+)"/)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

function triggerDownload(blob: Blob, naam: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = naam
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
