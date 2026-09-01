'use client'

/**
 * CalculatiesTabel — versie-kiezer: het tussenscherm dat bij het openen van de
 * Calculatie-tab verschijnt. Eén rij per versie (calculatie), gesorteerd op
 * familie + versienummer. Elke versie heeft ten hoogste één offerte; een versie
 * zonder offerte is een calculatie in bewerking ("Nog geen offerte"). Een
 * verzonden (definitieve) versie is alleen-lezen — je maakt een nieuwe versie via
 * "Reviseren" (kopieert de calculatie; de offerte maak je daarna opnieuw).
 * Meerwerk-calculaties staan in een eigen blok en zijn óók te reviseren — ook ná
 * opdracht. Losse offertes zonder versie in dit project staan onder "Overige offertes".
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Copy, Calculator } from 'lucide-react'
import { Card, CardHeader, CardBody, Button, Badge } from '@/components/ui'
import { fmt, fmtDatum, TH, TD } from '@/components/dossiers/tabs/tab-ui'
import { berekenCalcTotalen, type CalcTotalen } from '@/lib/everts-calc/calc-totalen'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { versieRootVan } from '@/lib/everts-calc/versie'
import type { Scenario } from '@/lib/everts-calc/types'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'

const TYPE_LABELS: Record<string, string> = {
  verkoopofferte: 'Offerte', interne_calculatie: 'Interne begroting',
}
const STATUS_LABELS: Record<string, string> = {
  concept: 'Concept', verzonden: 'Definitief',
}
const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  concept: 'neutral', verzonden: 'success',
}

interface Props {
  projectId: string
  scenarios: Scenario[]
  rijen: DossierQuoteRij[]
  /** Refresh-teller zodat de totalen na een wijziging herberekenen. */
  tick?: number
  readOnly?: boolean
  onOpenCalculatie: (scenarioId: string) => void
  onOpenOfferte: (quoteId: string) => void
  /** Reviseren van een contractversie: maak een nieuwe versie van deze (definitieve)
   *  calculatie. Weglaten (in de Opdracht-fase — daar is opdracht gegeven op de
   *  contractcalculatie) verbergt de Reviseren-knop in het Versies-blok. */
  onReviseer?: (scenarioId: string) => void
  /** Reviseren van een meerwerk-calculatie. Staat los van `onReviseer`: meerwerk mag
   *  ook ná opdracht nog een nieuwe versie krijgen. */
  onReviseerMeerwerk?: (scenarioId: string) => void
  /** Extra knoppen in de kaartkop (bijv. Verwijderen op de opdracht-tab). */
  headerExtra?: ReactNode
}

export default function CalculatiesTabel({
  projectId, scenarios, rijen, tick = 0, readOnly = false,
  onOpenCalculatie, onOpenOfferte, onReviseer, onReviseerMeerwerk, headerExtra,
}: Props) {
  // Totalen per calculatie, gerekend over de gedeelde calculatie uit Supabase
  // (één snapshot voor alle versies) — niet uit de lokale kopie van dit apparaat.
  const [totalenPerScenario, setTotalenPerScenario] = useState<Map<string, CalcTotalen | null>>(new Map())
  useEffect(() => {
    let actief = true
    laadCalculatieSnapshot(projectId)
      .then(snap => {
        if (!actief) return
        const map = new Map<string, CalcTotalen | null>()
        for (const s of scenarios) map.set(s.id, berekenCalcTotalen(snap, s.id))
        setTotalenPerScenario(map)
      })
      .catch(() => { if (actief) setTotalenPerScenario(new Map()) })
    return () => { actief = false }
  }, [projectId, scenarios, tick])

  const scenarioIds = new Set(scenarios.map(s => s.id))
  // Offerte van een (contract- of meerwerk-)scenario: de offerte van dit scenario.
  const offerteVan = (sid: string) =>
    rijen.find(r => r.scenario_id === sid && !r.meerwerk_regel_id) ?? null
  const meerwerkOfferteVan = (sid: string) =>
    rijen.find(r => r.scenario_id === sid) ?? null
  // Meerwerk-scenario's staan in hetzelfde dossier-project maar apart gemarkeerd; ze
  // tellen niet als contractversie. Revisies van hetzelfde meerwerk staan onder elkaar.
  const meerwerkScenarios = scenarios
    .filter(s => s.meerwerk_regel_id)
    .sort((a, b) => {
      const ma = a.meerwerk_regel_id ?? '', mb = b.meerwerk_regel_id ?? ''
      if (ma !== mb) return ma < mb ? -1 : 1
      return (a.versie ?? 1) - (b.versie ?? 1)
    })
  // Overige offertes: alleen echt losse offertes (geen scenario in dít project). Meerwerk-
  // offertes met een scenario in dit project verschijnen in het Meerwerk-blok.
  const overigeOffertes = rijen.filter(
    r => !r.scenario_id || !scenarioIds.has(r.scenario_id),
  )

  // Versies (contract, dus zonder meerwerk-markering) op familie + versienummer.
  const versies = useMemo(
    () => scenarios.filter(s => !s.meerwerk_regel_id).sort((a, b) => {
      const ra = versieRootVan(a), rb = versieRootVan(b)
      if (ra !== rb) return ra < rb ? -1 : 1
      return (a.versie ?? 1) - (b.versie ?? 1)
    }),
    [scenarios],
  )

  return (
    <div className="px-8 py-7 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Versies</span>
            {headerExtra}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Nummer</TH>
                <TH>Versie</TH>
                <TH>Offerte</TH>
                <TH right>Excl. BTW</TH>
                <TH right>Incl. BTW</TH>
                <TH right>Marge</TH>
                <TH>Verzonden</TH>
                <TH right>Acties</TH>
              </tr>
            </thead>
            <tbody>
              {versies.map(s => {
                const t = totalenPerScenario.get(s.id)
                const offerte = offerteVan(s.id)
                const definitief = offerte?.status === 'verzonden'
                return (
                  <tr
                    key={s.id}
                    onClick={() => onOpenCalculatie(s.id)}
                    className="cursor-pointer hover:bg-neutral-50"
                    title="Calculatie openen"
                  >
                    <TD vet>{s.nummer || offerte?.quote_nummer || '—'}</TD>
                    <TD>
                      v{s.versie ?? 1}{' '}
                      {definitief
                        ? <Badge tone="success">Definitief</Badge>
                        : <Badge tone="neutral">Concept</Badge>}
                    </TD>
                    <TD>
                      {offerte ? (
                        <span
                          onClick={e => { e.stopPropagation(); onOpenOfferte(offerte.id) }}
                          className="cursor-pointer"
                          title="Offerte openen"
                        >
                          <Badge tone={STATUS_TONE[offerte.status] ?? 'neutral'}>
                            {TYPE_LABELS[offerte.type] ?? offerte.type}
                            {' · '}{STATUS_LABELS[offerte.status] ?? offerte.status}
                          </Badge>
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-[12.5px]">Nog geen offerte</span>
                      )}
                    </TD>
                    <TD right>{t ? fmt(t.subtotaal_ex_btw, true) : '—'}</TD>
                    <TD right vet>{t ? fmt(t.totaal_incl_btw, true) : '—'}</TD>
                    <TD right kleur={t && t.marge_pct < 10 ? '#d9534f' : undefined}>
                      {t ? `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(t.marge_pct)} %` : '—'}
                    </TD>
                    <TD>{offerte?.verzonden_at ? fmtDatum(offerte.verzonden_at) : '—'}</TD>
                    <TD right>
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => onOpenCalculatie(s.id)}>
                          <Calculator className="h-3.5 w-3.5" /> Openen
                        </Button>
                        {definitief && !readOnly && onReviseer && (
                          <Button variant="ghost" size="sm" onClick={() => onReviseer(s.id)} title="Nieuwe versie op basis van deze calculatie">
                            <Copy className="h-3.5 w-3.5" /> Reviseren
                          </Button>
                        )}
                      </div>
                    </TD>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Meerwerk-calculaties: scenario's in dit dossier-project, apart gemarkeerd. */}
      {meerwerkScenarios.length > 0 && (
        <Card>
          <CardHeader>Meerwerk-calculaties</CardHeader>
          <CardBody style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH>Meerwerk</TH>
                  <TH>Versie</TH>
                  <TH>Offerte</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>Incl. BTW</TH>
                  <TH right>Marge</TH>
                  <TH right>Acties</TH>
                </tr>
              </thead>
              <tbody>
                {meerwerkScenarios.map(s => {
                  const t = totalenPerScenario.get(s.id)
                  const offerte = meerwerkOfferteVan(s.id)
                  const definitief = offerte?.status === 'verzonden'
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onOpenCalculatie(s.id)}
                      className="cursor-pointer hover:bg-neutral-50"
                      title="Meerwerk-calculatie openen"
                    >
                      <TD vet>{s.naam || s.nummer || '—'}</TD>
                      <TD>
                        v{s.versie ?? 1}{' '}
                        {definitief
                          ? <Badge tone="success">Definitief</Badge>
                          : <Badge tone="neutral">Concept</Badge>}
                      </TD>
                      <TD>
                        {offerte ? (
                          <span
                            onClick={e => { e.stopPropagation(); onOpenOfferte(offerte.id) }}
                            className="cursor-pointer"
                            title="Offerte openen"
                          >
                            <Badge tone={STATUS_TONE[offerte.status] ?? 'neutral'}>
                              {offerte.quote_nummer}{' · '}{STATUS_LABELS[offerte.status] ?? offerte.status}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-[12.5px]">Nog geen offerte</span>
                        )}
                      </TD>
                      <TD right>{t ? fmt(t.subtotaal_ex_btw, true) : '—'}</TD>
                      <TD right vet>{t ? fmt(t.totaal_incl_btw, true) : '—'}</TD>
                      <TD right kleur={t && t.marge_pct < 10 ? '#d9534f' : undefined}>
                        {t ? `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(t.marge_pct)} %` : '—'}
                      </TD>
                      <TD right>
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => onOpenCalculatie(s.id)}>
                            <Calculator className="h-3.5 w-3.5" /> Openen
                          </Button>
                          {definitief && !readOnly && onReviseerMeerwerk && (
                            <Button variant="ghost" size="sm" onClick={() => onReviseerMeerwerk(s.id)} title="Nieuwe versie van deze meerwerk-calculatie">
                              <Copy className="h-3.5 w-3.5" /> Reviseren
                            </Button>
                          )}
                        </div>
                      </TD>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* Losse offertes zonder gekoppelde calculatie-versie in dit project. */}
      {overigeOffertes.length > 0 && (
        <Card>
          <CardHeader>Overige offertes</CardHeader>
          <CardBody style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH>Nummer</TH><TH>Titel</TH><TH>Type</TH><TH>Status</TH>
                  <TH>Datum</TH><TH right>Excl. BTW</TH><TH right>Incl. BTW</TH>
                </tr>
              </thead>
              <tbody>
                {overigeOffertes.map(r => (
                  <tr key={r.id} onClick={() => onOpenOfferte(r.id)} className="cursor-pointer hover:bg-neutral-50" title="Offerte openen">
                    <TD vet>{r.quote_nummer}</TD>
                    <TD>{r.titel}</TD>
                    <TD>
                      {r.meerwerk_regel_id
                        ? <Badge tone="brand">Meerwerk</Badge>
                        : <Badge tone="neutral">{TYPE_LABELS[r.type] ?? r.type}</Badge>}
                    </TD>
                    <TD><Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABELS[r.status] ?? r.status}</Badge></TD>
                    <TD>{fmtDatum(r.datum)}</TD>
                    <TD right>{fmt(r.subtotaal_ex_btw, true)}</TD>
                    <TD right vet>{fmt(r.totaal_inc_btw, true)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
