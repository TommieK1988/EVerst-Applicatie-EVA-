'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import type { InspectieContext } from '@/lib/kwaliteit/inspecties'
import { controleerAfronden, rondInspectieAf, type AfrondControle } from '@/lib/kwaliteit/inspecties'
import type { KwaliteitSamenvatting } from '@/lib/kwaliteit/regels'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { GRIJS, GROEN, kaart, primaireKnop, RAND, ROOD, secundaireKnop, TEKST, ZACHT } from './stijl'

/**
 * Stap 4: de controlepagina vóór het definitief maken (§40).
 *
 * Toont de tellingen en — belangrijker — precies wat er nog mist. `controleerAfronden` geeft een
 * lijst terug in plaats van een fout, zodat elk ontbrekend punt hier als regel kan staan.
 *
 * Er komt bewust géén kwaliteitspercentage uit: een steekproef rechtvaardigt geen "96% kwaliteit".
 */
export default function AfrondStap({
  context,
  telling,
  bewerkbaar,
  onTerug,
  onGewijzigd,
}: {
  context: InspectieContext
  telling: KwaliteitSamenvatting
  bewerkbaar: boolean
  onTerug: () => void
  onGewijzigd: () => void
}) {
  const t = useTranslations('kwaliteit')
  const router = useRouter()
  const [controle, setControle] = React.useState<AfrondControle | null>(null)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)
  const [klaar, setKlaar] = React.useState(!bewerkbaar)

  React.useEffect(() => {
    if (!bewerkbaar) return
    void controleerAfronden(context.inspectie.id).then(setControle)
  }, [context.inspectie.id, bewerkbaar])

  async function afronden() {
    setBezig(true); setFout(null)
    const res = await rondInspectieAf(context.inspectie.id)
    setBezig(false)
    if (!res.ok) {
      // Onvolledig: de reden staat per punt in de lijst, in de eigen taal. Andere fouten komen
      // van de server en blijven zoals ze zijn.
      setFout(res.ontbreekt ? t('afronden.inspectieNietCompleet') : res.error)
      if (res.ontbreekt) setControle({ gereed: false, ontbreekt: res.ontbreekt })
      return
    }
    setKlaar(true)
    onGewijzigd()
  }

  const regels: { label: string; waarde: number; kleur?: string }[] = [
    { label: t('afronden.telling.beoordeeld'), waarde: telling.beoordeeld },
    { label: t('afronden.telling.voldoen'), waarde: telling.voldoet, kleur: GROEN },
    { label: t('afronden.telling.technisch'), waarde: telling.technisch },
    { label: t('afronden.telling.esthetisch'), waarde: telling.esthetisch },
    { label: t('afronden.telling.kritiek'), waarde: telling.kritiek, kleur: telling.kritiek > 0 ? ROOD : undefined },
    { label: t('afronden.telling.nietBeoordeeld'), waarde: telling.niet_beoordeeld },
    { label: t('afronden.telling.naderOnderzoek'), waarde: telling.nader_onderzoek },
    { label: t('afronden.telling.waarnemingen'), waarde: context.waarnemingen.length, kleur: GROEN },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '16px 14px 0', flex: 1 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: TEKST }}>
          {klaar ? t('afronden.titelAfgerond') : t('afronden.titelAfronden')}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: GRIJS, lineHeight: 1.4 }}>
          {context.inspectie.inspectienummer} · {context.dossier.titel}
        </p>

        <div style={{ ...kaart }}>
          {regels.map(r => (
            <div key={r.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '7px 0', borderBottom: `1px solid ${RAND}`,
            }}>
              <span style={{ fontSize: 13.5, color: GRIJS }}>{r.label}</span>
              <strong style={{ fontSize: 16, color: r.kleur ?? TEKST }}>{r.waarde}</strong>
            </div>
          ))}
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: ZACHT, lineHeight: 1.45 }}>
            {t('afronden.nietBeoordeeldUitleg')}
          </p>
        </div>

        {klaar && (
          <div style={{
            padding: '14px', borderRadius: 12, background: 'rgba(0,148,57,0.08)',
            border: `1px solid ${GROEN}`, marginBottom: 12,
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: GROEN }}>
              {t('afronden.definitief')}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: GRIJS, lineHeight: 1.45 }}>
              {t('afronden.definitiefUitleg')}
            </p>
          </div>
        )}

        {!klaar && controle && !controle.gereed && (
          <div style={{
            padding: '14px', borderRadius: 12, background: 'var(--warning-50)',
            border: '1px solid var(--warning-300)', marginBottom: 12,
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700, color: 'var(--warning-700)' }}>
              {t('afronden.nietCompleet')}
            </p>
            <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12.5, color: 'var(--warning-700)', lineHeight: 1.55 }}>
              {controle.ontbreekt.map((o, i) => (
                <li key={`${o.code}-${i}`}>
                  {o.code ? <strong>{o.code}</strong> : null}{' '}
                  {o.soort === 'niets_beoordeeld'
                    ? t('afronden.ontbreekt.nietsBeoordeeldTitel')
                    : <VertaalbareTekst label={false} tekst={o.titel} />}
                  {' — '}{t(`afronden.ontbreekt.${o.soort}`)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onTerug}
              style={{ ...secundaireKnop, marginTop: 10, width: '100%', padding: '10px', fontSize: 13.5 }}
            >
              {t('afronden.terugNaarControlepunten')}
            </button>
          </div>
        )}

        {!klaar && controle?.gereed && (
          <p style={{ fontSize: 12.5, color: GRIJS, lineHeight: 1.5, marginBottom: 12 }}>
            {t('afronden.naDefinitief')}
          </p>
        )}

        {fout && <p style={{ fontSize: 12.5, color: ROOD, marginBottom: 10 }}>{fout}</p>}
      </div>

      <MobielStickyFooter>
        {klaar ? (
          <button
            type="button"
            onClick={() => router.push('/m/taken')}
            style={{ ...primaireKnop, flex: 1 }}
          >
            {t('afronden.terugNaarActies')}
          </button>
        ) : (
          <>
            <button type="button" onClick={onTerug} style={{ ...secundaireKnop, flex: '0 0 auto' }}>{t('terug')}</button>
            <button
              type="button"
              onClick={() => void afronden()}
              disabled={bezig || (controle !== null && !controle.gereed)}
              style={{
                ...primaireKnop, flex: 1,
                background: controle && !controle.gereed ? ZACHT : GROEN,
              }}
            >
              {bezig ? t('bezig') : t('afronden.definitiefMaken')}
            </button>
          </>
        )}
      </MobielStickyFooter>
    </div>
  )
}
