'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import BottomSheet from '@/components/mobiel/BottomSheet'
import { hercodeerBlokMobiel } from '@/app/m/uren/keuren/actions'
import { getUrenDoelcodes, zorgUrenDoelPsl, type UrenDoelcode } from '@/lib/dossiers/actions'
import type { KeurCodeBlok } from '@/lib/mobiel/keuren'

const GROEN = '#009439'
const GRIJS = '#6b757c'
const ORANJE = '#b85a00'

/**
 * Alle uren van één dossier+code-blok in één keer op een andere bewakingscode zetten.
 *
 * Dit is de codecontrole van de teamleider. Een week staat meestal vijf dagen op dezelfde code,
 * dus een verkeerde of ontbrekende code is één fout — en hoort één handeling te zijn. Dit
 * venster bestaat omdat het anders vijf keer hetzelfde potloodje op een telefoon zou worden,
 * en dan komt het er niet van.
 *
 * Zonder prognose-filter: dit is corrigeren, niet invoeren. Een uur dat op de verkeerde code
 * staat moet naar élke code te verplaatsen zijn, ook naar een code waar niets voor begroot is.
 * Zelfde redenering als `KeurRegelSheet` en `UurregelBewerken` op de desktop.
 *
 * Een lijst met radioknoppen in plaats van een `<select>`: een keuzelijst met tientallen codes
 * is op een telefoon nauwelijks te raken, en je wilt de omschrijving naast de code kunnen lezen
 * voordat je kiest.
 */
export default function BlokCodeSheet({ blok, onSluit, onKlaar }: {
  blok: KeurCodeBlok
  onSluit: () => void
  /** De uren zijn verplaatst; het scherm haalt de lijst opnieuw op. */
  onKlaar: () => void
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const [codes, setCodes] = React.useState<UrenDoelcode[]>([])
  const [laden, setLaden] = React.useState(true)
  const [keuze, setKeuze] = React.useState<string | null>(blok.code)
  const [bezig, setBezig] = React.useState(false)

  React.useEffect(() => {
    if (!blok.dossierId) { setLaden(false); return }
    let levend = true
    getUrenDoelcodes(blok.dossierId)
      .then(c => { if (levend) setCodes(c) })
      .catch(() => { /* geen codelijst: het venster toont dat, de week blijft werkbaar */ })
      .finally(() => { if (levend) setLaden(false) })
    return () => { levend = false }
  }, [blok.dossierId])

  async function bewaar() {
    const gekozen = codes.find(c => c.code === keuze)
    if (!gekozen) { toast.error(t('blokCode.kiesEerst')); return }

    setBezig(true)
    // Een code die nog niet onder Arbeid staat krijgt die link pas bij het opslaan.
    let pslId = gekozen.pslId
    if (pslId == null) {
      const psl = blok.dossierId
        ? await zorgUrenDoelPsl(blok.dossierId, { code: gekozen.code, hoofdstukId: gekozen.hoofdstukId }).catch(() => null)
        : null
      if (!psl || !psl.ok) { setBezig(false); toast.error(psl?.error ?? t('keuren.bouw7Onbereikbaar')); return }
      pslId = psl.pslId
    }
    const r = await hercodeerBlokMobiel(blok.regelIds, pslId).catch(() => null)
    setBezig(false)

    if (!r) { toast.error(t('keuren.bouw7Onbereikbaar')); return }
    if (!r.ok) { toast.error(r.error); return }

    // Eerlijk melden wat er niet lukte: half verplaatste uren die als "gelukt" op het scherm
    // komen zijn erger dan geen melding — dan denk je dat de week rond is.
    if (r.mislukt > 0) {
      toast.error(t('blokCode.nietGelukt', {
        aantal: r.mislukt, totaal: blok.regelIds.length, fout: r.eersteFout ?? t('keuren.onbekendeFout'),
      }))
    } else {
      toast.success(t('blokCode.verplaatst', { aantal: r.gelukt, code: gekozen.code }))
    }
    onKlaar()
    onSluit()
  }

  const aantal = blok.regelIds.length
  const samenvatting = blok.code ? 'blokCode.staatOp' as const : 'blokCode.staatNergens' as const

  return (
    <BottomSheet titel={t('blokCode.titel')} onSluit={onSluit}>
      <div style={{ fontSize: 13, color: GRIJS, lineHeight: 1.5, marginBottom: 14 }}>
        {blok.projectNummer || blok.projectNaam ? (
          <>
            {blok.projectNummer}{blok.projectNummer && blok.projectNaam ? ' ' : ''}
            {blok.projectNaam && <VertaalbareTekst tekst={blok.projectNaam} label={false} />}
          </>
        ) : t('keuren.zonderProject')}
        <br />
        {t.rich(samenvatting, {
          uren: blok.uren.toLocaleString(locale, { maximumFractionDigits: 2 }),
          aantal,
          code: blok.code ?? '',
          b: (c) => <strong style={{ color: 'var(--fg)' }}>{c}</strong>,
          let: (c) => <span style={{ color: ORANJE }}>{c}</span>,
        })}
      </div>

      {laden ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: GRIJS }}>
          {t('blokCode.codesOphalen')}
        </div>
      ) : codes.length === 0 ? (
        <div style={{ padding: '18px 0', fontSize: 13, color: GRIJS, lineHeight: 1.5 }}>
          {t('blokCode.geenCodes')}
        </div>
      ) : (
        <div style={{
          maxHeight: '45vh', overflowY: 'auto', margin: '0 -4px',
          border: '1px solid var(--border)', borderRadius: 10,
        }}>
          {codes.map(c => {
            const aan = c.code === keuze
            return (
              <button
                key={c.sleutel}
                type="button"
                onClick={() => setKeuze(c.code)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', fontFamily: 'inherit',
                  background: aan ? 'rgba(0,148,57,.07)' : 'transparent',
                  padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid var(--border)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18, height: 18, flexShrink: 0, borderRadius: 9,
                    border: `2px solid ${aan ? GROEN : 'var(--border)'}`,
                    background: aan ? GROEN : 'transparent',
                    boxShadow: aan ? 'inset 0 0 0 3px #fff' : 'none',
                  }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>
                    {c.code}
                  </span>
                  {c.naam && (
                    <span style={{
                      display: 'block', fontSize: 12, color: GRIJS, marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <VertaalbareTekst tekst={c.naam} label={false} />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={bewaar}
        disabled={bezig || laden || !keuze || keuze === blok.code}
        style={{
          width: '100%', minHeight: 48, marginTop: 16, borderRadius: 12, border: 'none',
          background: bezig || !keuze || keuze === blok.code ? '#c9d2d6' : GROEN,
          color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {bezig
          ? t('knop.bezig')
          : keuze && keuze !== blok.code
            ? t('blokCode.zetOp', { aantal, code: keuze })
            : t('blokCode.kiesAndere')}
      </button>
    </BottomSheet>
  )
}
