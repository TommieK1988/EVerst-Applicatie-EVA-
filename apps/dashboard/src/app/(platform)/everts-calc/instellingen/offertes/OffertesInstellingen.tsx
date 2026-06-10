'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Star, Save, Building2, FileText, Upload, X, Layout, ExternalLink, Pencil, CreditCard, Layers, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  maakLayout, verwijderLayout, setStandaardLayout, kopieerLayout,
} from '@/app/(platform)/everts-calc/actions/quote-instellingen'
import {
  maakBetalingsconditie, updateBetalingsconditie, verwijderBetalingsconditie, setStandaardBetalingsconditie,
  type Betalingsconditie,
} from '@/app/(platform)/everts-calc/actions/betalingscondities'
import {
  maakAlgemeneVoorwaarden, verwijderAlgemeneVoorwaarden, setStandaardAlgemeneVoorwaarden,
  type AlgemeneVoorwaarden,
} from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'
import {
  maakSjabloontekst, updateSjabloontekst as updateSjabloontekstAction, verwijderSjabloontekst,
  type Sjabloontekst,
} from '@/app/(platform)/everts-calc/actions/sjabloonteksten'
import { createClient } from '@/lib/everts-calc/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'

// ─── Bedrijfsgegevens (localStorage) ─────────────────────────────────────────

const BEDRIJF_KEY = 'evc_offerte_bedrijf'
const BRIEFPAPIER_KEY = 'evc_offerte_briefpapier'
const BIJLAGEN_KEY = 'evc_offerte_bijlagen'

interface Bijlage { naam: string; data: string /* base64 data URL */ }

interface Bedrijf {
  naam: string
  adres: string
  postcode_plaats: string
  telefoon: string
  email: string
  website: string
  kvk: string
  btw: string
  iban: string
  logo_url: string
}

const BEDRIJF_LEEG: Bedrijf = {
  naam: '', adres: '', postcode_plaats: '', telefoon: '',
  email: '', website: '', kvk: '', btw: '', iban: '', logo_url: '',
}

function laadBedrijf(): Bedrijf {
  if (typeof window === 'undefined') return BEDRIJF_LEEG
  try {
    const raw = localStorage.getItem(BEDRIJF_KEY)
    return raw ? { ...BEDRIJF_LEEG, ...JSON.parse(raw) } : BEDRIJF_LEEG
  } catch { return BEDRIJF_LEEG }
}

// ─── Layout type ─────────────────────────────────────────────────────────────

interface LayoutItem {
  id: string
  naam: string
  beschrijving?: string | null
  primaire_kleur: string
  papier_formaat?: string | null
  papier_orientatie?: string | null
  is_standaard: boolean
  html_template?: string | null
  created_at: string
}

// ─── Template type ────────────────────────────────────────────────────────────

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function OffertesInstellingen({
  layouts: initLayouts,
  betalingscondities: initBetalingscondities,
  algVoorwaarden: initAlgVoorwaarden,
  sjabloonteksten: initSjabloonteksten,
}: {
  layouts: LayoutItem[]
  betalingscondities: Betalingsconditie[]
  algVoorwaarden: AlgemeneVoorwaarden[]
  sjabloonteksten: Sjabloontekst[]
}) {
  const [tab, setTab] = useState<'layouts' | 'betalingscondities' | 'voorwaarden' | 'bijlagen'>('layouts')

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/everts-calc/instellingen" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Offerte instellingen</h1>
          <p className="text-sm text-slate-500">Word layouts, betalingscondities en briefpapier</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 gap-0">
        {([
          { key: 'layouts',           label: 'Layouts',           icon: Layout },
          { key: 'betalingscondities',label: 'Betalingscondities',icon: CreditCard },
          { key: 'voorwaarden',       label: 'Alg. voorwaarden',  icon: FileText },
          { key: 'bijlagen',          label: 'Briefpapier',       icon: Upload },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? 'border-everts text-everts'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'layouts'            && <LayoutsTab layouts={initLayouts} />}
      {tab === 'betalingscondities' && <BetalingsconditiesTab betalingscondities={initBetalingscondities} />}
      {tab === 'voorwaarden'        && <AlgemeneVoorwaardenTab algVoorwaarden={initAlgVoorwaarden} />}
      {tab === 'bijlagen'           && <BijlagenTab />}
    </div>
  )
}

// ─── Bedrijfsgegevens tab ─────────────────────────────────────────────────────

function BedrijfTab() {
  const [form, setForm] = useState<Bedrijf>(laadBedrijf)

  function sla() {
    localStorage.setItem(BEDRIJF_KEY, JSON.stringify(form))
    toast.success('Bedrijfsgegevens opgeslagen')
  }

  function veld(key: keyof Bedrijf, label: string, placeholder?: string, type = 'text') {
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Bedrijfsinformatie
          </h3>
          <p className="text-xs text-slate-400">
            Deze gegevens verschijnen in het briefhoofd van de offerte.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {veld('naam', 'Bedrijfsnaam *', 'Everts Groep B.V.')}
            {veld('kvk', 'KvK nummer', '12345678')}
            {veld('adres', 'Adres', 'Voorbeeldstraat 1')}
            {veld('btw', 'BTW nummer', 'NL123456789B01')}
            {veld('postcode_plaats', 'Postcode + Plaats', '1234 AB Amstelveen')}
            {veld('iban', 'IBAN', 'NL00 BANK 0000 0000 00')}
            {veld('telefoon', 'Telefoon', '020-1234567', 'tel')}
            {veld('email', 'E-mailadres', 'info@uw-bedrijf.nl', 'email')}
            {veld('website', 'Website', 'www.uw-bedrijf.nl')}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Logo URL</label>
            <input
              type="url"
              value={form.logo_url}
              onChange={(e) => setForm(f => ({ ...f, logo_url: e.target.value }))}
              placeholder="https://... (PNG of SVG aanbevolen)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
            />
            {form.logo_url && (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg inline-block">
                <img src={form.logo_url} alt="Logo preview" className="max-h-12 max-w-40 object-contain" />
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <Button onClick={sla} size="lg">
        <Save className="w-4 h-4" />
        Opslaan
      </Button>
    </div>
  )
}

// ─── Briefpapier & Bijlagen tab ───────────────────────────────────────────────

function BijlagenTab() {
  const [briefpapier, setBriefpapier] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(BRIEFPAPIER_KEY) ?? ''
  })
  const [bijlagen, setBijlagen] = useState<Bijlage[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(BIJLAGEN_KEY) ?? '[]') } catch { return [] }
  })
  const briefRef = useRef<HTMLInputElement>(null)
  const bijlageRef = useRef<HTMLInputElement>(null)

  function laadBriefpapier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result as string
      setBriefpapier(data)
      localStorage.setItem(BRIEFPAPIER_KEY, data)
      toast.success('Briefpapier opgeslagen')
    }
    reader.readAsDataURL(file)
  }

  function verwijderBriefpapier() {
    setBriefpapier('')
    localStorage.removeItem(BRIEFPAPIER_KEY)
    toast.success('Briefpapier verwijderd')
  }

  function laadBijlage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const nieuw: Bijlage = { naam: file.name, data: reader.result as string }
      const lijst = [...bijlagen, nieuw]
      setBijlagen(lijst)
      localStorage.setItem(BIJLAGEN_KEY, JSON.stringify(lijst))
      toast.success(`${file.name} toegevoegd`)
    }
    reader.readAsDataURL(file)
    if (bijlageRef.current) bijlageRef.current.value = ''
  }

  function verwijderBijlage(index: number) {
    const lijst = bijlagen.filter((_, i) => i !== index)
    setBijlagen(lijst)
    localStorage.setItem(BIJLAGEN_KEY, JSON.stringify(lijst))
  }

  return (
    <div className="space-y-6">
      {/* Briefpapier */}
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Upload className="w-4 h-4 text-slate-400" />
              Briefpapier achtergrond
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Upload een PDF die als achtergrond op elke pagina van de offerte wordt geplaatst (zonder marges).
            </p>
          </div>

          {briefpapier ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700">Briefpapier PDF geladen</span>
              </div>
              <Button variant="outline" size="sm" onClick={verwijderBriefpapier}>
                <X className="w-3.5 h-3.5" />
                Verwijderen
              </Button>
            </div>
          ) : (
            <button
              onClick={() => briefRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-everts hover:text-everts transition-colors"
            >
              <Upload className="w-4 h-4" />
              PDF uploaden
            </button>
          )}
          <input ref={briefRef} type="file" accept="application/pdf" className="hidden" onChange={laadBriefpapier} />
        </CardBody>
      </Card>

      {/* Algemene voorwaarden bijlagen */}
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Algemene voorwaarden bijlagen
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Upload PDF-bestanden die als bijlage worden toegevoegd aan de gedownloade offerte.
            </p>
          </div>

          <div className="space-y-2">
            {bijlagen.map((b, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700 flex-1 truncate">{b.naam}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => verwijderBijlage(i)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <button
            onClick={() => bijlageRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-everts hover:text-everts transition-colors"
          >
            <Upload className="w-4 h-4" />
            PDF bijlage toevoegen
          </button>
          <input ref={bijlageRef} type="file" accept=".pdf" className="hidden" onChange={laadBijlage} />
        </CardBody>
      </Card>
    </div>
  )
}

// ─── Layouts tab ─────────────────────────────────────────────────────────────

function LayoutsTab({ layouts: init }: { layouts: LayoutItem[] }) {
  const [layouts, setLayouts] = useState(init)
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [showNieuw, setShowNieuw] = useState(false)
  const [, startTransition] = useTransition()

  function handleMaakAan() {
    if (!nieuwNaam.trim()) return
    startTransition(async () => {
      try {
        const id = await maakLayout({ naam: nieuwNaam.trim() })
        toast.success('Layout aangemaakt')
        setShowNieuw(false)
        setNieuwNaam('')
        // Redirect naar editor
        window.location.href = `/instellingen/offertes/layouts/${id}`
      } catch { toast.error('Fout bij aanmaken') }
    })
  }

  function handleKopieer(id: string) {
    startTransition(async () => {
      try {
        const nieuwId = await kopieerLayout(id)
        toast.success('Layout gekopieerd')
        window.location.href = `/instellingen/offertes/layouts/${nieuwId}`
      } catch { toast.error('Fout bij kopiëren') }
    })
  }

  function handleVerwijder(id: string, naam: string) {
    if (!confirm(`Layout "${naam}" verwijderen?`)) return
    startTransition(async () => {
      try {
        await verwijderLayout(id)
        setLayouts(l => l.filter(x => x.id !== id))
        toast.success('Layout verwijderd')
      } catch { toast.error('Fout bij verwijderen') }
    })
  }

  function handleSetStandaard(id: string) {
    startTransition(async () => {
      try {
        await setStandaardLayout(id)
        setLayouts(l => l.map(x => ({ ...x, is_standaard: x.id === id })))
        toast.success('Standaard layout ingesteld')
      } catch { toast.error('Fout') }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600 font-medium">Offerte-layouts</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Een layout bepaalt het uiterlijk van de offerte: kleuren, lettertype, marges en de HTML-template met variabelen.
            Elke offerte kan een andere layout gebruiken.
          </p>
        </div>
        <Button onClick={() => setShowNieuw(true)} size="md" className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Nieuwe layout
        </Button>
      </div>

      {showNieuw && (
        <div className="bg-everts/5 border border-everts/20 rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={nieuwNaam}
            onChange={e => setNieuwNaam(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleMaakAan()}
            autoFocus
            placeholder="Naam van de layout (bijv. 'Standaard blauw')"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
          />
          <div className="flex gap-2">
            <Button onClick={handleMaakAan} size="sm">
              Aanmaken & bewerken
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(false); setNieuwNaam('') }}>
              Annuleren
            </Button>
          </div>
        </div>
      )}

      {layouts.length === 0 ? (
        <Card>
          <EmptyState
            tone="neutral"
            icon={<Layout className="w-6 h-6" />}
            title="Nog geen layouts"
            description="Maak een layout aan en pas het HTML-template aan met je eigen huisstijl."
            actions={
              <Button onClick={() => setShowNieuw(true)}>
                <Plus className="w-4 h-4" />
                Eerste layout aanmaken
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {layouts.map(l => (
            <Card key={l.id}>
              <CardBody className="flex items-center gap-4 py-3">
                {/* Kleurblok */}
                <div
                  className="w-10 h-10 rounded-lg flex-shrink-0 border border-black/10"
                  style={{ background: l.primaire_kleur }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 truncate">{l.naam}</span>
                    {l.is_standaard && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium flex-shrink-0">
                        <Star className="w-3 h-3" /> Standaard
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>{l.papier_formaat ?? 'A4'} {l.papier_orientatie === 'landscape' ? 'liggend' : 'staand'}</span>
                    <span>·</span>
                    <span>{l.html_template ? 'Eigen template' : 'Standaard template'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!l.is_standaard && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleSetStandaard(l.id)}
                      title="Instellen als standaard"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleKopieer(l.id)}
                    title="Kopiëren naar nieuwe layout"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/instellingen/offertes/layouts/${l.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                      Bewerken
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleVerwijder(l.id, l.naam)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Alert tone="info" title="Hoe werkt het?" icon={<ExternalLink className="w-4 h-4" />}>
        <span>
          Elke layout heeft een <strong>HTML-template</strong> met Handlebars-variabelen zoals{' '}
          <code className="bg-info-100 px-1 rounded">{'{{offerte.nummer}}'}</code>,{' '}
          <code className="bg-info-100 px-1 rounded">{'{{klant.naam}}'}</code> en{' '}
          <code className="bg-info-100 px-1 rounded">{'{{totalen.totaal}}'}</code>.
          {' '}Klik op &ldquo;Bewerken&rdquo; om de layout volledig aan te passen. Een live preview toont direct het resultaat.
          {' '}Wijs een layout toe aan een offerte via de offerte-editor.
        </span>
      </Alert>
    </div>
  )
}

// ─── Sjabloonteksten tab ──────────────────────────────────────────────────────

function SjabloontekstenTab({ sjabloonteksten: init }: { sjabloonteksten: Sjabloontekst[] }) {
  const [items, setItems] = useState(init)
  const [modal, setModal] = useState<{ open: boolean; item?: Sjabloontekst }>({ open: false })
  const [form, setForm] = useState({ naam: '', inhoud_html: '', categorie: 'algemeen' })
  const [, startTransition] = useTransition()

  function openNieuw() {
    setForm({ naam: '', inhoud_html: '', categorie: 'algemeen' })
    setModal({ open: true })
  }

  function openBewerk(item: Sjabloontekst) {
    setForm({ naam: item.naam, inhoud_html: item.inhoud_html, categorie: item.categorie })
    setModal({ open: true, item })
  }

  function slaOp() {
    if (!form.naam.trim()) { toast.error('Geef een naam op'); return }
    startTransition(async () => {
      try {
        if (modal.item) {
          await updateSjabloontekstAction(modal.item.id, form)
          setItems(prev => prev.map(x => x.id === modal.item!.id ? { ...x, ...form } : x))
          toast.success('Bijgewerkt')
        } else {
          const id = await maakSjabloontekst(form)
          setItems(prev => [...prev, { id, ...form, volgorde: 0, created_at: '', updated_at: '' }])
          toast.success('Aangemaakt')
        }
        setModal({ open: false })
      } catch (e) { toast.error(String(e)) }
    })
  }

  function verwijder(id: string, naam: string) {
    if (!confirm(`"${naam}" verwijderen?`)) return
    startTransition(async () => {
      try {
        await verwijderSjabloontekst(id)
        setItems(prev => prev.filter(x => x.id !== id))
        toast.success('Verwijderd')
      } catch (e) { toast.error(String(e)) }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600 font-medium">Sjabloonteksten</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Herbruikbare HTML-blokken die je in de visuele layout-editor kunt invoegen. Gebruik <code className="bg-slate-100 px-1 rounded">{'{{variabele}}'}</code> voor dynamische gegevens.
          </p>
        </div>
        <Button onClick={openNieuw} size="md" className="flex-shrink-0">
          <Plus className="w-4 h-4" /> Nieuw
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            tone="neutral"
            icon={<Layers className="w-6 h-6" />}
            title="Nog geen sjabloonteksten"
            description="Maak herbruikbare blokken aan (adresblok, handtekening, etc.) die je in de layout-editor kunt invoegen."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(st => (
            <Card key={st.id}>
              <CardBody className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{st.naam}</div>
                    {st.categorie && st.categorie !== 'algemeen' && (
                      <div className="text-xs text-slate-400 mt-0.5">{st.categorie}</div>
                    )}
                    <pre className="mt-2 text-xs text-slate-500 bg-slate-50 rounded p-2 overflow-x-auto max-h-20 font-mono whitespace-pre-wrap">
                      {st.inhoud_html.substring(0, 200)}{st.inhoud_html.length > 200 ? '...' : ''}
                    </pre>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => openBewerk(st)} title="Bewerken">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => verwijder(st.id, st.naam)} title="Verwijderen">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modal.open} onOpenChange={(open) => !open && setModal({ open: false })}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {modal.item ? 'Sjabloontekst bewerken' : 'Nieuwe sjabloontekst'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Naam *</label>
              <input type="text" value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} autoFocus placeholder="bv. Adresblok, Handtekening..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Categorie</label>
              <input type="text" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))} placeholder="bv. koptekst, adres, tabel..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Inhoud (HTML)</label>
              <textarea value={form.inhoud_html} onChange={e => setForm(f => ({ ...f, inhoud_html: e.target.value }))} rows={8} placeholder={'<table><tr><td>{{klant.naam}}</td></tr></table>'} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-everts/30 resize-y" />
              <p className="text-xs text-slate-400 mt-1">Gebruik <code className="bg-slate-100 px-1 rounded">{'{{variabele}}'}</code> voor dynamische gegevens.</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false })}>Annuleren</Button>
            <Button onClick={slaOp}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Betalingscondities tab ───────────────────────────────────────────────────

function BetalingsconditiesTab({ betalingscondities: init }: { betalingscondities: Betalingsconditie[] }) {
  const [items, setItems] = useState(init)
  const [modal, setModal] = useState<{ open: boolean; item?: Betalingsconditie }>({ open: false })
  const [form, setForm] = useState({ naam: '', tekst: '' })
  const [, startTransition] = useTransition()

  function openNieuw() {
    setForm({ naam: '', tekst: '' })
    setModal({ open: true })
  }

  function openBewerk(item: Betalingsconditie) {
    setForm({ naam: item.naam, tekst: item.tekst })
    setModal({ open: true, item })
  }

  function slaOp() {
    if (!form.naam.trim()) { toast.error('Geef een naam op'); return }
    startTransition(async () => {
      try {
        if (modal.item) {
          await updateBetalingsconditie(modal.item.id, form)
          setItems(prev => prev.map(x => x.id === modal.item!.id ? { ...x, ...form } : x))
          toast.success('Bijgewerkt')
        } else {
          const id = await maakBetalingsconditie(form)
          setItems(prev => [...prev, { id, ...form, is_standaard: false, volgorde: 0, created_at: '' }])
          toast.success('Aangemaakt')
        }
        setModal({ open: false })
      } catch (e) { toast.error(String(e)) }
    })
  }

  function verwijder(id: string, naam: string) {
    if (!confirm(`"${naam}" verwijderen?`)) return
    startTransition(async () => {
      try {
        await verwijderBetalingsconditie(id)
        setItems(prev => prev.filter(x => x.id !== id))
        toast.success('Verwijderd')
      } catch (e) { toast.error(String(e)) }
    })
  }

  function setStandaard(id: string) {
    startTransition(async () => {
      try {
        await setStandaardBetalingsconditie(id)
        setItems(prev => prev.map(x => ({ ...x, is_standaard: x.id === id })))
        toast.success('Standaard ingesteld')
      } catch (e) { toast.error(String(e)) }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600 font-medium">Betalingscondities</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Kies per offerte welke betalingsconditie van toepassing is. De geselecteerde tekst verschijnt via <code className="bg-slate-100 px-1 rounded">{'{{offerte.betalingscondities}}'}</code> in de lay-out.
          </p>
        </div>
        <Button onClick={openNieuw} size="md" className="flex-shrink-0">
          <Plus className="w-4 h-4" /> Nieuw
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            tone="neutral"
            icon={<CreditCard className="w-6 h-6" />}
            title="Nog geen betalingscondities"
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(bc => (
            <Card key={bc.id}>
              <CardBody className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 text-sm">{bc.naam}</span>
                      {bc.is_standaard && (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium flex items-center gap-1">
                          <Star className="w-3 h-3" /> Standaard
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{bc.tekst}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {!bc.is_standaard && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setStandaard(bc.id)} title="Als standaard instellen">
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => openBewerk(bc)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => verwijder(bc.id, bc.naam)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modal.open} onOpenChange={(open) => !open && setModal({ open: false })}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {modal.item ? 'Betalingsconditie bewerken' : 'Nieuwe betalingsconditie'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Naam *</label>
              <input type="text" value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} autoFocus placeholder="bv. 30 dagen netto" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tekst</label>
              <textarea value={form.tekst} onChange={e => setForm(f => ({ ...f, tekst: e.target.value }))} rows={4} placeholder="Betaling dient te geschieden binnen 30 dagen na factuurdatum." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 resize-y" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false })}>Annuleren</Button>
            <Button onClick={slaOp}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Algemene voorwaarden tab ─────────────────────────────────────────────────

function AlgemeneVoorwaardenTab({ algVoorwaarden: init }: { algVoorwaarden: AlgemeneVoorwaarden[] }) {
  const [items, setItems] = useState(init)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ naam: '', versie: '', bestand: null as File | null })
  const [uploading, setUploading] = useState(false)
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  async function slaOp() {
    if (!form.naam.trim()) { toast.error('Geef een naam op'); return }
    if (!form.bestand) { toast.error('Selecteer een PDF-bestand'); return }
    setUploading(true)
    try {
      const supabase = createClient()
      const bestandsNaam = `${Date.now()}-${form.bestand.name.replace(/[^a-z0-9._-]/gi, '_')}`
      const { data: upload, error: uploadErr } = await (supabase as unknown as ReturnType<typeof createClient>)
        .storage.from('algemene-voorwaarden')
        .upload(bestandsNaam, form.bestand, { contentType: 'application/pdf', upsert: false })

      if (uploadErr) throw new Error('Upload mislukt: ' + uploadErr.message)

      const { data: { publicUrl } } = (supabase as unknown as ReturnType<typeof createClient>)
        .storage.from('algemene-voorwaarden')
        .getPublicUrl(upload.path)

      const id = await maakAlgemeneVoorwaarden({
        naam: form.naam,
        bestand_url: publicUrl,
        versie: form.versie || undefined,
      })

      setItems(prev => [...prev, {
        id, naam: form.naam, bestand_url: publicUrl,
        versie: form.versie || null, is_standaard: false, created_at: '',
      }])
      toast.success('Algemene voorwaarden toegevoegd')
      setModal(false)
      setForm({ naam: '', versie: '', bestand: null })
    } catch (e) {
      toast.error(String(e))
    } finally {
      setUploading(false)
    }
  }

  function verwijder(id: string, naam: string) {
    if (!confirm(`"${naam}" verwijderen?`)) return
    startTransition(async () => {
      try {
        await verwijderAlgemeneVoorwaarden(id)
        setItems(prev => prev.filter(x => x.id !== id))
        toast.success('Verwijderd')
      } catch (e) { toast.error(String(e)) }
    })
  }

  function setStandaard(id: string) {
    startTransition(async () => {
      try {
        await setStandaardAlgemeneVoorwaarden(id)
        setItems(prev => prev.map(x => ({ ...x, is_standaard: x.id === id })))
        toast.success('Standaard ingesteld')
      } catch (e) { toast.error(String(e)) }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600 font-medium">Algemene voorwaarden</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload PDF-bestanden met algemene voorwaarden. Per offerte kun je kiezen welke van toepassing is — het PDF wordt automatisch als bijlage bijgevoegd.
          </p>
        </div>
        <Button onClick={() => setModal(true)} size="md" className="flex-shrink-0">
          <Upload className="w-4 h-4" /> PDF uploaden
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            tone="neutral"
            icon={<FileText className="w-6 h-6" />}
            title="Nog geen algemene voorwaarden"
            description="Upload een PDF om deze te koppelen aan offertes."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(av => (
            <Card key={av.id}>
              <CardBody className="flex items-center gap-4 py-3">
                <FileText className="w-8 h-8 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm truncate">{av.naam}</span>
                    {av.versie && <span className="text-xs text-slate-400">v{av.versie}</span>}
                    {av.is_standaard && (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium flex items-center gap-1 flex-shrink-0">
                        <Star className="w-3 h-3" /> Standaard
                      </span>
                    )}
                  </div>
                  <a href={av.bestand_url} target="_blank" rel="noopener noreferrer" className="text-xs text-everts hover:underline mt-0.5 inline-block">
                    PDF bekijken →
                  </a>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {!av.is_standaard && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setStandaard(av.id)} title="Als standaard instellen">
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => verwijder(av.id, av.naam)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={(open) => { if (!open && !uploading) { setModal(false); setForm({ naam: '', versie: '', bestand: null }) } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Algemene voorwaarden uploaden</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Naam *</label>
              <input type="text" value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} autoFocus placeholder="bv. Algemene Voorwaarden 2024" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Versie (optioneel)</label>
              <input type="text" value={form.versie} onChange={e => setForm(f => ({ ...f, versie: e.target.value }))} placeholder="bv. 2024, 3.1" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">PDF-bestand *</label>
              <div
                className="flex items-center gap-3 px-3 py-2.5 border border-slate-300 rounded-lg cursor-pointer hover:border-everts transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500">{form.bestand ? form.bestand.name : 'Klik om PDF te selecteren'}</span>
              </div>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => setForm(f => ({ ...f, bestand: e.target.files?.[0] ?? null }))} />
            </div>
            <Alert tone="warning">
              <strong>Let op:</strong> Zorg dat de Supabase storage bucket <code className="bg-warning-100 px-1 rounded">algemene-voorwaarden</code> bestaat en publiek toegankelijk is. Zie de SQL-migratie v5.
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModal(false); setForm({ naam: '', versie: '', bestand: null }) }} disabled={uploading}>Annuleren</Button>
            <Button onClick={slaOp} loading={uploading}>
              Uploaden & opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
