'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, parseISO, type Locale } from 'date-fns'
import toast from 'react-hot-toast'
import { Pencil, Stamp } from 'lucide-react'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useDialogen } from '@/components/ui/dialogen'
import { fiatteerUren } from '@/app/m/uren/keuren/actions'
import KeurRegelSheet from './KeurRegelSheet'
import BlokCodeSheet from './BlokCodeSheet'
import type { KeurCodeBlok, KeurData, KeurRegel, KeurWeek } from '@/lib/mobiel/keuren'
import { VERSCHIL_DREMPEL_UREN, type DagVergelijking } from '@/lib/uren/types'
import { useDateFnsLocale } from './datumOpmaak'
import { GRIJS, GROEN, KostenBlok, Melding, ORANJE, Vinkje, Waarschuwing, ZACHT } from './KeurenOnderdelen'

const GEEL_VLAK = 'rgba(184,90,0,.08)'

/** Getal met 1–2 decimalen in de taal van de app; de eenheid zet de aanroeper erbij. */
const uurKort = (n: number, locale: string) =>
  n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 })

const datumKort = (iso: string, locale: Locale) => {
  try { return format(parseISO(iso), 'EEE d MMM', { locale }) } catch { return iso }
}
/** "ma 8" — de dagkolom van de weekstaat; kort genoeg om links smal te blijven. */
const dagKort = (iso: string, locale: Locale) => {
  try { return format(parseISO(iso), 'EEEEEE d', { locale }) } catch { return iso }
}
const weekLabel = (week: KeurWeek, locale: Locale) => {
  try {
    const start = parseISO(week.weekStart)
    const eind = new Date(start)
    eind.setDate(eind.getDate() + 4)
    return `${format(start, 'd', { locale })}–${format(eind, 'd MMM', { locale })}`
  } catch { return week.weekStart }
}

/**
 * Mobiel fiatteren van uren (`/m/uren/keuren`).
 *
 * JE KEURT EEN WEEK, NIET EEN REGEL. Per medewerker per week één kaart met de dagen eronder;
 * de knop onderin de kaart fiatteert die week in één keer. De vinkjes rechts zijn er voor de
 * uitzondering — een dag die je er nog even uit wilt houden — en staan daarom standaard áán.
 * Zo is de normale weg één tik en blijft afwijken mogelijk.
 *
 * DE BEWAKINGSCODE STAAT IN DE KOP. Een week heeft meestal één code voor alle vijf de dagen;
 * die per rij herhalen maakt juist de afwijkende dag onzichtbaar. De kop toont dus de
 * dossier+code-verdeling met de uren erachter, en tikken op een blok verplaatst álle uren van
 * dat blok in één handeling. Pas als een week meer dan één blok heeft dragen de dagrijen de
 * code ook zelf (`toonCodePerRegel`).
 *
 * GEWERKTE UREN ZONDER CODE BLOKKEREN. Die regels kleuren oranje en hun vinkje staat uit; de
 * knop vertelt hoeveel er nog gecodeerd moet worden. Je kunt er wel omheen door de regel uit
 * te vinken — dan keur je de rest van de week goed en blijft die ene staan. Verlof en ATV
 * horen geen code te hebben en worden nooit gemarkeerd.
 *
 * DE TEAMLEIDER IS HIER DE HOOFDGEBRUIKER, en die werkt altijd op zijn telefoon. Daarom kan hij
 * hier ook bijstellen: het potloodje opent `KeurRegelSheet`. Ná zijn akkoord kan dat niet meer —
 * de regel schuift door naar de projectleider en verdwijnt uit deze lijst. Regels waarop jij de
 * projectleider bent hebben daarom géén potlood; corrigeren hoort dan op de computer thuis.
 *
 * CONTEXTREGELS. Uren uit dezelfde week die bij iemand anders liggen staan er grijs bij, met
 * "bij <naam>". Zonder die rijen zou een week van 38,5 uur als 24 uur op het scherm staan en
 * zou je een halve week goedkeuren in de veronderstelling dat het de hele was.
 *
 * WIE WAT MAG bepaalt de server. `keurUrenGoed` haalt de meegestuurde regels opnieuw op en
 * toetst ze aan de routering; een lijst id's uit dit scherm zegt daar niets over. Dit component
 * mag dus optimistisch zijn zonder dat dat een gat in de afscherming is.
 *
 * Het fiatteren loopt via `fiatteerUren` en niet rechtstreeks via `keurUrenGoed` — zie de
 * toelichting in `app/m/uren/keuren/actions.ts`; rechtstreeks importeren breekt de
 * productiebuild.
 */
export default function KeurenClient({ data }: { data: KeurData }) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [afgehandeld, setAfgehandeld] = React.useState<Set<number>>(new Set())
  // Uitgevinkt: alles staat standaard aan, dus we houden bij wat je er JUIST uit haalde.
  // Andersom zou elke nieuwe week leeg beginnen en is de normale weg ineens vijf tikken.
  const [uit, setUit] = React.useState<Set<number>>(new Set())
  const [bezigWeek, setBezigWeek] = React.useState<string | null>(null)
  const [bewerken, setBewerken] = React.useState<KeurRegel | null>(null)
  const [hercoderen, setHercoderen] = React.useState<KeurCodeBlok | null>(null)
  const [, startTransition] = React.useTransition()

  // Wat er nog op het scherm hoort te staan: gefiatteerde regels verdwijnen meteen, zodat de
  // stapel zichtbaar slinkt terwijl je hem wegwerkt. Een week waarvan alleen nog contextregels
  // over zijn valt weg — daar is voor mij niets meer te doen.
  const weken = React.useMemo(
    () => data.weken
      .map(w => {
        const regels = w.regels.filter(r => !afgehandeld.has(r.id))
        const mijn = regels.filter(r => r.magKeuren)
        return {
          ...w,
          regels,
          mijnRegels: mijn.length,
          mijnUren: rond(mijn.reduce((s, r) => s + r.uren, 0)),
          totaalUren: rond(regels.reduce((s, r) => s + r.uren, 0)),
          ontbrekendeCodes: mijn.filter(r => r.codeOntbreekt).length,
        }
      })
      .filter(w => w.mijnRegels > 0),
    [data.weken, afgehandeld],
  )

  /** De regels van één week die nu daadwerkelijk gefiatteerd zouden worden. */
  const selectieVan = React.useCallback(
    (week: KeurWeek) => week.regels.filter(r => r.magKeuren && !uit.has(r.id)),
    [uit],
  )

  const wissel = React.useCallback((id: number) => {
    setUit(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const fiatteerWeek = React.useCallback(async (week: KeurWeek, zonderTeamleider = false) => {
    const selectie = selectieVan(week).map(r => r.id)
    if (!selectie.length || bezigWeek) return

    setBezigWeek(week.sleutel)
    const r = await fiatteerUren(selectie, zonderTeamleider).catch(() => null)
    setBezigWeek(null)

    if (!r) { toast.error(t('keuren.bouw7Onbereikbaar')); return }

    // De server houdt de teamleiderstap tegen en vraagt om bevestiging. Zegt de gebruiker ja,
    // dan gaat dezelfde selectie er in één keer doorheen — er is nog niets verwerkt.
    if (!r.ok && 'bevestigingNodig' in r) {
      const namen = r.teamleiders.length
        ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(r.teamleiders)
        : t('keuren.deTeamleider')
      const alles = r.aantalZonderTeamleider === r.totaal
      const ja = await bevestig({
        titel: t('keuren.overslaanTitel'),
        omschrijving: alles
          ? t('keuren.overslaanAlles', { namen, aantal: r.totaal })
          : t('keuren.overslaanDeel', { aantal: r.aantalZonderTeamleider, totaal: r.totaal, namen }),
        bevestigLabel: t('keuren.tochGoedkeuren'),
      })
      if (ja) await fiatteerWeek(week, true)
      return
    }

    if (!r.ok) { toast.error(r.error); return }

    // Alleen wat écht gelukt is verdwijnt. Bij een deelfout halen we de lijst opnieuw op in
    // plaats van te gokken welke regels het wel haalden — anders zou het scherm melden dat je
    // klaar bent terwijl er uren onaangeraakt bleven.
    if (r.mislukt > 0) {
      toast.error(t('keuren.nietGelukt', { aantal: r.mislukt, fout: r.eersteFout ?? t('keuren.onbekendeFout') }))
      startTransition(() => router.refresh())
      return
    }

    setAfgehandeld(prev => new Set([...prev, ...selectie]))
    toast.success(
      r.wachtOpProjectleider > 0
        ? t('keuren.akkoordWachtPl', { week: week.weekNr })
        : r.overgeslagen > 0
          ? t('keuren.akkoordOvergeslagen', { week: week.weekNr, aantal: r.overgeslagen })
          : t('keuren.akkoord', { week: week.weekNr, naam: week.medewerkerNaam }),
    )
  }, [bevestig, bezigWeek, router, selectieVan, t, locale])

  if (data.fout) {
    return <Melding titel={t('keuren.nietOpgehaald')} tekst={t('keuren.bouw7GeenAntwoord', { fout: data.fout })} />
  }

  if (weken.length === 0) {
    return (
      <>
        <Melding
          titel={t('keuren.nietsTeFiatteren')}
          tekst={afgehandeld.size > 0
            ? t('keuren.allesWeggewerkt')
            : t('keuren.geenUrenOpAkkoord')}
        />
        <KostenBlok onkosten={data.onkosten} />
      </>
    )
  }

  const openUren = rond(weken.reduce((s, w) => s + w.mijnUren, 0))
  const ontbreekt = weken.reduce((s, w) => s + w.ontbrekendeCodes, 0)

  return (
    <>
      {/* flexShrink 0 is hier geen detail: zonder dat knijpt de strook zich in een
          scrollende kolom tot een streepje — dat is in dit project al vaker misgegaan. */}
      <div style={{
        padding: '10px 16px', flexShrink: 0,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        fontSize: 13, color: GRIJS,
      }}>
        {t('keuren.samenvatting', {
          weken: weken.length,
          uren: openUren.toLocaleString(locale, { maximumFractionDigits: 2 }),
        })}
        {ontbreekt > 0 && (
          <div style={{ marginTop: 3, color: ORANJE, fontWeight: 600 }}>
            {t('keuren.missenCode', { aantal: ontbreekt })}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {weken.map(week => (
          <Week
            key={week.sleutel}
            week={week}
            selectie={selectieVan(week)}
            bezig={bezigWeek === week.sleutel}
            geblokkeerd={bezigWeek !== null}
            onWissel={wissel}
            onBewerk={setBewerken}
            onHercodeer={setHercoderen}
            onFiatteer={() => fiatteerWeek(week)}
          />
        ))}

        <KostenBlok onkosten={data.onkosten} />
      </div>

      {bewerken && (
        <KeurRegelSheet
          regel={bewerken}
          onSluit={() => setBewerken(null)}
          // Opnieuw ophalen in plaats van de rij lokaal bijwerken: een correctie gaat
          // naar Bouw7, en dan is de stand daar de waarheid — niet wat dit scherm dacht.
          onKlaar={() => startTransition(() => router.refresh())}
        />
      )}

      {hercoderen && (
        <BlokCodeSheet
          blok={hercoderen}
          onSluit={() => setHercoderen(null)}
          onKlaar={() => startTransition(() => router.refresh())}
        />
      )}
    </>
  )
}

const rond = (n: number) => Math.round(n * 100) / 100

/* ── Onderdelen ───────────────────────────────────────────────────── */

/**
 * Eén medewerker, één week: de kop met de codeverdeling, de dagen eronder, en de knop die
 * de week afhandelt.
 */
function Week({ week, selectie, bezig, geblokkeerd, onWissel, onBewerk, onHercodeer, onFiatteer }: {
  week: KeurWeek
  selectie: KeurRegel[]
  bezig: boolean
  /** Er loopt al een andere week; dan blijven de knoppen hier uit tot die klaar is. */
  geblokkeerd: boolean
  onWissel: (id: number) => void
  onBewerk: (regel: KeurRegel) => void
  onHercodeer: (blok: KeurCodeBlok) => void
  onFiatteer: () => void
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const dfLocale = useDateFnsLocale()
  const gekozen = new Set(selectie.map(r => r.id))
  const urenInSelectie = rond(selectie.reduce((s, r) => s + r.uren, 0))
  // Blokkeren op de SELECTIE en niet op de week: vink je de ongecodeerde regel uit, dan keur je
  // de rest gewoon goed en blijft die ene staan. Dat is vaak precies wat je wilt.
  const ongecodeerd = selectie.filter(r => r.codeOntbreekt).length
  const deelVanWeek = week.mijnRegels < week.regels.length

  // Bijna altijd dezelfde pet voor de hele week; is hij gemengd, dan laten we het label weg —
  // een tekst die voor de helft van de regels niet klopt is erger dan geen tekst.
  const mijn = week.regels.filter(r => r.magKeuren)
  const rol = mijn.every(r => r.rol === mijn[0].rol) ? mijn[0].rol : null

  return (
    <section style={{
      background: 'var(--bg-elev)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{
        padding: '11px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'baseline', gap: 8,
      }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{
            display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {week.medewerkerNaam}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: GRIJS, marginTop: 2 }}>
            {t('keuren.weekRegel', { week: week.weekNr, periode: weekLabel(week, dfLocale) })}
            {rol && ` · ${t(`keuren.rol.${rol}`)}`}
          </span>
        </span>
        <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 700, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {t('eenheid.urenKort', { uren: uurKort(week.totaalUren, locale) })}
        </span>
      </div>

      {week.blokken.length > 0 && (
        <div style={{ padding: '9px 12px 10px', background: 'rgba(0,0,0,.015)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: ZACHT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {t('keuren.geboektOp')}
          </div>
          {week.blokken.map(blok => (
            <CodeBlok key={blok.sleutel} blok={blok} onHercodeer={onHercodeer} />
          ))}
        </div>
      )}

      {week.regels.map((regel, i) => (
        <React.Fragment key={regel.id}>
          {/* Boven de eerste regel van elke dag: hoe lang stond de auto op het werk. */}
          {week.regels[i - 1]?.datum !== regel.datum && week.dagen[regel.datum] && (
            <DagAanwezig datum={regel.datum} d={week.dagen[regel.datum]} />
          )}
          <DagRij
            regel={regel}
            aan={gekozen.has(regel.id)}
            toonCode={week.toonCodePerRegel}
            onWissel={onWissel}
            onBewerk={onBewerk}
          />
        </React.Fragment>
      ))}

      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={onFiatteer}
          disabled={bezig || geblokkeerd || selectie.length === 0 || ongecodeerd > 0}
          style={{
            width: '100%', minHeight: 46, borderRadius: 11, border: 'none',
            background: bezig || selectie.length === 0 || ongecodeerd > 0 ? '#c9d2d6' : GROEN,
            color: '#fff', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Stamp size={17} strokeWidth={2.2} />
          {bezig
            ? t('knop.bezig')
            : selectie.length === 0
              ? t('keuren.nietsAangevinkt')
              : selectie.length === week.mijnRegels
                ? t(deelVanWeek ? 'keuren.mijnDeelAkkoord' : 'keuren.weekAkkoord', { uren: uurKort(urenInSelectie, locale) })
                : t('keuren.dagenSelectie', {
                    aantal: selectie.length, totaal: week.mijnRegels, uren: uurKort(urenInSelectie, locale),
                  })}
        </button>

        {ongecodeerd > 0 && (
          <div style={{ marginTop: 7, fontSize: 12, color: ORANJE, textAlign: 'center', lineHeight: 1.45 }}>
            {t('keuren.eerstCoderen', { aantal: ongecodeerd })}
          </div>
        )}
        {deelVanWeek && ongecodeerd === 0 && (
          <div style={{ marginTop: 7, fontSize: 11.5, color: ZACHT, textAlign: 'center', lineHeight: 1.45 }}>
            {t('keuren.grijzeRegels')}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Eén dossier+code-regel in de kop. Tikken opent het hercodeervenster voor álle uren van dit
 * blok — dat is de reden dat de kop bestaat: een week staat meestal vijf dagen op dezelfde
 * code, dus een verkeerde code is één fout en hoort één handeling te zijn.
 */
function CodeBlok({ blok, onHercodeer }: {
  blok: KeurCodeBlok
  onHercodeer: (blok: KeurCodeBlok) => void
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const magHercoderen = blok.regelIds.length > 0 && !!blok.dossierId
  // Projectnummer blijft zoals het is; de naam komt van kantoor en gaat door de vertaler.
  const titel = blok.projectNummer || blok.projectNaam ? (
    <>
      {blok.projectNummer}{blok.projectNummer && blok.projectNaam ? ' ' : ''}
      {blok.projectNaam && <VertaalbareTekst tekst={blok.projectNaam} label={false} />}
    </>
  ) : t('keuren.zonderProject')

  const inhoud = (
    <>
      <span style={{
        flexShrink: 0, padding: '2px 7px', borderRadius: 6,
        fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        background: blok.ontbreekt ? GEEL_VLAK : 'rgba(0,148,57,.10)',
        color: blok.ontbreekt ? ORANJE : GROEN,
      }}>
        {blok.code ?? t('keuren.geenCode')}
      </span>
      <span style={{
        minWidth: 0, flex: 1, fontSize: 12.5, color: 'var(--fg)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {titel}
      </span>
      <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
        {t('eenheid.urenKort', { uren: uurKort(blok.uren, locale) })}
      </span>
      {magHercoderen && <Pencil size={14} strokeWidth={2} style={{ flexShrink: 0, color: ZACHT }} />}
    </>
  )

  if (!magHercoderen) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>{inhoud}</div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onHercodeer(blok)}
      aria-label={t('keuren.codeAanpassen', { uren: blok.uren.toLocaleString(locale, { maximumFractionDigits: 2 }) })}
      style={{
        width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {inhoud}
    </button>
  )
}

/**
 * Aanwezig tegenover geboekt voor één dag, als dunne balk boven de dagrijen.
 *
 * Aanwezig komt uit de autoritten (aankomst op het werk tot vertrek, min de roosterpauze);
 * geboekt is álles van die dag, ook wat bij een andere beoordelaar ligt. Een verschil boven het
 * half uur kleurt oranje. Het is een vraag, geen oordeel: meerijden of een dag zonder auto geeft
 * ook een verschil. Zonder bruikbare ritten staat er een streepje met de reden, nooit "0 u".
 */
function DagAanwezig({ datum, d }: { datum: string; d: DagVergelijking }) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const dfLocale = useDateFnsLocale()
  // Eén decimaal: de ritten meten op de minuut, maar 7,32 u suggereert een precisie die de
  // meetlat (de auto, niet de persoon) niet heeft.
  const u1 = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const b = (c: React.ReactNode) => <b style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{c}</b>
  const leeg = '—'
  const aanwezig = d.aanwezigMinuten != null ? t('eenheid.urenKort', { uren: u1(d.aanwezigMinuten / 60) }) : leeg
  const geboekt = d.geboektUren != null ? t('eenheid.urenKort', { uren: u1(d.geboektUren) }) : leeg
  const opvallend = d.verschilUren != null && Math.abs(d.verschilUren) > VERSCHIL_DREMPEL_UREN
  const verschil = d.verschilUren == null ? null
    : t('eenheid.urenKort', { uren: `${d.verschilUren > 0 ? '+' : d.verschilUren < 0 ? '−' : ''}${u1(Math.abs(d.verschilUren))}` })
  // Alleen de eerste zin: de volledige uitleg is voor de desktop-tooltip, hier moet het passen.
  const reden = d.geenVenster?.split('. ')[0].replace(/\.$/, '')

  return (
    <div style={{
      padding: '6px 12px', borderTop: '1px solid var(--border)',
      background: opvallend ? GEEL_VLAK : 'rgba(0,0,0,.015)',
      fontSize: 11.5, color: GRIJS, lineHeight: 1.45,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{dagKort(datum, dfLocale)}</span>
        <span>
          {/* eslint-disable-next-line i18next/no-literal-string -- t.rich is de vertaalfunctie */}
          {t.rich('keuren.aanwezig', { waarde: aanwezig, b })}
          {d.aankomst && d.vertrek && ` (${d.aankomst}–${d.vertrek})`}
        </span>
        <span>
          {/* eslint-disable-next-line i18next/no-literal-string -- t.rich is de vertaalfunctie */}
          {t.rich('keuren.geboekt', { waarde: geboekt, b })}
        </span>
        {verschil && (
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: opvallend ? ORANJE : GRIJS, fontVariantNumeric: 'tabular-nums' }}>
            {verschil}
          </span>
        )}
      </div>
      {/* De reden is een vaste Nederlandse zin uit de urenmodule (ook op kantoor in gebruik). */}
      {reden && <VertaalbareTekst as="div" tekst={reden} label={false} style={{ fontSize: 11, color: ZACHT }} />}
    </div>
  )
}

/**
 * Eén dag uit de weekstaat. Twee trefgebieden naast elkaar: het grootste deel vinkt aan of uit,
 * het potlood rechts opent het bewerkvenster. Bewust geen genest `<button>` in de selectieknop —
 * dat is ongeldige HTML en de binnenste klik zou ook de buitenste afvuren, waardoor je bij elke
 * correctie ongemerkt de selectie omzet.
 */
function DagRij({ regel, aan, toonCode, onWissel, onBewerk }: {
  regel: KeurRegel
  aan: boolean
  /** De week heeft meer dan één code; dan draagt de rij hem ook. */
  toonCode: boolean
  onWissel: (id: number) => void
  onBewerk: (regel: KeurRegel) => void
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const dfLocale = useDateFnsLocale()
  const grond = !regel.magKeuren ? 'rgba(0,0,0,.02)'
    : regel.codeOntbreekt ? GEEL_VLAK
    : aan ? 'rgba(0,148,57,.05)'
    : 'transparent'

  // De uursoort komt van kantoor en gaat door de vertaler; nummer en code blijven zoals ze zijn.
  const codeDeel = toonCode
    ? [regel.projectNummer, regel.bewakingscode ?? t('keuren.geenCode')].filter(Boolean).join(' · ')
    : ''

  const inhoud = (
    <>
      <span style={{
        width: 42, flexShrink: 0, fontSize: 12, color: regel.codeOntbreekt ? ORANJE : GRIJS,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {dagKort(regel.datum, dfLocale)}
      </span>

      {/* minWidth 0 maakt de ellipsis pas mogelijk binnen een flexregel. */}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          display: 'block', fontSize: 13, color: regel.magKeuren ? 'var(--fg)' : GRIJS,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {codeDeel}
          {codeDeel && regel.uursoort ? ' · ' : ''}
          {regel.uursoort
            ? <VertaalbareTekst tekst={regel.uursoort} label={false} />
            : !codeDeel && t('keuren.urenFallback')}
        </span>
        {regel.codeOntbreekt && (
          <span style={{ display: 'block', fontSize: 11, color: ORANJE, marginTop: 1 }}>
            {t('keuren.geenBewakingscode')}
          </span>
        )}
        {!regel.magKeuren && (
          <span style={{ display: 'block', fontSize: 11, color: ZACHT, marginTop: 1 }}>
            {t('keuren.bij', { naam: regel.ligtBij ?? t('keuren.niemand') })}
          </span>
        )}
        {regel.wachtDaarnaOpProjectleider && (
          <span style={{ display: 'block', fontSize: 11, color: ORANJE, marginTop: 1 }}>
            {t('keuren.daarnaPl')}
          </span>
        )}
        {regel.wachtOpTeamleider && (
          <span style={{ display: 'block', fontSize: 11, color: ORANJE, marginTop: 1 }}>
            {t('keuren.wachtOp', { naam: regel.teamleiderNaam ?? t('keuren.deTeamleider') })}
          </span>
        )}
        {regel.opmerking && (
          <span style={{
            display: 'block', fontSize: 11.5, color: ZACHT, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {regel.opmerking}
          </span>
        )}
      </span>

      <span style={{
        flexShrink: 0, fontSize: 14, fontWeight: 700,
        color: regel.magKeuren ? 'var(--fg)' : GRIJS, fontVariantNumeric: 'tabular-nums',
      }}>
        {uurKort(regel.uren, locale)}
      </span>
    </>
  )

  return (
    <div style={{
      background: grond, display: 'flex', alignItems: 'stretch',
      borderTop: '1px solid var(--border)',
    }}>
      {regel.magKeuren ? (
        <button
          type="button"
          onClick={() => onWissel(regel.id)}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', border: 'none', fontFamily: 'inherit',
            background: 'transparent', padding: '10px 12px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {inhoud}
          <span style={{ flexShrink: 0 }}>
            {regel.codeOntbreekt && !aan
              ? <Waarschuwing />
              : <Vinkje aan={aan} />}
          </span>
        </button>
      ) : (
        <div style={{
          flex: 1, minWidth: 0, padding: '10px 12px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          {inhoud}
          <span style={{ width: 22, flexShrink: 0 }} />
        </div>
      )}

      {regel.magBewerken && (
        <button
          type="button"
          onClick={() => onBewerk(regel)}
          aria-label={t('keuren.bijstellen', { datum: datumKort(regel.datum, dfLocale) })}
          style={{
            width: 46, flexShrink: 0, border: 'none', background: 'transparent',
            borderLeft: '1px solid var(--border)',
            color: GRIJS, display: 'grid', placeItems: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Pencil size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
