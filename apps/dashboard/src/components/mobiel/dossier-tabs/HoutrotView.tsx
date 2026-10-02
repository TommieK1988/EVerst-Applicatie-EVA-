'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import {
  getRegistraties, createRegistratie, updateRegistratie, uploadPhoto, deletePhoto,
  regelVanRecept, uploadRegelFoto,
} from '@/services/houtrotherstel/registraties'
import { getHandmatigeStandaarden, type HandmatigeStandaarden } from '@/services/houtrotherstel/handmatig'
import { HandmatigeRegelFormulier, WerkzaamheidRij } from './HoutrotHandmatigMobiel'
import { getRecepten, type Recept } from '@/services/houtrotherstel/recepten'
import { getHuidigeMedewerker } from '@/services/houtrotherstel/identiteit'
import { getLocatieBoom } from '@/services/houtrotherstel/locatie-config'
import {
  cascadeRijen, bouwLocatiePad, selectieVanLocatie, locatieKeuzeCompleet,
} from '@/lib/houtrotherstel/locatie-boom'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import {
  type RepairRegistration, type RepairPhoto, type RegistratieForm, type RegistratieRegelForm,
  type LocatieBoom, type LocatieWaarde, type FotoType,
} from '@/lib/houtrotherstel/types'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { fotoPubliekeUrl, FOTO_VOLGORDE } from '@/lib/houtrotherstel/fotos'
import { registratieUren } from '@/lib/houtrotherstel/bedragen'
import { regelVanLijn } from '@/lib/houtrotherstel/handmatige-regel'
import { formatDateTime } from '@/lib/houtrotherstel/utils'

/**
 * Eén werkzaamheid in het formulier: gekozen recept + aantal. `opgeslagen` is de
 * volledige regel (uit de database, of een nieuwe handmatige regel). Opslaan vervangt
 * alle regels; zonder dit veld zou een handmatige regel bij elke bewerking zijn bron en
 * categorie kwijtraken. `foto` is een nog te uploaden foto bij een handmatige regel.
 */
type Werkzaamheid = { recept: Recept; aantal: number; opgeslagen?: RegistratieRegelForm; foto?: File | null }

/** Keuze in de lijst Soort die het invoerblok voor handmatige regels opent. */
const HANDMATIG = '__handmatig__'

/** Recept-vorm van een handmatige regel: alleen naam en aantal worden ervan gebruikt. */
function receptVanRegel(r: RegistratieRegelForm): Recept {
  return {
    id: '', code: '', naam: r.repair_name_snapshot ?? '', omschrijving: null, eenheid: r.unit_snapshot ?? null,
    groep: null, uren: 0, uurtarief: 0, arbeidskosten: 0, materiaalkosten: 0, kostprijs: 0, margePct: null, verkoopprijs: 0,
  }
}

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

const vet: React.CSSProperties = { color: 'var(--fg)', fontWeight: 600 }
const KLEUR_AFGEROND = '#009439'
const KLEUR_GEREGISTREERD = '#e08600'

/** Uitleg waarom er (nog) niet geregistreerd kan worden. */
function GeenBoomMelding() {
  const t = useTranslations('houtrot')
  return (
    <div style={{
      background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a5b00',
      borderRadius: 12, padding: '11px 13px', fontSize: 13, lineHeight: 1.5,
    }}>
      {t('geenBoom')}
    </div>
  )
}

/**
 * Eén vierkante fototegel op een overzichtskaart. Voor en na staan altijd naast
 * elkaar, ook als er nog geen na-foto is — anders schuift de na-foto op de plek
 * van de voor-foto en zie je in één oogopslag niet meer wat wat is.
 */
function FotoTegel({ foto, soort }: { foto?: RepairPhoto; soort: FotoType }) {
  const t = useTranslations('houtrot')
  const etiket = t(`fotoSoort.${soort}`)
  return (
    <div style={{
      position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden',
      border: foto ? '1px solid var(--border)' : '1px dashed var(--border)',
      background: foto ? '#0e1114' : 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl(foto.storage_path)} alt={etiket}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: 11.5, color: '#9aa4ab' }}>{t(`geenFoto.${soort}`)}</span>
      )}
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '3px 0',
        background: foto ? 'rgba(0,0,0,0.55)' : 'transparent',
        color: foto ? '#fff' : '#9aa4ab',
        fontSize: 10, fontWeight: 700, textAlign: 'center',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {etiket}
      </span>
    </div>
  )
}

/** "1,75" — het opgetelde tijdnorm-totaal van een registratie; "uur" erachter via de vertaling. */
function urenGetal(uren: number, locale: string): string {
  return uren.toLocaleString(locale, { maximumFractionDigits: 2 })
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
  const t = useTranslations('houtrot')
  const locale = useDatumLocale()
  const [registraties, setRegistraties] = useState<RepairRegistration[] | null>(null)
  const [recepten, setRecepten] = useState<Recept[]>([])
  const [boom, setBoom] = useState<LocatieBoom | null>(null)
  const [invoeren, setInvoeren] = useState(false)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  // Cascade-keuze: gekozen knoop-id per diepte. Zonder locatieboom kan er in de app
  // niet geregistreerd worden — de projectleider richt de locaties eerst in.
  const [gekozen, setGekozen] = useState<string[]>([])
  const [zelfGekozen, setZelfGekozen] = useState(false)
  /** Herkomst van de geopende registratie: wie maakte hem, wie bewerkte hem het laatst. */
  const [herkomst, setHerkomst] = useState<{
    maker: string | null; gemaaktOp: string
    bewerker: string | null; bewerktOp: string
  } | null>(null)
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
  // Handmatige regels: soort "Handmatig" opent het invoerblok. `bewerkIndex` = welke
  // regel wordt bewerkt; `handmatigTeller` geeft na elke toegevoegde regel een leeg blok;
  // `handmatigIngevuld` voorkomt dat half ingevulde invoer bij opslaan stil wegvalt.
  const [bewerkIndex, setBewerkIndex] = useState<number | null>(null)
  const [handmatigTeller, setHandmatigTeller] = useState(0)
  const [handmatigIngevuld, setHandmatigIngevuld] = useState(false)
  const [standaarden, setStandaarden] = useState<HandmatigeStandaarden | null>(null)
  // Gefactureerd op kantoor: de werkzaamheden liggen vast (de server dwingt dat ook af).
  const [vast, setVast] = useState(false)

  // Status: eenvoudige tweestand. false = Geregistreerd (oranje), true = Afgerond (groen).
  const [afgerond, setAfgerond] = useState(false)

  const [voorFoto, setVoorFoto] = useState<File | null>(null)
  const [naFoto, setNaFoto] = useState<File | null>(null)
  const [bestaandeFotos, setBestaandeFotos] = useState<RepairPhoto[]>([])
  const [verwijderdeFotos, setVerwijderdeFotos] = useState<Set<string>>(new Set())

  const laad = useCallback(() => {
    getRegistraties({ dossier_id: dossierId })
      .then(setRegistraties)
      .catch(e => setFout(e instanceof Error ? e.message : t('fout.ladenMislukt')))
  }, [dossierId, t])

  useEffect(() => { laad() }, [laad])
  useEffect(() => {
    getRecepten().then(setRecepten).catch(() => setRecepten([]))
    getLocatieBoom(dossierId).then(setBoom).catch(() => setBoom({ labels: [], nodes: [] }))
    getHandmatigeStandaarden(dossierId).then(setStandaarden)
      .catch(() => setStandaarden({ functies: [], opslagPct: 0, eenheden: ['st', 'uur'] }))
  }, [dossierId])

  const boomLaadt = boom === null
  const heeftBoom = !!boom && boom.nodes.length > 0

  // Afgeleid, niet als state — zie `bewerkLocatie`.
  const gekozenLocatie = bewerkLocatie.map(l => l.waarde).filter(Boolean).join(' · ')
  /**
   * Staat de locatie al vast? Bij een bestaande registratie met een locatie is die
   * keuze klaar: hij wordt als tekstregel getoond en bij opslaan ongemoeid gelaten.
   * Corrigeren gebeurt in EVA op de desktop — in het veld is dat geen taak, en zo
   * kan een verkeerde tik de locatie ook niet stilletjes verzetten.
   */
  const locatieVast = !!bewerkId && !!gekozenLocatie
  // Bestaande registratie zónder locatie (van vóór de locatieboom): die moet nog wél.
  const oudNietOpBoom = heeftBoom && !!bewerkId && !locatieVast
  const locatieCompleet = locatieVast || (heeftBoom && locatieKeuzeCompleet(boom.nodes, gekozen))

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

  // Namen uit de reparatiebibliotheek en de locatieboom komen van kantoor. In een <option>
  // kan geen component, dus hier in één keer vertalen en per tekst opzoeken.
  const cascade = boom && heeftBoom ? cascadeRijen(boom.nodes, gekozen) : []
  const bibliotheekTeksten = [
    ...groepen, ...receptenInGroep.map(variantLabel),
    ...cascade.flatMap(c => c.opties.map(o => o.naam)),
    ...(boom?.labels ?? []).map(l => l?.trim() ?? ''),
  ]
  const vertalingen = useVertalingen(bibliotheekTeksten)
  const vertaald = new Map(bibliotheekTeksten.map((tekst, i) => [tekst, vertalingen[i]?.tekst ?? tekst]))
  const vt = (tekst: string) => vertaald.get(tekst) ?? tekst

  function leegmaken() {
    setBewerkId(null); setHerkomst(null)
    setGekozen([]); setZelfGekozen(false); setBewerkLocatie([])
    setRegDatum(new Date().toISOString().slice(0, 10))
    setNotitie(''); setWerkzaamheden([]); setKeuzeGroep(''); setKeuzeRecept(''); setKeuzeAantal('1')
    setBewerkIndex(null); setHandmatigIngevuld(false); setVast(false)
    setAfgerond(false)
    setVoorFoto(null); setNaFoto(null); setBestaandeFotos([]); setVerwijderdeFotos(new Set())
  }

  function nieuwe() {
    if (!heeftBoom) return
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
    setHerkomst({
      maker: r.medewerker_naam ?? null, gemaaktOp: r.created_at,
      bewerker: r.bijgewerkt_door_naam ?? null, bewerktOp: r.updated_at,
    })
    setRegDatum(r.registration_date)
    setWerkzaamheden(
      (r.lines ?? [])
        .slice()
        .sort((a, b) => a.volgorde - b.volgorde)
        .map(l => ({ recept: receptVanLijn(l), aantal: Number(l.aantal), opgeslagen: regelVanLijn(l) })),
    )
    setNotitie(r.notes ?? '')
    setBewerkIndex(null); setHandmatigIngevuld(false); setVast(!!r.gefactureerd_op)
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

  function bewaarHandmatig(regel: RegistratieRegelForm, foto: File | null, fotoWeg: boolean) {
    const nieuw = (vorige?: Werkzaamheid): Werkzaamheid => ({
      recept: receptVanRegel(regel), aantal: regel.aantal, opgeslagen: regel,
      foto: foto ?? (fotoWeg ? null : vorige?.foto),
    })
    setWerkzaamheden(prev => {
      if (bewerkIndex == null) return [...prev, nieuw()]
      const kopie = [...prev]; kopie[bewerkIndex] = nieuw(kopie[bewerkIndex]); return kopie
    })
    // Soort blijft op Handmatig met een leeg blok: zo voeg je de volgende regel direct toe.
    setBewerkIndex(null); setHandmatigIngevuld(false); setHandmatigTeller(n => n + 1)
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
      if (!medewerker) throw new Error(t('fout.geenMedewerker'))
      // Zolang de boom niet binnen is, weten we niet of er een locatie-indeling is;
      // opslaan zou de bestaande locatie met een leeg pad overschrijven.
      if (boomLaadt) throw new Error(t('fout.locatieLaadt'))
      if (!locatieCompleet) throw new Error(t('fout.kiesLocatie'))
      if (werkzaamheden.length === 0) throw new Error(t('fout.minstensEen'))

      if (bewerkIndex != null || handmatigIngevuld) throw new Error(t('handmatig.fout.afronden'))

      // Nieuwe regelfoto's eerst uploaden: hun pad gaat in de regel mee de database in.
      const regels: RegistratieRegelForm[] = []
      for (const [i, w] of werkzaamheden.entries()) {
        const basis = w.opgeslagen
          ? { ...w.opgeslagen, aantal: w.aantal, volgorde: i }
          : regelVanRecept(w.recept, w.aantal, i)
        const foto_pad = w.foto ? await uploadRegelFoto(dossierId, await verkleinFoto(w.foto)) : basis.foto_pad
        regels.push({ ...basis, foto_pad })
      }

      // Een vastgezette locatie gaat er letterlijk weer in — niet opnieuw uit de boom
      // opbouwen, anders verliest een registratie zijn plek zodra de projectleider de
      // boom verbouwt of de knoop op inactief zet.
      let locatie: LocatieWaarde[]
      if (locatieVast) locatie = bewerkLocatie
      else if (heeftBoom && boom) locatie = bouwLocatiePad(boom, gekozen)
      else throw new Error(t('geenBoom'))

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
      setFout(e instanceof Error ? e.message : t('fout.opslaanMislukt'))
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

          {locatieVast && (
            <div style={{
              background: 'var(--bg-elev)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '11px 14px',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#6b757c', textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 3,
              }}>
                {t('locatie')}
              </div>
              <VertaalbareTekst tekst={gekozenLocatie} as="div" style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }} />
            </div>
          )}

          <Blok titel={t('fotos')}>
            {/* Groot en over de volle breedte: in het veld wil je de schade zien, niet
                een duimnagel. `contain` in plaats van `cover` zodat er niets wegvalt. */}
            {zichtbareFotos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {zichtbareFotos.map(p => (
                  <div key={p.id} style={{ position: 'relative' }}>
                    <a href={fotoUrl(p.storage_path)} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoUrl(p.storage_path)} alt={t(`fotoSoort.${p.photo_type}`)}
                        style={{
                          display: 'block', width: '100%', maxHeight: '50vh', objectFit: 'contain',
                          background: '#0e1114', borderRadius: 12, border: '1px solid var(--border)',
                        }} />
                    </a>
                    <span style={{
                      position: 'absolute', top: 8, left: 8, padding: '3px 9px', borderRadius: 999,
                      background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {t(`fotoSoort.${p.photo_type}`)}
                    </span>
                    <button type="button" onClick={() => fotoVerwijderen(p.id)} aria-label={t('fotoVerwijderen')}
                      style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, border: 'none', background: 'rgba(180,35,24,0.92)', color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer' }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label style={label} htmlFor="hr-voor">{heeftVoorBestaand && !voorFoto ? t('fotoVervangen', { soort: t('fotoSoort.voor') }) : t('fotoSoort.voor')}</label>
              <input id="hr-voor" type="file" accept="image/*" capture="environment" style={{ ...veld, padding: 9 }}
                onChange={e => setVoorFoto(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label style={label} htmlFor="hr-na">{heeftNaBestaand && !naFoto ? t('fotoVervangen', { soort: t('fotoSoort.na') }) : t('fotoSoort.na')}</label>
              <input id="hr-na" type="file" accept="image/*" capture="environment" style={{ ...veld, padding: 9 }}
                onChange={e => setNaFoto(e.target.files?.[0] ?? null)} />
            </div>
          </Blok>

          {/* Alleen te kiezen zolang de locatie nog niet vaststaat; anders staat hij
              als tekstregel bovenaan. */}
          {!locatieVast && (
          <Blok titel={t('locatie')}>
            {boom === null ? (
              <div style={{ fontSize: 13, color: '#6b757c' }}>{t('laden')}</div>
            ) : heeftBoom ? (
              <>
              {oudNietOpBoom && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a5b00', borderRadius: 10, padding: '9px 11px', fontSize: 12.5 }}>
                  {t('geenLocatieNog')}
                </div>
              )}
              {cascade.map(({ diepte, opties }) => (
                <div key={diepte}>
                  <label style={label} htmlFor={`hr-niv-${diepte}`}>{boom.labels[diepte]?.trim() ? vt(boom.labels[diepte].trim()) : t('niveau', { nummer: diepte + 1 })}</label>
                  <select
                    id={`hr-niv-${diepte}`}
                    style={veld}
                    value={gekozen[diepte] ?? ''}
                    onChange={e => kiesNiveau(diepte, e.target.value)}
                  >
                    <option value="">—</option>
                    {opties.map(o => <option key={o.id} value={o.id}>{vt(o.naam)}</option>)}
                  </select>
                </div>
              ))}
              {!locatieCompleet && (
                <div style={{ fontSize: 12, color: '#6b757c' }}>{t('kiesElkNiveau')}</div>
              )}
              </>
            ) : (
              <GeenBoomMelding />
            )}
          </Blok>
          )}

          <Blok titel={t('werkzaamheden')}>
            {werkzaamheden.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {werkzaamheden.map((w, i) => (
                  <WerkzaamheidRij key={i} regel={w.opgeslagen} naam={w.recept.naam} code={w.recept.code}
                    aantal={w.aantal} vast={vast}
                    onBewerk={() => { setBewerkIndex(i); setKeuzeGroep(HANDMATIG); setKeuzeRecept('') }}
                    onVerwijder={() => werkzaamheidVerwijderen(i)} />
                ))}
              </div>
            )}
            {vast && <div style={{ fontSize: 13, color: '#6b757c' }}>{t('handmatig.gefactureerd')}</div>}

            {!vast && (<>
            {/* Stap 1: soort (of Handmatig). Stap 2: variant binnen die soort, of het
                invoerblok voor arbeid en materiaal. */}
            <div>
              <label style={label} htmlFor="hr-groep">{t('soort')}</label>
              <select id="hr-groep" style={veld} value={keuzeGroep}
                onChange={e => {
                  setKeuzeGroep(e.target.value); setKeuzeRecept('')
                  setBewerkIndex(null); setHandmatigIngevuld(false)
                }}>
                <option value="">{t('kiesSoort')}</option>
                {groepen.map(g => <option key={g} value={g}>{vt(g)}</option>)}
                <option value={HANDMATIG}>{t('handmatig.soortOptie')}</option>
              </select>
            </div>
            {keuzeGroep === HANDMATIG ? (
              <HandmatigeRegelFormulier
                key={`${bewerkIndex ?? 'nieuw'}-${handmatigTeller}`}
                standaarden={standaarden}
                start={bewerkIndex != null ? werkzaamheden[bewerkIndex]?.opgeslagen : undefined}
                startFotoUrl={bewerkIndex != null && werkzaamheden[bewerkIndex]?.opgeslagen?.foto_pad
                  ? fotoUrl(werkzaamheden[bewerkIndex].opgeslagen!.foto_pad!) : undefined}
                onIngevuld={setHandmatigIngevuld}
                onOpslaan={bewaarHandmatig}
                onAnnuleer={() => { setBewerkIndex(null); setHandmatigIngevuld(false); setKeuzeGroep('') }}
              />
            ) : (<>
            {keuzeGroep && (
              <div>
                <label style={label} htmlFor="hr-variant">{t('variant')}</label>
                <select id="hr-variant" style={veld} value={keuzeRecept}
                  onChange={e => setKeuzeRecept(e.target.value)}>
                  <option value="">{t('kies')}</option>
                  {receptenInGroep.map(r => (
                    <option key={r.id} value={r.id}>{vt(variantLabel(r))}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ width: 96 }}>
                <label style={label} htmlFor="hr-aantal">{t('aantal')}</label>
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
                {t('toevoegen')}
              </button>
            </div>
            </>)}
            </>)}

            <div>
              <label style={label} htmlFor="hr-notitie">{t('notitie')}</label>
              <textarea id="hr-notitie" style={{ ...veld, minHeight: 60, resize: 'vertical' }} value={notitie} onChange={e => setNotitie(e.target.value)} />
            </div>
          </Blok>

          <Blok titel={t('status')}>
            {/* Eenvoudige tweestand: oranje = Geregistreerd, groen = Afgerond. */}
            <div style={{ display: 'flex', gap: 8 }}>
              {([false, true] as const).map(waarde => {
                const actief = afgerond === waarde
                const groen = waarde === true
                const kleur = groen ? KLEUR_AFGEROND : KLEUR_GEREGISTREERD
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
                    {groen ? t('afgerond') : t('geregistreerd')}
                  </button>
                )
              })}
            </div>
          </Blok>

          {/* Helemaal onderaan, want het is bijvangst: wie deze registratie maakte
              en wie er het laatst aan werkte. Archiveren en verwijderen kan alleen
              in EVA op de desktop — in het veld is dat geen taak. */}
          {herkomst && (
            <div style={{ fontSize: 11.5, color: '#8b949a', lineHeight: 1.6, padding: '2px 2px 4px' }}>
              <div>{t('aangemaaktDoor', { naam: herkomst.maker || t('onbekend'), moment: formatDateTime(herkomst.gemaaktOp) })}</div>
              <div>
                {t('laatstBewerktDoor', {
                  naam: herkomst.bewerker || herkomst.maker || t('onbekend'),
                  moment: formatDateTime(herkomst.bewerktOp),
                })}
              </div>
            </div>
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
            {t('annuleren')}
          </button>
          <button
            type="button"
            onClick={opslaan}
            disabled={bezig || boomLaadt || !locatieCompleet}
            style={{
              flex: 1, padding: '14px 16px', borderRadius: 12, border: 'none',
              background: bezig || boomLaadt || !locatieCompleet ? '#9aa4ab' : '#009439', color: '#fff',
              fontSize: 16, fontWeight: 700,
              cursor: bezig || boomLaadt || !locatieCompleet ? 'default' : 'pointer',
            }}
          >
            {bezig ? t('opslaanBezig') : t('opslaan')}
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
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 24 }}>{t('laden')}</div>
        )}
        {!fout && !boomLaadt && !heeftBoom && <GeenBoomMelding />}
        {!fout && registraties?.length === 0 && heeftBoom && (
          <div style={{ color: '#6b757c', fontSize: 14, textAlign: 'center', padding: 32 }}>
            {t('geenRegistraties')}
          </div>
        )}
        {registraties?.map(r => {
          const plaats = (r.locatie ?? []).map(l => l.waarde).filter(Boolean).join(' · ')
          const fotos = r.photos ?? []
          const voor = fotos.find(p => p.photo_type === 'voor')
          const na = fotos.find(p => p.photo_type === 'na')
          const overig = fotos
            .filter(p => p.photo_type !== 'voor' && p.photo_type !== 'na')
            .sort((a, b) => (FOTO_VOLGORDE[a.photo_type] ?? 9) - (FOTO_VOLGORDE[b.photo_type] ?? 9))
          const afg = r.status === 'afgerond'
          const uren = registratieUren(r)
           
          const tijdnorm = t.rich('tijdnorm', {
            uren: t('uren', { uren: urenGetal(uren, locale) }),
            b: (stuk) => <strong style={vet}>{stuk}</strong>,
          })
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
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', minWidth: 0 }}>
                  {plaats ? <VertaalbareTekst tekst={plaats} label={false} /> : t('geenLocatie')}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  flexShrink: 0, padding: '2px 8px', borderRadius: 999,
                  color: afg ? '#0a7a33' : '#9a5b00',
                  background: afg ? '#e6f4ea' : '#fde7cf',
                }}>
                  {afg ? t('afgerond') : t('geregistreerd')}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b757c', marginTop: 3 }}>
                {r.registration_date}
                {r.repair_name_snapshot && <> · <VertaalbareTekst tekst={r.repair_name_snapshot} label={false} /></>}
              </div>
              {uren > 0 && (
                <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>
                  {tijdnorm}
                </div>
              )}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10,
              }}>
                <FotoTegel foto={voor} soort="voor" />
                <FotoTegel foto={na} soort="na" />
                {overig.map(p => <FotoTegel key={p.id} foto={p} soort={p.photo_type} />)}
              </div>
            </button>
          )
        })}
      </div>

      <MobielStickyFooter>
        <button
          type="button"
          onClick={nieuwe}
          disabled={!heeftBoom}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
            background: heeftBoom ? '#009439' : '#c8ced2', color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: heeftBoom ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {boomLaadt ? t('laden') : heeftBoom ? t('nieuweRegistratie') : t('wachtOpLocaties')}
        </button>
      </MobielStickyFooter>
    </div>
  )
}
