'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Check, ChevronRight, Pencil, Stamp } from 'lucide-react'
import { useDialogen } from '@/components/ui/dialogen'
import { fiatteerUren } from '@/app/m/uren/keuren/actions'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import KeurRegelSheet from './KeurRegelSheet'
import type { KeurData, KeurGroep, KeurOnkosten, KeurRegel } from '@/lib/mobiel/keuren'
import { ONKOSTEN_LABEL, VERVOERMIDDEL_LABEL } from '@/lib/uren/onkosten'

const GROEN = '#009439'
const GRIJS = '#6b757c'
const ZACHT = '#9aa4ab'
const ORANJE = '#b85a00'

const uur = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`
const euro = (n: number) =>
  `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** De regels die de teamleider nog niet gezien heeft, in één zin. */
const wachtZin = (n: number) =>
  n === 1
    ? 'Bij 1 regel is de teamleider nog niet langs geweest.'
    : `Bij ${n} regels is de teamleider nog niet langs geweest.`

const datumKort = (iso: string) => {
  try { return format(parseISO(iso), 'EEE d MMM', { locale: nl }) } catch { return iso }
}

/**
 * Mobiel fiatteren van uren (`/m/uren/keuren`).
 *
 * Een werkvoorraad, geen tabel: per project een blok, daaronder de regels die op
 * jouw akkoord wachten. Je vinkt aan wat klopt en fiatteert de selectie in één keer.
 *
 * DE TEAMLEIDER IS HIER DE HOOFDGEBRUIKER, en die werkt altijd op zijn telefoon.
 * Daarom kan hij hier ook bijstellen: een regel met een potloodje opent
 * `KeurRegelSheet` en daar zet hij de uren, de bewakingscode of de opmerking recht
 * vóór hij akkoord geeft. Dat is de hele reden dat de teamleiderstap bestaat.
 *
 * Ná zijn akkoord kan dat niet meer: de regel schuift door naar de projectleider en
 * verdwijnt uit deze lijst. Regels waarop jij de projectleider bent hebben daarom
 * géén potlood — corrigeren in die fase hoort op de computer, bij `/uren`. Dat
 * scherm kan sowieso meer: intrekken, filteren op periode, alle uren van het bedrijf.
 *
 * DE NOODUITGANG. Ben je projectleider, dan staan de regels die nog bij de teamleider
 * liggen hier óók — herkenbaar aan "wacht op teamleider". Zonder dat zou het werk van
 * een ploeg blijven hangen zodra de teamleider met verlof is. Fiatteren daarvan vraagt
 * eerst een bevestiging, en die vraag komt van de server terug (`bevestigingNodig`),
 * niet uit een controle in dit component: zo kan de knop de stap niet per ongeluk
 * overslaan.
 *
 * WIE WAT MAG bepaalt de server. `keurUrenGoed` haalt de meegestuurde regels opnieuw
 * op en toetst ze aan de projectrollen op het dossier; een lijst id's uit dit scherm
 * zegt daar niets over. Dit component mag dus optimistisch zijn zonder dat dat een
 * gat in de afscherming is.
 *
 * Het fiatteren loopt via `fiatteerUren` en niet rechtstreeks via `keurUrenGoed` —
 * zie de toelichting in `app/m/uren/keuren/actions.ts`; rechtstreeks importeren
 * breekt de productiebuild.
 */
export default function KeurenClient({ data }: { data: KeurData }) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [gekozen, setGekozen] = React.useState<Set<number>>(new Set())
  const [afgehandeld, setAfgehandeld] = React.useState<Set<number>>(new Set())
  const [bezig, setBezig] = React.useState(false)
  const [bewerken, setBewerken] = React.useState<KeurRegel | null>(null)
  const [, startTransition] = React.useTransition()

  // Wat er nog op het scherm hoort te staan: gefiatteerde regels verdwijnen meteen,
  // zodat de stapel zichtbaar slinkt terwijl je hem wegwerkt.
  const groepen = React.useMemo(
    () => data.groepen
      .map(g => ({ ...g, regels: g.regels.filter(r => !afgehandeld.has(r.id)) }))
      .filter(g => g.regels.length > 0),
    [data.groepen, afgehandeld],
  )

  const zichtbareIds = React.useMemo(
    () => new Set(groepen.flatMap(g => g.regels.map(r => r.id))),
    [groepen],
  )

  // De selectie mag nooit een regel bevatten die niet meer op het scherm staat —
  // anders telt de knop uren mee die je al gefiatteerd hebt.
  const selectie = React.useMemo(
    () => [...gekozen].filter(id => zichtbareIds.has(id)),
    [gekozen, zichtbareIds],
  )

  const gekozenUren = React.useMemo(() => {
    const set = new Set(selectie)
    return groepen
      .flatMap(g => g.regels)
      .filter(r => set.has(r.id))
      .reduce((s, r) => s + r.uren, 0)
  }, [groepen, selectie])

  const wissel = React.useCallback((id: number) => {
    setGekozen(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const wisselGroep = React.useCallback((groep: KeurGroep) => {
    setGekozen(prev => {
      const n = new Set(prev)
      const allesAan = groep.regels.every(r => n.has(r.id))
      for (const r of groep.regels) {
        if (allesAan) n.delete(r.id)
        else n.add(r.id)
      }
      return n
    })
  }, [])

  async function fiatteer(zonderTeamleider = false) {
    if (!selectie.length || bezig) return
    setBezig(true)
    const r = await fiatteerUren(selectie, zonderTeamleider).catch(() => null)
    setBezig(false)

    if (!r) { toast.error('Bouw7 is niet bereikbaar. Probeer het zo nog eens.'); return }

    // De server houdt de teamleiderstap tegen en vraagt om bevestiging. Zegt de gebruiker ja,
    // dan gaat dezelfde selectie er in één keer doorheen — er is nog niets verwerkt.
    if (!r.ok && 'bevestigingNodig' in r) {
      const namen = r.teamleiders.length
        ? r.teamleiders.join(' en ')
        : 'de teamleider'
      const alles = r.aantalZonderTeamleider === r.totaal
      const ja = await bevestig({
        titel: 'Teamleider overslaan?',
        omschrijving: alles
          ? `${namen} heeft deze ${r.totaal === 1 ? 'urenregel' : `${r.totaal} urenregels`} nog niet nagekeken. Keur je ze nu zelf goed, dan slaat die stap over — bedoeld voor als de teamleider er niet is.`
          : `${r.aantalZonderTeamleider} van de ${r.totaal} regels zijn nog niet door ${namen} nagekeken. Doorgaan slaat die stap voor die regels over.`,
        bevestigLabel: 'Toch goedkeuren',
      })
      if (ja) await fiatteer(true)
      return
    }

    if (!r.ok) { toast.error(r.error); return }

    // Alleen wat écht gelukt is verdwijnt. Bij een deelfout halen we de lijst
    // opnieuw op in plaats van te gokken welke regels het wel haalden — anders zou
    // het scherm melden dat je klaar bent terwijl er uren onaangeraakt bleven.
    if (r.mislukt > 0) {
      toast.error(`${r.mislukt} niet gelukt: ${r.eersteFout ?? 'onbekende fout'}`)
      startTransition(() => router.refresh())
    } else {
      setAfgehandeld(prev => new Set([...prev, ...selectie]))
      toast.success(
        r.wachtOpProjectleider > 0
          ? `${r.verwerkt} geaccordeerd — ${r.wachtOpProjectleider} wacht nog op de projectleider.`
          : r.overgeslagen > 0
            ? `${r.verwerkt} geaccordeerd, waarvan ${r.overgeslagen} zonder de teamleider.`
            : `${r.verwerkt} regel${r.verwerkt === 1 ? '' : 's'} geaccordeerd.`,
      )
    }
    setGekozen(new Set())
  }

  if (data.fout) {
    return <Melding titel="Uren niet opgehaald" tekst={`Bouw7 gaf geen antwoord: ${data.fout}`} />
  }

  if (groepen.length === 0) {
    return (
      <>
        <Melding
          titel="Niets te fiatteren"
          tekst={afgehandeld.size > 0
            ? 'Je hebt alles weggewerkt.'
            : 'Er staan geen uren op jouw akkoord.'}
        />
        <KostenBlok onkosten={data.onkosten} />
      </>
    )
  }

  const totaalRegels = groepen.reduce((s, g) => s + g.regels.length, 0)
  const totaalUren = groepen.reduce((s, g) => s + g.regels.reduce((t, r) => t + r.uren, 0), 0)

  return (
    <>
      {/* flexShrink 0 is hier geen detail: zonder dat knijpt de strook zich in een
          scrollende kolom tot een streepje — dat is in dit project al vaker misgegaan. */}
      <div style={{
        padding: '10px 16px', flexShrink: 0,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        fontSize: 13, color: GRIJS,
      }}>
        {totaalRegels} regel{totaalRegels === 1 ? '' : 's'} · {uur(totaalUren)} op jouw akkoord
        {data.wachtOpTeamleider > 0 && (
          <div style={{ marginTop: 3, color: ZACHT }}>{wachtZin(data.wachtOpTeamleider)}</div>
        )}
      </div>

      <div style={{ padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groepen.map(groep => (
          <Groep
            key={groep.sleutel}
            groep={groep}
            gekozen={gekozen}
            onWissel={wissel}
            onWisselGroep={wisselGroep}
            onBewerk={setBewerken}
          />
        ))}

        <KostenBlok onkosten={data.onkosten} />
      </div>

      <MobielStickyFooter>
        <button
          type="button"
          onClick={() => fiatteer()}
          disabled={selectie.length === 0 || bezig}
          style={{
            flex: 1, minHeight: 48, borderRadius: 12, border: 'none',
            background: selectie.length === 0 || bezig ? '#c9d2d6' : GROEN,
            color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Stamp size={18} strokeWidth={2.2} />
          {bezig
            ? 'Bezig…'
            : selectie.length === 0
              ? 'Kies wat je wilt fiatteren'
              : `Fiatteer ${selectie.length} regel${selectie.length === 1 ? '' : 's'} · ${uur(gekozenUren)}`}
        </button>
      </MobielStickyFooter>

      {bewerken && (
        <KeurRegelSheet
          regel={bewerken}
          onSluit={() => setBewerken(null)}
          // Opnieuw ophalen in plaats van de rij lokaal bijwerken: een correctie gaat
          // naar Bouw7, en dan is de stand daar de waarheid — niet wat dit scherm dacht.
          onKlaar={() => startTransition(() => router.refresh())}
        />
      )}
    </>
  )
}

/* ── Onderdelen ───────────────────────────────────────────────────── */

/**
 * De kosten die je mensen deze periode indienden: parkeren, reiskosten, overig.
 *
 * Bewust alleen-lezen en zonder vinkjes. Een kostenpost hangt aan een weekstaat en niet aan
 * een Bouw7-urenregel, dus er is geen vlag om om te zetten -- het staat er zodat je bij het
 * fiatteren ziet wat er verder op die week geschreven is, met het bonnetje erbij.
 */
function KostenBlok({ onkosten }: { onkosten: KeurOnkosten[] }) {
  if (onkosten.length === 0) return null
  const totaal = onkosten.reduce((s, k) => s + k.bedrag, 0)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--bg-elev)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '11px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'baseline', gap: 8,
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>
          Ingediende kosten
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
          {euro(totaal)}
        </span>
      </div>

      {onkosten.map(k => (
        <div key={k.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', borderTop: '1px solid var(--border)',
        }}>
          {k.bonUrl ? (
            <a href={k.bonUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0, lineHeight: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={k.bonUrl} alt="Bonnetje" style={{
                width: 34, height: 34, objectFit: 'cover',
                borderRadius: 7, border: '1px solid var(--border)',
              }} />
            </a>
          ) : (
            <span style={{ width: 34, flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--fg)' }}>
              {ONKOSTEN_LABEL[k.soort]}
              {k.vervoermiddel ? ` · ${VERVOERMIDDEL_LABEL[k.vervoermiddel]}` : ''}
              {k.km ? ` · ${k.km.toLocaleString('nl-NL')} km` : ''}
            </div>
            <div style={{ fontSize: 11.5, color: ZACHT, marginTop: 1 }}>
              {datumKort(k.datum)} · {k.medewerkerNaam}
              {k.omschrijving ? ` · ${k.omschrijving}` : ''}
            </div>
          </div>

          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {euro(k.bedrag)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** "Daarna nog projectleider" — jouw akkoord is hier niet het laatste woord. */
const badgeStijl: React.CSSProperties = {
  display: 'inline-block', padding: '2px 7px', borderRadius: 6,
  background: 'rgba(184,90,0,.10)', color: ORANJE,
  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
}

function Melding({ titel, tekst }: { titel: string; tekst: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>
        {titel}
      </div>
      <div style={{ fontSize: 13, color: GRIJS, lineHeight: 1.5 }}>{tekst}</div>
      <Link
        href="/m/uren"
        style={{
          display: 'inline-block', marginTop: 20, fontSize: 13,
          fontWeight: 600, color: GROEN, textDecoration: 'none',
        }}
      >
        Naar mijn weekstaat
      </Link>
    </div>
  )
}

function Groep({ groep, gekozen, onWissel, onWisselGroep, onBewerk }: {
  groep: KeurGroep
  gekozen: Set<number>
  onWissel: (id: number) => void
  onWisselGroep: (groep: KeurGroep) => void
  onBewerk: (regel: KeurRegel) => void
}) {
  const allesAan = groep.regels.every(r => gekozen.has(r.id))
  const titel = [groep.projectNummer, groep.projectNaam].filter(Boolean).join(' · ') || 'Zonder project'

  // In welke pet je hier zit. Bijna altijd dezelfde voor het hele project; is hij
  // gemengd (jij bent teamleider én van een deel al akkoord) dan laten we het weg —
  // een label dat voor de helft van de regels niet klopt is erger dan geen label.
  const rol = groep.regels.every(r => r.rol === groep.regels[0].rol) ? groep.regels[0].rol : null

  // "Daarna nog projectleider" geldt vrijwel altijd voor het hele project — de
  // projectleider staat op het dossier, niet op de regel. Eén badge in de kop dus, in
  // plaats van dezelfde zin onder elke naam; alleen in het gemengde geval zakt hij
  // terug naar de regels zelf. Zelfde afweging voor "wacht op teamleider".
  const groepWachtOpPl = groep.regels.every(r => r.wachtDaarnaOpProjectleider)
  const groepWachtOpTl = groep.regels.every(r => r.wachtOpTeamleider)

  return (
    <section style={{
      background: 'var(--bg-elev)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      {/* De kop is de "alles aan/uit"-knop. Dat is op een telefoon de belangrijkste
          handeling: een projectleider keurt meestal een heel project in één keer. */}
      <button
        type="button"
        onClick={() => onWisselGroep(groep)}
        style={{
          width: '100%', textAlign: 'left', border: 'none', fontFamily: 'inherit',
          background: allesAan ? 'rgba(0,148,57,.06)' : 'transparent',
          padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Vinkje aan={allesAan} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{
            display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {titel}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: GRIJS, marginTop: 2 }}>
            {groep.regels.length} regel{groep.regels.length === 1 ? '' : 's'} · {uur(groep.totaalUren)}
            {rol && ` · als ${rol}`}
          </span>
          {groepWachtOpPl && (
            <span style={{ ...badgeStijl, marginTop: 5 }}>Daarna nog projectleider</span>
          )}
          {groepWachtOpTl && (
            <span style={{ ...badgeStijl, marginTop: 5 }}>
              Wacht op {groep.regels[0].teamleiderNaam ?? 'de teamleider'}
            </span>
          )}
        </span>
      </button>

      {groep.regels.map(regel => (
        <Regel
          key={regel.id}
          regel={regel}
          aan={gekozen.has(regel.id)}
          onWissel={onWissel}
          onBewerk={onBewerk}
          toonWachtBadge={!groepWachtOpPl}
          toonTeamleiderBadge={!groepWachtOpTl}
        />
      ))}

      {groep.dossierId && (
        <Link
          href={`/m/dossiers/${groep.dossierId}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)',
            color: GROEN, fontSize: 12, fontWeight: 600, textDecoration: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span>Naar het dossier</span>
          <ChevronRight size={15} strokeWidth={2.4} />
        </Link>
      )}
    </section>
  )
}

/**
 * Eén regel. Twee trefgebieden naast elkaar: het grootste deel selecteert, het
 * potlood rechts opent het bewerkvenster. Bewust geen genest `<button>` in de
 * selectieknop — dat is ongeldige HTML en de binnenste klik zou ook de buitenste
 * afvuren, waardoor je bij elke correctie ongemerkt de selectie omzet.
 */
function Regel({ regel, aan, onWissel, onBewerk, toonWachtBadge, toonTeamleiderBadge }: {
  regel: KeurRegel
  aan: boolean
  onWissel: (id: number) => void
  onBewerk: (regel: KeurRegel) => void
  /** False als de groepskop de badge al draagt; dan zou hij hier alleen ruis zijn. */
  toonWachtBadge: boolean
  toonTeamleiderBadge: boolean
}) {
  return (
    <div
      style={{
        background: aan ? 'rgba(0,148,57,.05)' : 'transparent',
        display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--border)',
      }}
    >
    <button
      type="button"
      onClick={() => onWissel(regel.id)}
      style={{
        flex: 1, minWidth: 0, textAlign: 'left', border: 'none', fontFamily: 'inherit',
        background: 'transparent',
        padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ marginTop: 2 }}><Vinkje aan={aan} /></span>

      {/* minWidth 0 maakt de ellipsis pas mogelijk binnen een flexregel. */}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            minWidth: 0, flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {regel.medewerkerNaam}
          </span>
          <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
            {uur(regel.uren)}
          </span>
        </span>

        <span style={{ display: 'block', fontSize: 12, color: GRIJS, marginTop: 2 }}>
          {datumKort(regel.datum)}
          {regel.uursoort && ` · ${regel.uursoort}`}
          {regel.bewakingscode && ` · ${regel.bewakingscode}`}
        </span>

        {regel.opmerking && (
          <span style={{
            display: 'block', fontSize: 12, color: ZACHT, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {regel.opmerking}
          </span>
        )}

        {toonWachtBadge && regel.wachtDaarnaOpProjectleider && (
          <span style={{ ...badgeStijl, marginTop: 5 }}>Daarna nog projectleider</span>
        )}
        {toonTeamleiderBadge && regel.wachtOpTeamleider && (
          <span style={{ ...badgeStijl, marginTop: 5 }}>
            Wacht op {regel.teamleiderNaam ?? 'de teamleider'}
          </span>
        )}
      </span>
    </button>

    {regel.magBewerken && (
      <button
        type="button"
        onClick={() => onBewerk(regel)}
        aria-label={`Uren van ${regel.medewerkerNaam} bijstellen`}
        style={{
          width: 48, flexShrink: 0, border: 'none', background: 'transparent',
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

function Vinkje({ aan }: { aan: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 6,
        border: aan ? `2px solid ${GROEN}` : '2px solid var(--border)',
        background: aan ? GROEN : 'transparent',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}
    >
      {aan && <Check size={14} strokeWidth={3} />}
    </span>
  )
}
