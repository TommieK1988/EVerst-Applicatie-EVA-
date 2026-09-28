'use client'

/**
 * Een hoger mandaat aanvragen, of een toegekende verhoging vastleggen.
 *
 * Eén venster voor beide kanten van dezelfde afspraak: je vraagt een bedrag, en als de
 * opdrachtgever ja zegt leg je datzelfde bedrag vast. Twee losse schermen zouden dezelfde velden
 * twee keer vragen.
 *
 * Bij aanvragen gaat er standaard meteen een mail naar de opdrachtgever mee (sjabloon
 * "Mandaatverhoging aanvragen" in Instellingen → E-mailsjablonen). Onderwerp en bericht lopen mee
 * met het bedrag en de toelichting die je typt, tot je ze zelf aanpast — daarna blijft jouw tekst
 * staan. Uitvinken kan, voor als de vraag al telefonisch is gesteld.
 */

import React, { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import {
  Button, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  FormField, Input, Spinner,
} from '@/components/ui'
import OntvangerVeld, { useMailOntvangers } from '@/components/mail/OntvangerVeld'
import {
  getMandaatMailConcept, kenMandaatverhogingToe, vraagMandaatverhogingAan,
  type MandaatMailConcept,
} from '@/lib/dossiers/servicedesk-acties'
import { vulMailTekst, netteRegel } from '@/lib/mail/sjabloontekst'
// Bestaat al en kent het verschil tussen '1.250,50' en '12.5'; een eigen parser hier zou de
// tweede als 125 lezen. Zie DEVELOPMENT_STANDARDS 1.3: een rekenregel heeft er maar een.
import { parseGetal } from '@/lib/everts-calc/calculations'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

const VELD = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-[13px] outline-none focus:border-brand-500'

export default function MandaatVerhogingModal({
  dossierId, huidigMandaat, modus, onSluit, onKlaar,
}: {
  dossierId: string
  huidigMandaat: number | null
  /** `aanvragen` = vragen aan de opdrachtgever, `toekennen` = het antwoord vastleggen. */
  modus: 'aanvragen' | 'toekennen'
  onSluit: () => void
  onKlaar: () => void
}) {
  const [bedrag, setBedrag] = useState('')
  const [toelichting, setToelichting] = useState('')
  const [bezig, start] = useTransition()

  const aanvragen = modus === 'aanvragen'
  const waarde = parseGetal(bedrag)

  // ── Mail aan de opdrachtgever (alleen bij aanvragen) ──
  const [mailen, setMailen] = useState(aanvragen)
  const [concept, setConcept] = useState<MandaatMailConcept | null>(null)
  const [aan, setAan] = useState('')
  const [cc, setCc] = useState('')
  /** null = nog niet aangeraakt, dus meelopen met het sjabloon. */
  const [eigenOnderwerp, setEigenOnderwerp] = useState<string | null>(null)
  const [eigenBericht, setEigenBericht] = useState<string | null>(null)

  const { ontvangers, laden: ontvangersLaden } = useMailOntvangers(aanvragen, { dossierId })

  useEffect(() => {
    if (!aanvragen) return
    let actief = true
    getMandaatMailConcept(dossierId)
      .then(c => { if (!actief) return; setConcept(c); setAan(c.to) })
      .catch(() => {
        if (!actief) return
        // Zonder concept is er niets om te versturen; de aanvraag zelf moet wel kunnen.
        toast.error('Kon de mail aan de opdrachtgever niet voorbereiden.')
        setMailen(false)
      })
    return () => { actief = false }
  }, [aanvragen, dossierId])

  const vars = {
    ...(concept?.vars ?? {}),
    'mandaat.gevraagd': waarde > 0 ? euro(waarde) : '…',
    'toelichting': toelichting.trim(),
  }
  const onderwerp = eigenOnderwerp ?? (concept ? netteRegel(vulMailTekst(concept.onderwerp, vars)) : '')
  // Een lege toelichting laat een lege alinea achter; die mag niet als gat in de mail staan.
  const bericht = eigenBericht
    ?? (concept ? vulMailTekst(concept.tekst, vars).replace(/\n{3,}/g, '\n\n').trim() : '')

  const mailKlaar = !mailen || (!!concept && aan.trim().length > 0 && onderwerp.trim().length > 0 && bericht.trim().length > 0)
  // parseGetal geeft 0 bij onleesbare invoer, dus dat dekt ook een leeg veld af.
  const geldig = waarde > 0 && (!aanvragen || (toelichting.trim().length > 0 && mailKlaar))

  function verstuur() {
    if (!geldig) return
    start(async () => {
      const res = aanvragen
        ? await vraagMandaatverhogingAan(
            dossierId,
            { gevraagdBedrag: waarde, toelichting },
            mailen ? { to: aan, cc, onderwerp, bericht } : undefined,
          )
        : await kenMandaatverhogingToe(dossierId, { nieuwMandaat: waarde, toelichting })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(aanvragen
        ? (mailen ? 'Mandaatverhoging aangevraagd en gemaild' : 'Mandaatverhoging aangevraagd')
        : `Mandaat staat nu op ${euro(waarde)}`)
      onKlaar()
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={open => !open && !bezig && onSluit()}>
      <DialogContent size={aanvragen && mailen ? 'lg' : 'md'}>
        <DialogHeader>
          <DialogTitle>
            {aanvragen ? 'Mandaatverhoging aanvragen' : 'Verhoging toekennen'}
          </DialogTitle>
        </DialogHeader>

        {/* De dialoog hangt in een portal buiten `.eva`; daar bestaan de DS-variabelen niet.
            Vandaar Tailwind-klassen in plaats van tokens. */}
        <DialogBody>
          <div className="flex flex-col gap-3.5">
            <p className="text-[13px] text-neutral-600">
              {huidigMandaat != null && huidigMandaat > 0
                ? <>Het mandaat staat nu op <strong>{euro(huidigMandaat)}</strong>.</>
                : <>Er staat nog geen mandaat op deze bon.</>}
            </p>

            <FormField label={aanvragen ? 'Gevraagd mandaat (excl. btw)' : 'Nieuw mandaat (excl. btw)'}>
              <Input
                value={bedrag}
                onChange={e => setBedrag(e.target.value)}
                placeholder="2.500,00"
                inputMode="decimal"
                autoFocus
              />
            </FormField>

            <FormField
              label="Toelichting"
              helper={aanvragen
                ? (mailen
                    ? 'Komt als notitie op de bon én in de mail aan de opdrachtgever; schrijf op waarom het werk meer vraagt.'
                    : 'Komt als notitie op de bon te staan; schrijf op waarom het werk meer vraagt.')
                : 'Optioneel — bijvoorbeeld wie akkoord gaf en wanneer.'}
            >
              <textarea
                value={toelichting}
                onChange={e => setToelichting(e.target.value)}
                rows={3}
                className={VELD}
                placeholder={aanvragen
                  ? 'Achter het plafond zit meer houtrot dan op de bon stond…'
                  : 'Telefonisch akkoord van…'}
              />
            </FormField>

            {/* Het nieuwe bedrag vervángt het oude; dat is hoe een opdrachtgever het ook zegt. */}
            {waarde > 0 && huidigMandaat != null && huidigMandaat > 0 && (
              <p className="text-[12px] text-neutral-500">
                {euro(huidigMandaat)} → <strong>{euro(waarde)}</strong>
                {waarde <= huidigMandaat && ' — dat is niet hoger dan het huidige mandaat.'}
              </p>
            )}

            {aanvragen && (
              <div className="mt-1 flex flex-col gap-3 border-t border-neutral-200 pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-neutral-800">
                  <Checkbox checked={mailen} onCheckedChange={v => setMailen(v === true)} disabled={bezig} />
                  Mail het verzoek naar de opdrachtgever
                </label>

                {mailen && !concept && (
                  <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                    <Spinner size="sm" /> Mail voorbereiden…
                  </div>
                )}

                {mailen && concept && (
                  <>
                    {!concept.to && (
                      <div className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[12.5px] text-warning-700">
                        Bij deze bon is geen e-mailadres van de opdrachtgever bekend. Kies of typ er hieronder een.
                      </div>
                    )}

                    <FormField label="Aan">
                      <OntvangerVeld
                        waarde={aan}
                        onChange={setAan}
                        ontvangers={ontvangers}
                        laden={ontvangersLaden}
                        disabled={bezig}
                        placeholder="Adres typen of contactpersoon kiezen…"
                      />
                    </FormField>

                    <FormField label="CC" optional>
                      <OntvangerVeld
                        waarde={cc}
                        onChange={setCc}
                        ontvangers={ontvangers}
                        laden={ontvangersLaden}
                        disabled={bezig}
                        placeholder="Bijvoorbeeld de projectleider…"
                      />
                    </FormField>

                    <FormField label="Onderwerp">
                      <Input
                        value={onderwerp}
                        onChange={e => setEigenOnderwerp(e.target.value)}
                        disabled={bezig}
                      />
                    </FormField>

                    <FormField
                      label="Bericht"
                      helper={eigenBericht == null
                        ? 'Loopt mee met het bedrag en de toelichting hierboven. Je naam en functie komen uit je Outlook-handtekening.'
                        : 'Je hebt de tekst aangepast; wijzigingen hierboven komen er niet meer vanzelf in.'}
                    >
                      <textarea
                        value={bericht}
                        onChange={e => setEigenBericht(e.target.value)}
                        rows={10}
                        disabled={bezig}
                        className={`${VELD} leading-relaxed`}
                      />
                    </FormField>
                    {eigenBericht != null && (
                      <button
                        type="button"
                        className="-mt-2 self-start text-[12px] font-medium text-brand-600 hover:underline"
                        onClick={() => { setEigenBericht(null); setEigenOnderwerp(null) }}
                      >
                        Terug naar de standaardtekst
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button variant="primary" onClick={verstuur} disabled={!geldig || bezig} loading={bezig}>
            {aanvragen
              ? (mailen ? 'Aanvragen en mail versturen' : 'Aanvraag vastleggen')
              : 'Mandaat bijwerken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
