'use client'

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { usePush, isIOS, isGeinstalleerd } from '@/lib/push/client'
import { TIJDZONE } from '@/i18n/talen'
import notificatiesNl from '@/i18n/berichten/nl/notificaties.json'

/**
 * Stand van de pushmeldingen op dít apparaat.
 *
 * Staat op twee plekken: "Mijn gegevens" in EVA Mobiel (weergave 'mobiel') en
 * "Mijn account" op de desktop (weergave 'desktop'). Het is bewust per apparaat en
 * niet per gebruiker: je wilt de meldingen op je telefoon, niet ook nog eens op de
 * balie-pc waar je 's ochtends toevallig hebt ingelogd.
 *
 * Bewust géén aan/uit-schakelaar. Meldingen horen aan te staan; een schakelaar
 * suggereert dat "uit" een normale stand is en nodigt uit tot per ongeluk
 * uitzetten. Alleen de allereerste keer is één tik nodig, omdat de browser
 * toestemming uitsluitend na een handeling van de gebruiker vraagt. Daarna houdt
 * PushHersteller het abonnement in de lucht. Echt uitzetten doe je bij de
 * meldingsinstellingen van de telefoon — daar hoort het thuis, en alleen daar kan
 * EVA het ook niet ongemerkt terugdraaien.
 *
 * De testknop is geen luxe — als push níét werkt merk je dat anders pas op het
 * moment dat je een melding mist.
 *
 * TAAL — de teksten staan in de naamruimte `notificaties`. In de app (weergave 'mobiel')
 * komt die in de taal van de medewerker uit de provider van `/m`. Op kantoor geeft de
 * root-layout alleen de gedeelde naamruimtes mee, dus daar zetten we hier een eigen
 * provider omheen met het Nederlandse bestand: kantoor blijft Nederlands, zonder dat de
 * hele naamruimte aan elke kantoorpagina wordt toegevoegd.
 */
export default function PushMeldingen({ weergave = 'desktop' }: { weergave?: 'mobiel' | 'desktop' }) {
  if (weergave === 'mobiel') return <PushMeldingenInhoud weergave="mobiel" />
  return (
    <NextIntlClientProvider locale="nl" messages={{ notificaties: notificatiesNl }} timeZone={TIJDZONE}>
      <PushMeldingenInhoud weergave="desktop" />
    </NextIntlClientProvider>
  )
}

function PushMeldingenInhoud({ weergave }: { weergave: 'mobiel' | 'desktop' }) {
  const t = useTranslations('notificaties.push')
  const { status, bezig, fout, aanzetten, testen, hercontroleer } = usePush()
  const [apparaat, setApparaat] = useState<'ios' | 'anders'>('anders')

  useEffect(() => {
    setApparaat(isIOS() ? 'ios' : 'anders')
  }, [])

  const aan = status === 'aan'
  // Geen aan/uit-schakelaar meer: meldingen horen gewoon aan te staan. Alleen de
  // allereerste keer is een tik nodig, omdat de browser toestemming alleen vraagt
  // na een handeling van de gebruiker. Uitzetten kan nog wel — in de instellingen
  // van de telefoon zelf, waar het thuishoort.
  const moetAanzetten = status === 'uit'
  // Standen die de gebruiker buiten EVA om kan oplossen; dan hoort er een knop
  // bij om opnieuw te kijken, want de browser meldt zo'n wijziging niet.
  const opTeLossen = status === 'geweigerd' || status === 'installeren'

  const statusTekst =
    status === 'laden'            ? t('status.laden')
    : status === 'aan'            ? t('status.aan')
    : status === 'uit'            ? t('status.uit')
    : status === 'installeren'    ? t('status.installeren')
    : status === 'geweigerd'      ? t('status.geweigerd')
    : status === 'geen-sw'        ? t('status.geenSw')
    : t('status.nietOndersteund')

  const statusKleur =
    status === 'aan'                                ? '#067647'
    : status === 'geweigerd'                        ? '#b42318'
    : status === 'installeren'                      ? '#b54708'
    : '#6b757c'

  const uitleg =
    status === 'installeren'
      ? t('uitleg.installeren')
    : status === 'geweigerd'
      ? apparaat === 'ios'
        ? t('uitleg.geweigerdIos')
        : t('uitleg.geweigerdAnders')
    : status === 'geen-sw'
      ? t('uitleg.geenSw')
    : status === 'niet-ondersteund'
      ? t('uitleg.nietOndersteund')
    : status === 'uit'
      ? t('uitleg.uit')
    : t('uitleg.aan')

  async function testMelding() {
    if (await testen()) toast.success(t('testVerstuurd'))
    else toast.error(t('versturenMislukt'))
  }

  const mobiel = weergave === 'mobiel'

  return (
    <div
      style={
        mobiel
          ? {
              padding: 16, background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 14,
              display: 'flex', flexDirection: 'column', gap: 12,
            }
          : { display: 'flex', flexDirection: 'column', gap: 12 }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: mobiel ? undefined : 'var(--font-ui)',
            fontSize: mobiel ? 15 : 13.5,
            fontWeight: mobiel ? 600 : 500,
            color: 'var(--fg)',
          }}>
            {t('titel')}
          </div>
          <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 3, lineHeight: 1.45 }}>
            {uitleg}
          </div>
        </div>

        <span style={{
          fontSize: 13, fontWeight: 600, color: statusKleur, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {aan && (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {statusTekst}
        </span>
      </div>

      {moetAanzetten && (
        <button
          type="button"
          disabled={bezig}
          onClick={aanzetten}
          style={{
            alignSelf: mobiel ? 'stretch' : 'flex-start',
            padding: mobiel ? '14px 16px' : '9px 16px',
            borderRadius: mobiel ? 12 : 8,
            background: '#009439', color: '#fff', border: 'none',
            fontSize: mobiel ? 15 : 13, fontWeight: 700,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? t('bezig') : t('aanzetten')}
        </button>
      )}

      {aan && (
        <button
          type="button"
          disabled={bezig}
          onClick={testMelding}
          style={{
            alignSelf: mobiel ? 'stretch' : 'flex-start',
            padding: mobiel ? '13px 16px' : '8px 14px',
            borderRadius: mobiel ? 12 : 8,
            background: 'transparent', color: 'var(--fg)',
            border: '1px solid var(--border)',
            fontSize: mobiel ? 15 : 13, fontWeight: 600,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? t('bezig') : t('testSturen')}
        </button>
      )}

      {opTeLossen && (
        <button
          type="button"
          disabled={bezig}
          onClick={hercontroleer}
          style={{
            alignSelf: mobiel ? 'stretch' : 'flex-start',
            padding: mobiel ? '13px 16px' : '8px 14px',
            borderRadius: mobiel ? 12 : 8,
            background: 'transparent', color: 'var(--fg)',
            border: '1px solid var(--border)',
            fontSize: mobiel ? 15 : 13, fontWeight: 600,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? t('bezig') : t('opnieuwControleren')}
        </button>
      )}

      {fout && (
        <p style={{ fontSize: 12.5, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{fout}</p>
      )}
    </div>
  )
}
