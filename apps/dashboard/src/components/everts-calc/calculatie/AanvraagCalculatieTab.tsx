'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import OfferteDetail from './OfferteDetail'
import { maakProjectVanAanvraag } from '@/app/(platform)/everts-calc/actions/projecten'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { Card, CardHeader, CardBody, Badge } from '@/components/ui'
import { fmt, fmtDatum, TH, TD } from '@/components/dossiers/tabs/tab-ui'
import type { DossierQuoteRij } from '@/lib/everts-calc/services/quotes'

const TYPE_LABELS: Record<string, string> = {
  verkoopofferte:     'Offerte',
  interne_calculatie: 'Interne begroting',
}
const STATUS_LABELS: Record<string, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen', verlopen: 'Verlopen',
}
const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  concept: 'neutral', verzonden: 'info', geaccepteerd: 'success',
  afgewezen: 'error', verlopen: 'warning',
}

/** Compacte lijst van aan het dossier gekoppelde offertes/calculaties. */
function OffertesLijst({ rijen, onOpen }: { rijen: DossierQuoteRij[]; onOpen: (id: string) => void }) {
  if (rijen.length === 0) return null
  return (
    <Card className="mb-4">
      <CardHeader>Offertes &amp; calculaties</CardHeader>
      <CardBody>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Nummer</TH><TH>Titel</TH><TH>Type</TH><TH>Status</TH>
              <TH>Datum</TH><TH right>Excl. BTW</TH><TH right>Incl. BTW</TH>
            </tr>
          </thead>
          <tbody>
            {rijen.map(r => (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="cursor-pointer hover:bg-neutral-50"
                title="Offerte openen"
              >
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
  )
}

const MAP_KEY = 'aanvraag_project_ids'

function leesMapping(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') } catch { return {} }
}

function schrijfMapping(map: Record<string, string>) {
  localStorage.setItem(MAP_KEY, JSON.stringify(map))
}

function migreerCalculatieData(oudId: string, nieuwId: string) {
  for (const key of ['evc_scenarios', 'evc_meetstaten', 'evc_werkbegrotingen']) {
    try {
      const data: { project_id?: string }[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      localStorage.setItem(key, JSON.stringify(
        data.map(item => item.project_id === oudId ? { ...item, project_id: nieuwId } : item)
      ))
    } catch {}
  }
}

export function slaAanvraagProjectIdOp(aanvraagId: string, projectId: string) {
  const mapping = leesMapping()
  mapping[aanvraagId] = projectId
  schrijfMapping(mapping)
}

interface Props {
  aanvraagId: string
  naam: string
  nummer: string
  /** Server-side gekoppeld everts-calc project (dossiers.everts_calc_project_id). Seedt de
   *  localStorage-mapping zodat de calculatie ook in een verse browser zichtbaar is. */
  initieelProjectId?: string | null
  /** Aan het dossier gekoppelde offertes/calculaties (server-side opgehaald). */
  rijen?: DossierQuoteRij[]
}

export function AanvraagCalculatieTab({ aanvraagId, naam, nummer, initieelProjectId, rijen = [] }: Props) {
  const readOnly = useDossierReadOnly()
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isLaden, setIsLaden]     = useState(false)
  const [fout, setFout]           = useState<string | null>(null)
  // Inline geopende offerte (master-detail); ook via ?offerte={id} na aanmaken.
  const [offerteId, setOfferteId] = useState<string | null>(null)
  useEffect(() => {
    const q = searchParams.get('offerte')
    if (q) setOfferteId(q)
  }, [searchParams])

  useEffect(() => {
    const mapping = leesMapping()
    if (mapping[aanvraagId]) {
      setProjectId(mapping[aanvraagId])
    } else if (initieelProjectId) {
      // Server zegt dat er een project gekoppeld is, maar deze browser kent de mapping nog niet.
      mapping[aanvraagId] = initieelProjectId
      schrijfMapping(mapping)
      setProjectId(initieelProjectId)
    }
  }, [aanvraagId, initieelProjectId])

  async function handleKoppelen() {
    setIsLaden(true)
    setFout(null)
    try {
      const { id } = await maakProjectVanAanvraag(naam, '')
      migreerCalculatieData(aanvraagId, id)
      const mapping = leesMapping()
      mapping[aanvraagId] = id
      schrijfMapping(mapping)
      setProjectId(id)
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Fout bij aanmaken')
    } finally {
      setIsLaden(false)
    }
  }

  // Inline offerte-detail (bekijken/goedkeuren/verzenden) binnen het dossier.
  if (offerteId) {
    return (
      <div style={{ padding: '24px 32px' }}>
        <OfferteDetail
          quoteId={offerteId}
          dossierId={aanvraagId}
          onTerug={() => setOfferteId(null)}
          onOpenOfferte={setOfferteId}
        />
      </div>
    )
  }

  if (!projectId) {
    return (
      <div style={{
        padding: '56px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 32, opacity: 0.25 }}>⚡</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Calculatie koppelen aan overzicht
        </p>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
          {readOnly
            ? 'Deze aanvraag heeft geen calculatie in het EvertsCalc-overzicht. Het dossier is afgesloten en alleen-lezen.'
            : 'Deze aanvraag heeft nog geen calculatie in het EvertsCalc-overzicht. Klik hieronder om het eenmalig aan te maken.'}
        </p>
        {!readOnly && (
          <button
            onClick={handleKoppelen}
            disabled={isLaden}
            style={{
              marginTop: 4,
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'white',
              fontSize: 13, fontWeight: 700,
              cursor: isLaden ? 'not-allowed' : 'pointer',
              opacity: isLaden ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isLaden ? 'Bezig…' : 'Calculatie aanmaken in overzicht'}
          </button>
        )}
        {fout && (
          <p style={{ fontSize: 12, color: 'var(--color-red, #dc2626)', margin: 0 }}>{fout}</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <OffertesLijst rijen={rijen} onOpen={setOfferteId} />
      <CalculatieHoofdscherm
        projectId={projectId}
        projectNaam={naam}
        projectNummer={nummer}
        toonProjectDetail
        readOnly={readOnly}
      />
    </div>
  )
}
