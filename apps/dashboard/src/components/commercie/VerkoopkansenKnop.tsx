'use client'

/**
 * "Verkoopkansen": alles wat over dossiers heen is blijven liggen na een verloren, vervallen of
 * uitgestelde offerte — met wie erachteraan gaat en wanneer.
 *
 * Waarom hier, op het Aanvragen-tab, en niet bij Offertes: een verkoopkans is géén offerte meer.
 * Het is een aanvraag die nog moet ontstaan. Wie deze lijst afwerkt, maakt er nieuwe aanvragen
 * van — dat is precies de beweging die dit scherm ondersteunt.
 *
 * De data wordt pas geladen bij het openen van het venster. De aanvragenpagina doet al vier
 * parallelle queries; een vijfde voor iedereen die de knop niet aanklikt is verspild werk.
 */

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Button, Badge, Spinner,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { getVerkoopkansen, maakVerkoopkans, wijzigVerkoopkans } from '@/lib/commercie/verkoopkansen'
import { getMedewerkers } from '@/lib/dossiers/actions'
import {
  verkoopkansCompleet, LEGE_VERKOOPKANS,
  type Verkoopkans, type VerkoopkansInvoer,
} from '@/lib/commercie/types'
import { formatDatumNL, dagenTussenKalender } from '@/lib/dossiers/datum-regels'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { SECTIE_ROUTE } from '@/components/dossiers/open-dossier'
import { VerkoopkansVelden, type MedewerkerKeuze } from './VerkoopkansVelden'

/** Welke kans er in het bewerkvenster staat: een bestaande, of een nieuwe. */
type Bewerking =
  | { soort: 'nieuw' }
  | { soort: 'bestaand'; kans: Verkoopkans }

export default function VerkoopkansenKnop() {
  const [open, setOpen] = useState(false)
  const [kansen, setKansen] = useState<Verkoopkans[] | null>(null)
  const [laden, setLaden] = useState(false)
  const [toonAfgerond, setToonAfgerond] = useState(false)
  const [medewerkers, setMedewerkers] = useState<MedewerkerKeuze[]>([])
  const [bewerking, setBewerking] = useState<Bewerking | null>(null)

  async function openen() {
    setOpen(true)
    setLaden(true)
    try {
      const [lijst, mensen] = await Promise.all([getVerkoopkansen(), getMedewerkers()])
      setKansen(lijst)
      setMedewerkers(mensen)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon de verkoopkansen niet laden.')
      setOpen(false)
    } finally {
      setLaden(false)
    }
  }

  async function herlaad() {
    try { setKansen(await getVerkoopkansen()) } catch { /* de lijst blijft staan zoals hij was */ }
  }

  const zichtbaar = (kansen ?? []).filter(k => toonAfgerond || !k.afgerondOp)
  const openCount = (kansen ?? []).filter(k => !k.afgerondOp).length

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openen} title="Kansen uit afgesloten dossiers">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" />
        </svg>
        Verkoopkansen
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!o) setOpen(false) }}>
        <DialogContent size="xl" style={{ maxWidth: 'min(1100px, 94vw)', width: '94vw' }}>
          <DialogHeader>
            <div className="pr-8">
              <DialogTitle>Verkoopkansen</DialogTitle>
              <DialogDescription>
                Werk dat terugkomt: kansen uit offertes die verloren zijn, vervallen of uitgesteld.
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody>
            {laden && (
              <div className="flex items-center gap-2 py-8 text-[13px] text-neutral-500">
                <Spinner size="sm" /> Verkoopkansen laden…
              </div>
            )}

            {!laden && kansen && (
              zichtbaar.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-neutral-500">
                  {toonAfgerond
                    ? 'Er zijn nog geen verkoopkansen vastgelegd.'
                    : 'Er staan geen openstaande verkoopkansen.'}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] text-neutral-600">
                      {openCount} openstaand
                      {kansen.length > openCount && ` · ${kansen.length - openCount} afgerond`}
                    </p>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-neutral-600">
                      <input
                        type="checkbox"
                        checked={toonAfgerond}
                        onChange={e => setToonAfgerond(e.target.checked)}
                      />
                      Ook afgeronde tonen
                    </label>
                  </div>

                  <div className="max-h-[56vh] overflow-y-auto pr-1">
                    <VerkoopkansenTabel
                      kansen={zichtbaar}
                      onKies={k => setBewerking({ soort: 'bestaand', kans: k })}
                    />
                  </div>
                </div>
              )
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" className="mr-auto" onClick={() => setBewerking({ soort: 'nieuw' })}>
              Nieuwe verkoopkans
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bewerking && (
        <BewerkDialoog
          bewerking={bewerking}
          medewerkers={medewerkers}
          onSluit={() => setBewerking(null)}
          onOpgeslagen={async () => { setBewerking(null); await herlaad() }}
        />
      )}
    </>
  )
}

/**
 * De tabel zelf, los van het ophalen en het bewerken. Apart gehouden zodat hij met verzonnen
 * rijen te renderen is op een tijdelijke voorbeeldpagina onder `/auth/` — de enige manier om de
 * opmaak zonder sessie echt te bekijken (zie de werkwijze in de projectnotities).
 */
export function VerkoopkansenTabel({ kansen, onKies }: {
  kansen: Verkoopkans[]
  onKies: (kans: Verkoopkans) => void
}) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 bg-white">
        <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-500">
          <th className="py-1.5 pr-2 font-semibold">Kans</th>
          <th className="w-44 py-1.5 pr-2 font-semibold">Uit dossier</th>
          <th className="w-40 py-1.5 pr-2 font-semibold">Klant</th>
          <th className="w-36 py-1.5 pr-2 font-semibold">Actiehouder</th>
          <th className="w-32 py-1.5 font-semibold">Deadline</th>
        </tr>
      </thead>
      <tbody>
        {kansen.map(k => <KansRij key={k.id} kans={k} onKlik={() => onKies(k)} />)}
      </tbody>
    </table>
  )
}

/** Eén regel. De deadline draagt de urgentie; de rest is context om hem te herkennen. */
function KansRij({ kans, onKlik }: { kans: Verkoopkans; onKlik: () => void }) {
  const dagen = kans.deadline ? dagenTussenKalender(vandaagNL(), kans.deadline) : null
  const teLaat = !kans.afgerondOp && dagen != null && dagen < 0

  return (
    <tr
      onClick={onKlik}
      className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
    >
      <td className="py-1.5 pr-2">
        <span className={kans.afgerondOp ? 'text-neutral-400 line-through' : 'text-neutral-800'}>
          {kans.uitleg || '—'}
        </span>
        {kans.afgerondOp && <Badge tone="neutral" size="sm" className="ml-2">Afgerond</Badge>}
      </td>
      <td className="py-1.5 pr-2">
        {kans.bronDossierId && kans.bronSectie ? (
          // stopPropagation: de link opent het dossier, de rij eromheen opent het bewerkvenster.
          <Link
            href={`/${SECTIE_ROUTE[kans.bronSectie]}/${kans.bronDossierId}/informatie`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-neutral-700 hover:underline"
          >
            <span className="tabular-nums text-neutral-500">{kans.bronDossiernummer ?? '—'}</span>
            {kans.bronDossierTitel ? ` ${kans.bronDossierTitel}` : ''}
          </Link>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="py-1.5 pr-2 text-neutral-600">{kans.klantNaam ?? '—'}</td>
      <td className="py-1.5 pr-2 text-neutral-600">{kans.actiehouderNaam ?? '—'}</td>
      <td className={`py-1.5 whitespace-nowrap tabular-nums ${teLaat ? 'font-semibold text-error-600' : 'text-neutral-600'}`}>
        {kans.deadline ? formatDatumNL(kans.deadline) : '—'}
      </td>
    </tr>
  )
}

/** Aanmaken en bewerken delen één venster: het zijn dezelfde drie velden. */
function BewerkDialoog({ bewerking, medewerkers, onSluit, onOpgeslagen }: {
  bewerking: Bewerking
  medewerkers: MedewerkerKeuze[]
  onSluit: () => void
  onOpgeslagen: () => void | Promise<void>
}) {
  const bestaand = bewerking.soort === 'bestaand' ? bewerking.kans : null

  const [waarde, setWaarde] = useState<VerkoopkansInvoer>(
    bestaand
      ? {
          uitleg: bestaand.uitleg,
          actiehouderId: bestaand.actiehouderId ?? '',
          deadline: bestaand.deadline ?? '',
          bronDossierId: bestaand.bronDossierId,
        }
      : LEGE_VERKOOPKANS,
  )
  const [afgerond, setAfgerond] = useState(bestaand?.afgerondOp != null)
  const [afgerondReden, setAfgerondReden] = useState(bestaand?.afgerondReden ?? '')
  const [bezig, setBezig] = useState(false)

  async function opslaan() {
    setBezig(true)
    try {
      const res = bestaand
        ? await wijzigVerkoopkans(bestaand.id, { ...waarde, afgerond, afgerondReden })
        : await maakVerkoopkans(waarde)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(bestaand ? 'Bijgewerkt' : 'Verkoopkans vastgelegd')
      await onOpgeslagen()
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>{bestaand ? 'Verkoopkans bewerken' : 'Nieuwe verkoopkans'}</DialogTitle>
            <DialogDescription>
              Waar het over gaat, wie erachteraan gaat en wanneer — meer heeft een kans niet nodig.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <VerkoopkansVelden waarde={waarde} onChange={setWaarde} medewerkers={medewerkers} />

          {bestaand?.bronDossierId && bestaand.bronSectie && (
            <p className="text-xs text-neutral-500">
              Komt uit{' '}
              <Link
                href={`/${SECTIE_ROUTE[bestaand.bronSectie]}/${bestaand.bronDossierId}/informatie`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {bestaand.bronDossiernummer ?? 'dossier'}
                {bestaand.bronDossierTitel ? ` — ${bestaand.bronDossierTitel}` : ''}
              </Link>
              .
            </p>
          )}

          {bestaand && (
            <div className="rounded-lg border border-neutral-200 p-3">
              <label className="flex items-center gap-2 text-[13px] text-neutral-800">
                <input
                  type="checkbox"
                  checked={afgerond}
                  onChange={e => setAfgerond(e.target.checked)}
                />
                Deze kans is afgehandeld
              </label>
              {afgerond && (
                <input
                  className="mt-2 h-8 w-full rounded-md border border-neutral-300 px-2 text-[13px]"
                  placeholder="Hoe liep het af? (optioneel)"
                  value={afgerondReden}
                  onChange={e => setAfgerondReden(e.target.value)}
                />
              )}
              <p className="mt-1.5 text-xs text-neutral-500">
                Een afgeronde kans verdwijnt uit de lijst maar blijft bewaard — en het vinkje kan
                weer uit als hij toch terugkomt.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" disabled={bezig} onClick={onSluit}>Annuleren</Button>
          <Button disabled={bezig || !verkoopkansCompleet(waarde)} onClick={opslaan}>
            {bezig ? 'Bezig…' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
