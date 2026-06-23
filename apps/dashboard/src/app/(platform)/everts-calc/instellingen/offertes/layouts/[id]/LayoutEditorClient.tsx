'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ArrowLeft, Save, Eye, Code2, RefreshCw, Copy, Check,
  Palette, Settings2, ChevronDown, ChevronRight, Layers,
  Plus, Trash2, Pencil, CreditCard, TableProperties,
  FileText, Upload, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { updateLayout } from '@/app/(platform)/everts-calc/actions/quote-instellingen'
import { maakSjabloontekst, updateSjabloontekst, verwijderSjabloontekst } from '@/app/(platform)/everts-calc/actions/sjabloonteksten'
import type { Sjabloontekst } from '@/app/(platform)/everts-calc/actions/sjabloonteksten'

// Word-preview rendert client-side (geen SSR)
const DocxViewer = dynamic(() => import('@/components/everts-calc/DocxViewer'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

interface Layout {
  id: string
  naam: string
  beschrijving?: string | null
  html_template?: string | null
  wysiwyg_body?: string | null
  docx_template_url?: string | null
  docx_template_bron?: string | null
  docx_template_drive_id?: string | null
  docx_template_item_id?: string | null
  docx_template_web_url?: string | null
  primaire_kleur: string
  secundaire_kleur?: string | null
  accent_kleur?: string | null
  kleur_niveau_2?: string | null
  kleur_niveau_3?: string | null
  lettertype?: string | null
  lettergrootte?: number | null
  papier_formaat?: string | null
  papier_orientatie?: string | null
  marge_boven?: number | null
  marge_onder?: number | null
  marge_links?: number | null
  marge_rechts?: number | null
  toon_voorblad?: boolean | null
  toon_specificatie?: boolean | null
  toon_voorwaarden?: boolean | null
  toon_paginanummer?: boolean | null
  koptekst?: string | null
  voettekst?: string | null
  footer_html?: string | null
}

interface Props {
  layout: Layout
  voorbeeldQuoteId: string | null
  sjabloonteksten: Sjabloontekst[]
}

// ─── Variabelen per categorie ─────────────────────────────────────────────────

const VARIABELEN = [
  { groep: 'Offerte', items: [
    { v: 'offerte.nummer',         label: 'Nummer' },
    { v: 'offerte.titel',          label: 'Titel' },
    { v: 'offerte.datum',          label: 'Datum' },
    { v: 'offerte.geldig_tot',     label: 'Geldig tot' },
    { v: 'offerte.referentie',     label: 'Referentie' },
    { v: 'offerte.aanhef',         label: 'Aanhef' },
    { v: 'offerte.inleiding',      label: 'Inleiding' },
    { v: 'offerte.slottekst',      label: 'Slottekst' },
  ]},
  { groep: 'Betalingscondities', isBlok: true, items: [
    { v: 'offerte.betalingscondities', label: 'Betalingscondities (blok)' },
  ]},
  { groep: 'Klant', items: [
    { v: 'klant.naam',             label: 'Naam' },
    { v: 'klant.bedrijfsnaam',     label: 'Bedrijfsnaam' },
    { v: 'klant.bedrijf_of_naam',  label: 'Bedrijf of naam' },
    { v: 'klant.adres',            label: 'Adres' },
    { v: 'klant.postcode_plaats',  label: 'Postcode + Plaats' },
    { v: 'klant.email',            label: 'E-mail' },
    { v: 'klant.telefoon',         label: 'Telefoon' },
  ]},
  { groep: 'Bedrijf', items: [
    { v: 'bedrijf.naam',           label: 'Naam' },
    { v: 'bedrijf.adres',          label: 'Adres' },
    { v: 'bedrijf.postcode_plaats',label: 'Postcode + Plaats' },
    { v: 'bedrijf.telefoon',       label: 'Telefoon' },
    { v: 'bedrijf.email',          label: 'E-mail' },
    { v: 'bedrijf.website',        label: 'Website' },
    { v: 'bedrijf.kvk',            label: 'KvK' },
    { v: 'bedrijf.btw',            label: 'BTW' },
    { v: 'bedrijf.iban',           label: 'IBAN' },
    { v: 'bedrijf.logo_url',       label: 'Logo URL' },
  ]},
  { groep: 'Totalen', items: [
    { v: 'totalen.subtotaal',      label: 'Subtotaal' },
    { v: 'totalen.btw_pct',        label: 'BTW %' },
    { v: 'totalen.btw_bedrag',     label: 'BTW bedrag' },
    { v: 'totalen.totaal',         label: 'Totaal incl. BTW' },
  ]},
  { groep: 'Loops (HTML-modus)', items: [
    { v: '#each normale_secties',  label: 'Secties (loop)' },
    { v: '#each this.regels',      label: 'Regels (loop)' },
    { v: '#if heeft_stelposten',   label: 'Als stelposten' },
    { v: '#if heeft_opties',       label: 'Als opties' },
  ]},
]

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function LayoutEditorClient({ layout, voorbeeldQuoteId, sjabloonteksten: initSjabloonteksten }: Props) {
  const [form, setForm] = useState({
    naam: layout.naam,
    beschrijving: layout.beschrijving ?? '',
    primaire_kleur: layout.primaire_kleur ?? '#1a56db',
    secundaire_kleur: layout.secundaire_kleur ?? '#f8fafc',
    accent_kleur: layout.accent_kleur ?? '#009439',
    kleur_niveau_2: layout.kleur_niveau_2 ?? '#475569',
    kleur_niveau_3: layout.kleur_niveau_3 ?? '#e2e8f0',
    lettertype: layout.lettertype ?? 'system-ui, sans-serif',
    lettergrootte: layout.lettergrootte ?? 10,
    papier_formaat: layout.papier_formaat ?? 'A4',
    papier_orientatie: layout.papier_orientatie ?? 'portrait',
    marge_boven: layout.marge_boven ?? 15,
    marge_onder: layout.marge_onder ?? 15,
    marge_links: layout.marge_links ?? 18,
    marge_rechts: layout.marge_rechts ?? 18,
    toon_voorblad: layout.toon_voorblad ?? true,
    toon_specificatie: layout.toon_specificatie ?? true,
    toon_voorwaarden: layout.toon_voorwaarden ?? true,
    toon_paginanummer: layout.toon_paginanummer ?? true,
    koptekst: layout.koptekst ?? '',
    voettekst: layout.voettekst ?? 'Pagina {{paginanummer}} van {{totaal_paginas}}',
    footer_html: layout.footer_html ?? '',
    docx_template_url: layout.docx_template_url ?? '',
    docx_template_bron: layout.docx_template_bron ?? '',
    docx_template_drive_id: layout.docx_template_drive_id ?? '',
    docx_template_item_id: layout.docx_template_item_id ?? '',
    docx_template_web_url: layout.docx_template_web_url ?? '',
  })

  const activeTab = 'word' as const
  const [previewKey, setPreviewKey] = useState(0)
  const [varOpen, setVarOpen] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Calculatieregels kolom-keuze
  const ALLE_KOLOMMEN = [
    { key: 'omschrijving', label: 'Omschrijving' },
    { key: 'eenheid',      label: 'Eenheid' },
    { key: 'aantal',       label: 'Aantal' },
    { key: 'prijs',        label: 'Prijs p/e' },
    { key: 'totaal',       label: 'Totaal' },
    { key: 'btw',          label: 'BTW %' },
    { key: 'marge',        label: 'Marge %' },
  ]
  const [calcKolommen, setCalcKolommen] = useState<string[]>(['omschrijving', 'eenheid', 'aantal', 'prijs', 'totaal'])

  // Sjabloonteksten beheer
  const [sjabloonteksten, setSjabloonteksten] = useState(initSjabloonteksten)
  const [stModal, setStModal] = useState<{ open: boolean; item?: Sjabloontekst }>({ open: false })
  const [stForm, setStForm] = useState({ naam: '', inhoud_html: '', categorie: 'algemeen' })
  const [, startStTransition] = useTransition()

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const bedrijfJson = typeof window !== 'undefined'
    ? (localStorage.getItem('evc_offerte_bedrijf') ?? '{}')
    : '{}'

  // Word-only: voorbeeld vereist een gekoppelde .docx-template (SharePoint/OneDrive of Supabase)
  const isGraphTemplate = form.docx_template_bron === 'sharepoint' || form.docx_template_bron === 'onedrive'
  const previewUrl = !voorbeeldQuoteId
    ? null
    : isGraphTemplate && form.docx_template_drive_id && form.docx_template_item_id
      ? `/everts-calc/api/quotes/${voorbeeldQuoteId}/docx-preview?drive_id=${encodeURIComponent(form.docx_template_drive_id)}&item_id=${encodeURIComponent(form.docx_template_item_id)}&bedrijf=${encodeURIComponent(bedrijfJson)}`
      : form.docx_template_url
        ? `/everts-calc/api/quotes/${voorbeeldQuoteId}/docx-preview?template_url=${encodeURIComponent(form.docx_template_url)}&bedrijf=${encodeURIComponent(bedrijfJson)}`
        : null

  // ── Opslaan ───────────────────────────────────────────────────────────────

  function slaOp() {
    startTransition(async () => {
      try {
        const data: Record<string, unknown> = {
          naam: form.naam,
          beschrijving: form.beschrijving || null,
          primaire_kleur: form.primaire_kleur,
          secundaire_kleur: form.secundaire_kleur,
          accent_kleur: form.accent_kleur,
          kleur_niveau_2: form.kleur_niveau_2,
          kleur_niveau_3: form.kleur_niveau_3,
          lettertype: form.lettertype,
          lettergrootte: Number(form.lettergrootte),
          papier_formaat: form.papier_formaat,
          papier_orientatie: form.papier_orientatie,
          marge_boven: Number(form.marge_boven),
          marge_onder: Number(form.marge_onder),
          marge_links: Number(form.marge_links),
          marge_rechts: Number(form.marge_rechts),
          toon_voorblad: form.toon_voorblad,
          toon_specificatie: form.toon_specificatie,
          toon_voorwaarden: form.toon_voorwaarden,
          toon_paginanummer: form.toon_paginanummer,
          koptekst: form.koptekst || null,
          voettekst: form.voettekst,
          footer_html: form.footer_html || null,
          docx_template_url: form.docx_template_url || null,
          docx_template_bron: form.docx_template_bron || null,
          docx_template_drive_id: form.docx_template_drive_id || null,
          docx_template_item_id: form.docx_template_item_id || null,
          docx_template_web_url: form.docx_template_web_url || null,
        }

        await updateLayout(layout.id, data)
        toast.success('Layout opgeslagen')
        setPreviewKey(k => k + 1)
      } catch (e) {
        toast.error('Opslaan mislukt: ' + String(e))
      }
    })
  }

  const ververs = useCallback(() => setPreviewKey(k => k + 1), [])

  const veld = (key: keyof typeof form, label: string, type = 'text') => (
    <div key={key}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(f => ({
          ...f,
          [key]: type === 'number' ? Number(e.target.value) : e.target.value,
        }))}
        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
      />
    </div>
  )

  const toggle = (
    key: 'toon_voorblad' | 'toon_specificatie' | 'toon_voorwaarden' | 'toon_paginanummer',
    label: string,
  ) => (
    <label key={key} className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
        className="rounded border-slate-300 text-everts focus:ring-everts/30"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  )

  // ── Sjabloonteksten beheer ─────────────────────────────────────────────────

  function openNieuweSjabloontekst() {
    setStForm({ naam: '', inhoud_html: '', categorie: 'algemeen' })
    setStModal({ open: true })
  }

  function openBewerkSjabloontekst(item: Sjabloontekst) {
    setStForm({ naam: item.naam, inhoud_html: item.inhoud_html, categorie: item.categorie })
    setStModal({ open: true, item })
  }

  function slaanSjabloontekstOp() {
    if (!stForm.naam.trim()) { toast.error('Geef een naam op'); return }
    startStTransition(async () => {
      try {
        if (stModal.item) {
          await updateSjabloontekst(stModal.item.id, stForm)
          setSjabloonteksten(prev => prev.map(x => x.id === stModal.item!.id ? { ...x, ...stForm } : x))
          toast.success('Bijgewerkt')
        } else {
          const id = await maakSjabloontekst(stForm)
          setSjabloonteksten(prev => [...prev, { id, ...stForm, volgorde: 0, created_at: '', updated_at: '' }])
          toast.success('Aangemaakt')
        }
        setStModal({ open: false })
      } catch (e) { toast.error(String(e)) }
    })
  }

  function verwijderSt(id: string, naam: string) {
    if (!confirm(`"${naam}" verwijderen?`)) return
    startStTransition(async () => {
      try {
        await verwijderSjabloontekst(id)
        setSjabloonteksten(prev => prev.filter(x => x.id !== id))
        toast.success('Verwijderd')
      } catch (e) { toast.error(String(e)) }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
        <Link
          href="/everts-calc/instellingen/offertes"
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Terug
        </Link>

        <input
          type="text"
          value={form.naam}
          onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
          className="font-semibold text-slate-800 text-sm bg-transparent border-none outline-none focus:ring-2 focus:ring-everts/30 rounded px-1 w-48"
        />

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={slaOp}
            className="flex items-center gap-2 px-4 py-1.5 bg-everts text-white rounded-lg text-sm font-medium hover:bg-everts/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            Opslaan
          </button>
        </div>
      </div>

      {/* ── Hoofdinhoud ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Linkerpaneel ──────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">


          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-5 pb-12">
              <WordTemplatePaneel
                layoutId={layout.id}
                docxTemplateUrl={form.docx_template_url}
                bron={form.docx_template_bron}
                webUrl={form.docx_template_web_url}
                onUrlChange={url => setForm(f => ({
                  ...f, docx_template_url: url,
                  docx_template_bron: '', docx_template_drive_id: '', docx_template_item_id: '', docx_template_web_url: '',
                }))}
                onGraphLink={r => setForm(f => ({
                  ...f, docx_template_url: '',
                  docx_template_bron: 'sharepoint',
                  docx_template_drive_id: r.drive_id, docx_template_item_id: r.item_id, docx_template_web_url: r.web_url ?? '',
                }))}
                onClearGraph={() => setForm(f => ({
                  ...f, docx_template_bron: '', docx_template_drive_id: '', docx_template_item_id: '', docx_template_web_url: '',
                }))}
              />

            </div>
          </div>
        </div>

        {/* ── Stijl-modus: document-editor (full width, geen preview) ──── */}
        {/* ── Word-modus: preview van de offerte ─────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-100">
          <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Voorbeeld Word-template</span>
            <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">Word</span>
            {!voorbeeldQuoteId && (
              <span className="text-xs text-amber-600 ml-2">⚠ Geen offerte gevonden voor preview</span>
            )}
            <button onClick={ververs} className="ml-auto p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Verversen">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {previewUrl ? (
            <DocxViewer key={previewKey} src={previewUrl} className="flex-1" />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm px-6 text-center">
              {voorbeeldQuoteId
                ? 'Koppel een Word-template om een voorbeeld te zien.'
                : 'Geen voorbeeld-offerte beschikbaar.'}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}

// ─── Word template paneel ─────────────────────────────────────────────────────

const WORD_VARIABELEN: { groep: string; items: { v: string; label: string }[] }[] = [
  { groep: 'Offerte', items: [
    { v: 'offerte.nummer',           label: 'Offertenummer (bv. OFF-2024-001)' },
    { v: 'offerte.titel',            label: 'Titel van de offerte' },
    { v: 'offerte.datum',            label: 'Datum (bv. 15 januari 2024)' },
    { v: 'offerte.datum_iso',        label: 'Datum als ISO-string (bv. 2024-01-15)' },
    { v: 'offerte.geldig_tot',       label: 'Geldig tot datum (bv. 15 februari 2024)' },
    { v: 'offerte.geldig_tot_iso',   label: 'Geldig tot als ISO-string (bv. 2024-02-15)' },
    { v: 'offerte.referentie',       label: 'Referentie / projectnummer' },
    { v: 'offerte.contactpersoon',   label: 'Contactpersoon' },
    { v: 'offerte.aanhef',           label: 'Aanhef (bv. Geachte heer De Vries)' },
    { v: 'offerte.inleiding',        label: 'Inleidingstekst' },
    { v: 'offerte.slottekst',        label: 'Slottekst' },
    { v: 'offerte.betalingscondities', label: 'Betalingscondities tekst' },
  ]},
  { groep: 'Klant', items: [
    { v: 'klant.naam',               label: 'Volledige naam contactpersoon' },
    { v: 'klant.bedrijfsnaam',       label: 'Bedrijfsnaam klant' },
    { v: 'klant.bedrijf_of_naam',    label: 'Bedrijfsnaam, anders naam' },
    { v: 'klant.adres',              label: 'Straat + huisnummer' },
    { v: 'klant.postcode',           label: 'Postcode' },
    { v: 'klant.plaats',             label: 'Plaats' },
    { v: 'klant.postcode_plaats',    label: 'Postcode + Plaats (bv. 1234 AB Amsterdam)' },
    { v: 'klant.email',              label: 'E-mailadres' },
    { v: 'klant.telefoon',           label: 'Telefoonnummer' },
  ]},
  { groep: 'Jouw bedrijf', items: [
    { v: 'bedrijf.naam',             label: 'Jouw bedrijfsnaam' },
    { v: 'bedrijf.adres',            label: 'Jouw adres' },
    { v: 'bedrijf.postcode_plaats',  label: 'Jouw postcode + Plaats' },
    { v: 'bedrijf.telefoon',         label: 'Jouw telefoonnummer' },
    { v: 'bedrijf.email',            label: 'Jouw e-mailadres' },
    { v: 'bedrijf.website',          label: 'Website' },
    { v: 'bedrijf.kvk',              label: 'KvK nummer' },
    { v: 'bedrijf.btw',              label: 'BTW nummer' },
    { v: 'bedrijf.iban',             label: 'IBAN rekeningnummer' },
  ]},
  { groep: 'Totalen', items: [
    { v: 'totalen.subtotaal',            label: 'Subtotaal excl. BTW (bv. € 10.000,00)' },
    { v: 'totalen.subtotaal_raw',        label: 'Subtotaal als getal (bv. 10000)' },
    { v: 'totalen.btw_pct',              label: 'BTW percentage (bv. 21)' },
    { v: 'totalen.btw_bedrag',           label: 'BTW bedrag (bv. € 2.100,00)' },
    { v: 'totalen.btw_bedrag_raw',       label: 'BTW bedrag als getal' },
    { v: 'totalen.totaal',               label: 'Totaal incl. BTW (bv. € 12.100,00)' },
    { v: 'totalen.totaal_raw',           label: 'Totaal incl. BTW als getal' },
    { v: 'totalen.stelposten_subtotaal', label: 'Totaal stelposten' },
    { v: 'totalen.opties_subtotaal',     label: 'Totaal opties (niet inbegrepen)' },
  ]},
  { groep: 'Teksten', items: [
    { v: 'voorwaarden',              label: 'Algemene voorwaarden (plain text)' },
    { v: 'uitsluitingen',            label: 'Uitsluitingen (plain text)' },
    { v: 'opmerkingen',              label: 'Opmerkingen (plain text)' },
  ]},
  { groep: 'Loop: normale_secties', items: [
    { v: '#normale_secties',         label: 'Begin loop — alle calculatiegroepen (excl. leeg)' },
    { v: '/normale_secties',         label: 'Einde loop' },
    { v: 'display_naam',             label: 'Genummerde naam (bv. "1.1  Metselwerk")' },
    { v: 'naam',                     label: 'Naam van de groep' },
    { v: 'nummer',                   label: 'Nummer (bv. "1.1")' },
    { v: 'subtotaal',                label: 'Subtotaal van de groep (bv. € 5.000,00)' },
    { v: 'subtotaal_raw',            label: 'Subtotaal als getal (bv. 5000)' },
    { v: 'niveau',                   label: 'Niveau (1, 2 of 3)' },
    { v: 'discipline',               label: 'Discipline / kostensoort' },
    { v: 'toon_detail',              label: 'Boolean: regels zichtbaar voor klant' },
    { v: 'heeft_regels',             label: 'Boolean: heeft deze groep regels' },
    { v: 'aantal_regels',            label: 'Aantal regels in deze groep' },
    { v: 'is_stelpost_sectie',       label: 'Boolean: bevat stelpost-regels' },
    { v: 'is_optioneel',             label: 'Boolean: is dit een optie-groep' },
  ]},
  { groep: 'Loop: niveau 1 / 2 / 3 secties', items: [
    { v: '#normale_secties_niveau1', label: 'Begin loop — alleen hoofdgroepen (niveau 1)' },
    { v: '/normale_secties_niveau1', label: 'Einde loop' },
    { v: '#normale_secties_niveau2', label: 'Begin loop — alleen subgroepen (niveau 2)' },
    { v: '/normale_secties_niveau2', label: 'Einde loop' },
    { v: '#normale_secties_niveau3', label: 'Begin loop — alleen subsubgroepen (niveau 3)' },
    { v: '/normale_secties_niveau3', label: 'Einde loop' },
  ]},
  { groep: 'Loop: regels (binnen normale_secties)', items: [
    { v: '#regels',                  label: 'Begin loop — regels binnen een groep' },
    { v: '/regels',                  label: 'Einde loop' },
    { v: 'omschrijving',             label: 'Omschrijving van de regel' },
    { v: 'omschrijving_volledig',    label: 'Omschrijving + werkomschrijving (1 regel eronder, alleen indien gevuld)' },
    { v: 'hoeveelheid',              label: 'Hoeveelheid (bv. 10,500)' },
    { v: 'eenheid',                  label: 'Eenheid (bv. m², uur, stuk)' },
    { v: 'eenheidsprijs',            label: 'Prijs per eenheid (bv. € 12,50)' },
    { v: 'totaal',                   label: 'Totaalbedrag regel (bv. € 131,25)' },
    { v: 'totaal_raw',               label: 'Totaal als getal' },
    { v: 'werkomschrijving',          label: 'Uitgebreide werkomschrijving' },
    { v: 'btw_pct',                  label: 'BTW percentage (bv. 21)' },
    { v: 'is_stelpost',              label: 'Boolean: is dit een stelpost' },
    { v: 'opmerking',                label: 'Opmerking bij de regel' },
  ]},
  { groep: 'Loop: stelpost_regels', items: [
    { v: '#stelpost_regels',         label: 'Begin loop — alle stelpost-regels (platte lijst)' },
    { v: '/stelpost_regels',         label: 'Einde loop' },
    { v: 'omschrijving',             label: 'Omschrijving van de stelpost' },
    { v: 'sectie_naam',              label: 'Naam van de groep waartoe hij behoort' },
    { v: 'totaal',                   label: 'Stelpost bedrag (bv. € 5.000,00)' },
    { v: 'totaal_raw',               label: 'Stelpost bedrag als getal' },
  ]},
  { groep: 'Loop: optie_secties', items: [
    { v: '#optie_secties',           label: 'Begin loop — alleen optie-groepen' },
    { v: '/optie_secties',           label: 'Einde loop' },
    { v: 'display_naam',             label: 'Naam (zelfde velden als normale_secties)' },
    { v: 'subtotaal',                label: 'Subtotaal optie' },
  ]},
  { groep: 'Loop: regels (schilderbehandeling)', items: [
    { v: 'schilderbehandeling',      label: 'Schilderbehandeling van de regel (binnen regels-loop)' },
    { v: 'heeft_schilderbehandeling', label: 'Boolean: heeft deze regel een schilderbehandeling' },
  ]},
  { groep: 'Loop: behandelingen_overzicht', items: [
    { v: '#behandelingen_overzicht', label: 'Begin loop — unieke schilderbehandelingen (behandelingsblad)' },
    { v: '/behandelingen_overzicht', label: 'Einde loop' },
    { v: '.',                        label: 'De behandelingsomschrijving (binnen loop)' },
  ]},
  { groep: 'Conditionele blokken', items: [
    { v: '#heeft_stelposten',        label: 'Als er stelposten zijn' },
    { v: '/heeft_stelposten',        label: 'Einde conditioneel blok' },
    { v: '#heeft_opties',            label: 'Als er opties zijn' },
    { v: '/heeft_opties',            label: 'Einde conditioneel blok' },
    { v: '#heeft_terms',             label: 'Als er voorwaarden/opmerkingen zijn' },
    { v: '/heeft_terms',             label: 'Einde conditioneel blok' },
    { v: '#heeft_behandelingen',     label: 'Als er schilderbehandelingen zijn' },
    { v: '/heeft_behandelingen',     label: 'Einde conditioneel blok' },
    { v: '^heeft_opties',            label: 'Als er GEEN opties zijn (inverse)' },
    { v: '/heeft_opties',            label: 'Einde inverse blok' },
  ]},
]

function WordTemplatePaneel({
  layoutId,
  docxTemplateUrl,
  bron,
  webUrl,
  onUrlChange,
  onGraphLink,
  onClearGraph,
}: {
  layoutId: string
  docxTemplateUrl: string
  bron: string
  webUrl: string
  onUrlChange: (url: string) => void
  onGraphLink: (r: { drive_id: string; item_id: string; web_url: string | null; naam: string | null }) => void
  onClearGraph: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [copiedVar, setCopiedVar] = useState<string | null>(null)
  const [openGroep, setOpenGroep] = useState<string | null>('Offerte')
  const [shareLink, setShareLink] = useState('')
  const [linking, setLinking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isGraph = bron === 'sharepoint' || bron === 'onedrive'

  async function koppelGraph() {
    if (!shareLink.trim()) { toast.error('Plak eerst een SharePoint/OneDrive-link'); return }
    setLinking(true)
    try {
      const res = await fetch('/everts-calc/api/docx-templates/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareLink: shareLink.trim() }),
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
    if (!file.name.endsWith('.docx')) {
      toast.error('Alleen .docx bestanden zijn toegestaan')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('layoutId', layoutId)
      const res = await fetch('/everts-calc/api/docx-templates/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onUrlChange(json.url)
      toast.success('Template geüpload — klik op Opslaan om op te slaan')
    } catch (err) {
      toast.error('Upload mislukt: ' + String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function kopieer(v: string) {
    const tag = v.startsWith('/') || v.startsWith('#') || v.startsWith('^')
      ? `{${v}}`
      : `{${v}}`
    navigator.clipboard.writeText(tag).then(() => {
      setCopiedVar(v)
      setTimeout(() => setCopiedVar(null), 1500)
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Upload sectie */}
      <div className="p-3 border-b border-slate-200 space-y-2 flex-shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <FileText className="w-3 h-3" /> Word template
        </h3>

        {/* SharePoint / OneDrive koppeling — bewerken in Word Online */}
        {isGraph ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <span className="text-xs text-blue-800 flex-1 truncate font-medium">Gekoppeld aan SharePoint/OneDrive</span>
            </div>
            <div className="flex gap-1.5">
              {webUrl && (
                <a href={webUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                  <Pencil className="w-3 h-3" /> Bewerken in Word Online
                </a>
              )}
              <button onClick={() => { onClearGraph(); toast.success('Koppeling verwijderd') }}
                className="p-1 border border-red-200 rounded text-red-500 hover:bg-red-50 transition-colors" title="Ontkoppelen">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              type="url" value={shareLink} onChange={e => setShareLink(e.target.value)}
              placeholder="Plak SharePoint/OneDrive-link naar .docx"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-everts/30"
            />
            <button onClick={koppelGraph} disabled={linking}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
              {linking ? '⟳ Koppelen...' : <><FileText className="w-3.5 h-3.5" /> Koppel & bewerk in Word Online</>}
            </button>
          </div>
        )}

        {!isGraph && <div className="text-[10px] text-slate-400 text-center py-0.5">— of upload een .docx —</div>}

        {!isGraph && (docxTemplateUrl ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              <span className="text-xs text-green-800 flex-1 truncate font-medium">Template ingesteld</span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
                <Upload className="w-3 h-3" /> Vervangen
              </button>
              <a href={docxTemplateUrl} download
                className="flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                <FileText className="w-3 h-3" /> Download
              </a>
              <button onClick={() => { onUrlChange(''); toast.success('Template verwijderd') }}
                className="p-1 border border-red-200 rounded text-red-500 hover:bg-red-50 transition-colors" title="Verwijderen">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-everts hover:text-everts transition-colors disabled:opacity-60">
            {uploading ? '⟳ Uploaden...' : <><Upload className="w-3.5 h-3.5" /> .docx template uploaden</>}
          </button>
        ))}
        <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={uploadTemplate} />
      </div>

      {/* Syntax uitleg */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-amber-50 flex-shrink-0">
        <p className="text-xs font-semibold text-amber-800 mb-1.5">Template syntax in Word</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{variabele}'}</code>
            <span className="text-amber-700">Vervang door waarde (midden in tekst)</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{#lijst}'} … {'{/lijst}'}</code>
            <span className="text-amber-700">Loop — herhaal voor elk item. Tags op <strong>eigen alinea</strong>!</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{#boolean}'} … {'{/boolean}'}</code>
            <span className="text-amber-700">Conditioneel — toon alleen als waar</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-900 whitespace-nowrap flex-shrink-0">{'{^boolean}'} … {'{/boolean}'}</code>
            <span className="text-amber-700">Negatief — toon alleen als leeg/onwaar</span>
          </div>
          <div className="mt-2 p-2 bg-white border border-amber-200 rounded text-amber-800 leading-relaxed">
            <strong>Tabelrij herhalen:</strong> Zet {'{#regels}'} in de eerste cel van een rij en {'{/regels}'} in de laatste cel — de hele rij herhaalt zich per regel.
          </div>
        </div>
      </div>

      {/* Variabelenlijst */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          <p className="text-xs text-slate-400 px-1 pb-1">Klik op een variabele om te kopiëren.</p>
          {WORD_VARIABELEN.map(({ groep, items }) => (
            <div key={groep} className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenGroep(v => v === groep ? null : groep)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span>{groep}</span>
                {openGroep === groep ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {openGroep === groep && (
                <div className="divide-y divide-slate-100">
                  {items.map(({ v, label }) => (
                    <button
                      key={v + label}
                      onClick={() => kopieer(v)}
                      className="w-full px-3 py-2 hover:bg-everts/5 transition-colors group text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className={`text-xs px-1.5 py-0.5 rounded  min-w-0 break-all ${
                          v.startsWith('#') ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          v.startsWith('/') ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                          v.startsWith('^') ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {`{${v}}`}
                        </code>
                        <div className="flex-shrink-0">
                          {copiedVar === v
                            ? <Check className="w-3 h-3 text-green-500" />
                            : <Copy className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          }
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 group-hover:text-slate-700 mt-0.5 leading-snug">{label}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
