'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getRegistraties, createRegistratie, updateRegistratie, uploadPhoto, deletePhoto,
  regelVanRecept, zetArchief, deleteRegistratie,
} from '@/services/houtrotherstel/registraties'
import { getRecepten, type Recept } from '@/services/houtrotherstel/recepten'
import { getHuidigeMedewerker } from '@/services/houtrotherstel/identiteit'
import { getLocatieBoom } from '@/services/houtrotherstel/locatie-config'
import {
  cascadeRijen, bouwLocatiePad, selectieVanLocatie, locatieKeuzeCompleet,
} from '@/lib/houtrotherstel/locatie-boom'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import {
  type RepairRegistration, type RepairPhoto, type RegistratieForm,
  type LocatieBoom, type LocatieWaarde,
} from '@/lib/houtrotherstel/types'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { fotoPubliekeUrl } from '@/lib/houtrotherstel/fotos'
import { useDialogen } from '@/components/ui/dialogen'

/** Eén werkzaamheid in het formulier: gekozen recept + aantal. */
type Werkzaamheid = { recept: Recept; aantal: number }

const fotoUrl = fotoPubliekeUrl

/** Kortere variant-tekst binnen een groep: strip het groepswoord uit de naam. */
function variantLabel(r: Recept): string {
  if (r.groep && r.naam.toLowerCase().startsWith(r.groep.toLowerCase())) {
    const rest = r.naam.slice(r.groep.length).replace(/^[\s\-–—:]+/, '').trim()
    return rest || r.naam
  }
  return r.naam
}

/** Bouwt een recept-vorm uit een opgeslagen werkzaamheden-regel (voor bewerken). */
function receptVanLijn(l: NonNullable<RepairRegistration['lines']>[number]): Recept {
  return {
    id: l.recept_id ?? '',
    code: l.repair_code_snapshot ?? '',
    naam: l.repair_name_snapshot ?? 'Werkzaamheid',
    omschrijving: l.repair_description_snapshot ?? null,
    eenheid: l.unit_snapshot ?? null,
    groep: null,
    uren: Number(l.labor_hours_snapshot ?? 0),
    uurtarief: Number(l.labor_rate_snapshot ?? 0),
    arbeidskosten: Number(l.labor_cost_snapshot ?? 0),
    materiaalkosten: Number(l.material_cost_snapshot ?? 0),
    kostprijs: Number(l.cost_price_snapshot ?? 0),
    margePct: null,
    verkoopprijs: Number(l.sale_price_snapshot ?? 0),
  }
}

/**
 * Houtrot binnen een dossier (mobiel). Registraties hangen aan het dossier.
 * Deze tab verschijnt alleen bij een opdracht-dossier met de toggle
 * `houtrot_registreren` aan.
 *
 * Twee standen in één component (lijst / invoeren). Bedragen worden hier bewust
 * NIET getoond — die zijn voor de projectleider in EVA.
 */
const veld: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-elev)',
  fontSize: 16, // voorkomt inzoomen op iOS
  color: 'var(--fg)', fontFamily: 'inherit',
}
const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#6b757c', marginBottom: 5, display: 'block',
}

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b757c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        {titel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

export default function HoutrotView({ dossierId }: { dossierId: string }) {
  const [registraties, setRegistraties] = useState<RepairRegistration[] | null>(null)
  const [recepten, setRecepten] = useState<Recept[]>([])
  const [boom, setBoom] = useState<LocatieBoom | null>(null)
  const [invoeren, setInvoeren] = useState(false)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const { bevestig } = useDialogen()

  // Cascade-keuze: gekozen knoop-id per diepte. Terugval = vrij tekstveld (lege boom).
  const [gekozen, setGekozen] = useState<string[]>([])
  const [zelfGekozen, setZelfGekozen] = useState(false)
  const [vrijeLocatie, setVrijeLocatie] = useState('')
  /**
   * De opgeslagen locatie van de registratie die wordt bewerkt. Bewust de ruwe waarde
   * bewaren en de hint eruit bérekenen: de boom komt uit een server action en kan later
   * binnenkomen dan het moment waarop je op een registratie tikt. Als vlag-in-state
   * bleef de hint dan onterecht weg — en werd de locatie bij opslaan gewist.
   */
  const [bewerkLocatie, setBewerkLocatie] = useState<LocatieWaarde[]>([])

  const [regDatum, setRegDatum] = useState(new Date().toISOString().slice(0, 10))
  const [werkzaamheden, setWerkzaamheden] = useState<Werkzaamheid[]>([])
  const [keuzeGroep, setKeuzeGroep] = useState('')
  const [keuzeRecept, setKeuzeRecept] = useState('')
  const [keuzeAantal, setKeuzeAantal] = useState('1')
  const [notitie, setNotitie] = useState('')

  // Status: eenvoudige tweestand. false = Geregistreerd (oranje), true = Afgerond (groen).
  const [afgerond, setAfgerond] = useState(false)

  const [voorFoto, setVoorFoto] = useState<File | null>(null)
  const [naFoto, setNaFoto] = useState<File | null>(null)
  const [bestaandeFotos, setBestaandeFotos] = useState<RepairPhoto[]>([])
  const [verwijderdeFotos, setVerwijderdeFotos] = useState<Set<string>>(new Set())

  const laad = useCallback(() => {
    getRegistraties({ dossier_id: dossierId })
      .then(setRegistraties)
      .catch(e => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [dossierId])

  useEffect(() => { laad() }, [laad])
  useEffect(() => {
    getRecepten().then(setRecepten).catch(() => setRecepten([]))
    getLocatieBoom(dossierId).then(setBoom).catch(() => setBoom({ labels: [], nodes: [] }))
  }, [dossierId])

  const boomLaadt = boom === null
  const heeftBoom = !!boom && boom.nodes.length > 0

  // Hint + volledigheid als berekening, niet als state — zie `bewerkLocatie`.
  const vorigeLocatie = bewerkLocatie.map(l => l.waarde).filter(Boolean).join(' · ')
  const oudNietOpBoom = heeftBoom && !!bewerkId && selectieVanLocatie(boom.nodes, bewerkLocatie).length === 0
  const locatieCompleet = heeftBoom
    ? locatieKeuzeCompleet(boom.nodes, gekozen)
    : !!vrijeLocatie.trim()

  // De boom kan ná het openen van het formulier binnenkomen; dan de cascade opnieuw
  // vullen uit de opgeslagen locatie, tenzij de gebruiker zelf al gekozen heeft.
  useEffect(() => {
    if (!boom || zelfGekozen) return
    setGekozen(selectieVanLocatie(boom.nodes, bewerkLocatie))
  }, [boom, zelfGekozen, bewerkLocatie])

  function kiesNiveau(diepte: number, nodeId: string) {
    setZelfGekozen(true)
    setGekozen(prev => [...prev.slice(0, diepte), nodeId].filter(Boolean))
  }

  // Alleen houtrot-recepten (die met een groep) verschijnen in de keuze.
  const groepen = Array.from(new Set(recepten.filter(r => r.groep).map(r => r.groep as string)))
  const receptenInGroep = recepten.filter(r => r.groep === keuzeGroep)

  function leegmaken() {
    setBewerkId(null)
    setGekozen([]); setZelfGekozen(false); setVrijeLocatie(''); setBewerkLocatie([])
    setRegDatum(new Date().toISOString().slice(0, 10))
    setNotitie(''); setWerkzaamheden([]); setKeuzeGroep(''); setKeuzeRecept(''); setKeuzeAantal('1')
    setAfgerond(false)
    setVoorFoto(null); setNaFoto(null); setBestaandeFotos([]); setVerwijderdeFotos(new Set())
  }

  function nieuwe() {
    leegmaken(); setFout(null); setInvoeren(true)
  }

  function bewerken(r: RepairRegistration) {
    setBewerkId(r.id)
    // Alleen de ruwe locatie bewaren; de cascade wordt gevuld door het effect zodra de
    // boom er is, en de hint wordt berekend. Zo maakt het niet uit of de boom al binnen
    // was toen je op de registratie tikte.
    const opgeslagen = (r.locatie ?? []) as LocatieWaarde[]
    setBewerkLocatie(opgeslagen)
    setZelfGekozen(false)
    setGekozen(boom ? selectieVanLocatie(boom.nodes, opgeslagen) : [])
    setVrijeLocatie(opgeslagen[0]?.waarde ?? '')
    setRegDatum(r.registration_date)
    setWerkzaamheden(
      (r.lines ?? [])
        .slice()
        .sort((a, b) => a.volgorde - b.volgorde)
        .map(l => ({ recept: receptVanLijn(l), aantal: Number(l.aantal) })),
    )
    setNotitie(r.notes ?? '')
    setAfgerond(r.status === 'afgerond')
    setKeuzeGroep(''); setKeuzeRecept(''); setKeuzeAantal('1')
    setBestaandeFotos(r.photos ?? [])
    setVerwijderdeFotos(new Set())
    setVoorFoto(null); setNaFoto(null)
    setFout(null)
    setInvoeren(true)
  }

  function werkzaamheidToevoegen() {
    const recept = recepten.find(r => r.id === keuzeRecept)
    const aantal = Math.max(1, Math.round(Number(keuzeAantal.replace(',', '.')) || 0))
    if (!recept || aantal < 1) return
    setWerkzaamheden(prev => {
      const idx = prev.findIndex(w => w.recept.id === recept.id)
      if (idx >= 0) {
        const kopie = [...prev]
        kopie[idx] = { ...kopie[idx], aantal: kopie[idx].aantal + aantal }
        return kopie
      }
      return [...prev, { recept, aantal }]
    })
    setKeuzeRecept(''); setKeuzeAantal('1')
  }

  function werkzaamheidVerwijderen(index: number) {
    setWerkzaamheden(prev => prev.filter((_, i) => i !== index))
  }

  function fotoVerwijderen(id: string) {
    setVerwijderdeFotos(prev => new Set(prev).add(id))
  }

  const zichtbareFotos = bestaandeFotos.filter(p => !verwijderdeFotos.has(p.id))
  const heeftVoorBestaand = zichtbareFotos.some(p => p.photo_type === 'voor')
  const heeftNaBestaand = zichtbareFotos.some(p => p.photo_type === 'na')

  async function opslaan() {
    setBezig(true)
    setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      if (!medewerker) throw new Error('Geen medewerker-koppeling gevonden voor dit account.')
      // Zolang de boom niet binnen is, weten we niet of er een locatie-indeling is;
      // opslaan zou de bestaande locatie met een leeg pad overschrijven.
      if (boomLaadt) throw new Error('De locatie wordt nog geladen. Probeer het over een moment opnieuw.')
      if (!locatieCompleet) {
        throw new Error(heeftBoom ? 'Kies eerst de volledige locatie.' : 'Vul eerst een locatie in.')
      }
      if (werkzaamheden.length === 0) throw new Error('Voeg minstens één werkzaamheid toe.')

      const regels = werkzaamheden.map((w, i) => regelVanRecept(w.recept, w.aantal, i))

      const locatie: LocatieWaarde[] =
        heeftBoom && boom
          ? bouwLocatiePad(boom, gekozen)
          : [{ naam: 'Locatie', waarde: vrijeLocatie.trim() }]

      const teVerwijderen = new Set(verwijderdeFotos)
      if (voorFoto) bestaandeFotos.filter(p => p.photo_type === 'voor').forEach(p => teVerwijderen.add(p.id))
      if (naFoto) bestaandeFotos.filter(p => p.photo_type === 'na').forEach(p => teVerwijderen.add(p.id))

      const form: RegistratieForm = {
        dossier_id: dossierId,
        werkzaamheden: regels,
        locatie,
        registration_date: regDatum,
        notes: notitie || undefined,
        status: afgerond ? 'afgerond' : 'geregistreerd',
        status_handmatig: true,
        control_status: 'niet_gecontroleerd',
      }

      let regId: string
      if (bewerkId) {
        await updateRegistratie(bewerkId, form, medewerker.id)
        regId = bewerkId
      } else {
        regId = (await createRegistratie(form, medewerker.id)).id
      }

      for (const id of teVerwijderen) {
        const p = bestaandeFotos.find(x => x.id === id)
        if (p) await deletePhoto(p.id, p.storage_path).catch(() => null)
      }
      if (voorFoto) await uploadPhoto(regId, await verkleinFoto(voorFoto), 'voor').catch(() => null)
      if (naFoto) await uploadPhoto(regId, await verkleinFoto(naFoto), 'na').catch(() => null)

      terugNaarLijst()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  /** Sluit de invoerstand en haalt de lijst opnieuw op. */
  function terugNaarLijst() {
    leegmaken()
    setInvoeren(false)
    setRegistraties(null)
    laad()
  }

  /**
   * Archiveren: uit de lijst en uit rapportages, maar niets gaat verloren.
   * Terugzetten kan alleen in EVA op de desktop — in het veld is dat geen taak.
   */
  async function archiveren() {
    if (!bewerkId) return
    if (!await bevestig({
      titel: 'Deze registratie archiveren?',
      omschrijving: 'Hij verdwijnt uit de lijst en uit rapportages, maar blijft bewaard.',
      bevestigLabel: 'Archiveren',
    })) return
    setBezig(true)
    setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      if (!medewerker) throw new Error('Geen medewerker-koppeling gevonden voor dit account.')
      await zetArchief(bewerkId, true, medewerker.id)
      terugNaarLijst()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Archiveren mislukt')
    } finally {
      setBezig(false)
    }
  }

  async function verwijderen() {
    if (!bewerkId) return
    if (!await bevestig({
      titel: 'Deze registratie definitief verwijderen?',
      omschrijving: 'Werkzaamheden en foto’s gaan mee. Dit kan niet ongedaan worden gemaakt.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })) return
    setBezig(true)
    setFout(null)
    try {
      const medewerker = await getHuidigeMedewerker()
      await deleteRegistratie(bewerkId, medewerker?.id)
      terugNaarLijst()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally {
      setBezig(false)
    }
  }

  // ── Invoerstand ────────────────────────────────────────────────────────────
  if (invoeren) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {fout && (
            <div style={{ background: '#fdf1f0', border: '1px solid #f0c8c2', color: '#b42318', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
              {fout}
            </div>
          )}

          <Blok titel="Locatie">
            {boom === null ? (
              <div style={{ fontSize: 13, color: '#6b757c' }}>Laden…</div>
            ) : heeftBoom ? (
              <>
              {oudNietOpBoom && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a5b00', borderRadius: 10, padding: '9px 11px', fontSize: 12.5 }}>
                  {vorigeLocatie
                    ? <>Nog niet op de boom geplaatst. Vorige locatie: <strong>{vorigeLocatie}</strong>. Kies hieronder de juiste plek.</>
                    : 'Nog geen locatie. Kies hieronder de juiste plek op de boom.'}
                </div>
              )}
              {cascadeRijen(boom.nodes, gekozen).map(({ diepte, opties }) => (
                <div key={diepte}>
                  <label style={label} htmlFor={`hr-niv-${diepte}`}>{boom.labels[diepte]?.trim() || `Niveau ${diepte + 1}`}</label>
                  <select
                    id={`hr-niv-${diepte}`}
                    style={veld}
                    value={gekozen[diepte] ?? ''}
                    onChange={e => kiesNiveau(diepte, e.target.value)}
                  >
                    <option value="">—</option>
                    {opties.map(o => <option key={o.id} value={o.id}>{o.naam}</option>)}
                  </select>
                </div>
              ))}
              {!locatieCompleet && (
                <div style={{ fontSize: 12, color: '#6b757c' }}>Kies elk niveau; zonder volledige locatie kun je niet opslaan.</div>
              )}
              </>
            ) : (
              <div>
                <label style={label} htmlFor="hr-loc">Locatie</label>
                <input id="hr-loc" style={veld} value={vrijeLocatie}
                  onChange={e => setVrijeLocatie(e.target.value)} placeholder="bijv. Voorgevel, 2e etage" />
              </div>
            )}
          </Blok>

          <Blok titel="Werkzaamheden">
            {werkzaamheden.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {werkzaamheden.map((w, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {w.aantal}× {w.recept.naam}
                      </div>
                      {w.recept.code && <div style={{ fontSize: 11.5, color: '#6b757c' }}>{w.recept.code}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => werkzaamheidVerwijderen(i)}
                      aria-label="Werkzaamheid verwijderen"
                      style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-elev)', color: '#b42318', fontSize: 16, lineHeight: 1, cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Stap 1: soort. Stap 2: variant binnen die soort. */}
            <div>
              <label style={label} htmlFor="hr-groep">Soort</label>
              <select id="hr-groep" style={veld} value={keuzeGroep}
                onChange={e => { setKeuzeGroep(e.target.value); setKeuzeRecept('') }}>
                <option value="">— kies een soort —</option>
                {groepen.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {keuzeGroep && (
              <div>
                <label style={label} htmlFor="hr-variant">Variant</label>
                <select id="hr-variant" style={veld} value={keuzeRecept}
                  onChange={e => setKeuzeRecept(e.target.value)}>
                  <option value="">— kies —</option>
                  {receptenInGroep.map(r => (
                    <option key={r.id} value={r.id}>{variantLabel(r)}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ width: 96 }}>
                <label style={label} htmlFor="hr-aantal">Aantal</label>
                <input
                  id="hr-aantal" type="number" inputMode="numeric" min={1} step={1}
                  style={veld} value={keuzeAantal}
                  onChange={e => setKeuzeAantal(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={werkzaamheidToevoegen}
                disabled={!keuzeRecept}
                style={{
                  flex: 1, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)',
                  background: keuzeRecept ? '#009439' : 'var(--bg-elev)',
                  color: keuzeRecept ? '#fff' : '#9aa4ab',
                  fontSize: 14, fontWeight: 700, cursor: keuzeRecept ? 'pointer' : 'default',
                }}
              >
                Toevoegen
              </button>
            </div>

            <div>
              <label style={label} htmlFor="hr-notitie">Notitie</label>
              <textarea id="hr-notitie" style={{ ...veld, minHeight: 60, resize: 'vertical' }} value={notitie} onChange={e => setNotitie(e.target.value)} />
            </div>
          </Blok>

          <Blok titel="Foto's">
            {zichtbareFotos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {zichtbareFotos.map(p => (
                  <div key={p.id} style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoUrl(p.storage_path)} alt={p.photo_type}
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
                      {p.photo_type}
                    </span>
                    <button type="button" onClick={() => fotoVerwijderen(p.id)} aria-label="Foto verwijderen"
                      style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 'none', background: '#b42318', color: '#fff', fontSize: 13, lineHeight: 1, cursor: 'pointer' }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label style={label} htmlFor="hr-voor">Voor{heeftVoorBestaand && !voorFoto ? ' (vervangen)' : ''}</label>
              <input id="hr-voor" type="file" accept="image/*" capture="environment" style={{ ...veld, padding: 9 }}
                onChange={e => setVoorFoto(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label style={label} htmlFor="hr-na">Na{heeftNaBestaand && !naFoto ? ' (vervangen)' : ''}</label>
              <input id="hr-na" type="file" accept="image/*" capture="environment" style={{ ...veld, padding: 9 }}
                onChange={e => setNaFoto(e.target.files?.[0] ?? null)} />
            </div>
          </Blok>

          <Blok titel="Status">
            {/* Eenvoudige tweestand: oranje = Geregistreerd, groen = Afgerond. */}
            <div style={{ display: 'flex', gap: 8 }}>
              {([false, true] as const).map(waarde => {
                const actief = afgerond === waarde
                const groen = waarde === true
                const kleur = groen ? '#009439' : '#e08600'
                return (
                  <button
                    key={String(waarde)}
                    type="button"
                    onClick={() => setAfgerond(waarde)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      cursor: 'pointer',
                      border: `2px solid ${actief ? kleur : 'var(--border)'}`,
                      background: actief ? kleur : 'var(--bg-elev)',
                      color: actief ? '#fff' : '#6b757c',
                    }}
                  >
                    {groen ? 'Afgerond' : 'Geregistreerd'}
                  </button>
                )
              })}
            </div>
          </Blok>

          {bewerkId && (
            <Blok titel="Deze registratie">
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={archiveren}
                  disabled={bezig}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-elev)', color: '#6b757c',
                    cursor: bezig ? 'default' : 'pointer',
                  }}
                >
                  Archiveren
                </button>
                <button
                  type="button"
                  onClick={verwijderen}
                  disabled={bezig}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                    border: '1px solid #f0c8c2', background: 'var(--bg-elev)', color: '#b42318',
                    cursor: bezig ? 'default' : 'pointer',
                  }}
                >
                  Verwijderen
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: '#6b757c' }}>
                Archiveren haalt de registratie uit de lijst en uit rapportages, maar bewaart hem.
                Verwijderen is definitief.
              </div>
            </Blok>
          )}
        </div>

        <MobielStickyFooter>
          <button
            type="button"
            onClick={() => { setInvoeren(false); setFout(null) }}
            disabled={bezig}
            style={{
              padding: '14px 16px', borderRadius: 12, background: 'var(--bg-elev)', color: '#6b757c',
              border: '1px solid var(--border)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={opslaan}
            disabled={bezig || boomLaadt}
            style={{
              flex: 1, padding: '14px 16px', borderRadius: 12, border: 'none',
              background: bezig || boomLaadt ? '#9aa4ab' : '#009439', color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: bezig || boomLaadt ? 'default' : 'pointer',
            }}
          >
            {bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
        </MobielStickyFooter>
      </div>
    )
  }

  // ── Lijststand ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {fout && (
          <div style={{ color: '#b42318', fontSize: 14, textAlign: 'center', padding: 24 }}>{fout}</div>
        )}
        {!fout && registraties === null && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 24 }}>Laden…</div>
        )}
        {!fout && registraties?.length === 0 && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 32 }}>
            Nog geen houtrotregistraties voor dit dossier.
          </div>
        )}
        {registraties?.map(r => {
          const plaats = (r.locatie ?? []).map(l => l.waarde).filter(Boolean).join(' · ') || 'Geen locatie'
          const fotos = (r.photos ?? []).slice().sort(
            (a, b) => (a.photo_type === 'voor' ? 0 : 1) - (b.photo_type === 'voor' ? 0 : 1))
          const afg = r.status === 'afgerond'
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => bewerken(r)}
              style={{
                textAlign: 'left', padding: '12px 14px', background: 'var(--bg-elev)',
                border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', font: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', minWidth: 0 }}>{plaats}</div>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  flexShrink: 0, padding: '2px 8px', borderRadius: 999,
                  color: afg ? '#0a7a33' : '#9a5b00',
                  background: afg ? '#e6f4ea' : '#fde7cf',
                }}>
                  {afg ? 'Afgerond' : 'Geregistreerd'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b757c', marginTop: 3 }}>
                {r.registration_date}
                {r.repair_name_snapshot ? ` · ${r.repair_name_snapshot}` : ''}
              </div>
              {fotos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {fotos.map(p => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={fotoUrl(p.storage_path)} alt={p.photo_type}
                      style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <MobielStickyFooter>
        <button
          type="button"
          onClick={nieuwe}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
            background: '#009439', color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          Nieuwe registratie
        </button>
      </MobielStickyFooter>
    </div>
  )
}
