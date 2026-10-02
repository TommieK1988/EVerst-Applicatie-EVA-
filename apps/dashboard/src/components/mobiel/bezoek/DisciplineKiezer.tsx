'use client'

/**
 * De disciplinekeuze van een projectbezoek — een multiselect die als bottom sheet opengaat.
 *
 * Waarom geen `<select multiple>`: iOS rendert die als een scrollende lijstbox waarin de
 * ctrl-klik-semantiek niet bestaat, en Android maakt er een picker zonder zoekveld van. Met
 * 21 disciplines is dat onbruikbaar.
 *
 * Waarom niet het tegelraster van de kwaliteitsronde (`kwaliteit/DisciplineStap.tsx`): daar
 * staat op elke tegel het aantal controlepunten, en dát rechtvaardigt de ruimte. Hier is dat
 * getal betekenisloos en zijn 21 tegels elf rijen scrollen voordat je begint.
 *
 * Dicht is het één regel met de gekozen namen; open een lijst met vinkjes en een zoekveld.
 * Er wordt **één keer** opgeslagen — bij sluiten, niet per tik: 21 losse roundtrips op een
 * bouwplaats met twee streepjes bereik is precies het scenario waar de doorloop op ontworpen is.
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import type { DisciplineKeuze } from '@/lib/bezoek/types'
import {
  GRIJS, GROEN, RAND, TEKST, OPPERVLAK, veld, primaireKnop,
} from '@/components/mobiel/kwaliteit/stijl'

export default function DisciplineKiezer({
  beschikbaar, gekozen, lezen, metPunten, opslaan,
}: {
  beschikbaar: DisciplineKeuze[]
  gekozen: string[]
  lezen: boolean
  /** Codes die niet uitgezet mogen worden omdat er punten onder hangen. */
  metPunten: Set<string>
  opslaan: (codes: string[]) => Promise<{ ok: boolean; error?: string }>
}) {
  const t = useTranslations('bezoek')
  const [open, setOpen] = useState(false)
  const [selectie, setSelectie] = useState<string[]>(gekozen)
  const [zoek, setZoek] = useState('')
  const [bezig, setBezig] = useState(false)

  // Disciplinenamen komen van kantoor: in de taal van de app tonen. Opgeslagen worden de codes.
  const vertalingen = useVertalingen(beschikbaar.map(d => d.naam))
  const naamPerCode = useMemo(
    () => new Map(beschikbaar.map((d, i) => [d.code, vertalingen[i]?.tekst ?? d.naam])),
    [beschikbaar, vertalingen],
  )

  const zichtbaar = useMemo(() => {
    const term = zoek.trim().toLowerCase()
    if (!term) return beschikbaar
    // Zoeken op de getoonde (vertaalde) naam én op het Nederlandse origineel.
    return beschikbaar.filter(d =>
      d.naam.toLowerCase().includes(term)
      || (naamPerCode.get(d.code) ?? '').toLowerCase().includes(term))
  }, [beschikbaar, zoek, naamPerCode])

  const samenvatting = gekozen.length
    ? gekozen.map(c => naamPerCode.get(c) ?? c).join(', ')
    : t('kiezer.kiesDisciplines')

  function wissel(code: string) {
    setSelectie(prev => (
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    ))
  }

  async function sluitEnBewaar() {
    setBezig(true)
    const r = await opslaan(selectie)
    setBezig(false)
    if (!r.ok) return          // de doorloop toont de toast; het paneel blijft open
    setOpen(false)
    setZoek('')
  }

  return (
    <>
      <button
        type="button"
        disabled={lezen}
        onClick={() => { setSelectie(gekozen); setOpen(true) }}
        style={{
          ...veld,
          display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          minHeight: 48, cursor: lezen ? 'default' : 'pointer',
          color: gekozen.length ? TEKST : GRIJS,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{samenvatting}</span>
        {!lezen && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GRIJS}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{ flexShrink: 0 }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }}
          />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
            maxHeight: '78vh', display: 'flex', flexDirection: 'column',
            background: OPPERVLAK, borderRadius: '18px 18px 0 0',
            borderTop: `1px solid ${RAND}`,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}>
            <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${RAND}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEKST, marginBottom: 10 }}>
                {t('welkeDisciplines')}
              </div>
              <input
                type="search" value={zoek} placeholder={t('kiezer.zoeken')}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={e => setZoek(e.target.value)}
                style={veld}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
              {zichtbaar.map(d => {
                const aan = selectie.includes(d.code)
                const vast = aan && metPunten.has(d.code)
                return (
                  <button
                    key={d.code}
                    type="button"
                    disabled={vast}
                    onClick={() => wissel(d.code)}
                    title={vast ? t('kiezer.heeftPuntenTitel') : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      minHeight: 48, padding: '10px 14px', border: 'none', background: 'none',
                      textAlign: 'left', fontFamily: 'inherit', fontSize: 15,
                      color: vast ? GRIJS : TEKST,
                      cursor: vast ? 'default' : 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${aan ? GROEN : RAND}`,
                      background: aan ? GROEN : 'transparent',
                      color: '#fff', fontSize: 14, lineHeight: '19px',
                      textAlign: 'center', fontWeight: 700,
                      // eslint-disable-next-line i18next/no-literal-string -- vinkje-symbool, geen tekst
                    }}>{aan ? '✓' : ''}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{naamPerCode.get(d.code) ?? d.naam}</span>
                    {vast && (
                      <span style={{ fontSize: 11, color: GRIJS, flexShrink: 0 }}>{t('kiezer.heeftPunten')}</span>
                    )}
                  </button>
                )
              })}
              {zichtbaar.length === 0 && (
                <p style={{ fontSize: 13, color: GRIJS, textAlign: 'center', padding: '24px 0' }}>
                  {t('kiezer.nietsGevonden')}
                </p>
              )}
            </div>

            <div style={{ padding: 14, borderTop: `1px solid ${RAND}` }}>
              <button
                type="button" disabled={bezig} onClick={sluitEnBewaar}
                style={{ ...primaireKnop, width: '100%', opacity: bezig ? 0.6 : 1 }}
              >
                {bezig ? t('bezig') : t('kiezer.klaar', { aantal: selectie.length })}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
