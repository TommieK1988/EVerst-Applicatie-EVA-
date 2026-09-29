'use client'

/**
 * Antwoorden op een binnengekomen bericht, vanuit het eigen mailadres.
 *
 * WAAROM DE ONTVANGER NIET VASTSTAAT
 * Bij gewone post is de afzender de ontvanger van je antwoord. Bij intake-post
 * vaak niet: werkorders komen van een postbus, opdrachtbonnen van `no_reply@`, en
 * onderaan staat dan "u kunt hier niet op reageren". EVA vult daarom de beste
 * kandidaat voor -- meestal de contactpersoon die op het bericht staat -- en zegt
 * eronder waaróm, zodat je kunt zien of dat klopt voordat je verstuurt.
 *
 * Staat er een no-reply-adres, dan blijft het veld leeg en zegt de melding dat.
 * Liever een leeg veld dan een antwoord dat in een zwart gat verdwijnt.
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter, Spinner,
} from '@/components/ui'
import OntvangerVeld, { useMailOntvangers } from '@/components/mail/OntvangerVeld'

import {
  getAntwoordConcept, beantwoordBericht, type AntwoordConcept,
} from '@/lib/mailintake/beantwoorden'

const labelCls = 'block text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500'
const inputCls =
  'mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-brand-500'

export default function AntwoordVenster({
  berichtId, open, onSluit, onVerstuurd, conceptVooraf,
}: {
  berichtId: string
  open: boolean
  onSluit: () => void
  /** Aangeroepen ná een geslaagde verzending, zodat het logboek ververst. */
  onVerstuurd: () => void
  /**
   * Een kant-en-klaar concept, in plaats van het zelf op te halen.
   *
   * Alleen voor `/auth/mailintake-preview`: dat scherm draait zonder sessie, en
   * `getAntwoordConcept` eist rechten. Zonder deze ingang is de opmaak van dit
   * venster nergens te beoordelen zonder eerst een echte mail door de molen te
   * halen -- en juist opmaakfouten worden door geen enkele type-check gevangen.
   */
  conceptVooraf?: AntwoordConcept
}) {
  const [concept, setConcept] = useState<AntwoordConcept | null>(null)
  const [laden, setLaden] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [citeer, setCiteer] = useState(true)
  const [mail, setMail] = useState({ aan: '', cc: '', onderwerp: '', bericht: '' })

  const { ontvangers, laden: ontvangersLaden } = useMailOntvangers(open, {
    dossierId: concept?.dossierId ?? null,
    relatieId: concept?.relatieId ?? null,
  })

  useEffect(() => {
    if (!open) return
    if (conceptVooraf) {
      setConcept(conceptVooraf)
      setMail({ aan: conceptVooraf.aan, cc: '', onderwerp: conceptVooraf.onderwerp, bericht: '' })
      return
    }
    let afgebroken = false
    setLaden(true)
    getAntwoordConcept(berichtId)
      .then(res => {
        if (afgebroken) return
        if (!res.ok) { toast.error(res.error); onSluit(); return }
        setConcept(res.concept)
        setMail({ aan: res.concept.aan, cc: '', onderwerp: res.concept.onderwerp, bericht: '' })
      })
      .catch(() => { if (!afgebroken) { toast.error('Het antwoord kon niet worden voorbereid.'); onSluit() } })
      .finally(() => { if (!afgebroken) setLaden(false) })
    return () => { afgebroken = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, berichtId])

  async function verstuur() {
    setBezig(true)
    try {
      const res = await beantwoordBericht({
        berichtId,
        aan: mail.aan,
        cc: mail.cc,
        onderwerp: mail.onderwerp,
        bericht: mail.bericht,
        citeer,
      })
      if (!res.ok) { toast.error(res.error ?? 'Versturen mislukt'); return }
      toast.success('Antwoord verstuurd')
      onVerstuurd()
      onSluit()
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          {/* Één blok, met ruimte voor de sluitknop — zie dialog.tsx. */}
          <div className="pr-8">
            <DialogTitle>Beantwoorden</DialogTitle>
            <DialogDescription>
              Het antwoord gaat vanuit je eigen mailadres en komt in je Verzonden items te staan.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          {laden ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-neutral-500">
              <Spinner size="sm" /> Antwoord voorbereiden…
            </div>
          ) : (
            <div className="space-y-3">
              {concept?.noReply && (
                <div className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[12.5px] text-warning-700">
                  Dit bericht komt van een adres waarop niet geantwoord kan worden. Kies zelf een
                  ontvanger — bijvoorbeeld de contactpersoon die onderaan de mail genoemd wordt.
                </div>
              )}

              <div>
                <span className={labelCls}>Aan</span>
                <OntvangerVeld
                  className="mt-1"
                  waarde={mail.aan}
                  onChange={v => setMail(m => ({ ...m, aan: v }))}
                  ontvangers={ontvangers}
                  laden={ontvangersLaden}
                  disabled={bezig}
                  placeholder="Adres typen of contactpersoon kiezen…"
                />
                {concept?.toelichting && (
                  <p className="mt-1 text-[11.5px] text-neutral-500">{concept.toelichting}</p>
                )}
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
                  className={`${inputCls} min-h-[200px] leading-relaxed`}
                  value={mail.bericht}
                  disabled={bezig}
                  placeholder="Je antwoord…"
                  onChange={e => setMail(m => ({ ...m, bericht: e.target.value }))}
                />
              </label>

              <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
                <input
                  type="checkbox"
                  checked={citeer}
                  disabled={bezig}
                  onChange={e => setCiteer(e.target.checked)}
                />
                De oorspronkelijke mail eronder meesturen
              </label>

              <p className="text-[11.5px] text-neutral-500">
                Dit wordt een nieuw bericht met “RE:” in het onderwerp, geen antwoord in dezelfde
                mailketen — Outlook zet het bij de ontvanger dus niet onder het origineel.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={verstuur}
            disabled={bezig || laden || !mail.aan.trim() || !mail.bericht.trim()}
          >
            {bezig ? 'Versturen…' : 'Versturen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
