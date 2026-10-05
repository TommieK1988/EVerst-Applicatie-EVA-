'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import {
  handmatigVanRegel, regelVanHandmatig, valideerHandmatigeRegel, tariefVoorFunctie,
} from '@/lib/houtrotherstel/handmatige-regel'
import HoutrotFotoVak from './HoutrotFotoVak'
import type { RegelCategorie, RegelType, RegistratieRegelForm } from '@/lib/houtrotherstel/types'
import type { HandmatigeStandaarden } from '@/services/houtrotherstel/handmatig'
import {
  veld, label, primaireKnop, secundaireKnop, GRIJS, RAND, TEKST, VLAK, OPPERVLAK, GROEN, ROOD, AMBER,
} from '@/components/mobiel/oplevering/stijl'

/**
 * Handmatige houtrotregel in EVA Mobiel: arbeid of materiaal die niet in de
 * bibliotheek staat, of aanvullend werk dat op locatie blijkt.
 *
 * Bedragen staan hier bewust niet (zie HoutrotView): het uurtarief en de opslag
 * komen op de achtergrond uit de standaardwaarden van het dossier, en kantoor kan
 * ze in EVA bijstellen. Alleen de inkoopprijs mag de monteur invullen — die staat
 * vaak gewoon op de bon.
 */

const TYPES: RegelType[] = ['arbeid', 'materiaal']
const BLAUW = '#1d4e89'

const getal = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))
const invoer = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '' : String(n))

export function HandmatigeRegelFormulier({
  standaarden, start, startFotoUrl, onIngevuld, onOpslaan, onAnnuleer,
}: {
  standaarden: HandmatigeStandaarden | null
  /** Bestaande handmatige regel om te bewerken. */
  start?: RegistratieRegelForm
  startFotoUrl?: string
  /** Meldt of er al iets is ingevuld, zodat de registratie die invoer niet stil laat vallen. */
  onIngevuld?: (ingevuld: boolean) => void
  onOpslaan: (regel: RegistratieRegelForm, foto: File | null, fotoWeg: boolean) => void
  onAnnuleer: () => void
}) {
  const t = useTranslations('houtrot')
  const s = start ? handmatigVanRegel(start) : undefined
  const functies = standaarden?.functies ?? []
  const eenheden = standaarden?.eenheden ?? []

  const [type, setType] = useState<RegelType>(s?.type ?? 'arbeid')
  const [omschrijving, setOmschrijving] = useState(s?.omschrijving ?? '')
  const [categorie, setCategorie] = useState<RegelCategorie>(s?.categorie ?? 'reparatie')
  const [notitie, setNotitie] = useState(s?.notitie ?? '')
  const [functie, setFunctie] = useState(s?.type === 'arbeid' ? s.functie : '')
  const [uren, setUren] = useState(s?.type === 'arbeid' ? invoer(s.uren) : '')
  const [aantal, setAantal] = useState(s?.type === 'materiaal' ? invoer(s.aantal) : '1')
  const [eenheid, setEenheid] = useState(s?.type === 'materiaal' ? s.eenheid : 'st')
  const [inkoop, setInkoop] = useState(s?.type === 'materiaal' && s.inkoopprijs > 0 ? invoer(s.inkoopprijs) : '')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoWeg, setFotoWeg] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const ingevuld = !start && omschrijving.trim() !== ''
  useEffect(() => { onIngevuld?.(ingevuld) }, [ingevuld, onIngevuld])

  // Functienamen komen van kantoor; in een <option> kan geen component, dus hier vertalen.
  const namen = functies.map(f => f.naam)
  const vertaling = useVertalingen(namen)
  const fnaam = (naam: string) => vertaling[namen.indexOf(naam)]?.tekst ?? naam

  function opslaan() {
    if (!omschrijving.trim()) return setFout(t('handmatig.fout.omschrijving'))
    const gedeeld = {
      omschrijving, categorie,
      // Btw kiest kantoor; een nieuwe regel begint op hoog, een bestaande houdt de zijne.
      btw_tarief: s?.btw_tarief ?? 'hoog' as const,
      notitie: notitie.trim() || undefined,
      foto_pad: fotoWeg ? undefined : s?.foto_pad,
    }
    let kandidaat
    if (type === 'arbeid') {
      if (!functie) return setFout(t('handmatig.fout.functie'))
      const u = getal(uren)
      if (!(u > 0)) return setFout(t('handmatig.fout.uren'))
      kandidaat = { type, ...gedeeld, functie, uren: u, ...tariefVoorFunctie(functie, functies, s) }
    } else {
      const a = getal(aantal)
      if (!(a > 0)) return setFout(t('handmatig.fout.aantal'))
      if (!eenheid) return setFout(t('handmatig.fout.eenheid'))
      const prijs = inkoop.trim() === '' ? 0 : getal(inkoop)
      if (!(prijs >= 0)) return setFout(t('handmatig.fout.inkoopprijs'))
      kandidaat = {
        type, ...gedeeld, aantal: a, eenheid, inkoopprijs: prijs,
        opslag_pct: s?.type === 'materiaal' ? s.opslag_pct : (standaarden?.opslagPct ?? 0),
      }
    }
    const uitkomst = valideerHandmatigeRegel(kandidaat)
    if (!uitkomst.ok) return setFout(t('handmatig.fout.ongeldig'))
    onOpslaan(regelVanHandmatig(uitkomst.regel, start?.volgorde ?? 0), foto, fotoWeg)
  }

  const typeKnop = (waarde: RegelType) => {
    const actief = type === waarde
    return (
      <button key={waarde} type="button" onClick={() => { setType(waarde); setFout(null) }}
        style={{
          flex: 1, padding: '11px 12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          border: `2px solid ${actief ? GROEN : RAND}`, background: actief ? GROEN : OPPERVLAK,
          color: actief ? '#fff' : GRIJS, whiteSpace: 'normal',
        }}>
        {t(`handmatig.${waarde}`)}
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: 12,
      background: VLAK, border: `1px solid ${RAND}`, borderRadius: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>
        {start ? t('handmatig.titelBewerken') : t('handmatig.titelNieuw')}
      </div>
      {fout && <div style={{ color: ROOD, fontSize: 13 }}>{fout}</div>}

      <div style={{ display: 'flex', gap: 8 }}>{TYPES.map(typeKnop)}</div>

      <div>
        <label style={label} htmlFor="hm-omschrijving">{t('handmatig.omschrijving')}</label>
        <input id="hm-omschrijving" style={veld} value={omschrijving} onChange={e => setOmschrijving(e.target.value)} />
      </div>

      {type === 'arbeid' ? (
        <>
          <div>
            <label style={label} htmlFor="hm-functie">{t('handmatig.functie')}</label>
            <select id="hm-functie" style={veld} value={functie} onChange={e => setFunctie(e.target.value)}>
              <option value="">{standaarden ? t('handmatig.kiesFunctie') : t('laden')}</option>
              {functie && !namen.includes(functie) && <option value={functie}>{functie}</option>}
              {namen.map(n => <option key={n} value={n}>{fnaam(n)}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="hm-uren">{t('handmatig.uren')}</label>
            <input id="hm-uren" type="text" inputMode="decimal" style={veld} value={uren}
              onChange={e => setUren(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={label} htmlFor="hm-aantal">{t('handmatig.aantal')}</label>
              <input id="hm-aantal" type="text" inputMode="decimal" style={veld} value={aantal}
                onChange={e => setAantal(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label} htmlFor="hm-eenheid">{t('handmatig.eenheid')}</label>
              <select id="hm-eenheid" style={veld} value={eenheid} onChange={e => setEenheid(e.target.value)}>
                {!eenheden.includes(eenheid) && <option value={eenheid}>{eenheid}</option>}
                {eenheden.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={label} htmlFor="hm-inkoop">{t('handmatig.inkoopprijs')}</label>
            <input id="hm-inkoop" type="text" inputMode="decimal" style={veld} value={inkoop}
              onChange={e => setInkoop(e.target.value)} />
            <div style={{ fontSize: 12, color: GRIJS, marginTop: 4 }}>{t('handmatig.inkoopprijsHulp')}</div>
          </div>
        </>
      )}

      <div>
        <label style={label} htmlFor="hm-categorie">{t('handmatig.categorie')}</label>
        <select id="hm-categorie" style={veld} value={categorie}
          onChange={e => setCategorie(e.target.value as RegelCategorie)}>
          <option value="reparatie">{t('handmatig.reparatie')}</option>
          <option value="meerwerk">{t('handmatig.meerwerk')}</option>
        </select>
      </div>

      <div>
        <label style={label} htmlFor="hm-notitie">{t('handmatig.notitie')}</label>
        <textarea id="hm-notitie" style={{ ...veld, minHeight: 56, resize: 'vertical' }} value={notitie}
          onChange={e => setNotitie(e.target.value)} />
      </div>

      <HoutrotFotoVak titel={t('handmatig.foto')}
        huidigeUrl={fotoWeg ? undefined : startFotoUrl}
        nieuw={foto} gewijzigd={!!foto || (fotoWeg && !!startFotoUrl)}
        onKies={setFoto}
        onVerwijder={() => { setFoto(null); setFotoWeg(true) }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onAnnuleer} style={{ ...secundaireKnop, flex: 1, whiteSpace: 'normal' }}>
          {t('handmatig.annuleren')}
        </button>
        <button type="button" onClick={opslaan} style={{ ...primaireKnop, flex: 1, whiteSpace: 'normal' }}>
          {start ? t('handmatig.regelBijwerken') : t('handmatig.regelToevoegen')}
        </button>
      </div>
    </div>
  )
}

/** Eén werkzaamheid in de lijst van het invoerscherm: recept of handmatige regel. */
export function WerkzaamheidRij({
  regel, naam, code, aantal, vast, onBewerk, onVerwijder,
}: {
  /** De opgeslagen of nieuwe regel; bepaalt of hij als handmatig/meerwerk getoond wordt. */
  regel?: RegistratieRegelForm
  naam: string
  code?: string
  aantal: number
  vast: boolean
  onBewerk: () => void
  onVerwijder: () => void
}) {
  const t = useTranslations('houtrot')
  const locale = useDatumLocale()
  const handmatig = regel?.bron === 'handmatig'
  const getalTekst = aantal.toLocaleString(locale, { maximumFractionDigits: 2 })
  const hoeveelheid = !handmatig
    ? null
    : regel?.regel_type === 'arbeid'
      ? t('uren', { uren: getalTekst })
      : t('handmatig.regelAantal', { aantal: getalTekst, eenheid: regel?.unit_snapshot ?? '' })
  const etiket = (tekst: string, kleur: string) => (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color: kleur, border: `1px solid ${kleur}`,
      borderRadius: 999, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{tekst}</span>
  )
  const knop: React.CSSProperties = {
    flexShrink: 0, height: 32, borderRadius: 8, border: `1px solid ${RAND}`,
    background: OPPERVLAK, fontSize: 13, cursor: 'pointer', padding: '0 10px',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
      background: VLAK, border: `1px solid ${RAND}`, borderRadius: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEKST }}>
          {handmatig ? hoeveelheid : t('handmatig.aantalKeer', { aantal: getalTekst })}{' '}
          <VertaalbareTekst tekst={naam} label={false} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3, alignItems: 'center' }}>
          {code && <span style={{ fontSize: 11.5, color: GRIJS }}>{code}</span>}
          {handmatig && etiket(t('handmatig.label'), BLAUW)}
          {regel?.categorie === 'meerwerk' && etiket(t('handmatig.meerwerkKort'), AMBER)}
        </div>
      </div>
      {!vast && handmatig && (
        <button type="button" onClick={onBewerk} style={{ ...knop, color: TEKST }}>{t('handmatig.bewerken')}</button>
      )}
      {!vast && (
        <button type="button" onClick={onVerwijder} aria-label={t('werkzaamheidVerwijderen')}
          style={{ ...knop, width: 32, padding: 0, color: ROOD, fontSize: 16 }}>
          ×
        </button>
      )}
    </div>
  )
}
