'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { isPast, isToday, parseISO } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useVertaling } from '@/components/vertalen/useVertaling'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import { bepaalUitvoerActies } from '@/lib/taken/uitvoeracties'
import TaakUitvoerKnop, { UitvoerBadge } from './TaakUitvoerKnop'
import BottomSheet from './BottomSheet'
import type { DossierTaakRegel } from '@/lib/taken/services/taken'

/**
 * Acties-blok op de mobiele dossier-infopagina.
 *
 * Toont de vijf eerstvolgende openstaande acties; de rest én alles wat al
 * afgerond of vervallen is zit achter één uitklapknop.
 *
 * Werkt hetzelfde als de lijst in Mijn taken: tik op een actie voor het detail,
 * vink hem daar of in de lijst af, en start een formulier/ronde/toolbox met de
 * groene knop. Dit blok was eerst bewust alleen-lezen — met als gedachte dat
 * afvinken in Mijn taken hoort — maar wie op locatie een dossier openslaat wil
 * zijn werk daar kunnen wegtikken zonder eerst terug te navigeren.
 *
 * Een actie met een doorloop krijgt géén vinkje maar de badge van die doorloop: zo'n
 * actie sluit zichzelf zodra de registratie binnen is, en handmatig afvinken wordt
 * serverzijdig geweigerd.
 */

const TOP = 5

// `hoog` toont hier bewust als Urgent; vandaar een eigen sleutel naast de kleur.
const PRIO: Record<string, { sleutel: 'urgent' | 'normaal' | 'laag'; c: string; bg: string }> = {
  urgent:  { sleutel: 'urgent',  c: '#b42318', bg: '#fef3f2' },
  hoog:    { sleutel: 'urgent',  c: '#b42318', bg: '#fef3f2' },
  normaal: { sleutel: 'normaal', c: '#b85a00', bg: '#fff6ec' },
  laag:    { sleutel: 'laag',    c: '#6b757c', bg: '#f1f4f5' },
}

function deadlineLabel(
  iso: string | null, locale: string, vandaag: string,
): { tekst: string; kleur: string } | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    if (isNaN(d.getTime())) return null
    const kleur = isPast(d) && !isToday(d) ? '#b42318' : isToday(d) ? '#b85a00' : '#6b757c'
    const tekst = isToday(d) ? vandaag : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    return { tekst, kleur }
  } catch { return null }
}

function Vinkvakje({ afgerond, bezig, onClick }: {
  afgerond: boolean
  bezig: boolean
  onClick?: () => void
}) {
  const t = useTranslations('taken')
  const inhoud = afgerond ? (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : null

  const stijl: React.CSSProperties = {
    width: 22, height: 22, flexShrink: 0, marginTop: 1, borderRadius: 6, padding: 0,
    border: `2px solid ${afgerond ? '#009439' : 'var(--border)'}`,
    background: afgerond ? '#009439' : 'transparent',
    display: 'grid', placeItems: 'center',
    opacity: bezig ? 0.5 : 1,
  }

  if (!onClick) return <div style={stijl}>{inhoud}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bezig}
      aria-label={t('afvinkenLabel')}
      style={{ ...stijl, cursor: bezig ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}
    >
      {inhoud}
    </button>
  )
}

function TaakRegel({ taak, bezig, onAfvinken, onOpenen }: {
  taak: DossierTaakRegel
  bezig: boolean
  onAfvinken: () => void
  onOpenen: () => void
}) {
  const t = useTranslations('taken')
  const locale = useDatumLocale()
  const prio = PRIO[taak.prioriteit] ?? PRIO.normaal
  const dl = deadlineLabel(taak.deadline, locale, t('vandaag'))
  const acties = bepaalUitvoerActies(taak)
  const heeftDoorloop = acties.length > 0

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid #f0f3f4', opacity: taak.afgerond ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Hangt er een doorloop aan de actie, dan geen afvinkvakje maar het icoon ervan:
            het formulier, de ronde of de toolbox zet de actie zelf op gereed. */}
        {heeftDoorloop && !taak.afgerond ? (
          <UitvoerBadge actie={acties[0]} />
        ) : (
          <Vinkvakje
            afgerond={taak.afgerond}
            bezig={bezig}
            onClick={taak.afgerond ? undefined : onAfvinken}
          />
        )}

        <button
          type="button"
          onClick={onOpenen}
          style={{
            flex: 1, minWidth: 0, display: 'block', textAlign: 'left',
            background: 'none', border: 'none', padding: 0, margin: 0,
            font: 'inherit', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <VertaalbareTekst
              tekst={taak.titel}
              label={false}
              style={{
                flex: 1, minWidth: 0,
                fontSize: 14, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4,
                textDecoration: taak.afgerond ? 'line-through' : 'none',
              }}
            />
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9aa4ab" strokeWidth={2}
              style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {!taak.afgerond && (
              <span style={{ fontSize: 10, fontWeight: 700, color: prio.c, background: prio.bg, padding: '2px 8px', borderRadius: 99 }}>
                {t(`prioriteit.${prio.sleutel}`)}
              </span>
            )}
            {taak.status === 'in_behandeling' && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#1f6feb', background: '#eef4ff', padding: '2px 8px', borderRadius: 99 }}>
                {t('dossierBlok.statusBezig')}
              </span>
            )}
            {dl && <span style={{ fontSize: 11, fontWeight: 700, color: taak.afgerond ? '#9aa4ab' : dl.kleur }}>{dl.tekst}</span>}
            {taak.assignee_naam && <span style={{ fontSize: 11, color: '#6b757c' }}>{taak.assignee_naam}</span>}
          </div>
        </button>
      </div>

      {/* Startknop meteen in de lijst: op locatie is dat de handeling waarvoor je het dossier
          openslaat. Alleen als je de doorloop ook mág openen — anders loopt hij op notFound(). */}
      {!taak.afgerond && taak.mag_uitvoeren && acties.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0 2px 32px' }}>
          {acties.map(actie => <TaakUitvoerKnop key={actie.soort} actie={actie} />)}
        </div>
      )}
    </div>
  )
}

export default function DossierActiesBlok({ taken }: { taken: DossierTaakRegel[] }) {
  const t = useTranslations('taken')
  const locale = useDatumLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<DossierTaakRegel | null>(null)
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function zetStatus(taak: DossierTaakRegel, status: 'gereed' | 'in_behandeling') {
    setFout(null)
    setBezig(taak.id)
    startTransition(async () => {
      try {
        await updateTaakStatus(taak.id, status)
        setDetail(null)
        // Geen optimistische streep maar een echte verversing: het afronden kan
        // vervolgacties in gang zetten (substatus, volgende sjabloontaak) die je
        // in dezelfde lijst hoort terug te zien.
        router.refresh()
      } catch (e) {
        setFout(e instanceof Error ? e.message : t('dossierBlok.bijwerkenMislukt'))
      } finally {
        setBezig(null)
      }
    })
  }

  const openstaand = taken.filter(tk => !tk.afgerond)
  const afgerond = taken.filter(tk => tk.afgerond)
  const eerste = openstaand.slice(0, TOP)
  const rest = [...openstaand.slice(TOP), ...afgerond]

  const detailActies = detail ? bepaalUitvoerActies(detail) : []
  // De titel van het paneel is een string-prop; daarom hier de hook in plaats van <VertaalbareTekst>.
  const detailTitel = useVertaling(detail?.titel ?? null)
  const detailDeadline = detail ? deadlineLabel(detail.deadline, locale, t('vandaag')) : null
  const detailPrio = detail ? (PRIO[detail.prioriteit] ?? PRIO.normaal) : PRIO.normaal

  const regel = (tk: DossierTaakRegel) => (
    <TaakRegel
      key={tk.id}
      taak={tk}
      bezig={bezig === tk.id}
      onAfvinken={() => zetStatus(tk, 'gereed')}
      onOpenen={() => { setFout(null); setDetail(tk) }}
    />
  )

  return (
    <div style={{
      background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '14px 16px 4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b757c' }}>{t('titel')}</span>
        {taken.length > 0 && (
          <span style={{ fontSize: 12, color: '#9aa4ab' }}>
            {openstaand.length === 0 ? t('dossierBlok.allesAfgerond') : t('aantalOpen', { aantal: openstaand.length })}
          </span>
        )}
      </div>

      {fout && !detail && (
        <div style={{
          fontSize: 13, color: '#b42318', background: '#fef3f2', borderRadius: 8,
          padding: '10px 12px', marginBottom: 8, lineHeight: 1.45,
        }}>
          {fout}
        </div>
      )}

      {taken.length === 0 ? (
        <div style={{ fontSize: 14, color: '#9aa4ab', padding: '4px 0 14px' }}>
          {t('dossierBlok.geenActies')}
        </div>
      ) : (
        <>
          {eerste.length === 0 && (
            <div style={{ fontSize: 14, color: '#9aa4ab', padding: '4px 0 6px', borderTop: '1px solid #f0f3f4' }}>
              {t('dossierBlok.alleAfgerond')}
            </div>
          )}
          {eerste.map(regel)}
          {open && rest.map(regel)}

          {rest.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              style={{
                width: '100%', padding: '12px 0', marginTop: 2,
                borderTop: '1px solid #f0f3f4', border: 'none', borderTopWidth: 1, borderTopStyle: 'solid',
                background: 'none', color: '#009439', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {open ? t('dossierBlok.minderTonen') : t('dossierBlok.toonAlle', { aantal: rest.length })}
            </button>
          )}
          {rest.length === 0 && <div style={{ height: 10 }} />}
        </>
      )}

      {detail && (
        <BottomSheet titel={detailTitel.tekst} sluitLabel={t('sluiten')} onSluit={() => setDetail(null)}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '3px 9px',
              color: detailPrio.c,
              background: detailPrio.bg,
            }}>
              {t(`prioriteit.${detailPrio.sleutel}`)}
            </span>
            {detailDeadline && (
              <span style={{ fontSize: 12, fontWeight: 700, color: detailDeadline.kleur }}>
                {detailDeadline.tekst}
              </span>
            )}
            {detail.assignee_naam && <span style={{ fontSize: 12, color: '#6b757c' }}>{detail.assignee_naam}</span>}
            {detail.lijst_naam && <span style={{ fontSize: 12, color: '#9aa4ab' }}>{detail.lijst_naam}</span>}
          </div>

          {detail.omschrijving != null ? (
            <VertaalbareTekst
              as="div"
              tekst={detail.omschrijving}
              style={{ fontSize: 14, color: '#3a444b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}
            />
          ) : (
            <div style={{ fontSize: 14, color: '#3a444b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {t('dossierBlok.geenOmschrijving')}
            </div>
          )}

          {fout && (
            <div style={{
              fontSize: 13, color: '#b42318', background: '#fef3f2', borderRadius: 8,
              padding: '10px 12px', lineHeight: 1.45,
            }}>
              {fout}
            </div>
          )}

          {!detail.afgerond && detail.mag_uitvoeren &&
            detailActies.map(actie => <TaakUitvoerKnop key={actie.soort} actie={actie} />)}

          {detail.afgerond ? (
            <div style={{ fontSize: 13, color: '#6b757c' }}>
              {detail.status === 'vervallen' ? t('dossierBlok.isVervallen') : t('dossierBlok.isAfgerond')}
            </div>
          ) : detailActies.length > 0 ? (
            <div style={{ fontSize: 13, color: '#6b757c', lineHeight: 1.45 }}>
              {detail.mag_uitvoeren
                ? t('dossierBlok.uitlegZin', { uitleg: t(`uitvoer.${detailActies[0].soort}.uitleg`) })
                : t('dossierBlok.vanIemandAnders')}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => zetStatus(detail, 'gereed')}
                disabled={bezig === detail.id}
                style={{
                  padding: '14px 16px', borderRadius: 10, border: 'none',
                  background: '#009439', color: '#fff', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: 700,
                  cursor: bezig === detail.id ? 'default' : 'pointer',
                  opacity: bezig === detail.id ? 0.6 : 1,
                }}
              >
                {bezig === detail.id ? t('bezig') : t('dossierBlok.afvinken')}
              </button>
              {/* Oppakken zonder af te ronden: zo ziet de binnendienst in het dossier dat er
                  aan gewerkt wordt. Alleen zolang de actie nog helemaal open staat. */}
              {detail.status === 'open' && (
                <button
                  type="button"
                  onClick={() => zetStatus(detail, 'in_behandeling')}
                  disabled={bezig === detail.id}
                  style={{
                    padding: '13px 16px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--fg)', fontFamily: 'inherit',
                    fontSize: 15, fontWeight: 600,
                    cursor: bezig === detail.id ? 'default' : 'pointer',
                    opacity: bezig === detail.id ? 0.6 : 1,
                  }}
                >
                  {t('dossierBlok.ermeeBezig')}
                </button>
              )}
            </>
          )}
        </BottomSheet>
      )}
    </div>
  )
}
