'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Calculator, ArrowLeft } from 'lucide-react'
import { Card, CardHeader, CardBody, Button, Badge } from '@/components/ui'
import { fmt, fmtDatum, TH, TD } from '@/components/dossiers/tabs/tab-ui'
import { koppelCalculatieProject } from '@/lib/dossiers/actions'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'
import { berekenCalcTotalenVoorProject, type CalcTotalen } from '@/lib/everts-calc/calc-totalen'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import { slaAanvraagProjectIdOp } from './AanvraagCalculatieTab'

const TYPE_LABELS: Record<string, string> = {
  verkoopofferte:     'Offerte',
  interne_calculatie: 'Interne begroting',
}

const STATUS_LABELS: Record<string, string> = {
  concept:      'Concept',
  verzonden:    'Verzonden',
  geaccepteerd: 'Geaccepteerd',
  afgewezen:    'Afgewezen',
  verlopen:     'Verlopen',
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  concept:      'neutral',
  verzonden:    'info',
  geaccepteerd: 'success',
  afgewezen:    'error',
  verlopen:     'warning',
}

type Props = {
  dossierId: string
  naam: string
  nummer: string
  /** Gekoppeld everts-calc project (dossiers.everts_calc_project_id). */
  projectId: string | null
  /** Aanmaakdatum van het calculatieproject (projects.created_at). */
  projectAangemaakt: string | null
  /** Alle aan het dossier gekoppelde calculaties/offertes (incl. meerwerk), server-side opgehaald. */
  rijen: DossierQuoteRij[]
}

export function OpdrachtCalculatieTab({ dossierId, naam, nummer, projectId, projectAangemaakt, rijen }: Props) {
  const router = useRouter()
  const [toonCalculatie, setToonCalculatie] = useState(false)
  const [bezig, setBezig] = useState(false)
  // Totalen van de calculatie zelf — client-side uit localStorage (net als InformatieTab),
  // want de calculatieregels zijn (nog) niet server-side opgeslagen.
  const [calcTotalen, setCalcTotalen] = useState<CalcTotalen | null>(null)
  useEffect(() => {
    if (!projectId) { setCalcTotalen(null); return }
    try { setCalcTotalen(berekenCalcTotalenVoorProject(projectId)) } catch { setCalcTotalen(null) }
  }, [projectId, toonCalculatie])

  async function aanmaken() {
    setBezig(true)
    const r = await koppelCalculatieProject(dossierId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    // localStorage-mapping van de calc-module bijwerken zodat de calculatie-omgeving het project kent.
    slaAanvraagProjectIdOp(dossierId, r.projectId)
    toast.success('Calculatie aangemaakt')
    router.refresh()
  }

  // Volledige calculatie-omgeving (zoals in de offerte-fase), met terugknop naar de tabel.
  if (toonCalculatie && projectId) {
    return (
      <div>
        <div className="px-8 pt-4">
          <Button variant="ghost" onClick={() => setToonCalculatie(false)}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Terug naar overzicht
          </Button>
        </div>
        <CalculatieHoofdscherm
          projectId={projectId}
          projectNaam={naam}
          projectNummer={nummer}
          toonProjectDetail
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-7 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Calculaties</span>
            {projectId ? (
              <Button variant="primary" onClick={() => setToonCalculatie(true)}>
                <Calculator className="h-3.5 w-3.5" />
                Calculatie openen
              </Button>
            ) : (
              <Button variant="primary" onClick={aanmaken} disabled={bezig}>
                <Calculator className="h-3.5 w-3.5" />
                {bezig ? 'Bezig…' : 'Calculatie aanmaken'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {!projectId ? (
            <div className="px-4 py-8 text-center">
              <div className="text-[14px] font-semibold text-neutral-800">Nog geen calculatie gekoppeld</div>
              <div className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] text-neutral-500">
                Dit dossier heeft nog geen calculatieproject. Maak er één aan om calculaties,
                offertes en meerwerk-calculaties aan dit dossier te koppelen.
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH>Nummer</TH>
                  <TH>Titel</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Datum</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>Incl. BTW</TH>
                  <TH right>Marge</TH>
                </tr>
              </thead>
              <tbody>
                {/* De calculatie zelf — altijd bovenaan; totalen client-side uit de calc-omgeving. */}
                <tr
                  onClick={() => setToonCalculatie(true)}
                  className="cursor-pointer hover:bg-neutral-50"
                  title="Calculatie openen"
                >
                  <TD vet>{nummer || '—'}</TD>
                  <TD>{`Calculatie — ${naam}`}</TD>
                  <TD><Badge tone="info">Calculatie</Badge></TD>
                  <TD>—</TD>
                  <TD>{fmtDatum(projectAangemaakt)}</TD>
                  <TD right>{calcTotalen ? fmt(calcTotalen.subtotaal_ex_btw, true) : '—'}</TD>
                  <TD right vet>{calcTotalen ? fmt(calcTotalen.totaal_incl_btw, true) : '—'}</TD>
                  <TD right kleur={calcTotalen && calcTotalen.marge_pct < 10 ? '#d9534f' : undefined}>
                    {calcTotalen
                      ? `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(calcTotalen.marge_pct)} %`
                      : '—'}
                  </TD>
                </tr>
                {rijen.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/everts-calc/quotes/${r.id}`)}
                    className="cursor-pointer hover:bg-neutral-50"
                    title="Openen in Everts Calc"
                  >
                    <TD vet>{r.quote_nummer}</TD>
                    <TD>{r.titel}</TD>
                    <TD>
                      {r.meerwerk_regel_id ? (
                        <Badge tone="brand">Meerwerk</Badge>
                      ) : (
                        <Badge tone="neutral">{TYPE_LABELS[r.type] ?? r.type}</Badge>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TD>
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
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
      {projectId && (
        <div className="text-[11.5px] leading-normal text-neutral-500">
          De calculatie en alle offertes die via het calculatieproject aan dit dossier gekoppeld zijn,
          inclusief meerwerk-offertes. Klik op een regel om deze te openen.
        </div>
      )}
    </div>
  )
}
