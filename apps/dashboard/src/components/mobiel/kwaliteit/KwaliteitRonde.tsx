'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import type { InspectieContext } from '@/lib/kwaliteit/inspecties'
import type { KwaliteitDiscipline } from '@everts/database/kwaliteit-types'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { samenvatting, steekproefSignaal } from '@/lib/kwaliteit/regels'
import DisciplineStap from './DisciplineStap'
import OpenAfwijkingen from './OpenAfwijkingen'
import PuntKaart from './PuntKaart'
import WaarnemingBlok from './WaarnemingBlok'
import AfrondStap from './AfrondStap'
import { GRIJS, GROEN, primaireKnop, RAND, ROOD, secundaireKnop, TEKST, ZACHT } from './stijl'

type Stap = 'disciplines' | 'eerder' | 'doorloop' | 'afronden'

/** Uitklappijltjes; geen tekst. */
const PIJL = { open: '▴', dicht: '▾' }

/**
 * De mobiele kwaliteitsronde in vier stappen.
 *
 * Stap 1 is bewust de disciplinekeuze: de opzichter bepaalt wat hij deze ronde controleert, en pas
 * daarna laat de app de bijbehorende controlepunten zien. Van 167 punten in de bibliotheek blijven
 * er zo doorgaans 15 tot 35 over.
 *
 * Er is geen aparte conceptopslag: elk controlepunt wordt bij het aantikken meteen weggeschreven.
 * `router.refresh()` haalt daarna de verse server-state op — dat is trager dan optimistisch
 * bijwerken, maar op een ronde met foto's en afwijkingen is "wat op het scherm staat is ook wat er
 * is opgeslagen" belangrijker.
 */
export default function KwaliteitRonde({
  context,
  disciplines,
}: {
  context: InspectieContext
  disciplines: (KwaliteitDiscipline & { aantal: number })[]
}) {
  const t = useTranslations('kwaliteit')
  const router = useRouter()
  const [stap, setStap] = React.useState<Stap>(
    context.resultaten.length > 0 ? 'doorloop' : 'disciplines',
  )
  const [openDisciplines, setOpenDisciplines] = React.useState<Set<string>>(new Set(['ALG']))

  const bewerkbaar = context.inspectie.status === 'concept'
  const ververs = React.useCallback(() => router.refresh(), [router])

  const resultaatPerPunt = React.useMemo(() => {
    const m = new Map<string, (typeof context.resultaten)[number]>()
    for (const r of context.resultaten) m.set(r.controlepunt_id, r)
    return m
  }, [context.resultaten])

  const bevindingenPerResultaat = React.useMemo(() => {
    const m = new Map<string, typeof context.afwijkingen>()
    for (const a of context.afwijkingen) {
      if (!a.resultaat_id) continue
      m.set(a.resultaat_id, [...(m.get(a.resultaat_id) ?? []), a])
    }
    return m
  }, [context.afwijkingen])

  /** Locaties die al in deze ronde zijn gebruikt; die staan in de kiezer vooraan. */
  const recenteLocaties = React.useMemo(() => {
    const gezien: string[] = []
    for (const a of [...context.afwijkingen].reverse()) {
      const l = a.locatie?.trim()
      if (l && !gezien.some(g => g.toLowerCase() === l.toLowerCase())) gezien.push(l)
    }
    return gezien
  }, [context.afwijkingen])

  const telling = samenvatting(context.resultaten, context.afwijkingen)
  const bekeken = context.inspectie.steekproef_bekeken
  const afwijkend = context.inspectie.steekproef_afwijkend
  // De regel (wanneer is het een signaal) blijft in regels.ts; alleen de zin komt uit de taalbestanden.
  const signaal = steekproefSignaal(bekeken, afwijkend) && bekeken && afwijkend !== null
    ? t('ronde.steekproefSignaal', { afwijkend, bekeken, pct: Math.round((afwijkend / bekeken) * 100) })
    : null

  const gekozen = context.inspectie.discipline_codes ?? []
  const disciplineNaam = React.useMemo(
    () => new Map(disciplines.map(d => [d.code, d.naam])),
    [disciplines],
  )
  // Namen van disciplines komen uit de bibliotheek van kantoor: vertalen als leeshulp.
  const gekozenNamen = useVertalingen(gekozen.map(c => disciplineNaam.get(c) ?? c))

  // Controlepunten gegroepeerd per discipline, in de volgorde waarin de opzichter ze koos.
  const groepen = React.useMemo(() => {
    const perCode = new Map<string, typeof context.controlepunten>()
    for (const p of context.controlepunten) {
      perCode.set(p.discipline_code, [...(perCode.get(p.discipline_code) ?? []), p])
    }
    return disciplines
      .filter(d => perCode.has(d.code))
      .map(d => ({ discipline: d, punten: perCode.get(d.code)! }))
  }, [context.controlepunten, disciplines])

  if (stap === 'disciplines') {
    return (
      <DisciplineStap
        context={context}
        disciplines={disciplines}
        bewerkbaar={bewerkbaar}
        onVerder={() => { ververs(); setStap(context.openEerdere.length > 0 ? 'eerder' : 'doorloop') }}
      />
    )
  }

  if (stap === 'eerder') {
    return (
      <OpenAfwijkingen
        inspectieId={context.inspectie.id}
        afwijkingen={context.openEerdere}
        bewerkbaar={bewerkbaar}
        onGewijzigd={ververs}
        onTerug={() => setStap('disciplines')}
        onVerder={() => setStap('doorloop')}
      />
    )
  }

  if (stap === 'afronden') {
    return (
      <AfrondStap
        context={context}
        telling={telling}
        bewerkbaar={bewerkbaar}
        onTerug={() => setStap('doorloop')}
        onGewijzigd={ververs}
      />
    )
  }

  /* ── Doorloop ──────────────────────────────────────────────────────────── */
  const vet = (c: React.ReactNode) => <strong>{c}</strong>
  const tellingTekst = {
    beoordeeld: t.rich('ronde.beoordeeld', { aantal: telling.beoordeeld, b: (c) => <strong style={{ color: TEKST }}>{c}</strong> }),
    voldoet: t.rich('ronde.voldoet', { aantal: telling.voldoet, b: vet }),
    voldoetNiet: t.rich('ronde.voldoetNiet', { aantal: telling.voldoet_niet, b: vet }),
    nietBeoordeeld: t.rich('ronde.nietBeoordeeld', { aantal: telling.niet_beoordeeld, b: vet }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Live samenvatting; blijft in beeld zodat de opzichter zijn ronde kan overzien. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-elev)',
        borderBottom: `1px solid ${RAND}`, padding: '10px 14px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: GRIJS, flexWrap: 'wrap' }}>
          <span>{tellingTekst.beoordeeld}</span>
          <span style={{ color: GROEN }}>{tellingTekst.voldoet}</span>
          <span style={{ color: ROOD }}>{tellingTekst.voldoetNiet}</span>
          {telling.niet_beoordeeld > 0 && <span>{tellingTekst.nietBeoordeeld}</span>}
          {telling.kritiek > 0 && (
            <span style={{ color: ROOD, fontWeight: 700 }}>{t('ronde.kritiek', { aantal: telling.kritiek })}</span>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 14px 0', flex: 1 }}>
        {!bewerkbaar && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, background: 'var(--warning-50)',
            border: '1px solid var(--warning-300)', color: 'var(--warning-700)',
            fontSize: 12.5, marginBottom: 12,
          }}>
            {t('ronde.alleenLezen')}
          </div>
        )}

        {context.openEerdere.length > 0 && (
          <button
            type="button"
            onClick={() => setStap('eerder')}
            style={{
              width: '100%', marginBottom: 12, padding: '11px 12px', borderRadius: 10,
              border: `1px solid ${RAND}`, background: 'var(--bg-elev)', color: GRIJS,
              fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
            }}
          >
            {t('ronde.openEerdere', { aantal: context.openEerdere.length })}
          </button>
        )}

        {signaal && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, background: 'var(--warning-50)',
            border: '1px solid var(--warning-300)', color: 'var(--warning-700)',
            fontSize: 12.5, marginBottom: 12,
          }}>
            {signaal}
          </div>
        )}

        {groepen.map(({ discipline, punten }) => {
          const open = openDisciplines.has(discipline.code)
          const gedaan = punten.filter(p => resultaatPerPunt.has(p.id)).length
          return (
            <section key={discipline.code} style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setOpenDisciplines(prev => {
                  const s = new Set(prev)
                  if (s.has(discipline.code)) s.delete(discipline.code); else s.add(discipline.code)
                  return s
                })}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '13px 14px', borderRadius: 12, border: `1px solid ${RAND}`,
                  background: 'var(--bg-elev)', cursor: 'pointer', minHeight: 48,
                }}
              >
                <VertaalbareTekst label={false} tekst={discipline.naam}
                  style={{ fontSize: 14.5, fontWeight: 700, color: TEKST, textAlign: 'left' }} />
                <span style={{ fontSize: 12, color: gedaan === punten.length ? GROEN : GRIJS, fontWeight: 600 }}>
                  {gedaan}/{punten.length} {open ? PIJL.open : PIJL.dicht}
                </span>
              </button>

              {open && (
                <div style={{ marginTop: 8 }}>
                  {punten.map(p => {
                    const res = resultaatPerPunt.get(p.id)
                    return (
                      <PuntKaart
                        key={p.id}
                        punt={p}
                        resultaat={res}
                        bevindingen={res ? bevindingenPerResultaat.get(res.id) ?? [] : []}
                        fotos={context.fotos}
                        projectEisen={context.projectEisen}
                        recenteLocaties={recenteLocaties}
                        inspectieId={context.inspectie.id}
                        bewerkbaar={bewerkbaar}
                        onGewijzigd={ververs}
                      />
                    )
                  })}
                  <WaarnemingBlok
                    inspectieId={context.inspectie.id}
                    disciplineCode={discipline.code}
                    disciplineNaam={discipline.naam}
                    waarnemingen={context.waarnemingen.filter(w => w.discipline_code === discipline.code)}
                    fotos={context.fotos}
                    recenteLocaties={recenteLocaties}
                    bewerkbaar={bewerkbaar}
                    onGewijzigd={ververs}
                  />
                </div>
              )}
            </section>
          )
        })}

        {groepen.length === 0 && (
          <p style={{ fontSize: 13, color: ZACHT, textAlign: 'center', padding: '32px 0' }}>
            {t('ronde.geenDisciplines')}
          </p>
        )}

        <p style={{ fontSize: 11, color: ZACHT, textAlign: 'center', margin: '18px 0 0' }}>
          {t('ronde.disciplinesGekozen', { lijst: gekozenNamen.map(v => v.tekst).join(' · ') })}
        </p>
      </div>

      <MobielStickyFooter>
        <button type="button" onClick={() => setStap('disciplines')} style={{ ...secundaireKnop, flex: '0 0 auto' }}>
          {t('ronde.knopDisciplines')}
        </button>
        <button type="button" onClick={() => setStap('afronden')} style={{ ...primaireKnop, flex: 1 }}>
          {bewerkbaar ? t('ronde.knopAfronden') : t('ronde.knopOverzicht')}
        </button>
      </MobielStickyFooter>
    </div>
  )
}
