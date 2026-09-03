'use client'

/**
 * Sjabloon-editor: de document-tegenhanger van de offerte-layout-editor.
 *
 * Bewust slanker: géén kleuren/marges/lettertype/papier. In de Word-only pijplijn
 * bepaalt het .docx zelf de opmaak; die velden op quote_layouts zijn resten uit het
 * HTML-tijdperk en zouden hier alleen maar suggereren dat ze iets doen.
 *
 * Links: Word-template koppelen + variabelenpaneel. Rechts: live PDF-preview op
 * testgegevens (dossier_id=demo, geen echt dossier nodig).
 */

import { useState, useRef, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save, RefreshCw, Check, ChevronDown, ChevronRight, FileText, Upload, X, Pencil, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateSjabloon } from '../actions'
import VeldenBuilder from './VeldenBuilder'
import { DOCUMENT_VARIABELEN, bekendeVariabelen } from '@/lib/documenten/variabelen'
import { DOCUMENTSOORTEN, documentsoortLabels, type DocumentSjabloon, type DocumentVeld, type Documentsoort } from '@/lib/documenten/types'

export default function SjabloonEditorClient({ sjabloon }: { sjabloon: DocumentSjabloon }) {
  const [form, setForm] = useState({
    naam: sjabloon.naam,
    beschrijving: sjabloon.beschrijving ?? '',
    documentsoort: sjabloon.documentsoort,
    docx_template_url: sjabloon.docx_template_url ?? '',
    docx_template_bron: sjabloon.docx_template_bron ?? '',
    docx_template_drive_id: sjabloon.docx_template_drive_id ?? '',
    docx_template_item_id: sjabloon.docx_template_item_id ?? '',
    docx_template_web_url: sjabloon.docx_template_web_url ?? '',
    briefpapier_pdf_url: sjabloon.briefpapier_pdf_url ?? '',
    bestandsnaam_sjabloon: sjabloon.bestandsnaam_sjabloon ?? '',
    mail_onderwerp: sjabloon.mail_onderwerp ?? '',
    mail_body_html: sjabloon.mail_body_html ?? '',
    actief: sjabloon.actief,
  })
  const [velden, setVelden] = useState<DocumentVeld[]>(sjabloon.velden ?? [])
  const [previewKey, setPreviewKey] = useState(0)
  const [bezig, startT] = useTransition()

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const isGraph = form.docx_template_bron === 'sharepoint' || form.docx_template_bron === 'onedrive'
  const heeftTemplate = (isGraph && form.docx_template_drive_id && form.docx_template_item_id) || !!form.docx_template_url

  // Preview draait op de OPGESLAGEN sjabloonrij plus de nog niet opgeslagen
  // template/briefpapier als override — zo zie je een net geüpload bestand meteen.
  const previewUrl = useMemo(() => {
    if (!heeftTemplate) return null
    const p = new URLSearchParams({ sjabloon_id: sjabloon.id, dossier_id: 'demo', _k: String(previewKey) })
    if (isGraph) {
      p.set('drive_id', form.docx_template_drive_id)
      p.set('item_id', form.docx_template_item_id)
    } else if (form.docx_template_url) {
      p.set('template_url', form.docx_template_url)
    }
    if (form.briefpapier_pdf_url) p.set('briefpapier_url', form.briefpapier_pdf_url)
    return `/api/documenten/preview?${p.toString()}`
  }, [heeftTemplate, isGraph, form.docx_template_drive_id, form.docx_template_item_id, form.docx_template_url, form.briefpapier_pdf_url, sjabloon.id, previewKey])

  function opslaan() {
    startT(async () => {
      try {
        await updateSjabloon(sjabloon.id, {
          naam: form.naam.trim() || 'Naamloos sjabloon',
          beschrijving: form.beschrijving || null,
          documentsoort: form.documentsoort,
          docx_template_url: form.docx_template_url || null,
          docx_template_bron: form.docx_template_bron || null,
          docx_template_drive_id: form.docx_template_drive_id || null,
          docx_template_item_id: form.docx_template_item_id || null,
          docx_template_web_url: form.docx_template_web_url || null,
          briefpapier_pdf_url: form.briefpapier_pdf_url || null,
          bestandsnaam_sjabloon: form.bestandsnaam_sjabloon || null,
          mail_onderwerp: form.mail_onderwerp || null,
          mail_body_html: form.mail_body_html || null,
          actief: form.actief,
          velden,
        })
        toast.success('Opgeslagen')
        setPreviewKey(k => k + 1)
      } catch {
        toast.error('Opslaan mislukt')
      }
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--topbar-h,64px))] overflow-hidden">
      {/* Kop */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <Link href="/instellingen/document-sjablonen" className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input
          value={form.naam}
          onChange={e => set('naam', e.target.value)}
          className="text-sm font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-everts focus:outline-none px-1 py-0.5 min-w-[240px]"
        />
        <select
          value={form.documentsoort}
          onChange={e => set('documentsoort', e.target.value as Documentsoort)}
          className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-600"
        >
          {DOCUMENTSOORTEN.map(s => <option key={s} value={s}>{documentsoortLabels[s]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 ml-2">
          <input type="checkbox" checked={form.actief} onChange={e => set('actief', e.target.checked)} />
          Actief
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setPreviewKey(k => k + 1)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" /> Preview verversen
          </button>
          <button onClick={opslaan} disabled={bezig}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-everts text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-60">
            <Save className="w-3.5 h-3.5" /> {bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Linkerkolom */}
        <div className="w-80 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          <WordTemplatePaneel
            sjabloonId={sjabloon.id}
            docxTemplateUrl={form.docx_template_url}
            bron={form.docx_template_bron}
            webUrl={form.docx_template_web_url}
            driveId={form.docx_template_drive_id}
            itemId={form.docx_template_item_id}
            briefpapierUrl={form.briefpapier_pdf_url}
            onUrlChange={url => setForm(f => ({ ...f, docx_template_url: url, docx_template_bron: url ? 'bucket' : '' }))}
            onBriefpapierChange={url => set('briefpapier_pdf_url', url)}
            onGraphLink={r => setForm(f => ({
              ...f,
              docx_template_bron: 'sharepoint',
              docx_template_drive_id: r.drive_id,
              docx_template_item_id: r.item_id,
              docx_template_web_url: r.web_url ?? '',
              docx_template_url: '',
            }))}
            onClearGraph={() => setForm(f => ({
              ...f, docx_template_bron: '', docx_template_drive_id: '', docx_template_item_id: '', docx_template_web_url: '',
            }))}
          />

          <div className="p-3 border-t border-slate-200 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoervelden</h3>
            <p className="text-[11px] text-slate-500 leading-snug">
              Gegevens die niet in het dossier staan (werkzaamheden, garantietermijn). Ze worden gevraagd
              bij het opstellen en zijn in Word beschikbaar als <code className="bg-slate-100 px-1 rounded">{'{invoer.sleutel}'}</code>.
            </p>
            <VeldenBuilder velden={velden} onChange={setVelden} />
          </div>

          <div className="p-3 border-t border-slate-200 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Overig</h3>
            <label className="block text-[11px] text-slate-500">Bestandsnaam</label>
            <input value={form.bestandsnaam_sjabloon} onChange={e => set('bestandsnaam_sjabloon', e.target.value)}
              placeholder="{documentsoort} {dossiernummer}"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs" />
            <label className="block text-[11px] text-slate-500 pt-1">Mail — onderwerp</label>
            <input value={form.mail_onderwerp} onChange={e => set('mail_onderwerp', e.target.value)}
              placeholder="Werkzaamheden {dossier.titel}"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs" />
            <label className="block text-[11px] text-slate-500 pt-1">Mail — bericht</label>
            <textarea value={form.mail_body_html} onChange={e => set('mail_body_html', e.target.value)}
              rows={4} placeholder="Beste {geadresseerde.aanhef}, …"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs" />
            <label className="block text-[11px] text-slate-500 pt-1">Omschrijving (intern)</label>
            <input value={form.beschrijving} onChange={e => set('beschrijving', e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs" />
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-slate-100 overflow-hidden flex flex-col">
          <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-500">
              Preview met <strong>testgegevens</strong> — elke variabele is gevuld, zodat je het sjabloon
              kunt controleren zonder dossier.
            </span>
          </div>
          {previewUrl ? (
            <iframe key={previewKey} src={previewUrl} className="flex-1 w-full border-0" title="Preview" />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Koppel eerst een Word-template om een preview te zien.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Word template paneel ─────────────────────────────────────────────────────

function WordTemplatePaneel({
  sjabloonId, docxTemplateUrl, bron, webUrl, driveId, itemId, briefpapierUrl,
  onUrlChange, onBriefpapierChange, onGraphLink, onClearGraph,
}: {
  sjabloonId: string
  docxTemplateUrl: string
  bron: string
  webUrl: string
  driveId: string
  itemId: string
  briefpapierUrl: string
  onUrlChange: (url: string) => void
  onBriefpapierChange: (url: string) => void
  onGraphLink: (r: { drive_id: string; item_id: string; web_url: string | null; naam: string | null }) => void
  onClearGraph: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [openGroep, setOpenGroep] = useState<string | null>('Document')
  const [zoek, setZoek] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [linking, setLinking] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{
    problemen: { ernst: string; uitleg: string; tag?: string; context?: string }[]
    onbekend: { naam: string; context: string }[]
    tagCount: number
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bpRef = useRef<HTMLInputElement>(null)

  const isGraph = bron === 'sharepoint' || bron === 'onedrive'

  /* Zoeken in de variabelenlijst. Zonder dit moet je vijftien dichtgeklapte groepen
     langs om één tag te vinden, en staat de tag die je zoekt per definitie in de
     groep die dicht is (er kan er maar één tegelijk open).

     De vergelijking negeert de opmaak van een tag: {, }, #, /, %, @ en punten gaan
     eruit, zodat "opdrachtdatum", "{datums.opdrachtdatum}" en "datums opdrachtdatum"
     alle drie hetzelfde vinden. Het label doet mee, want dáár staan de woorden die
     iemand intikt ("voorlopig", "garantie") vaker in dan in de tagnaam zelf. */
  const zoekTermen = useMemo(
    () => zoek.toLowerCase().split(/[\s{}#\/%@.]+/).filter(Boolean),
    [zoek],
  )

  const zichtbareGroepen = useMemo(() => {
    if (zoekTermen.length === 0) return DOCUMENT_VARIABELEN
    const raakt = (tekst: string) => {
      const t = tekst.toLowerCase()
      return zoekTermen.every(term => t.includes(term))
    }
    return DOCUMENT_VARIABELEN
      .map(groep => {
        // Matcht de groepsnaam zelf, dan blijft de hele groep staan: wie "planning"
        // typt wil de planning-variabelen zien, niet alleen die met dat woord erin.
        if (raakt(groep.groep)) return groep
        const items = groep.items.filter(i => raakt(`${i.v} ${i.label}`))
        return items.length > 0 ? { ...groep, items } : null
      })
      .filter((g): g is typeof DOCUMENT_VARIABELEN[number] => g !== null)
  }, [zoekTermen])

  const aantalTreffers = zichtbareGroepen.reduce((n, g) => n + g.items.length, 0)
  const heeftTemplate = (isGraph && driveId && itemId) || !!docxTemplateUrl

  async function controleerTemplate() {
    setChecking(true)
    setCheckResult(null)
    try {
      const body = isGraph && driveId && itemId ? { drive_id: driveId, item_id: itemId } : { template_url: docxTemplateUrl }
      const res = await fetch('/everts-calc/api/docx-templates/valideer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      // Onbekend = een tag die niet in DOCUMENT_VARIABELEN staat. invoer.* is per
      // definitie vrij, dus die tellen niet als "onbekend".
      const geldig = bekendeVariabelen()
      const tags: { naam: string; type: string; context: string }[] = json.tags ?? []
      const onbekendMap = new Map<string, string>()
      for (const t of tags) {
        const naam = t.naam
        if (!naam || naam === '.') continue
        if (naam.startsWith('invoer.')) continue
        // Loop-/conditie-tags: {#planning.heeft} → planning.heeft is bekend.
        if (geldig.has(naam)) continue
        // Sub-veld binnen een bekend blok (bv. uitvoerder.foto) telt als bekend.
        if (!onbekendMap.has(naam)) onbekendMap.set(naam, t.context)
      }
      setCheckResult({
        problemen: json.problemen ?? [],
        onbekend: Array.from(onbekendMap, ([naam, context]) => ({ naam, context })),
        tagCount: tags.length,
      })
    } catch (err) {
      toast.error('Controleren mislukt: ' + String(err))
    } finally {
      setChecking(false)
    }
  }

  async function koppelGraph() {
    if (!shareLink.trim()) { toast.error('Plak eerst een SharePoint/OneDrive-link'); return }
    setLinking(true)
    try {
      const res = await fetch('/everts-calc/api/docx-templates/graph', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shareLink: shareLink.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onGraphLink(json)
      setShareLink('')
      toast.success('Word-template gekoppeld — klik op Opslaan')
    } catch (err) {
      toast.error('Koppelen mislukt: ' + String(err))
    } finally {
      setLinking(false)
    }
  }

  async function uploadTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.docx')) { toast.error('Alleen .docx bestanden zijn toegestaan'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('layoutId', sjabloonId)
      // Zonder deze prefix landt het template tussen de offerte-layouts.
      fd.append('prefix', 'documenten')
      const res = await fetch('/everts-calc/api/docx-templates/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onUrlChange(json.url)
      toast.success('Template geüpload — klik op Opslaan')
    } catch (err) {
      toast.error('Upload mislukt: ' + String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function uploadBriefpapier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { toast.error('Alleen .pdf bestanden zijn toegestaan'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('layoutId', sjabloonId)
      const res = await fetch('/everts-calc/api/briefpapier/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onBriefpapierChange(json.url)
      toast.success('Briefpapier geüpload — klik op Opslaan')
    } catch (err) {
      toast.error('Upload mislukt: ' + String(err))
    } finally {
      setUploading(false)
      if (bpRef.current) bpRef.current.value = ''
    }
  }

  function kopieer(v: string) {
    navigator.clipboard.writeText(v).then(() => {
      setCopied(v)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="flex flex-col">
      {/* Template */}
      <div className="p-3 border-b border-slate-200 space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <FileText className="w-3 h-3" /> Word template
        </h3>

        {isGraph ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span className="text-xs text-blue-800 flex-1 truncate font-medium">Gekoppeld aan SharePoint/OneDrive</span>
            </div>
            <div className="flex gap-1.5">
              {webUrl && (
                <a href={webUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50">
                  <Pencil className="w-3 h-3" /> Bewerken in Word Online
                </a>
              )}
              <button onClick={() => { onClearGraph(); toast.success('Koppeling verwijderd') }}
                className="p-1 border border-red-200 rounded text-red-500 hover:bg-red-50" title="Ontkoppelen">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input type="url" value={shareLink} onChange={e => setShareLink(e.target.value)}
              placeholder="Plak SharePoint/OneDrive-link naar .docx"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs" />
            <button onClick={koppelGraph} disabled={linking}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              {linking ? '⟳ Koppelen…' : <><FileText className="w-3.5 h-3.5" /> Koppel & bewerk in Word Online</>}
            </button>
          </div>
        )}

        {!isGraph && <div className="text-[10px] text-slate-400 text-center py-0.5">— of upload een .docx —</div>}

        {!isGraph && (docxTemplateUrl ? (
          <div className="flex gap-1.5">
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              <Upload className="w-3 h-3" /> Vervangen
            </button>
            <a href={docxTemplateUrl} download
              className="flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50">
              <FileText className="w-3 h-3" /> Download
            </a>
            <button onClick={() => { onUrlChange(''); toast.success('Template verwijderd') }}
              className="p-1 border border-red-200 rounded text-red-500 hover:bg-red-50" title="Verwijderen">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-everts hover:text-everts disabled:opacity-60">
            {uploading ? '⟳ Uploaden…' : <><Upload className="w-3.5 h-3.5" /> .docx template uploaden</>}
          </button>
        ))}
        <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={uploadTemplate} />

        {/* Briefpapier */}
        <div className="pt-1">
          <label className="block text-[11px] text-slate-500 mb-1">Briefpapier (PDF-achtergrond, optioneel)</label>
          {briefpapierUrl ? (
            <div className="flex gap-1.5">
              <a href={briefpapierUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50">
                Bekijken
              </a>
              <button onClick={() => bpRef.current?.click()}
                className="px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50">Vervangen</button>
              <button onClick={() => onBriefpapierChange('')}
                className="p-1 border border-red-200 rounded text-red-500 hover:bg-red-50" title="Verwijderen">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => bpRef.current?.click()} disabled={uploading}
              className="w-full px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-everts hover:text-everts disabled:opacity-60">
              Briefpapier-PDF uploaden
            </button>
          )}
          <input ref={bpRef} type="file" accept=".pdf" className="hidden" onChange={uploadBriefpapier} />
        </div>
      </div>

      {/* Template controleren */}
      {heeftTemplate && (
        <div className="p-3 border-b border-slate-200 space-y-2">
          <button onClick={controleerTemplate} disabled={checking}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            {checking ? '⟳ Controleren…' : <><Check className="w-3.5 h-3.5" /> Template controleren</>}
          </button>
          {checkResult && (
            <div className="space-y-1.5">
              {checkResult.problemen.length === 0 && checkResult.onbekend.length === 0 ? (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" /> Geen problemen — {checkResult.tagCount} tags herkend.
                </div>
              ) : (
                <>
                  {checkResult.problemen.map((p, i) => (
                    <div key={`p${i}`} className="px-2.5 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-semibold text-red-800 leading-snug">{p.tag ? `{${p.tag}} — ` : ''}{p.uitleg}</p>
                      {p.context && <p className="mt-1 text-[11px] text-red-600 font-mono break-words leading-snug">zoek in Word: “{p.context}”</p>}
                    </div>
                  ))}
                  {checkResult.onbekend.map((o, i) => (
                    <div key={`o${i}`} className="px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-semibold text-amber-800 leading-snug">Let op: onbekende variabele {`{${o.naam}}`}</p>
                      {o.context && <p className="mt-1 text-[11px] text-amber-700 font-mono break-words leading-snug">bij: “{o.context}”</p>}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Syntax */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-amber-50">
        <p className="text-xs font-semibold text-amber-800 mb-1.5">Template syntax in Word</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{variabele}'}</code>
            <span className="text-amber-700">Vervang door waarde</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{#blok}'} … {'{/blok}'}</code>
            <span className="text-amber-700">Toon alleen als gevuld. Tags op <strong>eigen alinea</strong>!</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{%foto}'}</code>
            <span className="text-amber-700">Afbeelding — moet <strong>alleen</strong> in zijn eigen alinea staan</span>
          </div>
        </div>
      </div>

      {/* Variabelen */}
      <div>
        <div className="p-2 space-y-1">
          <div className="relative px-1 pb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-slate-400" />
            <input
              // Bewust `text` en niet `search`: die laatste krijgt in Chrome een eigen
              // kruisje, en dan staan er twee naast elkaar.
              type="text"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              placeholder="Zoek een variabele…"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
            {zoek && (
              <button
                type="button"
                onClick={() => setZoek('')}
                aria-label="Zoekopdracht wissen"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 px-1 pb-1">
            {zoek
              ? `${aantalTreffers} ${aantalTreffers === 1 ? 'variabele' : 'variabelen'} gevonden — klik om te kopiëren.`
              : 'Klik op een variabele om te kopiëren.'}
          </p>
          {zoek && aantalTreffers === 0 && (
            <p className="px-1 py-3 text-xs text-slate-500">
              Niets gevonden voor “{zoek}”. Zoek op een deel van de naam, bijvoorbeeld{' '}
              <button type="button" onClick={() => setZoek('datum')} className="underline hover:text-slate-700">datum</button>{' '}
              of{' '}
              <button type="button" onClick={() => setZoek('klant')} className="underline hover:text-slate-700">klant</button>.
            </p>
          )}
          {zichtbareGroepen.map(({ groep, uitleg, items }) => (
            <div key={groep} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => setOpenGroep(v => v === groep ? null : groep)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100">
                <span>{groep}</span>
                {/* Tijdens het zoeken staat alles open: de accordeon dichthouden zou de
                    treffers verbergen die je net hebt gezocht. */}
                {zoek || openGroep === groep ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {(zoek || openGroep === groep) && (
                <div>
                  {uitleg && <p className="px-3 py-1.5 text-[11px] text-slate-500 bg-slate-50/60 border-b border-slate-100 leading-snug">{uitleg}</p>}
                  <div className="divide-y divide-slate-100">
                    {items.map(({ v, label }) => (
                      <button key={v} onClick={() => kopieer(v)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50 group">
                        <code className="text-[11px] text-everts font-mono break-all">{v}</code>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 group-hover:text-slate-600">
                          {copied === v ? '✓ gekopieerd' : label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
