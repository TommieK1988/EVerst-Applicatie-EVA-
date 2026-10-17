'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button, DialogBody, DialogFooter, FormField, FormRow, Input } from '@/components/ui'
import { corrigeerUurregel, type DossierTreffer, type UursoortOptie } from '@/lib/uren/bouw7-goedkeuring'
import {
  CodeKeuze, DossierKeuze, UursoortKeuze, leesUren, pslVoorCode, toonUren, useBewakingscodes,
} from './uurregel-velden'
import type { TeBewerkenRegel } from './UurregelBewerken'

/**
 * Eén geboekte urenregel bijstellen: uren, uursoort, dossier, bewakingscode, opmerking.
 *
 * Uursoort en dossier staan erin omdat dát de fouten zijn die de medewerker op zijn telefoon
 * maakt -- reisuren op gewerkte uren, of het buurdossier aangetikt. Op mobiel kan dit bewust niet:
 * daar corrigeert de teamleider alleen uren en code; verplaatsen is werk voor een groot scherm.
 */
export default function UurregelAanpassen({ regel, uursoorten, onSluit, onKlaar }: {
  regel: TeBewerkenRegel
  uursoorten: UursoortOptie[]
  onSluit: () => void
  onKlaar: () => void
}) {
  const [uren, setUren] = useState(toonUren(regel.uren))
  const [uursoortId, setUursoortId] = useState<number | null>(regel.hourTypeId)
  const [doel, setDoel] = useState<DossierTreffer | null>(null)
  const [code, setCode] = useState(regel.bewakingscode ?? '')
  const [opmerking, setOpmerking] = useState(regel.opmerking ?? '')
  const [bezig, setBezig] = useState(false)

  const verhuist = doel != null && doel.id !== regel.dossierId
  const dossierId = verhuist ? doel.id : regel.dossierId
  const { codes, laden } = useBewakingscodes(dossierId)

  function kiesDossier(d: DossierTreffer | null) {
    setDoel(d)
    // De oude code hoort bij het oude project en kan niet mee.
    setCode(d ? '' : (regel.bewakingscode ?? ''))
  }

  const getal = leesUren(uren)
  // Bij een verhuizing gaat de code altijd mee, ook als hij toevallig dezelfde naam heeft:
  // het is een andere bewakingscode, van een ander project.
  const codeGewijzigd = verhuist || code !== (regel.bewakingscode ?? '')
  const nietsGewijzigd = getal === regel.uren && !codeGewijzigd
    && opmerking === (regel.opmerking ?? '') && uursoortId === regel.hourTypeId

  async function bewaar() {
    if (!(getal > 0 && getal <= 24)) { toast.error('Vul een aantal uren tussen 0 en 24 in.'); return }
    if (verhuist && codes.length > 0 && !code) {
      toast.error('Kies een bewakingscode op het dossier waar de uren naartoe gaan.')
      return
    }
    setBezig(true)
    const psl = codeGewijzigd ? await pslVoorCode(dossierId, codes, code) : { ok: true as const, pslId: null }
    if (!psl.ok) { setBezig(false); toast.error(psl.error); return }
    const r = await corrigeerUurregel(regel.hourLogId, {
      ...(getal !== regel.uren ? { uren: getal } : {}),
      ...(codeGewijzigd ? { bewakingscodePslId: psl.pslId } : {}),
      ...(opmerking !== (regel.opmerking ?? '') ? { opmerking } : {}),
      ...(uursoortId != null && uursoortId !== regel.hourTypeId ? { uursoortHourTypeId: uursoortId } : {}),
      ...(verhuist ? { naarDossierId: doel.id } : {}),
    }).catch(() => ({ ok: false as const, error: 'Bouw7 is niet bereikbaar.' }))
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aangepast; de medewerker heeft bericht gekregen.')
    onKlaar()
    onSluit()
  }

  return (
    <>
      <DialogBody>
        <div className="flex flex-col gap-4">
          <FormRow cols="1-2">
            <FormField label="Aantal uren" upper>
              <Input inputMode="decimal" value={uren} onChange={e => setUren(e.target.value)} autoFocus />
            </FormField>
            <UursoortKeuze uursoorten={uursoorten} waarde={uursoortId} onChange={setUursoortId} terugvalNaam={regel.uursoort} />
          </FormRow>

          <DossierKeuze huidigLabel={regel.dossierLabel} doel={verhuist ? doel : null} onKies={kiesDossier} />
          {verhuist && (
            <p className="-mt-2 text-[11.5px] leading-snug text-neutral-500">
              Stond op {regel.dossierLabel ?? 'geen dossier'}. De goedkeuring begint opnieuw bij de
              teamleider en projectleider van het nieuwe dossier.
            </p>
          )}

          {dossierId && (
            <CodeKeuze codes={codes} laden={laden} waarde={code} onChange={setCode} naarAnderDossier={verhuist} />
          )}

          <FormField label="Opmerking" upper optional>
            <Input value={opmerking} onChange={e => setOpmerking(e.target.value)} />
          </FormField>

          <p className="text-[11.5px] leading-snug text-neutral-500">
            De wijziging gaat meteen naar Bouw7 en de medewerker krijgt een melding. Wat er stond
            blijft in EVA bewaard, zodat later na te gaan is wat er is aangepast.
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
        <Button onClick={bewaar} loading={bezig} disabled={bezig || nietsGewijzigd}>Opslaan</Button>
      </DialogFooter>
    </>
  )
}
