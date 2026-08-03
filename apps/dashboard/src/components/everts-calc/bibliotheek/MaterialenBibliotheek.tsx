'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Trash2, Download, Upload, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getMaterialen,
  maakMateriaal,
  wijzigMateriaal,
  verwijderMateriaal as verwijderMateriaalDb,
  importMaterialen,
  getMateriaalgroepen,
} from '@/app/(platform)/everts-calc/actions/materialen'
import type { Materiaal, MateriaalStatus } from '@/lib/everts-calc/types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Alert } from '@/components/ui/alert'
import { useDialogen } from '@/components/ui/dialogen'

// ─── Inline bewerkbare cellen ─────────────────────────────────────────────────

function InlineTekst({
  waarde, placeholder = '', cls = '',
  onOpslaan,
}: { waarde: string; placeholder?: string; cls?: string; onOpslaan: (v: string) => void }) {
  const [lokaal, setLokaal] = useState(waarde)
  useEffect(() => setLokaal(waarde), [waarde])

  return (
    <input
      type="text"
      value={lokaal}
      placeholder={placeholder}
      onChange={e => setLokaal(e.target.value)}
      onBlur={() => onOpslaan(lokaal)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`w-full text-xs px-1.5 py-1 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white placeholder-slate-300 ${cls}`}
    />
  )
}

function InlineGetal({
  waarde, decimalen = 2, cls = '', onOpslaan,
}: { waarde: number; decimalen?: number; cls?: string; onOpslaan: (v: number) => void }) {
  const toon = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen })
  const [lokaal, setLokaal] = useState(toon(waarde))
  useEffect(() => setLokaal(toon(waarde)), [waarde]) // eslint-disable-line react-hooks/exhaustive-deps

  const bevestig = () => {
    // Nederlandse invoer: komma als decimaalteken, punt als duizendtal.
    const genormaliseerd = lokaal.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
    const n = parseFloat(genormaliseerd)
    if (isNaN(n) || n === waarde) { setLokaal(toon(waarde)); return }
    onOpslaan(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={lokaal}
      onChange={e => setLokaal(e.target.value)}
      onBlur={bevestig}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setLokaal(toon(waarde)); (e.target as HTMLInputElement).blur() }
      }}
      className={`w-full text-xs px-1.5 py-1 rounded border border-transparent text-right
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white ${cls}`}
    />
  )
}

function InlineSelect({
  waarde, opties, onOpslaan, cls = '',
}: { waarde: string; opties: { value: string; label: string }[]; onOpslaan: (v: string) => void; cls?: string }) {
  return (
    <select
      value={waarde}
      onChange={e => onOpslaan(e.target.value)}
      className={`w-full text-xs px-1.5 py-1 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white cursor-pointer ${cls}`}
    >
      {opties.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** De everts-calc-layout zet --border en --accent om naar losse HSL-kanalen voor de
 *  shadcn-primitives; OverzichtTabel gebruikt ze als kléur (`var(--border)`), en dan
 *  vallen randen en accenten weg. Binnen de tabel zetten we ze terug naar de
 *  DS-tokens — die volgen het thema, dus donkere modus blijft kloppen. */
const DS_TOKENS = {
  '--border': 'var(--neutral-200)',
  '--accent': 'var(--brand)',
} as React.CSSProperties

// ─── Nieuw materiaal ──────────────────────────────────────────────────────────

/**
 * Aanmaken gaat via dit formulier en niet via een lege regel in de tabel: zo'n lege
 * regel valt weg achter een actief filter, staat tussen ~1900 andere regels en laat
 * halve records achter als je hem niet afmaakt.
 */
function NieuwMateriaalModal({
  groepOpties, onSluiten, onOpslaan,
}: {
  groepOpties: string[]
  onSluiten: () => void
  onOpslaan: (m: Partial<Materiaal>) => Promise<void>
}) {
  const [omschrijving,   setOmschrijving]   = useState('')
  const [leverancier,    setLeverancier]    = useState('')
  const [merk,           setMerk]           = useState('')
  const [artikelnummer,  setArtikelnummer]  = useState('')
  const [materiaalgroep, setMateriaalgroep] = useState('')
  const [eenheid,        setEenheid]        = useState('ltr')
  const [kostprijs,      setKostprijs]      = useState('0,00')
  const [bezig,          setBezig]          = useState(false)

  const kostprijsGetal = (() => {
    const n = parseFloat(kostprijs.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    return isNaN(n) ? 0 : n
  })()

  const kanOpslaan = omschrijving.trim().length > 0 && !bezig

  const bewaar = async () => {
    if (!kanOpslaan) return
    setBezig(true)
    try {
      await onOpslaan({
        omschrijving:   omschrijving.trim(),
        leverancier:    leverancier.trim()   || undefined,
        merk:           merk.trim()          || undefined,
        artikelnummer:  artikelnummer.trim() || undefined,
        materiaalgroep: materiaalgroep       || undefined,
        eenheid:        eenheid.trim()       || 'ltr',
        kostprijs:      kostprijsGetal,
        status:         'actief',
      })
      onSluiten()
    } catch {
      // Fout is al als toast getoond; modal blijft open met de ingevulde gegevens.
    } finally {
      setBezig(false)
    }
  }

  const veld = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts'
  const label = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      onMouseDown={e => { if (e.target === e.currentTarget) onSluiten() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Nieuw materiaal</h3>
          <Button variant="ghost" size="icon-sm" onClick={onSluiten} title="Sluiten">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div
          className="p-5 space-y-4"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void bewaar() } }}
        >
          <div>
            <label className={label}>Omschrijving *</label>
            <input
              autoFocus
              type="text"
              value={omschrijving}
              onChange={e => setOmschrijving(e.target.value)}
              placeholder="Bijv. Grondverf wit 2,5 ltr"
              className={veld}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Leverancier</label>
              <input type="text" value={leverancier} onChange={e => setLeverancier(e.target.value)} className={veld} />
            </div>
            <div>
              <label className={label}>Merk</label>
              <input type="text" value={merk} onChange={e => setMerk(e.target.value)} className={veld} />
            </div>
            <div>
              <label className={label}>Artikelnummer</label>
              <input type="text" value={artikelnummer} onChange={e => setArtikelnummer(e.target.value)} className={veld} />
            </div>
            <div>
              <label className={label}>Materiaalgroep</label>
              <select value={materiaalgroep} onChange={e => setMateriaalgroep(e.target.value)} className={veld}>
                <option value="">— Kies —</option>
                {groepOpties.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Eenheid</label>
              <input
                type="text"
                value={eenheid}
                onChange={e => setEenheid(e.target.value)}
                placeholder="ltr"
                className={veld}
              />
            </div>
            <div>
              <label className={label}>Kostprijs (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={kostprijs}
                onChange={e => setKostprijs(e.target.value)}
                className={`${veld} text-right`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200">
          <Button variant="ghost" size="sm" onClick={onSluiten}>Annuleren</Button>
          <Button variant="primary" size="sm" onClick={() => { void bewaar() }} disabled={!kanOpslaan}>
            {bezig ? <Spinner size="sm" /> : <Plus className="w-3.5 h-3.5" />}
            Materiaal toevoegen
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────

type Props = {
  layouts: GebruikerLayout[]
  user_id: string | null
}

export default function MaterialenBibliotheek({ layouts, user_id }: Props) {
  const [materialen, setMaterialen] = useState<Materiaal[]>([])
  // Zoeken, kolomfilters en sorteren doet de OverzichtTabel zelf; alleen het
  // actief/inactief-onderscheid blijft hier, omdat inactieve regels standaard
  // buiten beeld horen te blijven.
  const [alleenActief, setAlleenActief] = useState(true)
  const [laden, setLaden] = useState(true)
  const [importBezig, setImportBezig] = useState(false)
  const [importResultaat, setImportResultaat] = useState<{ aangemaakt: number; bijgewerkt: number; fouten: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dicoRef = useRef<HTMLInputElement>(null)
  const { bevestig } = useDialogen()
  // Zojuist toegevoegde regel: krijgt een label zodat hij niet ongemerkt tussen
  // de rest verdwijnt.
  const [nieuwId, setNieuwId] = useState<string | null>(null)
  const [nieuwOpen, setNieuwOpen] = useState(false)

  const [groepOpties, setGroepOpties] = useState<string[]>([])

  const laad = useCallback(async () => {
    setLaden(true)
    try {
      setMaterialen(await getMaterialen())
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { void laad() }, [laad])
  useEffect(() => { getMateriaalgroepen().then(setGroepOpties).catch(() => setGroepOpties([])) }, [])

  const wijzig = useCallback((id: string, patch: Partial<Materiaal>) => {
    // Optimistisch in de UI, daarna persisteren naar Supabase.
    setMaterialen(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    void wijzigMateriaal(id, patch).catch(() => { void laad() })
  }, [laad])

  const voegToe = useCallback(async (invoer: Partial<Materiaal>) => {
    try {
      const nieuw = await maakMateriaal(invoer)
      // Bovenaan tonen en met een label markeren: anders belandt de nieuwe regel
      // ergens tussen ~1900 andere en zie je niet dat hij er is.
      setAlleenActief(true)
      setMaterialen(prev => [nieuw, ...prev])
      setNieuwId(nieuw.id)
      toast.success('Materiaal toegevoegd')
    } catch (err) {
      toast.error(`Materiaal aanmaken mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
      throw err
    }
  }, [])

  const verwijder = useCallback(async (id: string) => {
    if (!await bevestig({ titel: 'Materiaal verwijderen?', bevestigLabel: 'Verwijderen', destructief: true })) return
    setMaterialen(prev => prev.filter(m => m.id !== id))
    void verwijderMateriaalDb(id).catch(() => { void laad() })
  }, [laad, bevestig])

  // ─── Tabelgegevens ────────────────────────────────────────────────────────

  const tabelRijen = useMemo(
    () => alleenActief ? materialen.filter(m => m.status === 'actief') : materialen,
    [materialen, alleenActief],
  )

  const kolommen: KolomDefinitie<Materiaal>[] = useMemo(() => {
    const uniek = (waarden: (string | undefined)[]) =>
      Array.from(new Set(waarden.filter((w): w is string => !!w))).sort()

    return [
      {
        key: 'omschrijving',
        label: 'Omschrijving',
        vast: true,
        breedte: 280,
        filterType: 'tekst',
        sorteerWaarde: m => m.omschrijving,
        render: m => (
          <div className="flex items-center gap-1.5">
            <InlineTekst
              waarde={m.omschrijving}
              placeholder="Omschrijving..."
              cls="font-medium"
              onOpslaan={v => wijzig(m.id, { omschrijving: v })}
            />
            {m.id === nieuwId && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                nieuw
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'leverancier',
        label: 'Leverancier',
        breedte: 150,
        filterType: 'select',
        filterOpties: uniek(materialen.map(m => m.leverancier)),
        sorteerWaarde: m => m.leverancier ?? '',
        render: m => (
          <InlineTekst
            waarde={m.leverancier ?? ''}
            placeholder="Leverancier..."
            onOpslaan={v => wijzig(m.id, { leverancier: v || undefined })}
          />
        ),
      },
      {
        key: 'merk',
        label: 'Merk',
        breedte: 130,
        filterType: 'select',
        filterOpties: uniek(materialen.map(m => m.merk)),
        sorteerWaarde: m => m.merk ?? '',
        render: m => (
          <InlineTekst
            waarde={m.merk ?? ''}
            placeholder="Merk..."
            onOpslaan={v => wijzig(m.id, { merk: v || undefined })}
          />
        ),
      },
      {
        key: 'artikelnummer',
        label: 'Artikelnummer',
        breedte: 140,
        filterType: 'tekst',
        sorteerWaarde: m => m.artikelnummer ?? '',
        render: m => (
          <InlineTekst
            waarde={m.artikelnummer ?? ''}
            placeholder="Artikelnr..."
            onOpslaan={v => wijzig(m.id, { artikelnummer: v || undefined })}
          />
        ),
      },
      {
        key: 'materiaalgroep',
        label: 'Materiaalgroep',
        breedte: 170,
        filterType: 'select',
        filterOpties: uniek(materialen.map(m => m.materiaalgroep)),
        sorteerWaarde: m => m.materiaalgroep ?? '',
        render: m => (
          <InlineSelect
            waarde={m.materiaalgroep ?? ''}
            opties={[
              { value: '', label: '— Kies —' },
              ...groepOpties.map(g => ({ value: g, label: g })),
              // Bestaande waarde die (nog) niet in de beheerlijst staat, blijven tonen
              ...(m.materiaalgroep && !groepOpties.includes(m.materiaalgroep)
                ? [{ value: m.materiaalgroep, label: m.materiaalgroep }]
                : []),
            ]}
            onOpslaan={v => wijzig(m.id, { materiaalgroep: v || undefined })}
          />
        ),
      },
      {
        key: 'eenheid',
        label: 'Eenheid',
        breedte: 90,
        filterType: 'select',
        filterOpties: uniek(materialen.map(m => m.eenheid)),
        sorteerWaarde: m => m.eenheid,
        render: m => (
          <InlineTekst
            waarde={m.eenheid}
            placeholder="ltr"
            onOpslaan={v => wijzig(m.id, { eenheid: v.trim() || 'ltr' })}
          />
        ),
      },
      {
        key: 'kostprijs',
        label: 'Kostprijs',
        breedte: 110,
        sorteerWaarde: m => m.kostprijs,
        render: m => (
          <div className="flex items-center gap-0.5">
            <span className="text-xs text-slate-400">€</span>
            <InlineGetal waarde={m.kostprijs} onOpslaan={v => wijzig(m.id, { kostprijs: v })} />
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        breedte: 110,
        filterType: 'select',
        filterOpties: ['Actief', 'Inactief'],
        sorteerWaarde: m => m.status === 'actief' ? 'Actief' : 'Inactief',
        render: m => (
          <Button
            variant={m.status === 'actief' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={e => { e.stopPropagation(); wijzig(m.id, { status: m.status === 'actief' ? 'inactief' : 'actief' }) }}
            className={m.status === 'actief' ? 'bg-success-100 text-success-700 hover:bg-success-300 border-transparent' : ''}
          >
            {m.status === 'actief' ? 'Actief' : 'Inactief'}
          </Button>
        ),
      },
      {
        key: 'leverancier_productgroep',
        label: 'Productgroep leverancier',
        breedte: 190,
        standaard_zichtbaar: false,
        filterType: 'tekst',
        sorteerWaarde: m => m.leverancier_productgroep ?? '',
        render: m => (
          <span className="text-xs text-slate-500" title={m.leverancier_productgroep}>
            {m.leverancier_productgroep ?? '—'}
          </span>
        ),
      },
      {
        key: 'gtin',
        label: 'GTIN',
        breedte: 140,
        standaard_zichtbaar: false,
        filterType: 'tekst',
        sorteerWaarde: m => m.gtin ?? '',
        render: m => <span className="text-xs text-slate-500">{m.gtin ?? '—'}</span>,
      },
      {
        key: 'bron',
        label: 'Bron',
        breedte: 110,
        standaard_zichtbaar: false,
        filterType: 'select',
        filterOpties: uniek(materialen.map(m => m.bron)),
        sorteerWaarde: m => m.bron ?? '',
        render: m => <span className="text-xs text-slate-500">{m.bron ?? '—'}</span>,
      },
      {
        key: 'verwijderen',
        label: 'Verwijderen',
        breedte: 90,
        render: m => (
          <div className="text-center">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={e => { e.stopPropagation(); verwijder(m.id) }}
              title="Verwijder materiaal"
              className="text-slate-400 hover:text-error-700 hover:bg-error-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ),
      },
    ]
  }, [materialen, groepOpties, nieuwId, wijzig, verwijder])

  // ─── Excel export ─────────────────────────────────────────────────────────

  const downloadSjabloon = () => {
    window.location.href = '/everts-calc/api/materialen/sjabloon'
  }

  // ─── Excel import ─────────────────────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setImportBezig(true)
    setImportResultaat(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await bestand.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rijen = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const items: Partial<Materiaal>[] = rijen.map(rij => {
        const kostprijsRaw = parseFloat(String(rij['Kostprijs'] ?? rij['kostprijs'] ?? '0').replace(',', '.'))
        const statusRaw    = String(rij['Status'] ?? rij['status'] ?? 'actief').trim().toLowerCase()
        const status: MateriaalStatus = statusRaw === 'inactief' ? 'inactief' : 'actief'
        return {
          omschrijving:   String(rij['Omschrijving']   ?? rij['omschrijving']   ?? '').trim(),
          leverancier:    String(rij['Leverancier']    ?? rij['leverancier']    ?? '').trim() || undefined,
          artikelnummer:  String(rij['Artikelnummer']  ?? rij['artikelnummer']  ?? '').trim() || undefined,
          materiaalgroep: String(rij['Materiaalgroep'] ?? rij['materiaalgroep'] ?? '').trim() || undefined,
          eenheid:        String(rij['Eenheid']        ?? rij['eenheid']        ?? 'ltr').trim() || 'ltr',
          kostprijs:      isNaN(kostprijsRaw) ? 0 : kostprijsRaw,
          status,
        }
      })

      const resultaat = await importMaterialen(items, 'excel')
      await laad()
      setImportResultaat(resultaat)
    } catch (err) {
      setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [String(err)] })
    } finally {
      setImportBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ─── DICO-import ──────────────────────────────────────────────────────────

  const handleDicoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setImportBezig(true)
    setImportResultaat(null)
    try {
      const form = new FormData()
      form.append('file', bestand)
      const res = await fetch('/everts-calc/api/materialen/dico', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [json.error ?? 'DICO-import mislukt'] })
      } else {
        await laad()
        setImportResultaat({ aangemaakt: json.aangemaakt ?? 0, bijgewerkt: json.bijgewerkt ?? 0, fouten: json.fouten ?? [] })
      }
    } catch (err) {
      setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [String(err)] })
    } finally {
      setImportBezig(false)
      if (dicoRef.current) dicoRef.current.value = ''
    }
  }


  return (
    <div className="space-y-4">

      {/* ─── Import resultaat ─────────────────────────────────────────────── */}
      {importResultaat && (
        <Alert
          tone={importResultaat.fouten.length > 0 ? 'warning' : 'success'}
          onClose={() => setImportResultaat(null)}
        >
          {importResultaat.aangemaakt} aangemaakt, {importResultaat.bijgewerkt} bijgewerkt
          {importResultaat.fouten.length > 0 && ` · ${importResultaat.fouten.length} fouten`}
          {importResultaat.fouten.slice(0, 2).map((f, i) => (
            <span key={i} className="block text-error-700">{f}</span>
          ))}
        </Alert>
      )}

      {/* ─── Tabel ────────────────────────────────────────────────────────── */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Spinner size="sm" /> <span className="ml-2 text-sm">Materialen laden…</span>
        </div>
      ) : (
        <div style={DS_TOKENS}>
          <OverzichtTabel
            scherm="everts-calc-materialen"
            data={tabelRijen}
            kolommen={kolommen}
            layouts={layouts}
            user_id={user_id}
            selecteerbaar={false}
            dicht
            // Bewerken gebeurt in de cellen zelf; een rijklik hoeft niets te doen
            // (zonder handler navigeert de tabel naar een detailpagina die er niet is).
            toonRijActie={false}
            onRijKlik={() => {}}
            beginSortering={[{ id: 'omschrijving', desc: false }]}
            acties={
              <>
                <Button
                  variant={alleenActief ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAlleenActief(a => !a)}
                  title="Inactieve materialen tonen of verbergen"
                >
                  {alleenActief ? 'Alleen actief' : 'Alles'}
                </Button>

                <Button variant="outline" size="sm" onClick={downloadSjabloon} title="Excel sjabloon downloaden">
                  <Download className="w-3.5 h-3.5" /> Sjabloon
                </Button>

                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={importBezig}
                  title="Excel importeren"
                >
                  {importBezig ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
                  Excel
                </Button>

                <input ref={dicoRef} type="file" accept=".xml,.dico,text/xml,application/xml" className="hidden" onChange={handleDicoImport} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dicoRef.current?.click()}
                  disabled={importBezig}
                  title="DICO-bestand importeren (Ketenstandaard artikel-XML)"
                >
                  {importBezig ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
                  DICO
                </Button>

                <Button variant="primary" size="sm" onClick={() => setNieuwOpen(true)}>
                  <Plus className="w-3.5 h-3.5" /> Materiaal toevoegen
                </Button>
              </>
            }
          />
        </div>
      )}

      {nieuwOpen && (
        <NieuwMateriaalModal
          groepOpties={groepOpties}
          onSluiten={() => setNieuwOpen(false)}
          onOpslaan={voegToe}
        />
      )}
    </div>
  )
}
