'use client'

/**
 * Opname binnen een dossier (desktop). Zichtbaar zodra de dossier-toggle `mutatie_opname` aanstaat.
 *
 * De opnemer werkt op /m; dit scherm is voor de calculator. Daarom staan hier wél de bedragen, de
 * kostprijs en de marge — en de knop die de opname omzet naar een calculatie.
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getOpnamesVoorDossier,
  getOpnameMetRegels,
  heropenOpname,
  startOpname,
  verwijderRegel,
} from '@/lib/opname/opnames'
import {
  OPNAME_STATUS_LABELS,
  groepeerPerRuimte,
  type Opname,
  type OpnameMetRegels,
} from '@everts/database/opname-types'
import { formatEuro } from '@/lib/everts-calc/calculations'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { useDialogen } from '@/components/ui/dialogen'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import OpnameImportKaart from './OpnameImportKaart'

const STATUS_KLEUR: Record<string, string> = {
  concept: 'bg-amber-50 text-amber-700 border-amber-200',
  gereed: 'bg-sky-50 text-sky-700 border-sky-200',
  omgezet: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  geannuleerd: 'bg-neutral-100 text-neutral-600 border-neutral-200',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        STATUS_KLEUR[status] ?? STATUS_KLEUR.geannuleerd
      }`}
    >
      {OPNAME_STATUS_LABELS[status as keyof typeof OPNAME_STATUS_LABELS] ?? status}
    </span>
  )
}

function datumKort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Props = {
  dossierId: string
  /** Aan het dossier gekoppelde calculatie (dossiers.everts_calc_project_id), of null. */
  gekoppeldProjectId: string | null
  dossierNaam: string
  /** Link naar het Calculatie-tabblad van dít dossier; de calculatie heeft geen eigen route. */
  calculatieHref: string
}

export default function OpnameTab({
  dossierId,
  gekoppeldProjectId,
  dossierNaam,
  calculatieHref,
}: Props) {
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()

  const [opnames, setOpnames] = useState<Opname[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<OpnameMetRegels | null>(null)
  const [bezig, setBezig] = useState(false)

  const laden = useCallback(async () => {
    try {
      const lijst = await getOpnamesVoorDossier(dossierId)
      setOpnames(lijst)
      // De nieuwste opname staat standaard open: in de praktijk is dat degene waar het om gaat.
      setOpen(huidig => huidig ?? lijst[0]?.id ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opnames laden mislukt')
      setOpnames([])
    }
  }, [dossierId])

  useEffect(() => {
    void laden()
  }, [laden])

  const laadDetail = useCallback(async (opnameId: string) => {
    try {
      setDetail(await getOpnameMetRegels(opnameId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opname laden mislukt')
      setDetail(null)
    }
  }, [])

  useEffect(() => {
    if (open) void laadDetail(open)
    else setDetail(null)
  }, [open, laadDetail])

  async function nieuweOpname() {
    setBezig(true)
    const res = await startOpname(dossierId)
    setBezig(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Opname gestart')
    setOpen(res.id)
    await laden()
  }

  async function regelWeg(regelId: string, omschrijving: string) {
    const ja = await bevestig({
      titel: 'Regel verwijderen?',
      omschrijving: `"${omschrijving}" wordt uit de opname gehaald. De foto's bij deze regel gaan mee.`,
      bevestigLabel: 'Verwijderen',
    })
    if (!ja) return
    const res = await verwijderRegel(regelId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (open) await laadDetail(open)
  }

  async function heropen(opnameId: string) {
    const ja = await bevestig({
      titel: 'Opname heropenen?',
      omschrijving: 'De opnemer kan er dan weer regels aan toevoegen.',
      bevestigLabel: 'Heropenen',
    })
    if (!ja) return
    const res = await heropenOpname(opnameId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    await laden()
    await laadDetail(opnameId)
  }

  if (opnames === null) {
    return <div className="px-8 py-10 text-sm text-neutral-500">Opnames laden…</div>
  }

  return (
    <div className="space-y-4 px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Opname</h2>
          <p className="text-[13px] text-neutral-500">
            Wat er ter plaatse is opgenomen, per ruimte. Van hieruit maak je er een calculatie van.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={nieuweOpname}
            disabled={bezig}
            className="rounded-md bg-[var(--brand-600,#009439)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Nieuwe opname
          </button>
        )}
      </div>

      {opnames.length === 0 ? (
        <Card>
          <EmptyState
            title="Nog geen opname"
            description="Start een opname vanaf hier, of laat de opnemer er een starten op zijn telefoon."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {opnames.map(opname => {
            const actief = open === opname.id
            const dit = actief ? detail : null
            const groepen = dit ? groepeerPerRuimte(dit.regels) : []
            const verkoop = dit ? dit.regels.reduce((s, r) => s + (r.regel_verkoop_totaal ?? 0), 0) : 0
            const kostprijs = dit ? dit.regels.reduce((s, r) => s + (r.regel_kostprijs_totaal ?? 0), 0) : 0
            const marge = verkoop > 0 ? ((verkoop - kostprijs) / verkoop) * 100 : 0

            return (
              <Card key={opname.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setOpen(actief ? null : opname.id)}
                >
                  <span className="flex items-center gap-3">
                    <span>{opname.opnamenummer}</span>
                    <span className="font-normal text-neutral-500">
                      {datumKort(opname.datum)}
                      {opname.adres_vrij ? ` · ${opname.adres_vrij}` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusChip status={opname.status} />
                    <span className="text-[11px] font-normal text-neutral-500">
                      {actief ? 'Inklappen' : 'Uitklappen'}
                    </span>
                  </span>
                </CardHeader>

                {actief && (
                  <CardBody className="space-y-4">
                    {!dit ? (
                      <div className="text-sm text-neutral-500">Regels laden…</div>
                    ) : dit.regels.length === 0 ? (
                      <div className="text-sm text-neutral-500">Deze opname is nog leeg.</div>
                    ) : (
                      <>
                        {groepen.map(groep => (
                          <div key={groep.ruimte}>
                            <div className="mb-1 flex items-baseline justify-between border-b border-neutral-200 pb-1">
                              <span className="text-[13px] font-semibold text-neutral-800">{groep.ruimte}</span>
                              <span className="text-[12px] tabular-nums text-neutral-500">
                                {formatEuro(groep.verkoop_totaal)}
                              </span>
                            </div>
                            <table className="w-full text-[12.5px]">
                              <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-400">
                                  <th className="w-20 py-1 font-semibold">Code</th>
                                  <th className="py-1 font-semibold">Omschrijving</th>
                                  <th className="w-24 py-1 text-right font-semibold">Aantal</th>
                                  <th className="w-24 py-1 text-right font-semibold">Prijs p.e.</th>
                                  <th className="w-28 py-1 text-right font-semibold">Totaal</th>
                                  <th className="w-28 py-1 font-semibold">Foto&apos;s</th>
                                  <th className="w-8 py-1" />
                                </tr>
                              </thead>
                              <tbody>
                                {groep.regels.map(regel => {
                                  const fotos = dit.fotos.filter(f => f.regel_id === regel.id)
                                  return (
                                    <tr key={regel.id} className="border-b border-neutral-100 align-top">
                                      <td className="py-1.5 text-neutral-500">{regel.onderdeel_code ?? '—'}</td>
                                      <td className="py-1.5">
                                        <div className="text-neutral-800">{regel.omschrijving}</div>
                                        {regel.toelichting_opnemer && (
                                          <div className="text-[11.5px] italic text-neutral-500">
                                            {regel.toelichting_opnemer}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums">
                                        {regel.aantal} {regel.eenheid}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-neutral-600">
                                        {formatEuro(regel.verkoop_pe ?? 0)}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums font-medium">
                                        {formatEuro(regel.regel_verkoop_totaal ?? 0)}
                                      </td>
                                      <td className="py-1.5">
                                        {fotos.length === 0 ? (
                                          <span className="text-neutral-300">—</span>
                                        ) : (
                                          <div className="flex gap-1">
                                            {fotos.slice(0, 3).map(f => (
                                              <a
                                                key={f.id}
                                                href={f.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={f.is_hoofdfoto ? 'Hoofdfoto — gaat mee naar de offerte' : 'Foto'}
                                                className={`block h-9 w-9 shrink-0 overflow-hidden rounded border ${
                                                  f.is_hoofdfoto ? 'border-[var(--brand-400,#4caf7d)]' : 'border-neutral-200'
                                                }`}
                                              >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={f.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                                              </a>
                                            ))}
                                            {fotos.length > 3 && (
                                              <span className="self-center text-[11px] text-neutral-400">
                                                +{fotos.length - 3}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        {!readOnly && opname.status === 'concept' && (
                                          <button
                                            type="button"
                                            onClick={() => regelWeg(regel.id, regel.omschrijving)}
                                            title="Regel verwijderen"
                                            className="text-neutral-400 hover:text-red-600"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}

                        <div className="flex flex-wrap items-center justify-end gap-6 border-t border-neutral-200 pt-3 text-[13px]">
                          <span className="text-neutral-500">
                            Kostprijs <span className="tabular-nums text-neutral-700">{formatEuro(kostprijs)}</span>
                          </span>
                          <span className="text-neutral-500">
                            Marge <span className="tabular-nums text-neutral-700">{marge.toFixed(1)}%</span>
                          </span>
                          <span className="font-semibold text-neutral-900">
                            Totaal <span className="tabular-nums">{formatEuro(verkoop)}</span>
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {!readOnly && opname.status !== 'concept' && (
                        <button
                          type="button"
                          onClick={() => heropen(opname.id)}
                          className="rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Heropenen
                        </button>
                      )}
                      <a
                        href={`/m/opname/${opname.id}`}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Openen zoals op de telefoon
                      </a>
                    </div>

                    {!readOnly && dit && dit.regels.length > 0 && (
                      <OpnameImportKaart
                        dossierId={dossierId}
                        opname={opname}
                        aantalRegels={dit.regels.length}
                        gekoppeldProjectId={gekoppeldProjectId}
                        dossierNaam={dossierNaam}
                        calculatieHref={calculatieHref}
                        onKlaar={async () => {
                          await laden()
                          await laadDetail(opname.id)
                        }}
                      />
                    )}
                  </CardBody>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
