import React from 'react'
import { VCA_SOORT_LABEL } from '@/lib/kam/vca'
import type { EigenGegevens, EigenBedrijfsmiddel, EigenRooster } from '@/lib/medewerker/eigen-gegevens'
import type { BedrijfsmiddelType } from '@everts/database/platform-types'

/**
 * De alleen-lezen medewerkergegevens op "Mijn gegevens" (EVA Mobiel).
 *
 * Lege velden worden weggelaten in plaats van als streepje getoond. Van de
 * actieve medewerkers heeft bijvoorbeeld maar een deel een ploeg, en een kaart
 * vol streepjes leest als "EVA weet niets van mij".
 *
 * Twee blokken zijn daarop de uitzondering en tonen wél een lege staat: VCA en
 * bedrijfsmiddelen. Daar is de afwezigheid zelf informatie — dat je geen geldig
 * VCA-diploma geregistreerd hebt staan, is precies wat je moet zien.
 */

const TYPE_LABEL: Record<BedrijfsmiddelType, string> = {
  sleutel: 'Sleutel',
  telefoon: 'Telefoon',
  tankpas: 'Tankpas',
  overig: 'Overig',
}

const DAG_KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

const kaartStijl: React.CSSProperties = {
  padding: 16,
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 14,
}

const kopStijl: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#6b757c',
  marginBottom: 10,
}

/** 'YYYY-MM-DD' → '3 maart 1987'. Rekent bewust niet met tijdzones. */
function datum(waarde: string | null): string | null {
  if (!waarde) return null
  const [jaar, maand, dag] = waarde.split('-').map(Number)
  if (!jaar || !maand || !dag) return waarde
  const maanden = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december']
  return `${dag} ${maanden[maand - 1]} ${jaar}`
}

/** Postgres levert '07:30:00'; daar wil niemand de seconden van zien. */
function tijd(waarde: string): string {
  return waarde.slice(0, 5)
}

/** [1,2,3,4,5] → 'ma t/m vr'; losse dagen → 'ma, wo, vr'. */
function werkdagenTekst(dagen: number[]): string {
  if (dagen.length === 0) return '—'
  const op = [...dagen].sort((a, b) => a - b)
  const aaneengesloten = op.every((d, i) => i === 0 || d === op[i - 1] + 1)
  const label = (d: number) => DAG_KORT[d - 1] ?? String(d)
  if (aaneengesloten && op.length > 2) return `${label(op[0])} t/m ${label(op[op.length - 1])}`
  return op.map(label).join(', ')
}

function Regel({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  if (!waarde) return null
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
      {/* 38% en niet meer: op een 375px-scherm houdt de waardekolom dan net genoeg
          breedte voor "10:00–10:15 en 13:00–13:30" en een postcode plus plaats. */}
      <div style={{ fontSize: 13, color: '#6b757c', flex: '0 0 38%' }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
        {waarde}
      </div>
    </div>
  )
}

/**
 * Houdt een waarde die niet middenin mag afbreken bij elkaar — een postcode,
 * een tijdvak. Zonder dit werd "3899 AA" over twee regels verdeeld.
 */
function Heel({ children }: { children: React.ReactNode }) {
  return <span style={{ whiteSpace: 'nowrap' }}>{children}</span>
}

function LegeStaat({ tekst }: { tekst: string }) {
  return <div style={{ fontSize: 13.5, color: '#6b757c', lineHeight: 1.45 }}>{tekst}</div>
}

function RoosterBlok({ rooster }: { rooster: EigenRooster }) {
  // Nederlandse notatie: de meest voorkomende deeltijdweek is 37,5 uur, en die
  // hoort niet als "37.50" op het scherm te staan.
  const uren = rooster.contracturen_per_week.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
  return (
    <div style={kaartStijl}>
      <div style={kopStijl}>Werkrooster</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>
        {werkdagenTekst(rooster.werkdagen)} · {tijd(rooster.dagstart)}–{tijd(rooster.dageind)}
      </div>
      <div style={{ marginTop: 8 }}>
        <Regel label="Contracturen" waarde={`${uren} uur per week`} />
        <Regel
          label={rooster.pauzes.length === 1 ? 'Pauze' : 'Pauzes'}
          waarde={rooster.pauzes.length > 0
            ? rooster.pauzes.map((p, i) => (
                <React.Fragment key={`${p.start}-${p.eind}`}>
                  {i > 0 && ' en '}
                  <Heel>{tijd(p.start)}–{tijd(p.eind)}</Heel>
                </React.Fragment>
              ))
            : null}
        />
      </div>
    </div>
  )
}

function BedrijfsmiddelRegel({ middel }: { middel: EigenBedrijfsmiddel }) {
  const details = [
    ...middel.kenmerken.map((k) => `${k.label}: ${k.waarde}`),
    middel.uitgegeven_op ? `Uitgegeven ${datum(middel.uitgegeven_op)}` : null,
  ].filter(Boolean)

  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
        {middel.omschrijving || TYPE_LABEL[middel.type]}
      </div>
      <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 2, lineHeight: 1.45 }}>
        {middel.omschrijving ? `${TYPE_LABEL[middel.type]}${details.length ? ' · ' : ''}` : ''}
        {details.join(' · ')}
      </div>
    </div>
  )
}

function VcaBlok({ vca }: { vca: NonNullable<EigenGegevens['vca']> }) {
  // Kleur volgt `bepaalVcaStatus()`, zodat mobiel en het KAM-overzicht niet uiteenlopen.
  const opmaak =
    vca.status === 'verlopen' ? { kleur: '#b42318', rand: '#f0c8c2', tekst: 'Vernieuwen nodig' }
    : vca.status === 'verloopt_binnenkort' ? { kleur: '#b54708', rand: '#f5d9b0', tekst: `Verloopt over ${vca.dagen_tot_verval} dagen` }
    : vca.status === 'onbekend' ? { kleur: '#6b757c', rand: 'var(--border)', tekst: 'Geen einddatum bekend' }
    : { kleur: '#027a48', rand: '#b7e0c6', tekst: 'Geldig' }

  // "Geldig tot" bij een verlopen diploma spreekt zichzelf tegen.
  const kopregel = !vca.geldig_tot ? 'Einddatum onbekend'
    : vca.status === 'verlopen' ? `Verlopen op ${datum(vca.geldig_tot)}`
    : `Geldig tot ${datum(vca.geldig_tot)}`

  return (
    <div style={{ ...kaartStijl, borderColor: opmaak.rand }}>
      <div style={kopStijl}>VCA-diploma</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{kopregel}</div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: opmaak.kleur }}>{opmaak.tekst}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Regel label="Soort" waarde={vca.soort ? VCA_SOORT_LABEL[vca.soort] : null} />
        <Regel label="Diplomanummer" waarde={vca.diplomanummer} />
        <Regel label="Behaald op" waarde={datum(vca.behaald_op)} />
      </div>
    </div>
  )
}

export default function MedewerkerGegevensBlok({ gegevens }: { gegevens: EigenGegevens }) {
  const woonplaatsregel = [gegevens.adres_postcode, gegevens.adres_plaats].filter(Boolean)
  // Twee regels, zoals op een envelop: straat boven, postcode en plaats eronder.
  // Als één string brak de postcode middenin af op een smal scherm.
  const adres = (gegevens.adres_straat || woonplaatsregel.length > 0) ? (
    <>
      {gegevens.adres_straat && <div>{gegevens.adres_straat}</div>}
      {woonplaatsregel.length > 0 && (
        <div>
          <Heel>{gegevens.adres_postcode}</Heel>
          {gegevens.adres_postcode && gegevens.adres_plaats ? '  ' : ''}
          {gegevens.adres_plaats}
        </div>
      )}
    </>
  ) : null

  const persoonlijk = [gegevens.email, gegevens.telefoon, gegevens.geboortedatum, adres].some(Boolean)
  const werk = [gegevens.functie, gegevens.afdeling, gegevens.ploeg, gegevens.in_dienst_vanaf].some(Boolean)

  return (
    <>
      {persoonlijk && (
        <div style={kaartStijl}>
          <div style={{ ...kopStijl, marginBottom: 2 }}>Persoonlijk</div>
          <Regel label="E-mail" waarde={gegevens.email} />
          <Regel label="Telefoon" waarde={gegevens.telefoon} />
          <Regel label="Geboortedatum" waarde={datum(gegevens.geboortedatum)} />
          <Regel label="Adres" waarde={adres || null} />
        </div>
      )}

      {werk && (
        <div style={kaartStijl}>
          <div style={{ ...kopStijl, marginBottom: 2 }}>Werk</div>
          <Regel label="Functie" waarde={gegevens.functie} />
          <Regel label="Afdeling" waarde={gegevens.afdeling} />
          <Regel label="Ploeg" waarde={gegevens.ploeg} />
          <Regel label="In dienst sinds" waarde={datum(gegevens.in_dienst_vanaf)} />
        </div>
      )}

      {gegevens.rooster && <RoosterBlok rooster={gegevens.rooster} />}

      <div style={kaartStijl}>
        <div style={kopStijl}>Bedrijfsmiddelen</div>
        {gegevens.bedrijfsmiddelen.length > 0
          ? gegevens.bedrijfsmiddelen.map((b) => <BedrijfsmiddelRegel key={b.id} middel={b} />)
          : <LegeStaat tekst="Er staan geen sleutels, telefoons of tankpassen op jouw naam." />}
      </div>

      {gegevens.vca
        ? <VcaBlok vca={gegevens.vca} />
        : (
          <div style={kaartStijl}>
            <div style={kopStijl}>VCA-diploma</div>
            <LegeStaat tekst="Er is geen VCA-diploma geregistreerd. Heb je er wel een? Geef het door aan KAM, dan wordt het vastgelegd." />
          </div>
        )}

      {/* Alles hierboven is alleen-lezen. Zonder deze regel gaan mensen zoeken naar
          een bewerkknop die er niet is — en melden ze een fout adres nergens. */}
      <div style={{ fontSize: 12.5, color: '#6b757c', lineHeight: 1.5, padding: '0 4px' }}>
        Klopt er iets niet? Geef het door aan de administratie; zij passen het aan.
      </div>
    </>
  )
}
