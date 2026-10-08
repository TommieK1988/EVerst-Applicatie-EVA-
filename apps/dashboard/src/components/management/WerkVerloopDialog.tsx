'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ExternalLink } from 'lucide-react'
import { cn } from '@everts/ui'
import { haalWerkVerloop } from '@/app/(platform)/management/actions'
import type { WerkVerloopPunt } from '@/lib/dashboard/snapshot-queries'
import { fPp, deltaKleur, type WerkCijfers } from '@/lib/dashboard/wijzigingen'
import { fEur, fPct, pvTh, pvTd, margeTone } from '@/lib/dashboard/aggregaties'
import { openDossierInNieuwTabblad } from '@/components/dossiers/open-dossier'
import { filiaalKleur } from './format'
import { maandLabel } from './maand'

type Rij = {
  label: string
  live?: boolean
  totale_opdracht: number | null
  totale_prognose: number | null
  verwacht_resultaat: number | null
  pct_marge: number | null
  pct_gereed: number | null
}

/**
 * Eén werk door de vastgestelde maanden heen, met de live stand als laatste regel.
 * Zo zie je of een margedaling een uitschieter is of een sluipende trend.
 */
export default function WerkVerloopDialog({
  werk, live, onClose,
}: {
  /** Het werk waarvan het verloop getoond wordt; null = dicht. */
  werk: WerkCijfers | null
  /** De huidige stand, als het werk nog in de live cijfers staat. */
  live: (WerkCijfers & { totale_prognose: number | null }) | null
  onClose: () => void
}) {
  const [verloop, setVerloop] = useState<WerkVerloopPunt[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const bouw7Id = werk?.bouw7_id ?? null

  useEffect(() => {
    if (!bouw7Id) return
    let actief = true
    setVerloop(null)
    setFout(null)
    haalWerkVerloop(bouw7Id)
      .then(r => { if (actief) setVerloop(r) })
      .catch(() => { if (actief) setFout('Het verloop kon niet worden opgehaald.') })
    return () => { actief = false }
  }, [bouw7Id])

  const rijen: Rij[] = [
    ...(verloop ?? []).map(p => ({ ...p, label: maandLabel(p.periode) })),
    ...(live ? [{ ...live, label: 'Nu (live)', live: true }] : []),
  ]
  const dossierLink = werk?.dossier_id && werk.dossier_sectie
    ? `/${werk.dossier_sectie}/${werk.dossier_id}/financieel` : null

  return (
    <Dialog open={!!werk} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle>
              <span className="font-mono" style={{ color: filiaalKleur(werk?.filiaal) }}>{werk?.projectnummer}</span>
              {' '}{werk?.projectnaam}
            </DialogTitle>
            <DialogDescription>
              Verloop per vastgestelde maand{werk?.projectleider ? ` · ${werk.projectleider}` : ''}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="p-0">
          {fout && <div className="m-4 rounded-md bg-error-50 px-3 py-2 text-[12px] text-error-700">{fout}</div>}
          {!fout && verloop == null && (
            <div className="flex justify-center py-8"><Spinner /></div>
          )}
          {!fout && verloop != null && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={cn(pvTh, 'text-left')}>Maand</th>
                    <th className={pvTh}>Opdracht</th>
                    <th className={pvTh}>Prognose kosten</th>
                    <th className={pvTh}>Verw. resultaat</th>
                    <th className={pvTh}>% marge</th>
                    <th className={pvTh}>Δ marge</th>
                    <th className={pvTh}>% gereed</th>
                  </tr>
                </thead>
                <tbody>
                  {rijen.map((r, i) => {
                    const vorige = rijen[i - 1]
                    const delta = vorige && r.pct_marge != null && vorige.pct_marge != null
                      ? r.pct_marge - vorige.pct_marge : null
                    return (
                      <tr key={r.label} className={r.live ? 'bg-brand-50/50' : undefined}>
                        <td className={cn(pvTd, r.live ? 'font-semibold' : 'capitalize')}>{r.label}</td>
                        <td className={cn(pvTd, 'text-right')}>{fEur(r.totale_opdracht)}</td>
                        <td className={cn(pvTd, 'text-right')}>{fEur(r.totale_prognose)}</td>
                        <td className={cn(pvTd, 'text-right')}>{fEur(r.verwacht_resultaat)}</td>
                        <td className={cn(pvTd, 'text-right', margeTone(r.pct_marge))}>{fPct(r.pct_marge)}</td>
                        <td className={cn(pvTd, 'text-right', deltaKleur(delta))}>{fPp(delta)}</td>
                        <td className={cn(pvTd, 'text-right text-neutral-600')}>{fPct(r.pct_gereed)}</td>
                      </tr>
                    )
                  })}
                  {rijen.length === 0 && (
                    <tr><td colSpan={7} className={cn(pvTd, 'text-center text-neutral-500')}>
                      Dit werk komt nog in geen enkele vastgestelde maand voor.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="md" onClick={onClose}>Sluiten</Button>
          {dossierLink && (
            <Button variant="primary" size="md" onClick={() => openDossierInNieuwTabblad(dossierLink)}>
              <ExternalLink className="h-4 w-4 mr-1" /> Open dossier
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

