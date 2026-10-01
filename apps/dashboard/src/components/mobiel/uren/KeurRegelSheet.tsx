'use client'

import React from 'react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useDateFnsLocale } from './datumOpmaak'
import { Minus, Plus } from 'lucide-react'
import BottomSheet from '@/components/mobiel/BottomSheet'
import { corrigeerUurregelMobiel } from '@/app/m/uren/keuren/actions'
import { getUrenDoelcodes, zorgUrenDoelPsl, type UrenDoelcode } from '@/lib/dossiers/actions'
import type { KeurRegel } from '@/lib/mobiel/keuren'

const GROEN = '#009439'
const GRIJS = '#6b757c'

/** Kwartieren: dat is de korrel waarin uren op de bon staan. */
const STAP = 0.25

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: GRIJS,
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

/**
 * De teamleider stelt één urenregel bij vóórdat hij hem goedkeurt.
 *
 * Dit is de kern van de teamleiderstap: een monteur schrijft acht uur op het
 * verkeerde project of vergeet een kwartier, en de teamleider zet dat recht terwijl
 * hij de bon nakijkt. Na zijn akkoord schuift de regel door naar de projectleider en
 * kan het hier niet meer — `corrigeerUurregelMobiel` weigert het dan ook echt, niet
 * alleen in beeld.
 *
 * Afkeuren bestaat niet, net als op de desktop: Bouw7 kent alleen goedgekeurd of
 * niet, en een regel heen en weer sturen kost alleen tijd. Je zet hem recht, en de
 * medewerker krijgt daar automatisch bericht van.
 *
 * De uren gaan met grote plus/min-knoppen in stappen van een kwartier — tikken in een
 * cijferveld is op een telefoon met werkhanden lastig. Zelfde keuze als `RegelSheet`.
 */
export default function KeurRegelSheet({ regel, onSluit, onKlaar }: {
  regel: KeurRegel
  onSluit: () => void
  /** De regel is aangepast; het scherm haalt de lijst opnieuw op. */
  onKlaar: () => void
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const dfLocale = useDateFnsLocale()
  const uurTekst = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 })
  const [uren, setUren] = React.useState(regel.uren)
  const [code, setCode] = React.useState(regel.bewakingscode ?? '')
  const [opmerking, setOpmerking] = React.useState(regel.opmerking ?? '')
  const [codes, setCodes] = React.useState<UrenDoelcode[]>([])
  const [codesLaden, setCodesLaden] = React.useState(false)
  const [bezig, setBezig] = React.useState(false)

  // Zonder prognose-filter: dit is corrigeren, niet invoeren. Een uur dat op de
  // verkeerde code staat moet naar élke code te verplaatsen zijn, ook naar een code
  // waar niets voor begroot is. Zelfde redenering als `UurregelBewerken` op de desktop.
  React.useEffect(() => {
    if (!regel.dossierId) return
    let levend = true
    setCodesLaden(true)
    getUrenDoelcodes(regel.dossierId)
      .then(c => { if (levend) setCodes(c) })
      .catch(() => { /* geen codelijst: het veld blijft leeg, de uren zijn nog wel te wijzigen */ })
      .finally(() => { if (levend) setCodesLaden(false) })
    return () => { levend = false }
  }, [regel.dossierId])

  const nietsGewijzigd =
    uren === regel.uren &&
    code === (regel.bewakingscode ?? '') &&
    opmerking === (regel.opmerking ?? '')

  async function bewaar() {
    if (!(uren > 0 && uren <= 24)) {
      toast.error(t('keurRegel.urenTussen'))
      return
    }
    const gekozen = codes.find(c => c.code === code)
    const codeGewijzigd = code !== (regel.bewakingscode ?? '')
    setBezig(true)
    // Een code die nog niet onder Arbeid staat krijgt die link pas bij het opslaan.
    let pslId: number | null = gekozen?.pslId ?? null
    if (codeGewijzigd && gekozen && pslId == null && regel.dossierId) {
      const psl = await zorgUrenDoelPsl(regel.dossierId, { code: gekozen.code, hoofdstukId: gekozen.hoofdstukId }).catch(() => null)
      if (!psl || !psl.ok) { setBezig(false); toast.error(psl?.error ?? t('keuren.bouw7Onbereikbaar')); return }
      pslId = psl.pslId
    }
    const r = await corrigeerUurregelMobiel(regel.id, {
      ...(uren !== regel.uren ? { uren } : {}),
      ...(codeGewijzigd ? { bewakingscodePslId: pslId } : {}),
      ...(opmerking !== (regel.opmerking ?? '') ? { opmerking } : {}),
    }).catch(() => null)
    setBezig(false)

    if (!r) { toast.error(t('keuren.bouw7Onbereikbaar')); return }
    if (!r.ok) { toast.error(r.error); return }

    toast.success(t('keurRegel.aangepast'))
    onKlaar()
    onSluit()
  }

  const datum = (() => {
    try { return format(parseISO(regel.datum), 'EEEE d MMMM', { locale: dfLocale }) } catch { return regel.datum }
  })()

  // Namen van codes komen uit de begroting (kantoor); in een <option> kan geen component.
  const codeNamen = useVertalingen(codes.map(c => c.naam))

  return (
    <BottomSheet titel={t('keurRegel.titel')} onSluit={onSluit}>
      <div style={{ fontSize: 13, color: GRIJS, marginTop: -4 }}>
        {regel.medewerkerNaam} · {datum}
        {regel.uursoort && <>{' · '}<VertaalbareTekst tekst={regel.uursoort} label={false} /></>}
      </div>

      <div>
        <span style={labelStijl}>{t('keurRegel.uren')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StapKnop
            aria-label={t('keurRegel.kwartierEraf')}
            onClick={() => setUren(u => Math.max(STAP, Math.round((u - STAP) * 100) / 100))}
            uit={uren <= STAP}
          >
            <Minus size={22} strokeWidth={2.4} />
          </StapKnop>

          <div style={{
            flex: 1, textAlign: 'center', fontSize: 30, fontWeight: 800,
            color: 'var(--fg)', letterSpacing: '-0.02em',
          }}>
            {uurTekst(uren)}
            <span style={{ fontSize: 14, fontWeight: 600, color: GRIJS, marginLeft: 6 }}>{t('eenheid.uur')}</span>
          </div>

          <StapKnop
            aria-label={t('keurRegel.kwartierErbij')}
            onClick={() => setUren(u => Math.min(24, Math.round((u + STAP) * 100) / 100))}
            uit={uren >= 24}
          >
            <Plus size={22} strokeWidth={2.4} />
          </StapKnop>
        </div>
        {uren !== regel.uren && (
          <div style={{ fontSize: 12, color: GRIJS, marginTop: 8, textAlign: 'center' }}>
            {t('keurRegel.stondOp', { uren: uurTekst(regel.uren) })}
          </div>
        )}
      </div>

      {regel.dossierId && (
        <div>
          <span style={labelStijl}>{t('keurRegel.bewakingscode')}</span>
          <select
            value={code}
            onChange={e => setCode(e.target.value)}
            disabled={codesLaden}
            style={veld}
          >
            <option value="">{codesLaden ? t('keurRegel.codesLaden') : t('keurRegel.geenCode')}</option>
            {/* De huidige code staat er altijd tussen, ook als hij niet in de opgehaalde
                lijst voorkomt — anders springt het veld stilletjes naar "Geen code". */}
            {!codesLaden && code && !codes.some(c => c.code === code) && (
              <option value={code}>{code}</option>
            )}
            {codes.map((c, i) => (
              <option key={c.sleutel} value={c.code}>
                {c.code}{c.naam ? ` · ${codeNamen[i]?.tekst ?? c.naam}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span style={labelStijl}>{t('keurRegel.opmerking')}</span>
        <textarea
          value={opmerking}
          onChange={e => setOpmerking(e.target.value)}
          rows={2}
          placeholder={t('keurRegel.opmerkingVoorbeeld')}
          style={{ ...veld, resize: 'vertical' }}
        />
      </div>

      <button
        type="button"
        onClick={bewaar}
        disabled={bezig || nietsGewijzigd}
        style={{
          minHeight: 48, borderRadius: 12, border: 'none',
          background: bezig || nietsGewijzigd ? '#c9d2d6' : GROEN,
          color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {bezig ? t('knop.bezig') : nietsGewijzigd ? t('keurRegel.nietsGewijzigd') : t('knop.opslaan')}
      </button>
    </BottomSheet>
  )
}

function StapKnop({ onClick, uit, children, ...rest }: {
  onClick: () => void
  uit: boolean
  children: React.ReactNode
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uit}
      style={{
        width: 52, height: 52, flexShrink: 0, borderRadius: 26,
        border: '1px solid var(--border)', background: 'var(--bg)',
        color: uit ? '#c9d2d6' : 'var(--fg)',
        display: 'grid', placeItems: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
