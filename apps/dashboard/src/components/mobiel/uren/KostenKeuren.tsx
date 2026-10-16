'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { useDatumLocale, useDateFnsLocale } from '@/i18n/client'
import { useDialogen } from '@/components/ui/dialogen'
import { keurOnkostenAf, keurOnkostenGoed } from '@/lib/uren/onkosten-goedkeuring-acties'
import type { KeurOnkosten } from '@/lib/mobiel/keuren'
import { GRIJS, GROEN, ZACHT } from './KeurenOnderdelen'

/**
 * De kosten op het fiatteerscherm, in twee delen:
 *
 * - `KostenTeKeuren` — wat bij jou ligt: kosten op jouw project (jij bent de projectleider), of
 *   zonder project van iemand die jou als goedkeurder heeft. Per post goedkeuren of afkeuren;
 *   afkeuren vraagt een reden, want die krijgt de medewerker te lezen.
 * - `KostenContext` — alleen-lezen: wat de mensen wier uren je beoordeelt verder indienden, met
 *   bij wie het ligt.
 *
 * Wie wat mag beslist de server (`keurOnkostenGoed`/`keurOnkostenAf` routeren opnieuw); dit
 * scherm mag dus optimistisch zijn: een afgehandelde post verdwijnt meteen uit de lijst.
 */

const ROOD = '#c0392b'

function useOpmaak() {
  const locale = useDatumLocale()
  const dfLocale = useDateFnsLocale()
  return {
    euro: (n: number) => `€ ${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    datumKort: (iso: string) => {
      try { return format(parseISO(iso), 'EEE d MMM', { locale: dfLocale }) } catch { return iso }
    },
    locale,
  }
}

export function KostenTeKeuren({ onkosten }: { onkosten: KeurOnkosten[] }) {
  const t = useTranslations('uren')
  const { euro } = useOpmaak()
  const { vraagTekst } = useDialogen()
  const router = useRouter()
  const [klaar, setKlaar] = React.useState<Set<string>>(new Set())
  const [bezig, setBezig] = React.useState<string | null>(null)

  const alle = onkosten.filter(k => k.magKeuren)
  const open = alle.filter(k => !klaar.has(k.id))
  if (alle.length === 0) return null
  if (open.length === 0) {
    return <p style={{ margin: 0, padding: '4px 2px', fontSize: 13, color: GROEN, fontWeight: 600 }}>{t('keuren.allesWeggewerkt')}</p>
  }

  const totaal = open.reduce((s, k) => s + k.bedrag, 0)

  async function goed(ids: string[], sleutel: string) {
    if (bezig) return
    setBezig(sleutel)
    const r = await keurOnkostenGoed(ids).catch(() => null)
    setBezig(null)
    if (!r) { toast.error(t('kostenKeuren.mislukt')); return }
    // Geweigerd: iemand anders was sneller, of de post ligt niet meer bij jou. Opnieuw ophalen
    // laat zien hoe het werkelijk staat.
    if (!r.ok) { toast.error(r.error); router.refresh(); return }
    setKlaar(prev => new Set([...prev, ...ids]))
    toast.success(t('kostenKeuren.goedgekeurdToast', { aantal: r.verwerkt }))
  }

  async function af(k: KeurOnkosten) {
    if (bezig) return
    const reden = await vraagTekst({
      titel: t('kostenKeuren.afkeurTitel'),
      omschrijving: t('kostenKeuren.afkeurUitleg', { naam: k.medewerkerNaam }),
      label: t('kostenKeuren.reden'),
      placeholder: t('kostenKeuren.redenVoorbeeld'),
      meerregelig: true,
      verplicht: true,
      bevestigLabel: t('kostenKeuren.afkeuren'),
    })
    if (!reden?.trim()) return
    setBezig(k.id)
    const r = await keurOnkostenAf(k.id, reden).catch(() => null)
    setBezig(null)
    if (!r) { toast.error(t('kostenKeuren.mislukt')); return }
    if (!r.ok) { toast.error(r.error); router.refresh(); return }
    setKlaar(prev => new Set([...prev, k.id]))
    toast.success(t('kostenKeuren.afgekeurdToast'))
  }

  return (
    <Kaart titel={t('kostenKeuren.titel')} totaal={euro(totaal)}>
      {open.map(k => (
        <div key={k.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
          <KostenRegel k={k} />
          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            <button type="button" onClick={() => af(k)} disabled={bezig !== null}
              style={{ ...knop, color: ROOD, border: '1px solid var(--border)', background: 'transparent' }}>
              {t('kostenKeuren.afkeuren')}
            </button>
            <button type="button" onClick={() => goed([k.id], k.id)} disabled={bezig !== null}
              style={{ ...knop, color: '#fff', border: 'none', background: GROEN, opacity: bezig === k.id ? 0.6 : 1 }}>
              {bezig === k.id ? t('knop.bezig') : t('kostenKeuren.goedkeuren')}
            </button>
          </div>
        </div>
      ))}

      {open.length > 1 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
          <button type="button" onClick={() => goed(open.map(k => k.id), 'alles')} disabled={bezig !== null}
            style={{
              ...knop, width: '100%', color: GROEN, background: 'rgba(0,148,57,0.08)',
              border: `1.5px solid ${GROEN}`, opacity: bezig === 'alles' ? 0.6 : 1,
            }}>
            {bezig === 'alles' ? t('knop.bezig') : t('kostenKeuren.allesGoedkeuren', { aantal: open.length, bedrag: euro(totaal) })}
          </button>
        </div>
      )}
    </Kaart>
  )
}

/** De overige kosten van de mensen wier uren je beoordeelt; alleen-lezen. */
export function KostenContext({ onkosten }: { onkosten: KeurOnkosten[] }) {
  const t = useTranslations('uren')
  const { euro } = useOpmaak()
  const overige = onkosten.filter(k => !k.magKeuren)
  if (overige.length === 0) return null

  return (
    <Kaart titel={t('kostenKeuren.overige')} totaal={euro(overige.reduce((s, k) => s + k.bedrag, 0))}>
      {overige.map(k => {
        const [tekst, kleur] =
          k.status === 'goedgekeurd'
            ? [k.beoordeeldDoorNaam ? t('kostenKeuren.goedgekeurdDoor', { naam: k.beoordeeldDoorNaam }) : t('kostenKeuren.goedgekeurd'), GROEN]
          : k.status === 'afgekeurd'
            ? [k.beoordeeldDoorNaam
                ? t('kostenKeuren.afgekeurdDoor', { naam: k.beoordeeldDoorNaam, reden: k.afkeurReden ?? '' })
                : t('weekstaat.kostenAfgekeurd', { reden: k.afkeurReden ?? '' }), ROOD]
          : [k.goedkeurderNaam ? t('keuren.wachtOp', { naam: k.goedkeurderNaam }) : t('keuren.niemand'), GRIJS]
        return (
          <div key={k.id} style={{ borderTop: '1px solid var(--border)', padding: '9px 14px' }}>
            <KostenRegel k={k} />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: kleur, marginTop: 4, paddingLeft: 44 }}>{tekst}</div>
          </div>
        )
      })}
    </Kaart>
  )
}

function Kaart({ titel, totaal, children }: { titel: string; totaal: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elev)', overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>{titel}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>{totaal}</span>
      </div>
      {children}
    </div>
  )
}

/** Bon, wat het is, van wie en voor welk project, en het bedrag. */
function KostenRegel({ k }: { k: KeurOnkosten }) {
  const t = useTranslations('uren')
  const { euro, datumKort, locale } = useOpmaak()
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {k.bonUrl ? (
        <a href={k.bonUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0, lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={k.bonUrl} alt={t('weekstaat.bonnetje')} style={{
            width: 34, height: 34, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)',
          }} />
        </a>
      ) : (
        <span style={{ width: 34, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)' }}>
          {t(`onkosten.label.${k.soort}`)}
          {k.vervoermiddel ? ` · ${t(`onkosten.vervoer.${k.vervoermiddel}`)}` : ''}
          {k.km ? ` · ${t('weekstaat.km', { km: k.km.toLocaleString(locale) })}` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: ZACHT, marginTop: 1 }}>
          {datumKort(k.datum)} · {k.medewerkerNaam}
          {k.omschrijving ? ` · ${k.omschrijving}` : ''}
        </div>
        {/* Mag afbreken: met een afkapping viel juist de rol (als projectleider) weg. */}
        <div style={{ fontSize: 11.5, color: GRIJS, marginTop: 1 }}>
          {k.project ?? t('onkosten.geenProject')}
          {k.magKeuren && k.rol ? ` · ${t(`kostenKeuren.rol.${k.rol}`)}` : ''}
        </div>
      </div>

      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{euro(k.bedrag)}</span>
    </div>
  )
}

const knop: React.CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, whiteSpace: 'normal',
}
