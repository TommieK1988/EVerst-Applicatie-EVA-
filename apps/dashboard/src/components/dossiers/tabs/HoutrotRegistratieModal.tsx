'use client'

import { useEffect, useState } from 'react'
import {
  createRegistratie, updateRegistratie, uploadPhoto, deletePhoto, regelVanRecept,
  zetArchief, deleteRegistratie, uploadRegelFoto,
} from '@/services/houtrotherstel/registraties'
import { getHandmatigeStandaarden, type HandmatigeStandaarden } from '@/services/houtrotherstel/handmatig'
import {
  regelVanLijn, regelVanHandmatig, handmatigVanRegel, type HandmatigeRegel,
} from '@/lib/houtrotherstel/handmatige-regel'
import HoutrotHandmatigeRegel from './HoutrotHandmatigeRegel'
import HoutrotWerkzaamhedenTabel from './HoutrotWerkzaamhedenTabel'
import { getHuidigeMedewerker } from '@/services/houtrotherstel/identiteit'
import type { Recept } from '@/services/houtrotherstel/recepten'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { formatDateTime } from '@/lib/houtrotherstel/utils'
import {
  cascadeRijen, bouwLocatiePad, selectieVanLocatie, locatieKeuzeCompleet,
} from '@/lib/houtrotherstel/locatie-boom'
import { fotoPubliekeUrl } from '@/lib/houtrotherstel/fotos'
import { useDialogen } from '@/components/ui/dialogen'
import type {
  RepairRegistration, RepairPhoto, RegistratieForm, RegistratieRegelForm, LocatieBoom, LocatieWaarde,
} from '@/lib/houtrotherstel/types'

const fotoUrl = fotoPubliekeUrl

/** Keuze in de lijst Soort die het invoerblok voor handmatige regels opent. */
const HANDMATIG = '__handmatig__'

/** Eén regel in de modal; `foto` is een nog te uploaden foto bij een handmatige regel. */
type Werkzaamheid = { regel: RegistratieRegelForm; foto?: File | null }

function variantLabel(r: Recept): string {
  if (r.groep && r.naam.toLowerCase().startsWith(r.groep.toLowerCase())) {
    const rest = r.naam.slice(r.groep.length).replace(/^[\s\-–—:]+/, '').trim()
    return rest || r.naam
  }
  return r.naam
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
  // Opgeslagen regels gaan met álle velden mee terug (bron, categorie, foto, …):
  // opslaan vervangt de hele regelset, dus wat hier wegvalt is daarna weg.
  const [werkzaamheden, setWerkzaamheden] = useState<Werkzaamheid[]>(
    (bestaand?.lines ?? []).slice().sort((a, b) => a.volgorde - b.volgorde)
      .map(l => ({ regel: regelVanLijn(l) })),
  )
  // Soort "Handmatig" opent het invoerblok. `bewerkIndex` = welke handmatige regel wordt
  // bewerkt; `handmatigTeller` geeft na elke toegevoegde regel een leeg blok;
  // `handmatigIngevuld` voorkomt dat half ingevulde invoer bij opslaan stil wegvalt.
  const [bewerkIndex, setBewerkIndex] = useState<number | null>(null)
  const [handmatigTeller, setHandmatigTeller] = useState(0)
  const [handmatigIngevuld, setHandmatigIngevuld] = useState(false)
  const [standaarden, setStandaarden] = useState<HandmatigeStandaarden | null>(null)
  const [gefactureerd, setGefactureerd] = useState(!!bestaand?.gefactureerd_op)
  // Pas vast na opslaan: wie "gefactureerd" net aanvinkt kan nog corrigeren.
  const vast = !!bestaand?.gefactureerd_op && gefactureerd
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

  useEffect(() => {
    getHandmatigeStandaarden(dossierId).then(setStandaarden)
      .catch(() => setStandaarden({ functies: [], opslagPct: 0, eenheden: ['st', 'uur'] }))
  }, [dossierId])

  function voegToe() {
    const recept = recepten.find(r => r.id === keuzeRecept)
    const aantal = Math.max(1, Math.round(Number(keuzeAantal.replace(',', '.')) || 0))
    if (!recept || aantal < 1) return
    setWerkzaamheden(prev => {
      // Hetzelfde recept tegen dezelfde prijs: aantal ophogen in plaats van een tweede regel.
      const idx = prev.findIndex(w => w.regel.bron !== 'handmatig' && w.regel.recept_id === recept.id
        && w.regel.sale_price_snapshot === recept.verkoopprijs)
      if (idx >= 0) {
        const k = [...prev]
        k[idx] = { regel: { ...k[idx].regel, aantal: Number(k[idx].regel.aantal) + aantal } }
        return k
      }
      return [...prev, { regel: regelVanRecept(recept, aantal, prev.length) }]
    })
    setKeuzeRecept(''); setKeuzeAantal('1')
  }

  function bewaarHandmatig(h: HandmatigeRegel, foto: File | null, fotoWeg: boolean) {
    const regel = regelVanHandmatig(h, bewerkIndex ?? werkzaamheden.length)
    setWerkzaamheden(prev => {
      if (bewerkIndex == null) return [...prev, { regel, foto }]
      const k = [...prev]
      k[bewerkIndex] = { regel, foto: foto ?? (fotoWeg ? null : k[bewerkIndex].foto) }
      return k
    })
    // Soort blijft op Handmatig met een leeg blok: zo voeg je de volgende regel direct toe.
    setBewerkIndex(null); setHandmatigIngevuld(false); setHandmatigTeller(n => n + 1)
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

      if (bewerkIndex != null || handmatigIngevuld) throw new Error('Rond de handmatige regel eerst af (toevoegen of annuleren).')

      // Nieuwe regelfoto's eerst uploaden: hun pad moet in de regel mee de database in.
      const regels: RegistratieRegelForm[] = []
      for (const [i, w] of werkzaamheden.entries()) {
        const foto_pad = w.foto ? await uploadRegelFoto(dossierId, await verkleinFoto(w.foto)) : w.regel.foto_pad
        regels.push({ ...w.regel, foto_pad, volgorde: i })
      }
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
        gefactureerd,
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
            {vast && (
              <p className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Deze reparatie is gefactureerd: de werkzaamheden liggen vast. Zet «Gefactureerd» uit om ze te wijzigen.
              </p>
            )}
            <HoutrotWerkzaamhedenTabel
              regels={werkzaamheden.map(w => w.regel)}
              vast={vast}
              onBewerk={i => { setBewerkIndex(i); setKeuzeGroep(HANDMATIG); setKeuzeRecept('') }}
              onVerwijder={i => setWerkzaamheden(prev => prev.filter((_, idx) => idx !== i))}
            />

            {!vast && (
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <div className={keuzeGroep === HANDMATIG ? 'sm:col-span-4' : undefined}>
                <label className={lblCls}>Soort</label>
                <select className={inputCls} value={keuzeGroep}
                  onChange={e => {
                    setKeuzeGroep(e.target.value); setKeuzeRecept('')
                    setBewerkIndex(null); setHandmatigIngevuld(false)
                  }}>
                  <option value="">— kies —</option>
                  {groepen.map(g => <option key={g} value={g}>{g}</option>)}
                  <option value={HANDMATIG}>Handmatig (arbeid of materiaal)</option>
                </select>
              </div>
              {keuzeGroep !== HANDMATIG && (<>
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
              </>)}
            </div>
            )}

            {!vast && keuzeGroep === HANDMATIG && (
              <div className="mt-3">
                <HoutrotHandmatigeRegel
                  // Nieuwe sleutel per regel: het formulier begint dan schoon met de juiste waarden.
                  key={`${bewerkIndex ?? 'nieuw'}-${handmatigTeller}`}
                  standaarden={standaarden}
                  start={bewerkIndex != null ? {
                    regel: handmatigVanRegel(werkzaamheden[bewerkIndex].regel),
                    fotoUrl: werkzaamheden[bewerkIndex].regel.foto_pad
                      ? fotoUrl(werkzaamheden[bewerkIndex].regel.foto_pad!) : undefined,
                  } : undefined}
                  onIngevuld={setHandmatigIngevuld}
                  onOpslaan={bewaarHandmatig}
                  onAnnuleer={() => { setBewerkIndex(null); setHandmatigIngevuld(false); setKeuzeGroep('') }}
                />
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
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={gefactureerd} onChange={e => setGefactureerd(e.target.checked)} />
                Gefactureerd — werkzaamheden liggen daarna vast
              </label>
            </div>
          </section>

          {/* Onderaan, want het is bijvangst: wie deze registratie maakte en wie er
              het laatst aan werkte. In het veld wordt er aangemaakt, op kantoor
              vaak nog bijgesteld — dan wil je kunnen zien door wie. */}
          {bestaand && (
            <div className="text-xs leading-relaxed text-slate-400">
              <div>
                Aangemaakt door {bestaand.medewerker_naam || 'onbekend'} · {formatDateTime(bestaand.created_at)}
              </div>
              <div>
                Laatst bewerkt door {bestaand.bijgewerkt_door_naam || bestaand.medewerker_naam || 'onbekend'}
                {' · '}{formatDateTime(bestaand.updated_at)}
              </div>
            </div>
          )}
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
