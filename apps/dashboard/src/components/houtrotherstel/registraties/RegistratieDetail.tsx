'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Camera, X,
  CheckCircle, Circle, Clock,
  Wrench, Trash2, ChevronDown, Euro, Pencil,
  Calendar, User, FileText, Image as ImageIcon,
} from 'lucide-react'
import {
  getAllProjecten, getAllProjectdelen, getAllLocaties, getAllRegistraties,
  saveRegistratie, getReparatiesVoorRegistratie, saveReparatie, deleteReparatie,
  getMedewerkerNaam,
} from '@/lib/houtrotherstel/local-store'
import { getAllBibliotheekActief } from '@/lib/houtrotherstel/local-store'
import type { Project, Projectdeel, Locatie, Registratie, Reparatie, StandardRepair, RegistratieStatus } from '@/lib/houtrotherstel/types'
import { formatCurrency } from '@/lib/houtrotherstel/utils'

interface Props {
  projectId: string
  projectdeelId: string
  locatieId: string
  registratieId: string
}

function berekenRegistratieStatus(voor: string | null, na: string | null): RegistratieStatus {
  if (na) return 'afgerond'
  if (voor) return 'onderhanden'
  return 'geregistreerd'
}

function fotoNaarBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function StatusBadge({ status }: { status: RegistratieStatus }) {
  if (status === 'afgerond') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-100 text-green-700">
        <CheckCircle className="w-3.5 h-3.5" /> Afgerond
      </span>
    )
  }
  if (status === 'onderhanden') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700">
        <Clock className="w-3.5 h-3.5" /> Onderhanden
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">
      <Circle className="w-3.5 h-3.5" /> Geregistreerd
    </span>
  )
}

function FotoVeld({
  label, waarde, onChange,
}: {
  label: string; waarde: string | null; onChange: (v: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onChange(await fotoNaarBase64(file))
  }
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
        <Camera className="w-3.5 h-3.5" />{label}
      </label>
      {waarde ? (
        <div className="relative rounded-lg overflow-hidden border border-slate-200">
          <img src={waarde} alt={label} className="w-full h-44 object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-36 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-everts hover:text-everts transition-colors"
        >
          <Camera className="w-6 h-6" />
          <span className="text-xs">Foto toevoegen</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

function ReparatieKaart({
  reparatie, onVerwijder, onBewerk,
}: {
  reparatie: Reparatie
  onVerwijder: () => void
  onBewerk: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            {reparatie.reparatie_naam && (
              <div className="text-xs font-medium text-everts mb-0.5">{reparatie.reparatie_naam}</div>
            )}
            <p className="text-sm text-slate-700">{reparatie.omschrijving}</p>
            <div className="flex items-center gap-3 mt-1">
              {reparatie.sale_price_snapshot && (
                <span className="text-xs text-slate-500 flex items-center gap-0.5">
                  <Euro className="w-3 h-3" />
                  {formatCurrency(reparatie.sale_price_snapshot).replace('€\u00a0', '')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onBewerk} className="p-1.5 text-slate-400 hover:text-everts transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onVerwijder} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegistratieDetail({ projectId, projectdeelId, locatieId, registratieId }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [projectdeel, setProjectdeel] = useState<Projectdeel | null>(null)
  const [locatie, setLocatie] = useState<Locatie | null>(null)
  const [registratie, setRegistratie] = useState<Registratie | null>(null)
  const [reparaties, setReparaties] = useState<Reparatie[]>([])

  // Reparatie form state
  const [showForm, setShowForm] = useState(false)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [omschrijving, setOmschrijving] = useState('')
  const [gekozenReparatie, setGekozenReparatie] = useState<StandardRepair | null>(null)
  const [zoekReparatie, setZoekReparatie] = useState('')
  const [showReparatieDropdown, setShowReparatieDropdown] = useState(false)
  const [saving, setSaving] = useState(false)

  function laden() {
    setProject(getAllProjecten().find(x => x.id === projectId) || null)
    setProjectdeel(getAllProjectdelen().find(x => x.id === projectdeelId) || null)
    setLocatie(getAllLocaties().find(x => x.id === locatieId) || null)
    setRegistratie(getAllRegistraties().find(x => x.id === registratieId) || null)
    setReparaties(getReparatiesVoorRegistratie(registratieId))
  }

  useEffect(() => { laden() }, [registratieId])

  // ── Registratie acties ────────────────────────────────────────────────────

  function slaFotoOp(veld: 'voor_foto' | 'na_foto', waarde: string | null) {
    if (!registratie) return
    const nieuweVoor = veld === 'voor_foto' ? waarde : registratie.voor_foto
    const nieuweNa = veld === 'na_foto' ? waarde : registratie.na_foto
    const nieuweStatus = berekenRegistratieStatus(nieuweVoor, nieuweNa)
    saveRegistratie({
      ...registratie,
      [veld]: waarde,
      status: nieuweStatus,
      updated_at: new Date().toISOString(),
    })
    laden()
  }

  // ── Reparatie acties ──────────────────────────────────────────────────────

  function resetForm() {
    setOmschrijving('')
    setGekozenReparatie(null)
    setZoekReparatie('')
    setBewerkId(null)
    setShowForm(false)
  }

  function startBewerken(rep: Reparatie) {
    setBewerkId(rep.id)
    setOmschrijving(rep.omschrijving)
    if (rep.standaard_reparatie_id) {
      const std = getAllBibliotheekActief().find(r => r.id === rep.standaard_reparatie_id)
      if (std) { setGekozenReparatie(std); setZoekReparatie(std.name) }
      else { setGekozenReparatie(null); setZoekReparatie('') }
    } else {
      setGekozenReparatie(null)
      setZoekReparatie('')
    }
    setShowForm(true)
  }

  function selecteerStandaardReparatie(r: StandardRepair) {
    setGekozenReparatie(r)
    setZoekReparatie(r.name)
    if (!omschrijving) setOmschrijving(r.description || r.name)
    setShowReparatieDropdown(false)
  }

  function opslaanReparatie() {
    if (!omschrijving.trim() && !gekozenReparatie) return
    setSaving(true)
    const bestaand = bewerkId ? reparaties.find(r => r.id === bewerkId) : null
    const op: Reparatie = {
      id: bewerkId || `rep-${Date.now()}`,
      registratie_id: registratieId,
      locatie_id: locatieId,
      projectdeel_id: projectdeelId,
      project_id: projectId,
      omschrijving: omschrijving.trim() || gekozenReparatie?.name || '',
      standaard_reparatie_id: gekozenReparatie?.id || null,
      reparatie_naam: gekozenReparatie?.name || null,
      reparatie_code: gekozenReparatie?.code || null,
      sale_price_snapshot: gekozenReparatie?.sale_price || null,
      created_at: bestaand?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    saveReparatie(op)

    // Also update the registratie's medewerker field from the current user
    if (registratie) {
      const medewerker = getMedewerkerNaam()
      if (medewerker && medewerker !== registratie.medewerker) {
        saveRegistratie({
          ...registratie,
          medewerker,
          updated_at: new Date().toISOString(),
        })
      }
    }

    resetForm()
    setSaving(false)
    laden()
  }

  function verwijderReparatie(id: string) {
    if (!confirm('Reparatie verwijderen?')) return
    deleteReparatie(id)
    laden()
  }

  const gefilterdReparaties = getAllBibliotheekActief().filter(r =>
    r.name.toLowerCase().includes(zoekReparatie.toLowerCase()) ||
    r.code.toLowerCase().includes(zoekReparatie.toLowerCase()) ||
    r.category.toLowerCase().includes(zoekReparatie.toLowerCase())
  )

  if (!registratie || !locatie || !projectdeel || !project) return (
    <div className="flex items-center justify-center h-40 text-slate-400">Niet gevonden</div>
  )

  const datum = new Date(registratie.datum).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="max-w-2xl space-y-6 pb-20 lg:pb-0">

      {/* Breadcrumb */}
      <div>
        <Link
          href={`/projecten/${projectId}/projectdelen/${projectdeelId}/locaties/${locatieId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {locatie.naam}
        </Link>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Registratie</p>
        <h1 className="text-xl font-bold text-slate-900">{datum}</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {project.name} · {projectdeel.naam} · {locatie.naam}
        </p>
      </div>

      {/* ── Registratie info + foto's ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">

        {/* Header met status badge */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-everts" />
            Registratie details
          </h2>
          <StatusBadge status={registratie.status} />
        </div>

        {/* Datum + medewerker */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {datum}
          </div>
          {registratie.medewerker && (
            <div className="flex items-center gap-2 text-slate-600">
              <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {registratie.medewerker}
            </div>
          )}
        </div>

        {/* Schadeomschrijving */}
        {registratie.omschrijving && (
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-400 mb-1">Schadeomschrijving</p>
            <p className="text-sm text-slate-600">{registratie.omschrijving}</p>
          </div>
        )}

        {/* Voor- en nafoto van de registratie */}
        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-3 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" />
            Foto&apos;s
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FotoVeld
              label="Voorfoto"
              waarde={registratie.voor_foto}
              onChange={v => slaFotoOp('voor_foto', v)}
            />
            <FotoVeld
              label="Nafoto"
              waarde={registratie.na_foto}
              onChange={v => slaFotoOp('na_foto', v)}
            />
          </div>
        </div>
      </div>

      {/* ── Reparaties ───────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-everts" />
            Reparaties
            {reparaties.length > 0 && (
              <span className="text-xs text-slate-400 font-normal">
                ({reparaties.length})
              </span>
            )}
          </h2>
          <button
            onClick={() => { resetForm(); setShowForm(v => bewerkId ? true : !v) }}
            className="inline-flex items-center gap-1.5 bg-everts hover:bg-everts-dark text-white font-medium px-3 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Reparatie
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">
              {bewerkId ? 'Reparatie bewerken' : 'Nieuwe reparatie'}
            </h3>

            {/* Standaard reparatie picker */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-medium text-slate-600">
                Standaard reparatie (optioneel)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={zoekReparatie}
                  onChange={e => {
                    setZoekReparatie(e.target.value)
                    setShowReparatieDropdown(true)
                    if (!e.target.value) setGekozenReparatie(null)
                  }}
                  onFocus={() => setShowReparatieDropdown(true)}
                  placeholder="Zoek reparatie..."
                  className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              {showReparatieDropdown && gefilterdReparaties.length > 0 && (
                <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {gefilterdReparaties.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selecteerStandaardReparatie(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-800">{r.name}</div>
                          <div className="text-xs text-slate-400">{r.code} · {r.category}</div>
                        </div>
                        <div className="text-sm font-semibold text-everts ml-3 flex-shrink-0">
                          {formatCurrency(r.sale_price)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Omschrijving */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Omschrijving</label>
              <textarea
                value={omschrijving}
                onChange={e => setOmschrijving(e.target.value)}
                placeholder="Beschrijf de reparatie..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts resize-none"
              />
            </div>

            {gekozenReparatie && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-everts font-medium">{gekozenReparatie.code}</div>
                  <div className="text-sm font-semibold text-slate-700">{gekozenReparatie.name}</div>
                </div>
                <div className="text-lg font-bold text-everts">
                  {formatCurrency(gekozenReparatie.sale_price)}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={opslaanReparatie}
                disabled={(!omschrijving.trim() && !gekozenReparatie) || saving}
                className="flex-1 bg-everts hover:bg-everts-dark disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                Opslaan
              </button>
              <button
                onClick={resetForm}
                className="px-4 bg-white border border-slate-300 text-slate-600 font-medium py-2.5 rounded-lg text-sm hover:border-slate-400 transition-colors"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}

        {reparaties.map(rep => (
          <ReparatieKaart
            key={rep.id}
            reparatie={rep}
            onVerwijder={() => verwijderReparatie(rep.id)}
            onBewerk={() => startBewerken(rep)}
          />
        ))}

        {reparaties.length === 0 && !showForm && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
            <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium">Nog geen reparaties</p>
            <p className="text-sm mt-1">Voeg een reparatie toe aan deze registratie</p>
          </div>
        )}
      </div>
    </div>
  )
}
