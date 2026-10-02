'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import type { UursoortOptie, WeekRegel, RegelInvoer } from '@/lib/uren/weekstaat'
import { getDossierOpties } from '@/lib/uren/weekstaat'
import { getBewakingscodesVoorUurlog, type BewakingscodeOptie } from '@/lib/dossiers/actions'

/**
 * Bottom sheet om één urenregel toe te voegen of te wijzigen.
 *
 * De volgorde volgt wat de monteur weet: eerst wát hij deed (uursoort), dan wáár (project +
 * bewakingscode, alleen bij werk-uren), dan hoeveel. De uren gaan met grote plus/min-knoppen in
 * stappen van een kwartier — tikken in een cijferveld is op een telefoon met werkhanden lastig.
 */

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#6b757c',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

/** De groepen in de keuzelijst; de koppen staan in `uren.regel.categorie.*`. */
const CATEGORIEEN = ['werk', 'tijd_voor_tijd', 'afwezig', 'feestdag'] as const

export default function RegelSheet({
  datum, uursoorten, regel, onSluit, onBewaar,
}: {
  datum: string
  uursoorten: UursoortOptie[]
  /** Gevuld = bewerken, leeg = nieuw. */
  regel: WeekRegel | null
  onSluit: () => void
  onBewaar: (invoer: RegelInvoer) => Promise<{ ok: boolean; error?: string }>
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const [uursoortId, setUursoortId] = useState(regel?.uursoort_id ?? uursoorten[0]?.id ?? '')
  const [uren, setUren] = useState(regel?.uren ?? 8)
  const [dossierId, setDossierId] = useState(regel?.dossier_id ?? '')
  const [code, setCode] = useState(regel?.bewakingscode ?? '')
  const [opmerking, setOpmerking] = useState(regel?.opmerking ?? '')
  const [bezig, setBezig] = useState(false)

  const [dossiers, setDossiers] = useState<Array<{ id: string; label: string; gekoppeld: boolean; indirect: boolean; servicedesk: boolean }>>([])
  const [codes, setCodes] = useState<BewakingscodeOptie[]>([])
  const [codesLaden, setCodesLaden] = useState(false)

  const soort = uursoorten.find(u => u.id === uursoortId)
  const isWerk = soort?.categorie === 'werk'
  // Overheadwerk op een indirecte-urendossier: daar staat geen begroting tegenover, dus is er
  // geen bewakingscode te kiezen en vraagt het scherm er ook niet om.
  const isIndirect = dossiers.some(d => d.id === dossierId && d.indirect)
  const isBon = dossiers.some(d => d.id === dossierId && d.servicedesk)

  // De opdrachten waaraan deze medewerker gekoppeld is staan bovenaan; de rest blijft kiesbaar.
  useEffect(() => {
    if (!isWerk) return
    let levend = true
    getDossierOpties(datum).then(d => { if (levend) setDossiers(d) })
    return () => { levend = false }
  }, [datum, isWerk])

  // Alleen codes waar prognose-uren op staan: de monteur kiest uit het werk dat voor dit project
  // begroot is, niet uit de volledige codelijst.
  useEffect(() => {
    if (!isWerk || !dossierId || isIndirect) { setCodes([]); return }
    let levend = true
    setCodesLaden(true)
    getBewakingscodesVoorUurlog(dossierId, { alleenMetPrognose: true })
      .then(c => { if (levend) setCodes(c) })
      .finally(() => { if (levend) setCodesLaden(false) })
    return () => { levend = false }
  }, [dossierId, isWerk, isIndirect])

  async function bewaar() {
    setBezig(true)
    const r = await onBewaar({
      datum,
      uren,
      uursoort_id: uursoortId,
      dossier_id: isWerk ? (dossierId || null) : null,
      bewakingscode: isWerk ? (code || null) : null,
      bouw7_psl_id: isWerk ? (codes.find(c => c.code === code)?.pslId ?? null) : null,
      opmerking: opmerking || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error ?? t('regel.opslaanMislukt')); return }
    onSluit()
  }

  // Uursoorten gegroepeerd, zodat "Gewerkt" en "Niet gewerkt" visueel uit elkaar liggen.
  const groepen = CATEGORIEEN
    .map(c => ({ categorie: c, opties: uursoorten.filter(u => u.categorie === c) }))
    .filter(g => g.opties.length > 0)

  // Namen van uursoorten en codes stelt kantoor in; in een <option> kan geen component, dus
  // hier de hook. In het Nederlands komt de tekst ongewijzigd terug.
  const uursoortNamen = useVertalingen(uursoorten.map(u => u.naam))
  const naamVanUursoort = new Map(uursoorten.map((u, i) => [u.id, uursoortNamen[i]?.tekst ?? u.naam]))
  const codeNamen = useVertalingen(codes.map(c => c.naam))

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--bg-elev)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 16px', flexShrink: 0 }} />
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', marginBottom: 16, flexShrink: 0 }}>
          {regel ? t('regel.titelAanpassen') : t('regel.titelNieuw')}
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Wat */}
          <div>
            <label style={labelStijl}>{t('regel.watGedaan')}</label>
            <select value={uursoortId} onChange={e => { setUursoortId(e.target.value); setCode('') }} style={veld}>
              {groepen.map(g => (
                <optgroup key={g.categorie} label={t(`regel.categorie.${g.categorie}`)}>
                  {g.opties.map(o => <option key={o.id} value={o.id}>{naamVanUursoort.get(o.id) ?? o.naam}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {isWerk && (
            <>
              <div>
                <label style={labelStijl}>{t('regel.project')}</label>
                <select value={dossierId} onChange={e => { setDossierId(e.target.value); setCode('') }} style={veld}>
                  <option value="">{t('regel.kiesProject')}</option>
                  {dossiers.some(d => d.gekoppeld) && (
                    <optgroup label={t('regel.jouwProjecten')}>
                      {dossiers.filter(d => d.gekoppeld).map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={t('regel.overigeOpdrachten')}>
                    {dossiers.filter(d => !d.gekoppeld && !d.indirect && !d.servicedesk).map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </optgroup>
                  {dossiers.some(d => !d.gekoppeld && !d.indirect && d.servicedesk) && (
                    <optgroup label={t('regel.servicedeskbonnen')}>
                      {dossiers.filter(d => !d.gekoppeld && !d.indirect && d.servicedesk).map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {dossiers.some(d => d.indirect) && (
                    <optgroup label={t('regel.indirecteUren')}>
                      {dossiers.filter(d => d.indirect).map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {isIndirect ? (
                <p style={{ fontSize: 12.5, color: '#6b757c', margin: '-6px 0 0', lineHeight: 1.45 }}>
                  {t('regel.indirectUitleg')}
                </p>
              ) : (
                <div>
                  <label style={labelStijl}>{t('regel.bewakingscode')}</label>
                  <select value={code} onChange={e => setCode(e.target.value)} style={veld}
                    disabled={!dossierId || codesLaden}>
                    <option value="">
                      {!dossierId ? t('regel.kiesEerstProject')
                        : codesLaden ? t('regel.codesOphalen')
                        : codes.length === 0 ? (isBon ? t('regel.geenCodeOpBon') : t('regel.geenCodesBegroot'))
                        : t('regel.kiesCode')}
                    </option>
                    {codes.map((c, i) => (
                      <option key={c.pslId} value={c.code}>
                        {c.code}{c.naam ? ` · ${codeNamen[i]?.tekst ?? c.naam}` : ''}
                        {c.prognoseUren > 0 ? ` ${t('regel.begroot', { uren: c.prognoseUren.toLocaleString(locale) })}` : ''}
                      </option>
                    ))}
                  </select>
                  {dossierId && !codesLaden && codes.length === 0 && (isBon ? (
                    <p style={{ fontSize: 12, color: '#6b757c', margin: '6px 0 0' }}>
                      {t('regel.bonZonderCode')}
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: '#a15c00', margin: '6px 0 0' }}>
                      {t('regel.geenBegroteUren')}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Hoeveel */}
          <div>
            <label style={labelStijl}>{t('regel.hoeveelUur')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button type="button" onClick={() => setUren(u => Math.max(0.25, Math.round((u - 0.25) * 100) / 100))}
                style={stapKnop}>−</button>
              <div style={{
                flex: 1, textAlign: 'center', fontSize: 30, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums', color: 'var(--fg)',
              }}>
                {uren.toLocaleString(locale)}<span style={{ fontSize: 16, fontWeight: 600, color: '#6b757c' }}> {t('eenheid.uur')}</span>
              </div>
              <button type="button" onClick={() => setUren(u => Math.min(24, Math.round((u + 0.25) * 100) / 100))}
                style={stapKnop}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {[4, 6, 7.5, 8, 9].map(v => (
                <button key={v} type="button" onClick={() => setUren(v)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                    border: `1.5px solid ${uren === v ? '#009439' : 'var(--border)'}`,
                    background: uren === v ? 'rgba(0,148,57,0.08)' : 'transparent',
                    color: uren === v ? '#009439' : '#6b757c',
                  }}>
                  {v.toLocaleString(locale)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStijl}>{t('regel.opmerking')}</label>
            <input type="text" value={opmerking} onChange={e => setOpmerking(e.target.value)}
              placeholder={t('regel.opmerkingVoorbeeld')} style={veld} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
          <button type="button" onClick={onSluit} style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
            {t('knop.annuleren')}
          </button>
          <button type="button" onClick={bewaar} disabled={bezig}
            style={{ ...actieKnop, background: '#009439', color: '#fff', border: 'none', opacity: bezig ? 0.6 : 1 }}>
            {bezig ? t('knop.bezig') : t('knop.opslaan')}
          </button>
        </div>
      </div>
    </div>
  )
}

const stapKnop: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 26, flexShrink: 0,
  border: '1.5px solid var(--border)', background: 'var(--bg)',
  fontSize: 26, fontWeight: 700, color: 'var(--fg)', cursor: 'pointer', lineHeight: 1,
}

const actieKnop: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 11, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}
