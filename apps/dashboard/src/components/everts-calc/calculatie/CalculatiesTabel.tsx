'use client'

/**
 * CalculatiesTabel — overzicht van alle calculaties (scenario's) van één
 * calc-project, met per calculatie de bijbehorende offertes. Wordt getoond
 * zodra er meer dan één calculatie per dossier is (kopiëren). Klikken op een
 * calculatie opent die in de calculatie-omgeving; klikken op een offerte opent
 * de offerte inline.
 */

import { useMemo, type ReactNode } from 'react'
import { Copy, Calculator } from 'lucide-react'
import { Card, CardHeader, CardBody, Button, Badge } from '@/components/ui'
import { fmt, fmtDatum, TH, TD } from '@/components/dossiers/tabs/tab-ui'
import { berekenCalcTotalenVoorProject } from '@/lib/everts-calc/calc-totalen'
import type { Scenario } from '@/lib/everts-calc/types'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'

const TYPE_LABELS: Record<string, string> = {
  verkoopofferte: 'Offerte', interne_calculatie: 'Interne begroting',
}
const STATUS_LABELS: Record<string, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen', verlopen: 'Verlopen',
}
const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  concept: 'neutral', verzonden: 'info', geaccepteerd: 'success',
  afgewezen: 'error', verlopen: 'warning',
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
  onKopieer: (scenarioId: string) => void
  /** Extra knoppen in de kaartkop (bijv. Verwijderen op de opdracht-tab). */
  headerExtra?: ReactNode
}

function OfferteRegels({ rijen, onOpen }: { rijen: DossierQuoteRij[]; onOpen: (id: string) => void }) {
  return (
    <>
      {rijen.map(r => (
        <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-neutral-50" title="Offerte openen">
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
          <TD right kleur={r.marge_pct != null && r.marge_pct < 10 ? '#d9534f' : undefined}>
            {r.marge_pct != null
              ? `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(r.marge_pct)} %`
              : '—'}
          </TD>
        </tr>
      ))}
    </>
  )
}

export default function CalculatiesTabel({
  projectId, scenarios, rijen, tick = 0, readOnly = false,
  onOpenCalculatie, onOpenOfferte, onKopieer, headerExtra,
}: Props) {
  // Totalen per calculatie (client-side uit localStorage).
  const totalenPerScenario = useMemo(() => {
    const map = new Map<string, ReturnType<typeof berekenCalcTotalenVoorProject>>()
    for (const s of scenarios) map.set(s.id, berekenCalcTotalenVoorProject(projectId, s.id))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scenarios, tick])

  const scenarioIds = new Set(scenarios.map(s => s.id))
  const offertesPerScenario = (sid: string) => rijen.filter(r => r.scenario_id === sid)
  const overigeOffertes = rijen.filter(r => !r.scenario_id || !scenarioIds.has(r.scenario_id))

  return (
    <div className="px-8 py-7 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Calculaties</span>
            {headerExtra}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Calculatie</TH>
                <TH>Offertes</TH>
                <TH right>Excl. BTW</TH>
                <TH right>Incl. BTW</TH>
                <TH right>Marge</TH>
                <TH right>Acties</TH>
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => {
                const t = totalenPerScenario.get(s.id)
                const aantal = offertesPerScenario(s.id).length
                return (
                  <tr
                    key={s.id}
                    onClick={() => onOpenCalculatie(s.id)}
                    className="cursor-pointer hover:bg-neutral-50"
                    title="Calculatie openen"
                  >
                    <TD vet>
                      {s.naam}{' '}
                      {s.is_standaard && <Badge tone="info">standaard</Badge>}
                    </TD>
                    <TD>{aantal > 0 ? `${aantal} offerte${aantal !== 1 ? 's' : ''}` : '—'}</TD>
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
                        {!readOnly && (
                          <Button variant="ghost" size="sm" onClick={() => onKopieer(s.id)} title="Calculatie kopiëren">
                            <Copy className="h-3.5 w-3.5" /> Kopiëren
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

      {/* Offertes per calculatie */}
      {scenarios.map(s => {
        const eigen = offertesPerScenario(s.id)
        if (eigen.length === 0) return null
        return (
          <Card key={`off-${s.id}`}>
            <CardHeader>Offertes — {s.naam}</CardHeader>
            <CardBody style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <TH>Nummer</TH><TH>Titel</TH><TH>Type</TH><TH>Status</TH>
                    <TH>Datum</TH><TH right>Excl. BTW</TH><TH right>Incl. BTW</TH><TH right>Marge</TH>
                  </tr>
                </thead>
                <tbody><OfferteRegels rijen={eigen} onOpen={onOpenOfferte} /></tbody>
              </table>
            </CardBody>
          </Card>
        )
      })}

      {overigeOffertes.length > 0 && (
        <Card>
          <CardHeader>Overige offertes</CardHeader>
          <CardBody style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH>Nummer</TH><TH>Titel</TH><TH>Type</TH><TH>Status</TH>
                  <TH>Datum</TH><TH right>Excl. BTW</TH><TH right>Incl. BTW</TH><TH right>Marge</TH>
                </tr>
              </thead>
              <tbody><OfferteRegels rijen={overigeOffertes} onOpen={onOpenOfferte} /></tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
