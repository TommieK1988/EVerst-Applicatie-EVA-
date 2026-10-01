'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useVertaling } from '@/components/vertalen/useVertaling'
import type {
  KwaliteitAfwijking,
  KwaliteitControlepunt,
  KwaliteitErnst,
  KwaliteitFoto,
  KwaliteitResultaat,
  KwaliteitResultaatStatus,
} from '@everts/database/kwaliteit-types'
import {
  bepaalEis, beoordeel, eenheidLabel, eisOmschrijving, fotoVerplicht,
  levertAfwijkingOp, toegestaneStatussen,
} from '@/lib/kwaliteit/regels'
import { bewaarResultaat, voegBevindingToe, verwijderBevinding, updateBevinding } from '@/lib/kwaliteit/inspecties'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import FotoStrook, { type StrookFoto } from './FotoStrook'
import LocatieKiezer from './LocatieKiezer'
import {
  ERNST_KLEUR, GRIJS, GROEN, kaart, label, RAND, ROOD, STATUS_KLEUR,
  TEKST, veld, ZACHT,
} from './stijl'

const ERNSTEN: KwaliteitErnst[] = ['kritiek', 'technisch', 'esthetisch', 'observatie']

/** De projecteis-vorm die `bepaalEis` verwacht; de tweede parameter is optioneel, vandaar NonNullable. */
type ProjectEis = NonNullable<Parameters<typeof bepaalEis>[1]>[number]

/**
 * Eén controlepunt in de ronde.
 *
 * Volgorde op het scherm volgt de werkwijze van de opzichter: eerst de korte vraag, dan de
 * statusknoppen, dan pas — en alleen wanneer nodig — het meetveld en het bevindingsblok. De
 * technische eis en de bron zitten achter "Technische eis bekijken"; die hoeft hij tijdens de
 * ronde niet te lezen, maar moet hij wel kunnen opzoeken.
 */
export default function PuntKaart({
  punt,
  resultaat,
  bevindingen,
  fotos,
  projectEisen,
  recenteLocaties,
  inspectieId,
  bewerkbaar,
  onGewijzigd,
}: {
  punt: KwaliteitControlepunt
  resultaat: KwaliteitResultaat | undefined
  bevindingen: KwaliteitAfwijking[]
  fotos: KwaliteitFoto[]
  projectEisen: ProjectEis[]
  recenteLocaties: string[]
  inspectieId: string
  bewerkbaar: boolean
  onGewijzigd: () => void
}) {
  const t = useTranslations('kwaliteit')
  const locale = useDatumLocale()
  const meetmiddel = useVertaling(punt.meetmiddel)
  const eis = React.useMemo(() => bepaalEis(punt, projectEisen), [punt, projectEisen])
  const heeftMeting = punt.inspectie_type === 'meting' || punt.inspectie_type === 'gecombineerd'
    || punt.meting_verplicht || punt.meting_optioneel

  const [meting, setMeting] = React.useState<string>(
    resultaat?.gemeten_waarde !== null && resultaat?.gemeten_waarde !== undefined
      ? String(resultaat.gemeten_waarde) : '',
  )
  const [meetlocatie, setMeetlocatie] = React.useState(resultaat?.meetlocatie ?? '')
  const [opmerking, setOpmerking] = React.useState(resultaat?.opmerking ?? '')
  const [toonEis, setToonEis] = React.useState(false)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  const status = resultaat?.status ?? null
  const gemeten = meting.trim() === '' ? null : Number(meting.replace(',', '.'))
  const metingGeldig = gemeten === null || Number.isFinite(gemeten)

  // Live-oordeel: wat zou de app van deze meetwaarde vinden? Draait ook client-side, zodat de
  // opzichter tijdens het typen groen of rood ziet in plaats van na het opslaan.
  const live = React.useMemo(() => {
    if (!metingGeldig) return null
    return beoordeel(punt, eis, { status, gemeten_waarde: gemeten })
  }, [punt, eis, status, gemeten, metingGeldig])

  async function kiesStatus(nieuw: KwaliteitResultaatStatus) {
    if (!bewerkbaar) return
    setBezig(true); setFout(null)
    const res = await bewaarResultaat(inspectieId, {
      controlepuntId: punt.id,
      status: nieuw,
      antwoord: punt.binair_voldoet_bij
        ? (nieuw === 'voldoet' ? punt.binair_voldoet_bij : (punt.binair_voldoet_bij === 'ja' ? 'nee' : 'ja'))
        : null,
      gemetenWaarde: gemeten,
      meetlocatie: meetlocatie || null,
      opmerking: opmerking || null,
    })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    onGewijzigd()
  }

  async function bewaarMeting() {
    if (!bewerkbaar || !metingGeldig) return
    setBezig(true); setFout(null)
    const res = await bewaarResultaat(inspectieId, {
      controlepuntId: punt.id,
      status: live?.status ?? status ?? 'niet_beoordeeld',
      gemetenWaarde: gemeten,
      meetlocatie: meetlocatie || null,
      opmerking: opmerking || null,
    })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    onGewijzigd()
  }

  // Buiten de JSX opgebouwd: zinnen met vetgedrukte delen via t.rich.
  const vet = (c: React.ReactNode) => <strong style={{ color: TEKST }}>{c}</strong>
  const gemetenTekst = gemeten === null || !metingGeldig ? null : t.rich(
    eis.geen_waarde_bekend ? 'punt.gemeten' : 'punt.gemetenToegestaan',
    {
      waarde: `${gemeten.toLocaleString(locale, { maximumFractionDigits: 3 })}${eis.eenheid ? ' ' + eenheidLabel(eis.eenheid) : ''}`,
      eis: eis.geen_waarde_bekend ? '' : eisOmschrijving(eis, locale),
      b: vet,
    },
  )
  const projecteisTekst = punt.project_eis_sleutel
    ? t.rich('punt.projecteisNodig', { sleutel: punt.project_eis_sleutel, b: (c) => <strong>{c}</strong> })
    : null

  const statussen = toegestaneStatussen(punt)
  const moetBevinden = status !== null && levertAfwijkingOp(status)

  return (
    <div style={{ ...kaart, borderLeft: `4px solid ${status ? STATUS_KLEUR[status] : RAND}` }}>
      {/* Kop: code + korte vraag. De vraag is wat de opzichter leest, niet de titel. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: ZACHT, letterSpacing: '0.02em' }}>
          {punt.code}
        </span>
        {punt.kwaliteitsaspect === 'veiligheid' && (
          <span style={{ fontSize: 10, fontWeight: 700, color: ROOD }}>{t('punt.veiligheid')}</span>
        )}
      </div>
      {/* De vraag komt uit de bibliotheek van kantoor: vertaald, met het origineel één tik weg. */}
      <VertaalbareTekst as="div" tekst={punt.korte_vraag}
        style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: TEKST, lineHeight: 1.35 }} />

      {/* Statusknoppen — groot genoeg voor een duim met handschoen. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: moetBevinden || heeftMeting ? 12 : 0 }}>
        {statussen.map(s => {
          const actief = status === s
          return (
            <button
              key={s}
              type="button"
              disabled={!bewerkbaar || bezig}
              onClick={() => kiesStatus(s)}
              style={{
                flex: s === 'voldoet' || s === 'voldoet_niet' ? '1 1 40%' : '0 1 auto',
                minHeight: 44, padding: '10px 12px', borderRadius: 10,
                border: `1.5px solid ${actief ? STATUS_KLEUR[s] : RAND}`,
                background: actief ? STATUS_KLEUR[s] : 'transparent',
                color: actief ? '#fff' : GRIJS,
                fontSize: 13, fontWeight: 700, cursor: bewerkbaar ? 'pointer' : 'default',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {t(`resultaatStatus.${s}`)}
            </button>
          )
        })}
      </div>

      {status && (
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: GRIJS, lineHeight: 1.4 }}>
          {t(`statusUitleg.${status}`)}
        </p>
      )}

      {/* Meetveld met live toetsing. */}
      {heeftMeting && (
        <div style={{ marginBottom: 12 }}>
          <label style={label}>
            {eis.eenheid
              ? t('punt.meetwaardeEenheid', { verplicht: punt.meting_verplicht ? 'ja' : 'nee', eenheid: eenheidLabel(eis.eenheid) })
              : t('punt.meetwaarde', { verplicht: punt.meting_verplicht ? 'ja' : 'nee' })}
            {punt.meetmiddel ? ` · ${meetmiddel.tekst}` : ''}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={meting}
              onChange={e => setMeting(e.target.value)}
              onBlur={() => void bewaarMeting()}
              inputMode="decimal"
              disabled={!bewerkbaar}
              placeholder={t('punt.meetPlaceholder')}
              style={{ ...veld, flex: 1 }}
            />
            <input
              value={meetlocatie}
              onChange={e => setMeetlocatie(e.target.value)}
              onBlur={() => void bewaarMeting()}
              disabled={!bewerkbaar}
              placeholder={t('punt.waarGemeten')}
              style={{ ...veld, flex: 1.4 }}
            />
          </div>

          {!metingGeldig && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD }}>{t('punt.vulGetal')}</p>
          )}

          {metingGeldig && gemeten !== null && (
            <div
              style={{
                marginTop: 8, padding: '9px 11px', borderRadius: 10,
                background: live?.berekend_voldoet === true ? 'rgba(0,148,57,0.08)'
                  : live?.berekend_voldoet === false ? 'rgba(180,35,24,0.08)'
                  : 'var(--bg)',
                border: `1px solid ${live?.berekend_voldoet === true ? GROEN
                  : live?.berekend_voldoet === false ? ROOD : RAND}`,
              }}
            >
              <div style={{ fontSize: 12, color: GRIJS, marginBottom: 2 }}>
                {gemetenTekst}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 800,
                color: live?.berekend_voldoet === true ? GROEN
                  : live?.berekend_voldoet === false ? ROOD : GRIJS,
              }}>
                {live?.berekend_voldoet === true ? t('punt.oordeelVoldoet')
                  : live?.berekend_voldoet === false ? t('punt.oordeelVoldoetNiet')
                  : t('punt.geenGrenswaarde')}
              </div>
            </div>
          )}

          {eis.geen_waarde_bekend && punt.project_eis_sleutel && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: GRIJS, lineHeight: 1.4 }}>
              {projecteisTekst}
            </p>
          )}
        </div>
      )}

      {/* Bevindingen: één rij per plek waar het misgaat. */}
      {moetBevinden && resultaat && (
        <Bevindingen
          inspectieId={inspectieId}
          resultaat={resultaat}
          punt={punt}
          bevindingen={bevindingen}
          fotos={fotos}
          recenteLocaties={recenteLocaties}
          bewerkbaar={bewerkbaar}
          onGewijzigd={onGewijzigd}
        />
      )}

      {/* Vrije toelichting, ook bij VOLDOET — soms wil je iets kwijt zonder afkeur. */}
      {status && !moetBevinden && (
        <div style={{ marginTop: 4 }}>
          <SpraakTextarea
            value={opmerking}
            onChange={setOpmerking}
            onBlur={() => void bewaarMeting()}
            rows={2}
            placeholder={t('punt.opmerkingPlaceholder')}
            disabled={!bewerkbaar}
            style={veld}
          />
        </div>
      )}

      {/* Technische achtergrond: uitklapbaar, want tijdens een ronde leest niemand dit. */}
      <button
        type="button"
        onClick={() => setToonEis(v => !v)}
        style={{
          marginTop: 10, background: 'none', border: 'none', padding: 0,
          color: GRIJS, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {toonEis ? t('punt.eisVerbergen') : t('punt.eisBekijken')}
      </button>
      {toonEis && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, color: GRIJS }}>
          <VertaalbareTekst as="p" label={false} tekst={punt.titel} style={{ margin: '0 0 6px', fontWeight: 700, color: TEKST }} />
          {punt.toelichting && <VertaalbareTekst as="p" tekst={punt.toelichting} style={{ margin: '0 0 6px' }} />}
          {eis.eis_tekst && <VertaalbareTekst as="p" tekst={eis.eis_tekst} style={{ margin: '0 0 6px' }} />}
          {punt.meetmethode && (
            <p style={{ margin: '0 0 6px' }}>
              <strong>{t('punt.meetmethode')}</strong>{' '}
              <VertaalbareTekst tekst={punt.meetmethode} />
            </p>
          )}
          <p style={{ margin: 0 }}>
            <strong>{t('punt.bron')}</strong> {t(`bron.${eis.bron_type}`)}
            {eis.bron_document ? ` — ${eis.bron_document}` : ''}
            {punt.bron_paragraaf ? `, ${punt.bron_paragraaf}` : ''}
            {eis.uit_projecteis && <> {t('punt.projectwaarde')}</>}
          </p>
        </div>
      )}

      {fout && <p style={{ margin: '8px 0 0', fontSize: 12, color: ROOD }}>{fout}</p>}
    </div>
  )
}

/* ─────────────────────────────── Bevindingen ─────────────────────────────── */

function Bevindingen({
  inspectieId, resultaat, punt, bevindingen, fotos, recenteLocaties, bewerkbaar, onGewijzigd,
}: {
  inspectieId: string
  resultaat: KwaliteitResultaat
  punt: KwaliteitControlepunt
  bevindingen: KwaliteitAfwijking[]
  fotos: KwaliteitFoto[]
  recenteLocaties: string[]
  bewerkbaar: boolean
  onGewijzigd: () => void
}) {
  const t = useTranslations('kwaliteit')
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  async function voegToe() {
    setBezig(true); setFout(null)
    const res = await voegBevindingToe(inspectieId, {
      resultaatId: resultaat.id,
      locatie: recenteLocaties[0] ?? '',
    })
    setBezig(false)
    if (!res.ok) setFout(res.error)
    else onGewijzigd()
  }

  // Eerste bevinding automatisch aanmaken zodra een punt wordt afgekeurd: de opzichter heeft er
  // altijd minstens één nodig en een extra tik is op een steiger een tik te veel.
  React.useEffect(() => {
    if (bewerkbaar && bevindingen.length === 0 && !bezig) void voegToe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bevindingen.length, bewerkbaar])

  return (
    <div style={{ marginTop: 4 }}>
      {bevindingen.map((b, i) => (
        <BevindingBlok
          key={b.id}
          bevinding={b}
          index={i}
          totaal={bevindingen.length}
          punt={punt}
          resultaatStatus={resultaat.status}
          fotos={fotos.filter(f => f.afwijking_id === b.id)}
          recenteLocaties={recenteLocaties}
          bewerkbaar={bewerkbaar}
          onGewijzigd={onGewijzigd}
        />
      ))}
      {bewerkbaar && (
        <button
          type="button"
          onClick={() => void voegToe()}
          disabled={bezig}
          style={{
            width: '100%', marginTop: 6, padding: '10px', borderRadius: 10,
            border: `1px dashed ${RAND}`, background: 'transparent', color: GRIJS,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('bevinding.nogEen')}
        </button>
      )}
      {fout && <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD }}>{fout}</p>}
    </div>
  )
}

function BevindingBlok({
  bevinding, index, totaal, punt, resultaatStatus, fotos, recenteLocaties, bewerkbaar, onGewijzigd,
}: {
  bevinding: KwaliteitAfwijking
  index: number
  totaal: number
  punt: KwaliteitControlepunt
  resultaatStatus: KwaliteitResultaatStatus
  fotos: KwaliteitFoto[]
  recenteLocaties: string[]
  bewerkbaar: boolean
  onGewijzigd: () => void
}) {
  const t = useTranslations('kwaliteit')
  const [locatie, setLocatie] = React.useState(bevinding.locatie ?? '')
  const [omschrijving, setOmschrijving] = React.useState(bevinding.omschrijving ?? '')
  const [actie, setActie] = React.useState(bevinding.voorgestelde_actie ?? '')
  const [ernst, setErnst] = React.useState<KwaliteitErnst>(bevinding.ernst)
  const [lokaleFotos, setLokaleFotos] = React.useState<StrookFoto[]>(
    fotos.map(f => ({ id: f.id, url: f.url })),
  )

  async function bewaar(patch: Partial<Parameters<typeof updateBevinding>[1]>) {
    if (!bewerkbaar) return
    await updateBevinding(bevinding.id, patch)
    onGewijzigd()
  }

  const fotoNodig = fotoVerplicht(punt, resultaatStatus)

  return (
    <div style={{
      border: `1px solid ${RAND}`, borderRadius: 12, padding: 12, marginBottom: 8,
      background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: ZACHT }}>
          {bevinding.afwijkingsnummer}{totaal > 1 ? ` · ${t('bevinding.vanTotaal', { nummer: index + 1, totaal })}` : ''}
        </span>
        {bewerkbaar && totaal > 1 && (
          <button
            type="button"
            onClick={async () => { await verwijderBevinding(bevinding.id); onGewijzigd() }}
            style={{ background: 'none', border: 'none', color: ROOD, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            {t('verwijderen')}
          </button>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <LocatieKiezer
          waarde={locatie}
          onChange={v => { setLocatie(v); void bewaar({ locatie: v }) }}
          recent={recenteLocaties}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={label}>{t('bevinding.toelichting')}</label>
        <SpraakTextarea
          value={omschrijving}
          onChange={setOmschrijving}
          onBlur={() => void bewaar({ omschrijving })}
          rows={3}
          placeholder={t('bevinding.toelichtingPlaceholder')}
          disabled={!bewerkbaar}
          style={veld}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={label}>{t('bevinding.ernst')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ERNSTEN.map(e => {
            const actief = ernst === e
            return (
              <button
                key={e}
                type="button"
                disabled={!bewerkbaar}
                onClick={() => { setErnst(e); void bewaar({ ernst: e }) }}
                style={{
                  padding: '8px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                  border: `1.5px solid ${actief ? ERNST_KLEUR[e] : RAND}`,
                  background: actief ? ERNST_KLEUR[e] : 'transparent',
                  color: actief ? '#fff' : GRIJS, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {t(`ernst.${e}`)}
              </button>
            )
          })}
        </div>
        {ernst === 'kritiek' && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD, fontWeight: 600 }}>
            {t('bevinding.kritiekMelding')}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={label}>{t('bevinding.herstelactie')}</label>
        <SpraakTextarea
          value={actie}
          onChange={setActie}
          onBlur={() => void bewaar({ voorgestelde_actie: actie })}
          rows={2}
          placeholder={t('bevinding.herstelactiePlaceholder')}
          disabled={!bewerkbaar}
          style={veld}
        />
      </div>

      <FotoStrook
        koppelSoort="afwijking"
        koppelId={bevinding.id}
        soort="afwijking"
        fotos={lokaleFotos}
        onVeranderd={setLokaleFotos}
        verplicht={fotoNodig}
      />
    </div>
  )
}
