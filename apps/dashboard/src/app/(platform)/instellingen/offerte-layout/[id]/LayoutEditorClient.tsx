'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

// Dynamisch importeren zodat docx-preview alleen in de browser laadt (geen SSR)
const DocxViewer = dynamic(() => import('@/components/everts-calc/DocxViewer'), { ssr: false })
import {
  ArrowLeft, Save, Eye, RefreshCw, Copy, Check,
  ChevronDown, ChevronRight,
  Plus, Trash2, Pencil,
  FileText, Upload, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { updateLayout } from '@/app/(platform)/instellingen/offerte-layout/actions'
import { maakSjabloontekst, updateSjabloontekst, verwijderSjabloontekst } from '@/app/(platform)/everts-calc/actions/sjabloonteksten'
import type { Sjabloontekst } from '@/app/(platform)/everts-calc/actions/sjabloonteksten'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Layout {
  id: string
  naam: string
  beschrijving?: string | null
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
  briefpapier_pdf_url?: string | null
}

interface Props {
  layout: Layout
  voorbeeldQuoteId: string | null
  sjabloonteksten: Sjabloontekst[]
}

// ─── Word template variabelen ─────────────────────────────────────────────────

const WORD_VARIABELEN: { groep: string; items: { v: string; label: string }[] }[] = [
  { groep: 'Afbeeldingen', items: [
    { v: '%logo',                    label: 'Bedrijfslogo — kleur, uit de bedrijfsgegevens (tag met %)' },
    { v: '%logo_wit',                label: 'Bedrijfslogo — wit/negatief, voor donkere achtergrond (tag met %)' },
    { v: '%handtekening',            label: 'Handtekening (afbeelding — tag begint met %)' },
  ]},
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
    { v: 'offerte.betalingscondities', label: 'Betalingscondities — tekstblok' },
    { v: 'offerte.betalingscondities_naam', label: 'Betalingscondities — naam/titel' },
    { v: 'offerte.status',           label: 'Status (bv. concept, verzonden)' },
    { v: 'offerte.type',             label: 'Type (verkoopofferte / interne_calculatie)' },
    { v: 'offerte.is_intern',        label: 'Boolean: is dit een interne calculatie' },
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
    { v: 'klant.aanhef',             label: 'Aanhef (= offerte-aanhef)' },
    { v: 'klant.kvk',                label: 'KvK-nummer van de klant' },
    { v: 'klant.btw',                label: 'BTW-nummer van de klant' },
  ]},
  { groep: 'Jouw bedrijf / werkmaatschappij', items: [
    { v: 'bedrijf.naam',             label: 'Naam werkmaatschappij (of organisatie)' },
    { v: 'bedrijf.code',             label: 'Code werkmaatschappij (bv. 001)' },
    { v: 'bedrijf.adres',            label: 'Adres (straat + huisnummer)' },
    { v: 'bedrijf.postcode_plaats',  label: 'Postcode + Plaats' },
    { v: 'bedrijf.land',             label: 'Land' },
    { v: 'bedrijf.telefoon',         label: 'Telefoonnummer' },
    { v: 'bedrijf.email',            label: 'E-mailadres' },
    { v: 'bedrijf.website',          label: 'Website' },
    { v: 'bedrijf.kvk',              label: 'KvK nummer' },
    { v: 'bedrijf.btw',              label: 'BTW nummer' },
    { v: 'bedrijf.iban',             label: 'IBAN rekeningnummer' },
    { v: 'bedrijf.is_werkmaatschappij', label: 'Boolean: is een werkmaatschappij (niet de hoofdorganisatie)' },
  ]},
  { groep: 'Werk / Dossier', items: [
    { v: 'dossier.heeft',            label: 'Boolean: is er een gekoppeld dossier' },
    { v: 'dossier.dossiernummer',    label: 'Dossiernummer' },
    { v: 'dossier.titel',            label: 'Projecttitel' },
    { v: 'dossier.referentie',       label: 'Referentie' },
    { v: 'dossier.opdracht_referentie', label: 'Opdracht-referentie' },
    { v: 'dossier.werkadres',        label: 'Werkadres (volledig: straat, postcode plaats)' },
    { v: 'dossier.werkadres_naam',   label: 'Werkadres — naam/omschrijving' },
    { v: 'dossier.werkadres_straat', label: 'Werkadres — straat' },
    { v: 'dossier.werkadres_postcode', label: 'Werkadres — postcode' },
    { v: 'dossier.werkadres_plaats', label: 'Werkadres — plaats' },
    { v: 'dossier.werkadres_telefoon', label: 'Werkadres — telefoon' },
    { v: 'dossier.werkadres_email',  label: 'Werkadres — e-mail' },
    { v: 'dossier.calculator',       label: 'Calculator' },
    { v: 'dossier.projectleider',    label: 'Projectleider' },
    { v: 'dossier.teamleider',       label: 'Teamleider' },
    { v: 'dossier.werkvoorbereider', label: 'Werkvoorbereider' },
    { v: 'dossier.uitvoerder',       label: 'Uitvoerder' },
    { v: 'dossier.contactpersoon',   label: 'Contactpersoon' },
    { v: 'dossier.contactpersoon_email', label: 'Contactpersoon — e-mail' },
    { v: 'dossier.contactpersoon_telefoon', label: 'Contactpersoon — telefoon' },
  ]},
  { groep: 'Totalen', items: [
    { v: 'totalen.subtotaal',              label: 'Subtotaal excl. BTW (bv. € 10.000,00)' },
    { v: 'totalen.subtotaal_bedrag',       label: 'Subtotaal met duizendpunt, zonder € (10.000,00)' },
    { v: 'totalen.subtotaal_raw',          label: 'Subtotaal als kaal getal (10000)' },
    { v: 'totalen.btw_pct',                label: 'BTW percentage (bv. 21)' },
    { v: 'totalen.btw_bedrag',             label: 'BTW bedrag (bv. € 2.100,00)' },
    { v: 'totalen.btw_bedrag_getal',       label: 'BTW bedrag met duizendpunt, zonder € (2.100,00)' },
    { v: 'totalen.btw_bedrag_raw',         label: 'BTW bedrag als kaal getal' },
    { v: 'totalen.totaal',                 label: 'Totaal incl. BTW (bv. € 12.100,00)' },
    { v: 'totalen.totaal_bedrag',          label: 'Totaal met duizendpunt, zonder € (12.100,00)' },
    { v: 'totalen.totaal_raw',             label: 'Totaal incl. BTW als kaal getal' },
    { v: 'totalen.stelposten_subtotaal',   label: 'Totaal stelposten (€)' },
    { v: 'totalen.stelposten_subtotaal_bedrag', label: 'Totaal stelposten (10.000,00, zonder €)' },
    { v: 'totalen.stelposten_subtotaal_raw', label: 'Totaal stelposten als kaal getal' },
    { v: 'totalen.stelposten_in_totaal',   label: 'Boolean: stelposten in totaal meegeteld' },
    { v: 'totalen.opties_subtotaal',       label: 'Totaal opties (€, niet inbegrepen)' },
    { v: 'totalen.opties_subtotaal_bedrag', label: 'Totaal opties (10.000,00, zonder €)' },
    { v: 'totalen.opties_subtotaal_raw',   label: 'Totaal opties als kaal getal' },
    { v: 'totalen.heeft_meerdere_btw',     label: 'Boolean: meer dan één BTW-tarief' },
  ]},
  { groep: 'Loop: btw_groepen (per BTW-tarief)', items: [
    { v: '#btw_groepen',             label: 'Begin loop — één rij per BTW-tarief' },
    { v: '/btw_groepen',             label: 'Einde loop' },
    { v: 'pct',                      label: 'Percentage als getal (bv. 21)' },
    { v: 'pct_str',                  label: 'Percentage als tekst (bv. "21%")' },
    { v: 'grondslag',                label: 'Grondslag/bedrag over dit tarief (€)' },
    { v: 'grondslag_bedrag',         label: 'Grondslag (10.000,00, zonder €)' },
    { v: 'grondslag_raw',            label: 'Grondslag als kaal getal' },
    { v: 'btw_bedrag',               label: 'BTW-bedrag over dit tarief (€)' },
    { v: 'btw_bedrag_getal',         label: 'BTW-bedrag (2.100,00, zonder €)' },
    { v: 'btw_bedrag_raw',           label: 'BTW-bedrag als kaal getal' },
  ]},
  { groep: 'Teksten', items: [
    { v: 'voorwaarden',              label: 'Algemene voorwaarden (plain text)' },
    { v: 'uitsluitingen',            label: 'Uitsluitingen (plain text)' },
    { v: 'opmerkingen',              label: 'Opmerkingen (plain text)' },
  ]},
  { groep: 'Loop: normale_secties', items: [
    { v: '#normale_secties',         label: 'Begin loop — alle calculatiegroepen (excl. opties/leeg)' },
    { v: '/normale_secties',         label: 'Einde loop' },
    { v: 'display_naam',             label: 'Genummerde naam (bv. "1.1  Metselwerk")' },
    { v: 'naam',                     label: 'Naam van de groep' },
    { v: 'nummer',                   label: 'Nummer (bv. "1.1")' },
    { v: 'subtotaal',                label: 'Subtotaal van de groep (bv. € 5.000,00)' },
    { v: 'subtotaal_bedrag',         label: 'Subtotaal (5.000,00, zonder €)' },
    { v: 'subtotaal_raw',            label: 'Subtotaal als kaal getal (5000)' },
    { v: 'niveau',                   label: 'Niveau (1, 2 of 3)' },
    { v: 'discipline',               label: 'Discipline / kostensoort' },
    { v: 'toon_detail',              label: 'Boolean: regels zichtbaar voor klant' },
    { v: 'heeft_regels',             label: 'Boolean: heeft deze groep regels' },
    { v: 'aantal_regels',            label: 'Aantal regels in deze groep' },
    { v: 'is_stelpost_sectie',       label: 'Boolean: bevat stelpost-regels' },
    { v: 'is_optioneel',             label: 'Boolean: is dit een optie-groep' },
  ]},
  { groep: 'Loop: regels (binnen een sectie)', items: [
    { v: '#regels',                  label: 'Begin loop — regels binnen een groep' },
    { v: '/regels',                  label: 'Einde loop' },
    { v: 'omschrijving',             label: 'Omschrijving van de regel' },
    { v: 'omschrijving_volledig',    label: 'Omschrijving + werkomschrijving' },
    { v: 'hoeveelheid',              label: 'Hoeveelheid (bv. 10,500)' },
    { v: 'eenheid',                  label: 'Eenheid (bv. m², uur, stuk)' },
    { v: 'eenheidsprijs',            label: 'Prijs per eenheid (bv. € 12,50)' },
    { v: 'eenheidsprijs_bedrag',     label: 'Prijs per eenheid (12,50, zonder €)' },
    { v: 'eenheidsprijs_raw',        label: 'Prijs per eenheid als kaal getal' },
    { v: 'totaal',                   label: 'Totaalbedrag regel (bv. € 131,25)' },
    { v: 'totaal_bedrag',            label: 'Totaalbedrag (131,25, zonder €)' },
    { v: 'totaal_raw',               label: 'Totaal als kaal getal' },
    { v: 'btw_pct',                  label: 'BTW percentage (bv. 21)' },
    { v: 'is_stelpost',              label: 'Boolean: is dit een stelpost' },
    { v: 'opmerking',                label: 'Opmerking bij de regel' },
    { v: 'werkomschrijving',         label: 'Uitgebreide werkomschrijving (= opmerking)' },
    { v: 'heeft_opmerking',          label: 'Boolean: heeft een opmerking' },
    { v: 'schilderbehandeling',      label: 'Schilderbehandeling van de regel' },
    { v: 'heeft_schilderbehandeling',label: 'Boolean: heeft een schilderbehandeling' },
    { v: 'kostprijs',                label: 'Kostprijs p/e (alleen intern; anders "—")' },
    { v: 'uren',                     label: 'Uren p/e (alleen intern; anders "—")' },
    { v: 'marge_pct',                label: 'Marge % (alleen intern; anders "—")' },
  ]},
  { groep: 'Loop: optie_secties', items: [
    { v: '#optie_secties',           label: 'Begin loop — alleen optionele groepen' },
    { v: '/optie_secties',           label: 'Einde loop' },
    { v: 'display_naam',             label: 'Zelfde velden als normale_secties (naam, subtotaal, #regels…)' },
  ]},
  { groep: 'Loop: stelpost_regels (plat)', items: [
    { v: '#stelpost_regels',         label: 'Begin loop — alle stelposten over alle groepen' },
    { v: '/stelpost_regels',         label: 'Einde loop' },
    { v: 'omschrijving',             label: 'Omschrijving van de stelpost' },
    { v: 'sectie_naam',              label: 'Naam van de groep waar de stelpost in zit' },
    { v: 'totaal',                   label: 'Bedrag stelpost (bv. € 750,00)' },
    { v: 'totaal_raw',               label: 'Bedrag als getal' },
  ]},
  { groep: 'Loop: behandelingen_overzicht', items: [
    { v: '#behandelingen_overzicht', label: 'Begin loop — unieke schilderbehandelingen' },
    { v: '.',                        label: 'De behandeling zelf (losse tekstwaarde)' },
    { v: '/behandelingen_overzicht', label: 'Einde loop' },
  ]},
  { groep: 'Loop: per niveau', items: [
    { v: '#normale_secties_niveau1', label: 'Begin loop — alleen niveau-1 groepen' },
    { v: '/normale_secties_niveau1', label: 'Einde loop' },
    { v: '#normale_secties_niveau2', label: 'Begin loop — alleen niveau-2 groepen' },
    { v: '/normale_secties_niveau2', label: 'Einde loop' },
    { v: '#normale_secties_niveau3', label: 'Begin loop — alleen niveau-3 groepen' },
    { v: '/normale_secties_niveau3', label: 'Einde loop' },
  ]},
  { groep: 'Conditionele blokken', items: [
    { v: '#heeft_stelposten',        label: 'Als er stelposten zijn' },
    { v: '/heeft_stelposten',        label: 'Einde conditioneel blok' },
    { v: '#heeft_opties',            label: 'Als er opties zijn' },
    { v: '/heeft_opties',            label: 'Einde conditioneel blok' },
    { v: '^heeft_opties',            label: 'Als er GEEN opties zijn (inverse)' },
    { v: '#heeft_behandelingen',     label: 'Als er schilderbehandelingen zijn' },
    { v: '/heeft_behandelingen',     label: 'Einde conditioneel blok' },
    { v: '#heeft_terms',             label: 'Als er voorwaarden/uitsluitingen/opmerkingen zijn' },
    { v: '/heeft_terms',             label: 'Einde conditioneel blok' },
    { v: '#heeft_betalingscondities', label: 'Als er een betalingsconditie gekozen is' },
    { v: '/heeft_betalingscondities', label: 'Einde conditioneel blok' },
    { v: '#heeft_meerdere_btw',      label: 'Als er meer dan één BTW-tarief is' },
    { v: '/heeft_meerdere_btw',      label: 'Einde conditioneel blok' },
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
    briefpapier_pdf_url: layout.briefpapier_pdf_url ?? '',
  })

  const [previewKey, setPreviewKey] = useState(0)
  const [, startTransition] = useTransition()
  const [sjabloonteksten, setSjabloonteksten] = useState(initSjabloonteksten)
  const [stModal, setStModal] = useState<{ open: boolean; item?: Sjabloontekst }>({ open: false })
  const [stForm, setStForm] = useState({ naam: '', inhoud_html: '', categorie: 'algemeen' })
  const [, startStTransition] = useTransition()

  // Preview: 'word' = snelle client-render (docx-preview, geen briefpapier),
  //          'pdf'  = echte PDF via Graph mét briefpapier-achtergrond.
  const [previewModus, setPreviewModus] = useState<'word' | 'pdf'>('word')
  // Databron: 'demo' = volledig gevulde testgegevens, 'echt' = een echte offerte.
  const [previewBron, setPreviewBron] = useState<'demo' | 'echt'>('demo')

  const bedrijfJson = typeof window !== 'undefined'
    ? (localStorage.getItem('evc_offerte_bedrijf') ?? '{}')
    : '{}'

  const previewQuoteId = previewBron === 'echt' && voorbeeldQuoteId ? voorbeeldQuoteId : 'demo'

  // Word-only: voorbeeld vereist een gekoppelde .docx-template (SharePoint/OneDrive of Supabase)
  const isGraphTemplate = form.docx_template_bron === 'sharepoint' || form.docx_template_bron === 'onedrive'
  const templateParams =
    isGraphTemplate && form.docx_template_drive_id && form.docx_template_item_id
      ? `drive_id=${encodeURIComponent(form.docx_template_drive_id)}&item_id=${encodeURIComponent(form.docx_template_item_id)}`
      : form.docx_template_url
        ? `template_url=${encodeURIComponent(form.docx_template_url)}`
        : ''
  const heeftTemplate = templateParams !== ''

  const wordPreviewUrl = heeftTemplate
    ? `/everts-calc/api/quotes/${previewQuoteId}/docx-preview?${templateParams}&bedrijf=${encodeURIComponent(bedrijfJson)}&_k=${previewKey}`
    : null
  const pdfPreviewUrl = heeftTemplate
    ? `/everts-calc/api/quotes/${previewQuoteId}/pdf-preview?${templateParams}` +
      `&briefpapier_url=${encodeURIComponent(form.briefpapier_pdf_url)}` +
      `&bedrijf=${encodeURIComponent(bedrijfJson)}&_k=${previewKey}`
    : null

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
          briefpapier_pdf_url: form.briefpapier_pdf_url || null,
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
        <Link
          href="/instellingen/offerte-layout"
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

      {/* Hoofdinhoud */}
      <div className="flex flex-1 overflow-hidden">
        {/* Linkerpaneel */}
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

              <BriefpapierPaneel
                layoutId={layout.id}
                briefpapierUrl={form.briefpapier_pdf_url}
                onChange={url => setForm(f => ({ ...f, briefpapier_pdf_url: url }))}
              />
            </div>
          </div>
        </div>

        {/* Rechter preview */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-100">
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Voorbeeld</span>

            {/* Weergavemodus */}
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden ml-1">
              <button
                onClick={() => setPreviewModus('word')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${previewModus === 'word' ? 'bg-everts text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Snelle Word-render (zonder briefpapier)"
              >
                Word (snel)
              </button>
              <button
                onClick={() => setPreviewModus('pdf')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${previewModus === 'pdf' ? 'bg-everts text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Echte PDF via Word-renderer, inclusief briefpapier"
              >
                PDF + briefpapier
              </button>
            </div>

            {/* Databron */}
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setPreviewBron('demo')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${previewBron === 'demo' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Volledig gevulde testgegevens"
              >
                Testgegevens
              </button>
              <button
                onClick={() => voorbeeldQuoteId && setPreviewBron('echt')}
                disabled={!voorbeeldQuoteId}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${previewBron === 'echt' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                title={voorbeeldQuoteId ? 'Een echte offerte' : 'Geen echte offerte beschikbaar'}
              >
                Echte offerte
              </button>
            </div>

            {previewModus === 'pdf' && (
              <span className="text-[11px] text-slate-400">Word-renderer via Microsoft 365 — kan enkele seconden duren.</span>
            )}

            <button onClick={ververs} className="ml-auto p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Verversen">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {!heeftTemplate ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm px-6 text-center">
              Koppel een Word-template in het linkerpaneel om een voorbeeld te zien.
            </div>
          ) : previewModus === 'word' ? (
            <DocxViewer key={`word-${previewKey}-${previewQuoteId}`} src={wordPreviewUrl!} className="flex-1" />
          ) : (
            <iframe
              key={`pdf-${previewKey}-${previewQuoteId}`}
              src={pdfPreviewUrl!}
              className="flex-1 w-full border-0 bg-white"
              title="PDF-voorbeeld met briefpapier"
            />
          )}
        </div>
      </div>

      {/* Sjabloonteksten modal */}
      {stModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">
              {stModal.item ? 'Sjabloontekst bewerken' : 'Nieuwe sjabloontekst'}
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Naam *</label>
              <input type="text" value={stForm.naam} onChange={e => setStForm(f => ({ ...f, naam: e.target.value }))} autoFocus placeholder="bv. Adresblok..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Categorie</label>
              <input type="text" value={stForm.categorie} onChange={e => setStForm(f => ({ ...f, categorie: e.target.value }))} placeholder="bv. koptekst, adres..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Inhoud (HTML)</label>
              <textarea value={stForm.inhoud_html} onChange={e => setStForm(f => ({ ...f, inhoud_html: e.target.value }))} rows={8} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm  focus:outline-none focus:ring-2 focus:ring-everts/30 resize-y" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setStModal({ open: false })} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">Annuleren</button>
              <button onClick={slaanSjabloontekstOp} className="px-4 py-2 bg-everts text-white rounded-lg text-sm font-medium hover:bg-everts/90 transition-colors">Opslaan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Word template paneel ─────────────────────────────────────────────────────

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
    const tag = `{${v}}`
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

// ─── Briefpapier paneel ───────────────────────────────────────────────────────

function BriefpapierPaneel({
  layoutId,
  briefpapierUrl,
  onChange,
}: {
  layoutId: string
  briefpapierUrl: string
  onChange: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Alleen .pdf bestanden zijn toegestaan')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('layoutId', layoutId)
      const res = await fetch('/everts-calc/api/briefpapier/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onChange(json.url)
      toast.success('Briefpapier geüpload — klik op Opslaan')
    } catch (err) {
      toast.error('Upload mislukt: ' + String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="border-t border-slate-200 pt-4 space-y-2">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        <FileText className="w-3 h-3" /> Briefpapier
      </h3>
      <p className="text-[11px] text-slate-400 leading-snug">
        PDF-achtergrond onder elke offerte-pagina. Zichtbaar in de <strong>PDF + briefpapier</strong>-preview
        en in de gedownloade offerte. Zorg dat je marges genoeg ruimte laten voor het briefhoofd/-voet.
      </p>

      {briefpapierUrl ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg">
            <FileText className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <span className="text-xs text-green-800 flex-1 truncate font-medium">Briefpapier ingesteld</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
              <Upload className="w-3 h-3" /> Vervangen
            </button>
            <a href={briefpapierUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 transition-colors">
              <FileText className="w-3 h-3" /> Bekijk
            </a>
            <button onClick={() => { onChange(''); toast.success('Briefpapier verwijderd — klik op Opslaan') }}
              className="p-1 border border-red-200 rounded text-red-500 hover:bg-red-50 transition-colors" title="Verwijderen">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-everts hover:text-everts transition-colors disabled:opacity-60">
          {uploading ? '⟳ Uploaden...' : <><Upload className="w-3.5 h-3.5" /> Briefpapier-PDF uploaden</>}
        </button>
      )}
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={upload} />
    </div>
  )
}
