'use client'

/**
 * Mailvenster voor één uitvraag: de prijsaanvraag, of — als er al eerder is uitgevraagd — de rappel.
 *
 * De ontvangerkiezer krijgt de `relatieId` van de uitgevraagde partij mee. Daardoor levert
 * `getMailOntvangers` de contactpersonen van díé onderaannemer als eigen groep, en hoeft er geen
 * losse contactpersoon-kolom op de uitvraag te staan.
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, Spinner } from '@/components/ui'
import OntvangerVeld, { useMailOntvangers } from '@/components/mail/OntvangerVeld'
import {
  getUitvraagMailConcept, verstuurUitvraagMail, type UitvraagMailConcept,
} from '@/lib/dossiers/uitvraag-mail-acties'

type Props = {
  uitvraagId: string | null
  dossierId: string
  onSluit: () => void
  /** Aangeroepen na een geslaagde verzending, zodat de tab de nieuwe datums ophaalt. */
  onVerstuurd: () => void
}

const labelCls = 'block text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500'
const inputCls =
  'mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-brand-500'

export default function UitvraagMailVenster({ uitvraagId, dossierId, onSluit, onVerstuurd }: Props) {
  const open = uitvraagId != null
  const [concept, setConcept] = useState<UitvraagMailConcept | null>(null)
  const [laden, setLaden] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [mail, setMail] = useState({ to: '', cc: '', onderwerp: '', bericht: '' })

  const { ontvangers, laden: ontvangersLaden } = useMailOntvangers(open, {
    dossierId, relatieId: concept?.relatieId ?? null,
  })

  useEffect(() => {
    if (!uitvraagId) { setConcept(null); return }
    let actief = true
    setLaden(true)
    getUitvraagMailConcept(uitvraagId)
      .then(c => {
        if (!actief) return
        setConcept(c)
        setMail({ to: c.to, cc: '', onderwerp: c.onderwerp, bericht: c.bericht })
      })
      .catch(e => {
        if (!actief) return
        toast.error(e instanceof Error ? e.message : 'Kon de mail niet voorbereiden.')
        onSluit()
      })
      .finally(() => { if (actief) setLaden(false) })
    return () => { actief = false }
  }, [uitvraagId])

  async function verstuur() {
    if (!uitvraagId) return
    if (!mail.to.trim()) { toast.error('Vul een e-mailadres in.'); return }
    setBezig(true)
    try {
      const r = await verstuurUitvraagMail(uitvraagId, mail)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(r.soort === 'rappel' ? 'Herinnering verstuurd' : 'Uitvraag verstuurd')
      onVerstuurd()
      onSluit()
    } finally {
      setBezig(false)
    }
  }

  const isRappel = concept?.soort === 'rappel'

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {isRappel ? 'Herinnering sturen' : 'Prijsopgave aanvragen'}
            {concept?.partijNaam ? ` — ${concept.partijNaam}` : ''}
          </DialogTitle>
          <DialogDescription>
            {isRappel
              ? 'Herinner deze partij aan de prijsopgave die nog openstaat.'
              : 'Vraag deze partij om een prijs voor het gekozen onderdeel.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {laden ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-neutral-500">
              <Spinner size="sm" /> Mail voorbereiden…
            </div>
          ) : (
            <div className="space-y-3">
              {concept && !concept.heeftAdres && (
                <div className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[12.5px] text-warning-700">
                  Bij deze partij is geen e-mailadres bekend. Vul hieronder een adres in, of vul het aan
                  bij de relatie zodat het de volgende keer klaarstaat.
                </div>
              )}

              <div>
                <span className={labelCls}>Aan</span>
                <OntvangerVeld
                  className="mt-1"
                  waarde={mail.to}
                  onChange={v => setMail(m => ({ ...m, to: v }))}
                  ontvangers={ontvangers}
                  laden={ontvangersLaden}
                  disabled={bezig}
                  placeholder="Adres typen of contactpersoon kiezen…"
                />
              </div>

              <div>
                <span className={labelCls}>CC (optioneel)</span>
                <OntvangerVeld
                  className="mt-1"
                  waarde={mail.cc}
                  onChange={v => setMail(m => ({ ...m, cc: v }))}
                  ontvangers={ontvangers}
                  laden={ontvangersLaden}
                  disabled={bezig}
                  placeholder="Bijvoorbeeld een collega…"
                />
              </div>

              <label className="block">
                <span className={labelCls}>Onderwerp</span>
                <input
                  className={inputCls}
                  value={mail.onderwerp}
                  disabled={bezig}
                  onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className={labelCls}>Bericht</span>
                <textarea
                  className={`${inputCls} min-h-[190px] leading-relaxed`}
                  value={mail.bericht}
                  disabled={bezig}
                  onChange={e => setMail(m => ({ ...m, bericht: e.target.value }))}
                />
              </label>

              <p className="text-[11.5px] text-neutral-500">
                Het project en de gevraagde discipline worden automatisch als tabel onder je bericht
                gezet. Je naam en functie komen uit je Outlook-handtekening.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button variant="primary" onClick={verstuur} disabled={bezig || laden}>
            {bezig ? 'Versturen…' : isRappel ? 'Herinnering versturen' : 'Uitvraag versturen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
