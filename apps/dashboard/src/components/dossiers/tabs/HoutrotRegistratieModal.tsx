'use client'

import { useEffect, useState } from 'react'
import {
  createRegistratie, updateRegistratie, uploadPhoto, deletePhoto, regelVanRecept,
  zetArchief, deleteRegistratie,
} from '@/services/houtrotherstel/registraties'
import { getHuidigeMedewerker } from '@/services/houtrotherstel/identiteit'
import type { Recept } from '@/services/houtrotherstel/recepten'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { formatCurrency } from '@/lib/houtrotherstel/utils'
import {
  cascadeRijen, bouwLocatiePad, selectieVanLocatie, locatieKeuzeCompleet,
} from '@/lib/houtrotherstel/locatie-boom'
import { fotoPubliekeUrl } from '@/lib/houtrotherstel/fotos'
import { useDialogen } from '@/components/ui/dialogen'
import type {
  RepairRegistration, RepairPhoto, RegistratieForm, LocatieBoom, LocatieWaarde,
} from '@/lib/houtrotherstel/types'

const fotoUrl = fotoPubliekeUrl

type Werkzaamheid = { recept: Recept; aantal: number }

function variantLabel(r: Recept): string {
  if (r.groep && r.naam.toLowerCase().startsWith(r.groep.toLowerCase())) {
    const rest = r.naam.slice(r.groep.length).replace(/^[\s\-–—:]+/, '').trim()
    return rest || r.naam
  }
  return r.naam
}

function receptVanLijn(l: NonNullable<RepairRegistration['lines']>[number]): Recept {
  return {
    id: l.recept_id ?? '', code: l.repair_code_snapshot ?? '',
    naam: l.repair_name_snapshot ?? 'Werkzaamheid', omschrijving: l.repair_description_snapshot ?? null,
    eenheid: l.unit_snapshot ?? null, groep: null,
    uren: Number(l.labor_hours_snapshot ?? 0), uurtarief: Number(l.labor_rate_snapshot ?? 0),
    arbeidskosten: Number(l.labor_cost_snapshot ?? 0), materiaalkosten: Number(l.material_cost_snapshot ?? 0),
    kostprijs: Number(l.cost_price_snapshot ?? 0), margePct: null, verkoopprijs: Number(l.sale_price_snapshot ?? 0),
  }
}

const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-everts focus:outline-none focus:ring-2 focus:ring-everts/20'
const lblCls = 'mb-1 block text-xs font-semibold text-slate-500'

/**
 * Desktop-editor voor een houtrotregistratie: alles bewerken (locatie,
 * werkzaamheden, status, foto's). Bedragen zijn hier wél zichtbaar.
 */
export default function HoutrotRegistratieModal({
  dossierId, registratie, boom, recepten, onClose, onSaved,
}: {
  dossierId: string
  registratie: RepairRegistration | null
  /** `null` = de boom wordt nog geladen. Dan niet opslaan: zie het effect hieronder. */
  boom: LocatieBoom | null
  recepten: Recept[]
  onClose: () => void
  onSaved: () => void
}) {
  const bestaand = registratie
  const opgeslagenLoc = (bestaand?.locatie ?? []) as LocatieWaarde[]
  const boomLaadt = boom === null
  const heeftBoom = !!boom && boom.nodes.length > 0

  // Cascade-keuze: gekozen knoop-id per diepte. Bij bewerken uit het pad terugzetten.
  const [gekozen, setGekozen] = useState<string[]>(() => selectieVanLocatie(boom?.nodes ?? [], opgeslagenLoc))
  const [zelfGekozen, setZelfGekozen] = useState(false)
  const [vrijeLocatie, setVrijeLocatie] = useState(opgeslagenLoc[0]?.waarde ?? '')

  // De boom komt uit een server action en kan ná het openen van de modal binnenkomen.
  // Zonder deze herhydratatie blijft de cascade op de lege beginstand staan, en zou
  // opslaan de bestaande locatie met een leeg pad overschrijven.
  useEffect(() => {
    if (!boom || zelfGekozen) return
    setGekozen(selectieVanLocatie(boom.nodes, opgeslagenLoc))
    // opgeslagenLoc is afgeleid van de registratie-prop en verandert niet tijdens de modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boom, zelfGekozen])

  function kiesNiveau(diepte: number, nodeId: string) {
    setZelfGekozen(true)
    setGekozen(prev => [...prev.slice(0, diepte), nodeId].filter(Boolean))
  }

  // Oude registratie die nog niet op de (inmiddels ingestelde) boom staat.
  const vorigeLocatie = opgeslagenLoc.map(l => l.waarde).filter(Boolean).join(' · ')
  const oudNietOpBoom = heeftBoom && !!bestaand && selectieVanLocatie(boom!.nodes, opgeslagenLoc).length === 0
  const locatieCompleet = heeftBoom
    ? locatieKeuzeCompleet(boom!.nodes, gekozen)
    : !!vrijeLocatie.trim()
  const [werkzaamheden, setWerkzaamheden] = useState<Werkzaamheid[]>(
    (bestaand?.lines ?? []).slice().sort((a, b) => a.volgorde - b.volgorde)
      .map(l => ({ recept: receptVanLijn(l), aantal: Number(l.aantal) })),
  )
  const [keuzeGroep, setKeuzeGroep] = useState('')
  const [keuzeRecept, setKeuzeRecept] = useState('')
  const [keuzeAantal, setKeuzeAantal] = useState('1')
  const [notitie, setNotitie] = useState(bestaand?.notes ?? '')
  const [afgerond, setAfgerond] = useState(bestaand?.status === 'afgerond')
  const [voorFoto, setVoorFoto] = useState<File | null>(null)
  const [naFoto, setNaFoto] = useState<File | null>(null)
  const [bestaandeFotos] = useState<RepairPhoto[]>(bestaand?.photos ?? [])
  const [verwijderd, setVerwijderd] = useState<Set<string>>(new Set())
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const { bevestig } = useDialogen()
  const isGearchiveerd = !!bestaand?.gearchiveerd_op

  const groepen = Array.from(new Set(recepten.filter(r => r.groep).map(r => r.groep as string)))
  const receptenInGroep = recepten.filter(r => r.groep === keuzeGroep)
  const zichtbareFotos = bestaandeFotos.filter(p => !verwijderd.has(p.id))

  const totUren = werkzaamheden.reduce((s, w) => s + w.aantal * w.recept.uren, 0)
  const totArbeid = werkzaamheden.reduce((s, w) => s + w.aantal * w.recept.arbeidskosten, 0)
  const totMateriaal = werkzaamheden.reduce((s, w) => s + w.aantal * w.recept.materiaalkosten, 0)
  const totVerkoop = werkzaamheden.reduce((s, w) => s + w.aantal * w.recept.verkoopprijs, 0)

  function voegToe() {
    const recept = recepten.find(r => r.id === keuzeRecept)
    const aantal = Math.max(1, Math.round(Number(keuzeAantal.replace(',', '.')) || 0))
    if (!recept || aantal < 1) return
    setWerkzaamheden(prev => {
      const idx = prev.findIndex(w => w.recept.id === recept.id)
      if (idx >= 0) {
        const k = [...prev]; k[idx] = { ...k[idx], aantal: k[idx].aantal + aantal }; return k
      }
      return [...prev, { recept, aantal }]
    })
    setKeuzeRecept(''); setKeuzeAantal('1')
  }

  async function opslaan() {
    setBezig(true); setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      if (!medewerker) throw new Error('Geen medewerker-koppeling gevonden.')
      // Zolang de boom niet binnen is, weten we niet of er een locatie-indeling is;
      // opslaan zou de bestaande locatie met een leeg pad overschrijven.
      if (boomLaadt) throw new Error('De locatie-indeling wordt nog geladen. Probeer het over een moment opnieuw.')
      if (!locatieCompleet) {
        throw new Error(heeftBoom
          ? 'Kies eerst de volledige locatie (elk niveau).'
          : 'Vul eerst een locatie in.')
      }
      if (werkzaamheden.length === 0) throw new Error('Voeg minstens één werkzaamheid toe.')

      const regels = werkzaamheden.map((w, i) => regelVanRecept(w.recept, w.aantal, i))
      const locatie: LocatieWaarde[] =
        heeftBoom
          ? bouwLocatiePad(boom!, gekozen)
          : [{ naam: 'Locatie', waarde: vrijeLocatie.trim() }]

      const teVerwijderen = new Set(verwijderd)
      if (voorFoto) bestaandeFotos.filter(p => p.photo_type === 'voor').forEach(p => teVerwijderen.add(p.id))
      if (naFoto) bestaandeFotos.filter(p => p.photo_type === 'na').forEach(p => teVerwijderen.add(p.id))

      const form: RegistratieForm = {
        dossier_id: dossierId,
        werkzaamheden: regels,
        locatie,
        registration_date: bestaand?.registration_date ?? new Date().toISOString().slice(0, 10),
        notes: notitie || undefined,
        status: afgerond ? 'afgerond' : 'geregistreerd',
        status_handmatig: true,
        control_status: 'niet_gecontroleerd',
      }

      let regId: string
      if (bestaand) {
        await updateRegistratie(bestaand.id, form, medewerker.id)
        regId = bestaand.id
      } else {
        regId = (await createRegistratie(form, medewerker.id)).id
      }

      for (const id of teVerwijderen) {
        const p = bestaandeFotos.find(x => x.id === id)
        if (p) await deletePhoto(p.id, p.storage_path).catch(() => null)
      }
      if (voorFoto) await uploadPhoto(regId, await verkleinFoto(voorFoto), 'voor').catch(() => null)
      if (naFoto) await uploadPhoto(regId, await verkleinFoto(naFoto), 'na').catch(() => null)

      onSaved()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  async function archiveren() {
    if (!bestaand) return
    if (!isGearchiveerd && !await bevestig({
      titel: 'Deze registratie archiveren?',
      omschrijving: 'Hij verdwijnt uit het overzicht en uit rapportages, maar blijft bewaard.',
      bevestigLabel: 'Archiveren',
    })) return
    setBezig(true); setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      if (!medewerker) throw new Error('Geen medewerker-koppeling gevonden.')
      await zetArchief(bestaand.id, !isGearchiveerd, medewerker.id)
      onSaved()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Archiveren mislukt')
      setBezig(false)
    }
  }

  async function verwijderen() {
    if (!bestaand) return
    if (!await bevestig({
      titel: 'Deze registratie definitief verwijderen?',
      omschrijving: 'Werkzaamheden en foto’s gaan mee. Dit kan niet ongedaan worden gemaakt.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })) return
    setBezig(true); setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      await deleteRegistratie(bestaand.id, medewerker?.id)
      onSaved()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Verwijderen mislukt')
      setBezig(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-800">
            {bestaand ? 'Registratie bewerken' : 'Nieuwe registratie'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Sluiten">✕</button>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {fout && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}

          {/* Locatie */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Locatie</h3>
            {boomLaadt ? (
              <div className="text-sm text-slate-400">Locatie-indeling laden…</div>
            ) : heeftBoom ? (
              <>
              {oudNietOpBoom && (
                <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
                  {vorigeLocatie
                    ? <>Nog niet op de boom geplaatst. Vorige locatie: <strong>{vorigeLocatie}</strong>. Kies hieronder de juiste plek.</>
                    : 'Nog geen locatie. Kies hieronder de juiste plek op de boom.'}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {cascadeRijen(boom!.nodes, gekozen).map(({ diepte, opties }) => (
                  <div key={diepte}>
                    <label className={lblCls}>{boom!.labels[diepte]?.trim() || `Niveau ${diepte + 1}`}</label>
                    <select className={inputCls} value={gekozen[diepte] ?? ''}
                      onChange={e => kiesNiveau(diepte, e.target.value)}>
                      <option value="">—</option>
                      {opties.map(o => <option key={o.id} value={o.id}>{o.naam}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!locatieCompleet && (
                <p className="mt-2 text-xs text-slate-500">Kies elk niveau; zonder volledige locatie kan de registratie niet worden opgeslagen.</p>
              )}
              </>
            ) : (
              <div>
                <label className={lblCls}>Locatie</label>
                <input className={inputCls} value={vrijeLocatie} onChange={e => setVrijeLocatie(e.target.value)} />
              </div>
            )}
          </section>

          {/* Werkzaamheden */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Werkzaamheden</h3>
            {werkzaamheden.length > 0 && (
              <div className="mb-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="px-3 py-2 text-left">Werkzaamheid</th>
                      <th className="px-3 py-2 text-right">Aantal</th>
                      <th className="px-3 py-2 text-right">Uren</th>
                      <th className="px-3 py-2 text-right">Verkoop</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {werkzaamheden.map((w, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate-700">{w.recept.naam}</td>
                        <td className="px-3 py-2 text-right">{w.aantal}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{(w.aantal * w.recept.uren).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(w.aantal * w.recept.verkoopprijs)}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => setWerkzaamheden(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-red-600 hover:text-red-800" aria-label="Verwijderen">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 text-xs font-semibold text-slate-600">
                      <td className="px-3 py-2">Totaal</td>
                      <td />
                      <td className="px-3 py-2 text-right">{totUren.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(totVerkoop)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <div>
                <label className={lblCls}>Soort</label>
                <select className={inputCls} value={keuzeGroep}
                  onChange={e => { setKeuzeGroep(e.target.value); setKeuzeRecept('') }}>
                  <option value="">— kies —</option>
                  {groepen.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={lblCls}>Variant</label>
                <select className={inputCls} value={keuzeRecept} disabled={!keuzeGroep}
                  onChange={e => setKeuzeRecept(e.target.value)}>
                  <option value="">— kies —</option>
                  {receptenInGroep.map(r => <option key={r.id} value={r.id}>{variantLabel(r)}</option>)}
                </select>
              </div>
              <div className="w-20">
                <label className={lblCls}>Aantal</label>
                <input type="number" min={1} step={1} className={inputCls} value={keuzeAantal}
                  onChange={e => setKeuzeAantal(e.target.value)} />
              </div>
              <button type="button" onClick={voegToe} disabled={!keuzeRecept}
                className="rounded-md bg-everts px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Toevoegen
              </button>
            </div>

            {werkzaamheden.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>Arbeidskosten: <strong className="text-slate-700">{formatCurrency(totArbeid)}</strong></span>
                <span>Materiaalkosten: <strong className="text-slate-700">{formatCurrency(totMateriaal)}</strong></span>
              </div>
            )}
          </section>

          {/* Foto's */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Foto&apos;s</h3>
            {zichtbareFotos.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {zichtbareFotos.map(p => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoUrl(p.storage_path)} alt={p.photo_type} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                    <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/55 text-center text-[9px] font-bold uppercase text-white">{p.photo_type}</span>
                    <button type="button" onClick={() => setVerwijderd(prev => new Set(prev).add(p.id))}
                      className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-red-600 text-xs text-white" aria-label="Verwijderen">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lblCls}>Voor</label>
                <input type="file" accept="image/*" className="w-full text-sm" onChange={e => setVoorFoto(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label className={lblCls}>Na</label>
                <input type="file" accept="image/*" className="w-full text-sm" onChange={e => setNaFoto(e.target.files?.[0] ?? null)} />
              </div>
            </div>
          </section>

          {/* Notitie + status */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lblCls}>Notitie</label>
              <textarea className={inputCls} rows={3} value={notitie} onChange={e => setNotitie(e.target.value)} />
            </div>
            <div>
              <label className={lblCls}>Status</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAfgerond(false)}
                  className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-semibold ${!afgerond ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 text-slate-500'}`}>
                  Geregistreerd
                </button>
                <button type="button" onClick={() => setAfgerond(true)}
                  className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-semibold ${afgerond ? 'border-green-600 bg-green-600 text-white' : 'border-slate-200 text-slate-500'}`}>
                  Afgerond
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {bestaand && (
            <div className="mr-auto flex gap-2">
              <button type="button" onClick={archiveren} disabled={bezig}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                {isGearchiveerd ? 'Terugzetten' : 'Archiveren'}
              </button>
              <button type="button" onClick={verwijderen} disabled={bezig}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                Verwijderen
              </button>
            </div>
          )}
          <button type="button" onClick={onClose} disabled={bezig}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Annuleren
          </button>
          <button type="button" onClick={opslaan} disabled={bezig || boomLaadt}
            className="rounded-lg bg-everts px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
