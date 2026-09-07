'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  InklapbareCard, Badge, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody,
} from '@/components/ui'
import { PORTAAL_ONDERDELEN } from '@/lib/portaal/onderdelen'
import {
  getPortaalBlokSamenvatting, getPortaalBeheerVoorBlok, setPortaalDossierActief,
  type PortaalBlokSamenvatting,
} from '@/lib/portaal/beheer-actions'
import type { PortaalDossierBeheer } from '@/lib/portaal/beheer'
import { PortaalTabClient } from './PortaalTabClient'

/**
 * Het klantportaal van dit dossier, als blok op de Informatie-tab.
 *
 * Stond eerder op een eigen tab in de sidebar. Dat is een zware plek voor iets wat je één
 * keer per dossier instelt en daarna zelden aanraakt — terwijl de klantchat van hetzelfde
 * portaal al op deze tab staat. Wat je hier ziet is de stand van zaken; het instellen zelf
 * zit achter de knop, in een dialog met het onveranderde beheerscherm.
 *
 * Het blok haalt bewust alleen een samenvatting op. De volledige beheergegevens (alle
 * uitnodigbare contactpersonen, namen, bestandstellingen) komen pas als de dialog opengaat:
 * dit blok draait mee op de drukste tab van het dossier.
 */
export function KlantportaalBlok({ dossierId }: { dossierId: string }) {
  // undefined = nog aan het laden, null = geen recht (blok verdwijnt).
  const [kort, setKort] = useState<PortaalBlokSamenvatting | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [volledig, setVolledig] = useState<PortaalDossierBeheer | null>(null)
  const [bezig, start] = useTransition()
  const router = useRouter()
  const pad = usePathname()

  function herlaad() {
    getPortaalBlokSamenvatting(dossierId).then(setKort).catch(() => setKort(null))
  }

  useEffect(() => {
    herlaad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId])

  function openInstellingen() {
    setOpen(true)
    // Pas hier de volledige set ophalen; hergebruik wat we al hebben bij heropenen.
    if (!volledig) getPortaalBeheerVoorBlok(dossierId).then(setVolledig).catch(() => setVolledig(null))
  }

  if (kort === null) return null
  if (kort === undefined) {
    return (
      <InklapbareCard titel="Klantportaal">
        <p className="text-[13px] text-neutral-500">Laden…</p>
      </InklapbareCard>
    )
  }

  const gedeeld = PORTAAL_ONDERDELEN.filter(o => kort.aanOnderdelen.includes(o.kolom))

  return (
    <>
      <InklapbareCard
        titel="Klantportaal"
        headerActies={
          <Badge tone={kort.actief ? 'success' : 'neutral'}>
            {kort.actief ? 'Open' : 'Dicht'}
          </Badge>
        }
      >
        <div className="space-y-3.5">
          <p className="text-[13px] leading-relaxed text-neutral-500">
            {kort.actief
              ? 'De opdrachtgever kan dit dossier online volgen.'
              : 'Dit dossier bestaat nog niet voor de opdrachtgever — ook niet met de link.'}
          </p>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-[13px]">
            <dt className="text-neutral-500">Meekijkers</dt>
            <dd className="font-medium text-neutral-900">
              {kort.aantalMeekijkers === 0
                ? 'Nog niemand uitgenodigd'
                : kort.aantalMeekijkers === 1
                  ? (kort.eersteMeekijkerNaam ?? '1 persoon')
                  : `${kort.aantalMeekijkers} personen`}
            </dd>

            <dt className="text-neutral-500">Gedeeld</dt>
            <dd className="font-medium text-neutral-900">
              {gedeeld.length === 0 ? 'Niets' : gedeeld.map(o => o.label).join(', ')}
            </dd>
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            <Button variant="outline" onClick={openInstellingen}>Instellingen…</Button>
            {/* Meekijken kan ook als het portaal nog dichtstaat: juist dán wil je zien wat
                er straks te zien is. In een nieuw tabblad zodat het dossier openblijft. */}
            <a
              href={`${kort.portaalUrl}?terug=${encodeURIComponent(pad)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Bekijken zoals de klant ↗
            </a>
            <Button
              variant={kort.actief ? 'ghost' : 'primary'}
              disabled={bezig}
              onClick={() => start(async () => {
                const r = await setPortaalDossierActief(dossierId, !kort.actief)
                if (r.ok) { herlaad(); setVolledig(null); router.refresh() }
              })}
            >
              {kort.actief ? 'Sluiten' : 'Openzetten'}
            </Button>
          </div>
        </div>
      </InklapbareCard>

      <Dialog
        open={open}
        onOpenChange={o => {
          setOpen(o)
          // Bij sluiten de samenvatting verversen: in de dialog kunnen onderdelen en
          // meekijkers zijn gewijzigd, en juist die staan in het blok.
          if (!o) { setVolledig(null); herlaad() }
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Klantportaal</DialogTitle>
            <DialogDescription>
              Wat de opdrachtgever van dit dossier ziet, en wie er mag meekijken.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {volledig
              ? <PortaalTabClient dossierId={dossierId} data={volledig} ingebed />
              : <p className="py-6 text-[13px] text-neutral-500">Laden…</p>}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
