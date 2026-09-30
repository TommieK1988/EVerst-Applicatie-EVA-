'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ExternalLink, Send, Undo2 } from 'lucide-react'
import {
  Button, Spinner, Input, Textarea, useDialogen,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { getInkoopContractDetail, trekInkoopContractIn } from '@/lib/dossiers/inkoop-contract-actions'
import type { InkoopContractDetail, InkoopContractSoort } from '@/lib/dossiers/inkoop-contract-types'
import { getBestellingMailConcept, verstuurBestelling } from '@/app/(platform)/everts-calc/actions/bestellingen'
import MailFotoBijlagen, { alsBijlagen, type MailFoto } from '@/components/mail/MailFotoBijlagen'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import { fmt, fmtDatum } from './tab-ui'

const fmtAantal = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

/**
 * De partijnaam in de tabel Inkooporders en onderaanneming als knop: klik en je ziet wat er
 * precies is besteld of opgedragen, en je kunt het intrekken.
 *
 * Gegevens worden pas bij openen opgehaald (live uit Bouw7): de tabel zelf komt uit de
 * snapshot en die heeft de regels niet.
 */
export default function InkoopContractOpenen({
  dossierId, soort, contractId, status, children,
}: {
  dossierId: string
  soort: InkoopContractSoort
  contractId: number
  /** Statusnaam uit de tabel (Bouw7 `statusName`); het detail zelf heeft alleen een id. */
  status: string | null
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={soort === 'oa_contract' ? 'Opdracht openen' : 'Bestelling openen'}
        className="text-left text-brand-700 hover:underline"
      >
        {children}
      </button>
      {open && (
        <ContractVenster
          dossierId={dossierId} soort={soort} contractId={contractId} status={status}
          onSluit={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ContractVenster({ dossierId, soort, contractId, status, onSluit }: {
  dossierId: string
  soort: InkoopContractSoort
  contractId: number
  status: string | null
  onSluit: () => void
}) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const readOnly = useDossierReadOnly()
  const [detail, setDetail] = React.useState<InkoopContractDetail | null>(null)
  const [fout, setFout] = React.useState<string | null>(null)
  const [bezig, setBezig] = React.useState(false)
  const [modus, setModus] = React.useState<'detail' | 'mail'>('detail')
  const [mail, setMail] = React.useState({ to: '', cc: '', onderwerp: '', bericht: '' })
  const [fotos, setFotos] = React.useState<MailFoto[]>([])

  React.useEffect(() => {
    let actief = true
    getInkoopContractDetail(dossierId, soort, contractId).then(res => {
      if (!actief) return
      if (res.ok) setDetail(res.data)
      else setFout(res.error)
    })
    return () => { actief = false }
  }, [dossierId, soort, contractId])

  const isOa = soort === 'oa_contract'
  const soortLabel = isOa ? 'Opdracht onderaannemer' : 'Inkooporder'
  const partijWoord = isOa ? 'de onderaannemer' : 'de leverancier'

  async function trekIn() {
    if (!detail) return
    const verstuurd = !!detail.verstuurdOp || !detail.uitEva
    const ok = await bevestig({
      titel: `${isOa ? 'Opdracht' : 'Bestelling'} intrekken?`,
      omschrijving: [
        `${detail.nummer ?? 'Dit contract'} en de leverbon worden in Bouw7 verwijderd.`,
        verstuurd
          ? `Let op: ${partijWoord}${detail.partij ? ` (${detail.partij})` : ''} kan de opdracht al hebben ontvangen. EVA stuurt geen bericht — laat het ${partijWoord} zelf weten.`
          : null,
        detail.uitEva ? 'De bestelling in de werkbegroting gaat terug naar concept; de regels zijn daarna weer te bestellen.' : null,
      ].filter(Boolean).join(' '),
      bevestigLabel: 'Intrekken',
      destructief: true,
    })
    if (!ok) return
    setBezig(true)
    const res = await trekInkoopContractIn(dossierId, soort, contractId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    toast.success(`${isOa ? 'Opdracht' : 'Bestelling'} ingetrokken`)
    onSluit()
    router.refresh()
  }

  const kanIntrekken = !!detail && !readOnly && detail.geboekteBonnen.length === 0

  /**
   * Versturen kan hier ook — op een servicedeskbon is er geen werkbegroting, dus zonder deze
   * knop bleef een order die bij het aanmaken op "Later versturen" ging voorgoed op "To send".
   * Alleen voor een EVA-bestelling (die heeft het document en de afroep) die nog niet verstuurd
   * is; een reservering gaat nooit naar de partij.
   */
  const kanVersturen = !!detail && !readOnly && !!detail.bestellingId && !detail.verstuurdOp && !detail.isReservering

  async function naarMail() {
    if (!detail?.bestellingId) return
    setBezig(true)
    try {
      const c = await getBestellingMailConcept(dossierId, detail.bestellingId, detail.sjabloonId)
      setMail({ to: c.to, cc: '', onderwerp: c.onderwerp, bericht: c.bericht })
    } catch {
      setMail({ to: detail.partijEmail ?? '', cc: '', onderwerp: detail.nummer ?? '', bericht: '' })
    } finally {
      setBezig(false)
    }
    setModus('mail')
  }

  async function verstuur() {
    if (!detail?.bestellingId || !mail.to.trim()) return
    setBezig(true)
    try {
      const res = await verstuurBestelling(dossierId, detail.bestellingId, {
        ...mail, sjabloonId: detail.sjabloonId, fotos: alsBijlagen(fotos),
      })
      if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
      toast.success(res.bonWaarschuwing
        ? `Verstuurd, maar de leverbon is niet aangemaakt: ${res.bonWaarschuwing}`
        : 'Verstuurd')
      fotos.forEach(f => URL.revokeObjectURL(f.url))
      onSluit()
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent size="xl">
        <DialogHeader>
          <div>
            <DialogTitle>
              {soortLabel}{detail?.nummer ? ` ${detail.nummer}` : ''}
            </DialogTitle>
            <DialogDescription>
              {[detail?.partij, status].filter(Boolean).join(' · ') || 'Gegevens ophalen uit Bouw7…'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {!detail && !fout && (
            <div className="flex items-center gap-2 text-[13px] text-neutral-500">
              <Spinner size="sm" /> Ophalen uit Bouw7…
            </div>
          )}
          {fout && <div className="rounded-lg bg-error-50 px-3 py-2 text-[13px] text-error-700">{fout}</div>}

          {detail && modus === 'mail' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Aan</span>
                  <Input value={mail.to} onChange={e => setMail(m => ({ ...m, to: e.target.value }))} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Cc</span>
                  <Input value={mail.cc} onChange={e => setMail(m => ({ ...m, cc: e.target.value }))} />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Onderwerp</span>
                <Input value={mail.onderwerp} onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Bericht</span>
                <Textarea
                  rows={7} value={mail.bericht}
                  onChange={e => setMail(m => ({ ...m, bericht: e.target.value }))}
                  className="text-[13px]"
                />
              </label>
              <MailFotoBijlagen fotos={fotos} onChange={setFotos} disabled={bezig} />
              <div className="text-[11px] text-neutral-500">
                De {isOa ? 'opdracht' : 'order'} gaat als PDF mee. Na versturen maakt EVA in Bouw7 de leverbon aan.
              </div>
            </div>
          )}

          {detail && modus === 'detail' && (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] md:grid-cols-3">
                <Veld label="Omschrijving" waarde={detail.naam} />
                <Veld label="Bedrag" waarde={detail.bedrag != null ? fmt(detail.bedrag, true) : null} />
                <Veld
                  label="Verstuurd"
                  waarde={detail.verstuurdOp
                    ? `${fmtDatum(detail.verstuurdOp)}${detail.verstuurdNaar ? ` naar ${detail.verstuurdNaar}` : ''}`
                    : detail.uitEva ? 'Nog niet' : null}
                />
                <Veld label="Start" waarde={detail.startdatum ? fmtDatum(detail.startdatum) : null} />
                <Veld label={isOa ? 'Oplevering' : 'Levering'} waarde={detail.opleverdatum ? fmtDatum(detail.opleverdatum) : null} />
                <Veld
                  label="Contact"
                  waarde={[detail.partijEmail, detail.partijTelefoon].filter(Boolean).join(' · ') || null}
                />
              </dl>

              {detail.omschrijving && detail.omschrijving !== detail.naam && (
                <div>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Toelichting</div>
                  <div className="whitespace-pre-wrap text-[13px] text-neutral-800">{detail.omschrijving}</div>
                </div>
              )}

              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">
                  {isOa ? 'Opgedragen' : 'Besteld'}
                </div>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-[11px] text-neutral-500">
                      <th className="py-1.5 pr-3 font-medium">Omschrijving</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Aantal</th>
                      <th className="py-1.5 pr-3 font-medium">Eenheid</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Prijs</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Bedrag</th>
                      <th className="py-1.5 font-medium">Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.termijnen.map((t, ti) => (
                      <React.Fragment key={ti}>
                        {detail.termijnen.length > 1 && (
                          <tr className="bg-neutral-50">
                            <td colSpan={6} className="py-1.5 pr-3 text-[12px] font-semibold text-neutral-700">
                              {t.omschrijving || `Termijn ${ti + 1}`}
                            </td>
                          </tr>
                        )}
                        {t.regels.map((r, ri) => (
                          <tr key={ri} className="border-b border-neutral-100 align-top">
                            <td className="whitespace-pre-wrap py-1.5 pr-3 text-neutral-800">{r.omschrijving}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmtAantal(r.aantal)}</td>
                            <td className="py-1.5 pr-3 text-neutral-600">{r.eenheid ?? '—'}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{r.stukprijs != null ? fmt(r.stukprijs, true) : '—'}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{r.bedrag != null ? fmt(r.bedrag, true) : '—'}</td>
                            <td className="py-1.5 text-neutral-600">{r.code ?? '—'}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    {detail.termijnen.length === 0 && (
                      <tr><td colSpan={6} className="py-3 text-neutral-400">Geen regels in Bouw7.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {detail.betaalafspraak && (
                <div>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Betaalafspraak</div>
                  <div className="whitespace-pre-wrap text-[13px] text-neutral-800">{detail.betaalafspraak}</div>
                </div>
              )}

              {detail.geboekteBonnen.length > 0 && (
                <div className="rounded-lg bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
                  Intrekken kan niet vanuit EVA: op leverbon {detail.geboekteBonnen.join(', ')} zit al een
                  inkoopfactuur. Handel dit in Bouw7 af.
                </div>
              )}
            </>
          )}
        </DialogBody>

        {modus === 'mail' ? (
        <DialogFooter>
          <Button variant="outline" onClick={() => setModus('detail')} disabled={bezig}>Terug</Button>
          <Button variant="primary" onClick={verstuur} disabled={bezig || !mail.to.trim()}>
            {bezig ? <Spinner size="sm" className="text-white" /> : <Send className="h-3.5 w-3.5" />}
            Versturen
          </Button>
        </DialogFooter>
        ) : (
        <DialogFooter split>
          <div className="flex items-center gap-2">
            {kanVersturen && (
              <Button variant="primary" onClick={naarMail} disabled={bezig}>
                {bezig ? <Spinner size="sm" className="text-white" /> : <Send className="h-3.5 w-3.5" />}
                Versturen
              </Button>
            )}
            {kanIntrekken && (
              <Button variant="outline" onClick={trekIn} disabled={bezig}>
                {bezig ? <Spinner size="sm" /> : <Undo2 className="h-3.5 w-3.5" />}
                Intrekken
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detail?.documentUrl && (
              <a href={detail.documentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-brand-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Verstuurd document
              </a>
            )}
            <Button variant="outline" onClick={onSluit} disabled={bezig}>Sluiten</Button>
          </div>
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Veld({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-neutral-800">{waarde || '—'}</dd>
    </div>
  )
}
