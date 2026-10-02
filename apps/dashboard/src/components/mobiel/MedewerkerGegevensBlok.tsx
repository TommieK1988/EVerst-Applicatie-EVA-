'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
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

type T = ReturnType<typeof useTranslations<'profiel.gegevens'>>

/**
 * Sleutel per kenmerklabel uit `lib/medewerker/eigen-gegevens` (`ZICHTBARE_KENMERKEN`).
 * Die lijst levert het Nederlandse label, want hij wordt ook op kantoor gebruikt; hier
 * zoeken we de vertaling erbij. Een onbekend label blijft gewoon staan.
 */
type KenmerkSleutel =
  | 'sleutelnummer' | 'kopienummer' | 'toestel' | 'imei' | 'simkaart'
  | 'kaartnummer' | 'maatschappij' | 'extraInfo'

const KENMERK_SLEUTEL: Record<string, KenmerkSleutel> = {
  Sleutelnummer: 'sleutelnummer',
  Kopienummer: 'kopienummer',
  Toestel: 'toestel',
  IMEI: 'imei',
  Simkaart: 'simkaart',
  Kaartnummer: 'kaartnummer',
  Maatschappij: 'maatschappij',
  'Extra info': 'extraInfo',
}

function kenmerkLabel(t: T, label: string): string {
  const sleutel = KENMERK_SLEUTEL[label]
  return sleutel ? t(`kenmerk.${sleutel}`) : label
}

function typeLabel(t: T, type: BedrijfsmiddelType): string {
  return t(`type.${type}`)
}

/** Korte dagnaam in de taal van de app; 1 = maandag (ISO), zoals `rooster.werkdagen`. */
function dagKort(locale: string, d: number): string {
  // 5 januari 1970 was een maandag; in UTC rekenen houdt het los van de tijdzone.
  const datum = new Date(Date.UTC(1970, 0, 4 + d))
  return datum.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
}

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

/** 'YYYY-MM-DD' → '3 maart 1987' (in de taal van de app). Rekent bewust niet met tijdzones. */
function datum(waarde: string | null, locale: string): string | null {
  if (!waarde) return null
  const [jaar, maand, dag] = waarde.split('-').map(Number)
  if (!jaar || !maand || !dag) return waarde
  return new Date(Date.UTC(jaar, maand - 1, dag)).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/** Postgres levert '07:30:00'; daar wil niemand de seconden van zien. */
function tijd(waarde: string): string {
  return waarde.slice(0, 5)
}

/** [1,2,3,4,5] → 'ma t/m vr'; losse dagen → 'ma, wo, vr'. */
function werkdagenTekst(dagen: number[], t: T, locale: string): string {
  if (dagen.length === 0) return '—'
  const op = [...dagen].sort((a, b) => a - b)
  const aaneengesloten = op.every((d, i) => i === 0 || d === op[i - 1] + 1)
  const label = (d: number) => (d >= 1 && d <= 7 ? dagKort(locale, d) : String(d))
  if (aaneengesloten && op.length > 2) return t('werkdagenReeks', { van: label(op[0]), tot: label(op[op.length - 1]) })
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

/**
 * Een telefoonnummer in vrije tekst: minstens negen cijfers, eventueel met +, spaties,
 * streepjes of haakjes ertussen ("06-12345678", "+31 6 1234 5678").
 */
const TELEFOONNUMMER = /\+?\d[\d\s()-]{7,}\d/g

/**
 * Het noodcontact komt als vrije tekst uit Bouw7 — naam, relatie en nummer door elkaar,
 * soms over meerdere regels. Opsplitsen in losse velden zou bij de helft misgaan, dus
 * de tekst blijft staan zoals de administratie hem invulde en alleen de nummers erin
 * worden aantikbaar. In een noodgeval wil je bellen, niet overtypen.
 */
function NoodcontactTekst({ tekst }: { tekst: string }) {
  const t = useTranslations('profiel.gegevens')
  const delen: React.ReactNode[] = []
  let vanaf = 0
  for (const m of tekst.matchAll(TELEFOONNUMMER)) {
    const start = m.index ?? 0
    if (start > vanaf) delen.push(tekst.slice(vanaf, start))
    const nummer = m[0].trim()
    delen.push(
      <a
        key={start}
        href={`tel:${nummer.replace(/[^\d+]/g, '')}`}
        aria-label={t('noodcontactBellen', { nummer })}
        style={{ color: 'var(--brand-600, #007530)', fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        {nummer}
      </a>,
    )
    vanaf = start + m[0].length
  }
  if (vanaf < tekst.length) delen.push(tekst.slice(vanaf))
  return <span style={{ whiteSpace: 'pre-line' }}>{delen}</span>
}

function LegeStaat({ tekst }: { tekst: string }) {
  return <div style={{ fontSize: 13.5, color: '#6b757c', lineHeight: 1.45 }}>{tekst}</div>
}

/**
 * Tijdvakken als opsomming in de taal van de app ("a en b", "a i b", …), met elk tijdvak
 * heel gehouden. `Intl.ListFormat` kent het voegwoord per taal; wij vullen de delen in.
 */
function Pauzes({ pauzes, locale }: { pauzes: EigenRooster['pauzes']; locale: string }) {
  const vakken = pauzes.map((p) => `${tijd(p.start)}–${tijd(p.eind)}`)
  const delen = new Intl.ListFormat(locale, { type: 'conjunction' }).formatToParts(vakken)
  return (
    <>
      {delen.map((deel, i) =>
        deel.type === 'element'
          ? <Heel key={i}>{deel.value}</Heel>
          : <React.Fragment key={i}>{deel.value}</React.Fragment>,
      )}
    </>
  )
}

function RoosterBlok({ rooster }: { rooster: EigenRooster }) {
  const t = useTranslations('profiel.gegevens')
  const locale = useDatumLocale()
  // Notatie van de taal van de app: de meest voorkomende deeltijdweek is 37,5 uur, en
  // die hoort in het Nederlands niet als "37.50" op het scherm te staan.
  const uren = rooster.contracturen_per_week.toLocaleString(locale, { maximumFractionDigits: 2 })
  return (
    <div style={kaartStijl}>
      <div style={kopStijl}>{t('werkrooster')}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>
        {werkdagenTekst(rooster.werkdagen, t, locale)} · {tijd(rooster.dagstart)}–{tijd(rooster.dageind)}
      </div>
      <div style={{ marginTop: 8 }}>
        <Regel label={t('contracturen')} waarde={t('urenPerWeek', { uren })} />
        <Regel
          label={t('pauze', { aantal: rooster.pauzes.length })}
          waarde={rooster.pauzes.length > 0 ? <Pauzes pauzes={rooster.pauzes} locale={locale} /> : null}
        />
      </div>
    </div>
  )
}

function BedrijfsmiddelRegel({ middel }: { middel: EigenBedrijfsmiddel }) {
  const t = useTranslations('profiel.gegevens')
  const locale = useDatumLocale()
  const details = [
    ...middel.kenmerken.map((k) => `${kenmerkLabel(t, k.label)}: ${k.waarde}`),
    middel.uitgegeven_op ? t('uitgegeven', { datum: datum(middel.uitgegeven_op, locale) ?? '' }) : null,
  ].filter(Boolean)

  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
        {middel.omschrijving || typeLabel(t, middel.type)}
      </div>
      <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 2, lineHeight: 1.45 }}>
        {middel.omschrijving ? `${typeLabel(t, middel.type)}${details.length ? ' · ' : ''}` : ''}
        {details.join(' · ')}
      </div>
    </div>
  )
}

function VcaBlok({ vca }: { vca: NonNullable<EigenGegevens['vca']> }) {
  const t = useTranslations('profiel.gegevens.vca')
  const locale = useDatumLocale()
  // Kleur volgt `bepaalVcaStatus()`, zodat mobiel en het KAM-overzicht niet uiteenlopen.
  const opmaak =
    vca.status === 'verlopen' ? { kleur: '#b42318', rand: '#f0c8c2', tekst: t('vernieuwen') }
    : vca.status === 'verloopt_binnenkort' ? { kleur: '#b54708', rand: '#f5d9b0', tekst: t('verlooptOver', { dagen: vca.dagen_tot_verval ?? 0 }) }
    : vca.status === 'onbekend' ? { kleur: '#6b757c', rand: 'var(--border)', tekst: t('geenEinddatum') }
    : { kleur: '#027a48', rand: '#b7e0c6', tekst: t('geldig') }

  // "Geldig tot" bij een verlopen diploma spreekt zichzelf tegen.
  const kopregel = !vca.geldig_tot ? t('einddatumOnbekend')
    : vca.status === 'verlopen' ? t('verlopenOp', { datum: datum(vca.geldig_tot, locale) ?? '' })
    : t('geldigTot', { datum: datum(vca.geldig_tot, locale) ?? '' })

  return (
    <div style={{ ...kaartStijl, borderColor: opmaak.rand }}>
      <div style={kopStijl}>{t('titel')}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{kopregel}</div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: opmaak.kleur }}>{opmaak.tekst}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Regel label={t('soort')} waarde={vca.soort ? t(`soorten.${vca.soort}`) : null} />
        <Regel label={t('diplomanummer')} waarde={vca.diplomanummer} />
        <Regel label={t('behaaldOp')} waarde={datum(vca.behaald_op, locale)} />
      </div>
    </div>
  )
}

export default function MedewerkerGegevensBlok({ gegevens }: { gegevens: EigenGegevens }) {
  const t = useTranslations('profiel')
  const locale = useDatumLocale()
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
          <div style={{ ...kopStijl, marginBottom: 2 }}>{t('gegevens.persoonlijk')}</div>
          <Regel label={t('gegevens.email')} waarde={gegevens.email} />
          <Regel label={t('gegevens.telefoon')} waarde={gegevens.telefoon} />
          <Regel label={t('gegevens.geboortedatum')} waarde={datum(gegevens.geboortedatum, locale)} />
          <Regel label={t('gegevens.adres')} waarde={adres || null} />
        </div>
      )}

      {gegevens.noodcontact && (
        <div style={kaartStijl}>
          <div style={kopStijl}>{t('gegevens.noodcontact')}</div>
          <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500, lineHeight: 1.5, wordBreak: 'break-word' }}>
            <NoodcontactTekst tekst={gegevens.noodcontact} />
          </div>
        </div>
      )}

      {werk && (
        <div style={kaartStijl}>
          <div style={{ ...kopStijl, marginBottom: 2 }}>{t('gegevens.werk')}</div>
          <Regel label={t('gegevens.functie')} waarde={gegevens.functie} />
          <Regel label={t('gegevens.afdeling')} waarde={gegevens.afdeling} />
          <Regel label={t('gegevens.ploeg')} waarde={gegevens.ploeg} />
          <Regel label={t('gegevens.inDienstSinds')} waarde={datum(gegevens.in_dienst_vanaf, locale)} />
        </div>
      )}

      {gegevens.rooster && <RoosterBlok rooster={gegevens.rooster} />}

      <div style={kaartStijl}>
        <div style={kopStijl}>{t('gegevens.bedrijfsmiddelen')}</div>
        {gegevens.bedrijfsmiddelen.length > 0
          ? gegevens.bedrijfsmiddelen.map((b) => <BedrijfsmiddelRegel key={b.id} middel={b} />)
          : <LegeStaat tekst={t('gegevens.geenBedrijfsmiddelen')} />}
      </div>

      {gegevens.vca
        ? <VcaBlok vca={gegevens.vca} />
        : (
          <div style={kaartStijl}>
            <div style={kopStijl}>{t('gegevens.vca.titel')}</div>
            <LegeStaat tekst={t('gegevens.vca.geen')} />
          </div>
        )}

      {/* Alles hierboven is alleen-lezen. Zonder deze regel gaan mensen zoeken naar
          een bewerkknop die er niet is — en melden ze een fout adres nergens. */}
      <div style={{ fontSize: 12.5, color: '#6b757c', lineHeight: 1.5, padding: '0 4px' }}>
        {t('kloptNiet')}
      </div>
    </>
  )
}
