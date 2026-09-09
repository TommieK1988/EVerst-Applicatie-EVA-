'use client'

/**
 * Uitvraag-tab: bij wie is voor dit dossier een prijs opgevraagd, en wat staat er nog open.
 *
 * Inline bewerken en geen venster per regel: alle velden zijn één datum of één korte tekst, en vier
 * datums invullen via vier keer openen/sluiten is nodeloos werk. Alleen het mailen krijgt een venster.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Badge, EmptyState, useDialogen } from '@/components/ui'
import {
  uitvraagStatusLabels, uitvraagSoortLabels, UITVRAAG_TRANSITIES,
  type UitvraagStatus, type UitvraagSoort,
} from '@everts/database'
import {
  getDossierUitvragen, getDisciplineSuggesties, maakUitvraag, updateUitvraag,
  setUitvraagStatus, verwijderUitvraag, type UitvraagView,
} from '@/lib/dossiers/uitvragen'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import PartijKiezer from '../PartijKiezer'
import UitvraagMailVenster from './UitvraagMailVenster'

type Props = { dossierId: string }


/** Statuskleuren, gelijk aan de tonen van de Badge (zie ui/badge.tsx). */
const STATUS_SELECT_TONE: Record<UitvraagStatus, string> = {
  open:        'bg-info-50 border-info-300 text-info-700',
  ontvangen:   'bg-brand-50 border-brand-300 text-brand-700',
  gegund:      'bg-success-50 border-success-300 text-success-700',
  afgevallen:  'bg-error-50 border-error-300 text-error-700',
  ingetrokken: 'bg-neutral-50 border-neutral-300 text-neutral-700',
}

const inlineCls =
  'w-full rounded border border-neutral-200 bg-white px-1.5 py-1 text-[12.5px] text-neutral-800 outline-none focus:border-brand-500 disabled:bg-neutral-50 disabled:text-neutral-500'
const datumCls = `${inlineCls} tabular-nums`

const nlDatum = (iso?: string | null) => {
  if (!iso) return ''
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso
}

export default function UitvraagTab({ dossierId }: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()

  const [rijen, setRijen] = useState<UitvraagView[] | null>(null)
  const [suggesties, setSuggesties] = useState<string[]>([])
  const [bezig, setBezig] = useState(false)
  const [mailVoor, setMailVoor] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [nieuw, setNieuw] = useState<{
    discipline: string; soort: UitvraagSoort
    relatie_id: string | null; partij_naam: string; reactie_uiterlijk: string
  }>({ discipline: '', soort: 'onderaannemer', relatie_id: null, partij_naam: '', reactie_uiterlijk: '' })

  const herlaad = useCallback(async () => {
    setRijen(await getDossierUitvragen(dossierId))
  }, [dossierId])

  useEffect(() => {
    let actief = true
    getDossierUitvragen(dossierId).then(r => { if (actief) setRijen(r) })
    getDisciplineSuggesties().then(s => { if (actief) setSuggesties(s) }).catch(() => {})
    return () => { actief = false }
  }, [dossierId])

  async function voegToe() {
    if (!nieuw.discipline.trim()) { toast.error('Vul een discipline in.'); return }
    if (!nieuw.partij_naam)       { toast.error('Kies een partij.'); return }
    setBezig(true)
    const r = await maakUitvraag(dossierId, {
      discipline: nieuw.discipline,
      soort: nieuw.soort,
      relatie_id: nieuw.relatie_id,
      partij_naam: nieuw.partij_naam,
      reactie_uiterlijk: nieuw.reactie_uiterlijk || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    setNieuw({ discipline: '', soort: nieuw.soort, relatie_id: null, partij_naam: '', reactie_uiterlijk: '' })
    setFormOpen(false)
    await herlaad()
    getDisciplineSuggesties().then(setSuggesties).catch(() => {})
    router.refresh()
  }

  /** Eén veld opslaan. De rij wordt meteen lokaal bijgewerkt zodat het veld niet terugspringt. */
  async function bewaar(rij: UitvraagView, patch: Parameters<typeof updateUitvraag>[1]) {
    const r = await updateUitvraag(rij.id, patch)
    if (!r.ok) { toast.error(r.error); await herlaad(); return }
    await herlaad()
    router.refresh()
  }

  async function zetStatus(rij: UitvraagView, status: UitvraagStatus) {
    setBezig(true)
    const r = await setUitvraagStatus(rij.id, status)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    await herlaad()
    router.refresh()
  }

  async function verwijder(rij: UitvraagView) {
    const ok = await bevestig({
      titel: `Uitvraag bij ${rij.partij_naam} verwijderen?`,
      omschrijving: 'De regel verdwijnt van dit dossier.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ok) return
    setBezig(true)
    const r = await verwijderUitvraag(rij.id)
    setBezig(false)
    // Een verstuurde uitvraag mag niet verdwijnen; de datalaag biedt "intrekken" als alternatief.
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Verwijderd')
    await herlaad()
    router.refresh()
  }

  if (rijen == null) {
    return <div className="px-8 py-7 text-[13px] text-neutral-500">Uitvragen laden…</div>
  }

  const open      = rijen.filter(r => r.status === 'open').length
  const ontvangen = rijen.filter(r => r.status === 'ontvangen').length
  const teLaat    = rijen.filter(r => r.te_laat).length

  return (
    <div className="px-8 py-7 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Uitvraag</span>
              {rijen.length > 0 && (
                <span className="text-[12px] font-normal text-neutral-500">
                  {open} open · {ontvangen} ontvangen
                  {teLaat > 0 && <span className="text-error-600 font-medium"> · {teLaat} te laat</span>}
                </span>
              )}
            </div>
            {!readOnly && rijen.length > 0 && (
              <Button variant="primary" onClick={() => setFormOpen(o => !o)} disabled={bezig}>
                {formOpen ? 'Annuleren' : 'Uitvraag toevoegen'}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardBody>
          {rijen.length === 0 && !formOpen ? (
            <EmptyState
              title="Nog niets uitgevraagd"
              description="Leg hier vast bij welke onderaannemers en leveranciers je een prijs hebt opgevraagd, en houd bij wat er nog open staat."
              actions={!readOnly ? <Button variant="primary" onClick={() => setFormOpen(true)}>Uitvraag toevoegen</Button> : undefined}
            />
          ) : (
            <>
              {formOpen && !readOnly && (
                <div className="mb-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <div className="grid grid-cols-4 gap-3">
                    <label className="text-[12px] font-medium text-neutral-700">
                      Discipline
                      <input
                        className={`${inlineCls} mt-1`}
                        list="uitvraag-disciplines"
                        placeholder="Bijv. Dak"
                        value={nieuw.discipline}
                        onChange={e => setNieuw(n => ({ ...n, discipline: e.target.value }))}
                      />
                      {/* Vrije tekst, met wat collega's eerder typten als suggestie. */}
                      <datalist id="uitvraag-disciplines">
                        {suggesties.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </label>

                    <label className="text-[12px] font-medium text-neutral-700">
                      Soort
                      <select
                        className={`${inlineCls} mt-1`}
                        value={nieuw.soort}
                        onChange={e => setNieuw(n => ({
                          // Partij wissen: een leverancier staat niet in de onderaannemerslijst.
                          ...n, soort: e.target.value as UitvraagSoort, relatie_id: null, partij_naam: '',
                        }))}
                      >
                        <option value="onderaannemer">Onderaannemer</option>
                        <option value="leverancier">Leverancier</option>
                      </select>
                    </label>

                    <label className="text-[12px] font-medium text-neutral-700">
                      Partij
                      <div className="mt-1">
                        <PartijKiezer
                          soort={nieuw.soort}
                          naam={nieuw.partij_naam || null}
                          onKies={(id, naam) => setNieuw(n => ({ ...n, relatie_id: id, partij_naam: naam }))}
                          onWis={() => setNieuw(n => ({ ...n, relatie_id: null, partij_naam: '' }))}
                        />
                      </div>
                    </label>

                    <label className="text-[12px] font-medium text-neutral-700">
                      Reactie uiterlijk
                      <input
                        type="date"
                        className={`${datumCls} mt-1`}
                        value={nieuw.reactie_uiterlijk}
                        onChange={e => setNieuw(n => ({ ...n, reactie_uiterlijk: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={bezig}>Annuleren</Button>
                    <Button variant="primary" onClick={voegToe} disabled={bezig}>Toevoegen</Button>
                  </div>
                </div>
              )}

              {rijen.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        <th className="py-2 pr-3 font-semibold">Discipline</th>
                        <th className="py-2 pr-3 font-semibold">Partij</th>
                        <th className="py-2 pr-3 font-semibold">Status</th>
                        <th className="py-2 pr-3 font-semibold">Aangevraagd</th>
                        <th className="py-2 pr-3 font-semibold">Uiterlijk</th>
                        <th className="py-2 pr-3 font-semibold">Ontvangen</th>
                        <th className="py-2 pr-3 font-semibold">Open</th>
                        <th className="py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {rijen.map(rij => {
                        const status = rij.status as UitvraagStatus
                        return (
                          <tr key={rij.id} className="border-b border-neutral-100 align-top">
                            <td className="py-2 pr-3 w-[16%]">
                              <input
                                className={inlineCls}
                                defaultValue={rij.discipline}
                                disabled={readOnly}
                                list="uitvraag-disciplines"
                                onBlur={e => {
                                  const v = e.target.value.trim()
                                  if (v && v !== rij.discipline) bewaar(rij, { discipline: v })
                                }}
                              />
                            </td>

                            <td className="py-2 pr-3 w-[20%]">
                              <div className="flex flex-col gap-0.5">
                                {rij.relatie_id ? (
                                  <Link href={`/relaties/${rij.relatie_id}`} className="truncate text-neutral-800 hover:underline">
                                    {rij.partij_naam}
                                  </Link>
                                ) : (
                                  <span className="truncate text-neutral-800">{rij.partij_naam}</span>
                                )}
                                <span className="text-[11px] text-neutral-400">
                                  {uitvraagSoortLabels[rij.soort]}
                                  {rij.partij_inactief && <span className="text-warning-600"> · inactief</span>}
                                  {!rij.partij_email && !rij.laatst_gemaild_naar?.length && (
                                    <span className="text-warning-600"> · geen e-mailadres</span>
                                  )}
                                </span>
                              </div>
                            </td>

                            <td className="py-2 pr-3 w-[13%]">
                              <select
                                className={`h-7 w-full rounded-md border px-1.5 text-[12px] font-medium outline-none disabled:opacity-70 ${STATUS_SELECT_TONE[status]}`}
                                value={status}
                                disabled={readOnly || bezig}
                                onChange={e => zetStatus(rij, e.target.value as UitvraagStatus)}
                              >
                                {/* Alleen de huidige stand plus de stappen die daarvandaan mogen.
                                    Dezelfde map die de server hanteert, zodat de lijst nooit een
                                    keuze aanbiedt die daarna wordt geweigerd. */}
                                {[status, ...(UITVRAAG_TRANSITIES[status] ?? [])].map(s => (
                                  <option key={s} value={s}>{uitvraagStatusLabels[s]}</option>
                                ))}
                              </select>
                            </td>

                            <td className="py-2 pr-3 w-[11%]">
                              <input
                                type="date"
                                className={datumCls}
                                defaultValue={rij.aangevraagd_op ?? ''}
                                disabled={readOnly}
                                onBlur={e => {
                                  const v = e.target.value || null
                                  if (v !== rij.aangevraagd_op) bewaar(rij, { aangevraagd_op: v })
                                }}
                              />
                            </td>

                            <td className="py-2 pr-3 w-[11%]">
                              <input
                                type="date"
                                className={`${datumCls} ${rij.te_laat ? 'border-error-300 text-error-700' : ''}`}
                                defaultValue={rij.reactie_uiterlijk ?? ''}
                                disabled={readOnly}
                                onBlur={e => {
                                  const v = e.target.value || null
                                  if (v !== rij.reactie_uiterlijk) bewaar(rij, { reactie_uiterlijk: v })
                                }}
                              />
                            </td>

                            <td className="py-2 pr-3 w-[11%]">
                              <input
                                type="date"
                                className={datumCls}
                                defaultValue={rij.ontvangen_op ?? ''}
                                disabled={readOnly}
                                onBlur={e => {
                                  const v = e.target.value || null
                                  if (v !== rij.ontvangen_op) bewaar(rij, { ontvangen_op: v })
                                }}
                              />
                            </td>

                            <td className="py-2 pr-3 w-[9%] whitespace-nowrap">
                              {rij.dagen_open == null ? (
                                <span className="text-neutral-400">—</span>
                              ) : (
                                <span className={rij.te_laat ? 'font-semibold text-error-600' : 'text-neutral-600'}>
                                  {rij.dagen_open} d
                                </span>
                              )}
                              {rij.rappels > 0 && (
                                <Badge
                                  tone="warning"
                                  className="ml-1.5"
                                  title={rij.laatst_gerappelleerd_op ? `Laatst: ${nlDatum(rij.laatst_gerappelleerd_op)}` : undefined}
                                >
                                  {rij.rappels}×
                                </Badge>
                              )}
                            </td>

                            <td className="py-2 pr-1 text-right whitespace-nowrap">
                              {!readOnly && (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setMailVoor(rij.id)}
                                    title={rij.aangevraagd_op ? 'Herinnering sturen' : 'Uitvraag mailen'}
                                    className="rounded p-1 text-brand-600 hover:bg-brand-50"
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => verwijder(rij)}
                                    title="Verwijderen"
                                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-error-600"
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <UitvraagMailVenster
        uitvraagId={mailVoor}
        dossierId={dossierId}
        onSluit={() => setMailVoor(null)}
        onVerstuurd={() => { herlaad(); router.refresh() }}
      />
    </div>
  )
}
