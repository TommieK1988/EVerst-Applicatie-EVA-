'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  Button, DialogBody, DialogFooter, FormField, FormRow, Input, RadioGroup, RadioGroupItem,
} from '@/components/ui'
import type { DossierTreffer, UursoortOptie } from '@/lib/uren/bouw7-goedkeuring'
import { splitsUurregel } from '@/lib/uren/uurregel-splitsen'
import {
  CodeKeuze, DossierKeuze, UursoortKeuze, leesUren, pslVoorCode, toonUren, useBewakingscodes,
} from './uurregel-velden'
import type { TeBewerkenRegel } from './UurregelBewerken'

/**
 * Een urenregel opsplitsen, of er een regel bij zetten op dezelfde dag van dezelfde medewerker.
 *
 * Voor wat met één regel niet recht te zetten is: acht uur op één dossier waarvan er drie bij het
 * buurdossier horen, of een dag gewerkt waar twee reisuren in zaten. Bij splitsen gaat de
 * bestaande regel met evenveel uren omlaag en blijft het dagtotaal gelijk; bij "erbij" komen de
 * uren erbovenop, voor wat de medewerker vergat te boeken.
 *
 * De nieuwe regel begint met dezelfde uursoort, hetzelfde dossier en dezelfde code als de
 * bestaande -- meestal verschilt er maar één ding, en dat zet je om.
 */
export default function UurregelSplitsen({ regel, uursoorten, onSluit, onKlaar }: {
  regel: TeBewerkenRegel
  uursoorten: UursoortOptie[]
  onSluit: () => void
  onKlaar: () => void
}) {
  const [aftrekken, setAftrekken] = useState(true)
  const [uren, setUren] = useState('')
  const [uursoortId, setUursoortId] = useState<number | null>(regel.hourTypeId)
  const [doel, setDoel] = useState<DossierTreffer | null>(null)
  const [code, setCode] = useState(regel.bewakingscode ?? '')
  const [opmerking, setOpmerking] = useState('')
  const [bezig, setBezig] = useState(false)

  const anderDossier = doel != null && doel.id !== regel.dossierId
  const dossierId = anderDossier && doel ? doel.id : regel.dossierId
  const { codes, laden } = useBewakingscodes(dossierId)

  function kiesDossier(d: DossierTreffer | null) {
    setDoel(d)
    setCode(d ? '' : (regel.bewakingscode ?? ''))
  }

  const getal = leesUren(uren)
  const geldig = getal > 0 && getal <= 24
  const rest = Math.round((regel.uren - (geldig ? getal : 0)) * 100) / 100
  const fout = uren.trim() === '' ? null
    : !geldig ? 'Vul een aantal uren tussen 0 en 24 in.'
    : aftrekken && rest <= 0 ? `Er staat ${toonUren(regel.uren)} uur op deze regel; daar moet iets van overblijven.`
    : null
  // Een regel die precies hetzelfde is als de bestaande heeft geen zin: dan had je die moeten aanpassen.
  const nietsAnders = aftrekken && !anderDossier && uursoortId === regel.hourTypeId
    && code === (regel.bewakingscode ?? '') && opmerking.trim() === ''
  const kan = geldig && !fout && !nietsAnders && !bezig

  async function bewaar() {
    if (!kan) return
    if (anderDossier && codes.length > 0 && !code) {
      toast.error('Kies een bewakingscode op het dossier waar de uren naartoe gaan.')
      return
    }
    setBezig(true)
    // Zelfde dossier en zelfde code: niets meesturen, dan neemt de server de code van de regel over.
    const codeAnders = anderDossier || code !== (regel.bewakingscode ?? '')
    const psl = codeAnders ? await pslVoorCode(dossierId, codes, code) : { ok: true as const, pslId: null }
    if (!psl.ok) { setBezig(false); toast.error(psl.error); return }
    const r = await splitsUurregel(regel.hourLogId, {
      uren: getal,
      aftrekken,
      ...(uursoortId != null && uursoortId !== regel.hourTypeId ? { uursoortHourTypeId: uursoortId } : {}),
      ...(anderDossier && doel ? { naarDossierId: doel.id } : {}),
      ...(codeAnders ? { bewakingscodePslId: psl.pslId } : {}),
      ...(opmerking.trim() ? { opmerking: opmerking.trim() } : {}),
    }).catch(() => ({ ok: false as const, error: 'Bouw7 is niet bereikbaar.' }))
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(aftrekken ? 'Regel gesplitst; de medewerker heeft bericht gekregen.' : 'Regel toegevoegd; de medewerker heeft bericht gekregen.')
    onKlaar()
    onSluit()
  }

  const nieuw = geldig ? getal : 0
  const samen = Math.round((aftrekken ? regel.uren : regel.uren + nieuw) * 100) / 100

  return (
    <>
      <DialogBody>
        <div className="flex flex-col gap-4">
          <RadioGroup value={aftrekken ? 'splitsen' : 'erbij'} onValueChange={v => setAftrekken(v === 'splitsen')}>
            <Keuze waarde="splitsen" titel="Splitsen"
              uitleg="De uren gaan van deze regel af. Het dagtotaal blijft gelijk." />
            <Keuze waarde="erbij" titel="Regel erbij"
              uitleg="De uren komen erbovenop, voor wat de medewerker vergat te boeken." />
          </RadioGroup>

          <FormRow cols="1-2">
            <FormField label="Uren nieuwe regel" upper error={fout ?? undefined}>
              <Input inputMode="decimal" value={uren} onChange={e => setUren(e.target.value)} placeholder="bv. 3" autoFocus />
            </FormField>
            <UursoortKeuze uursoorten={uursoorten} waarde={uursoortId} onChange={setUursoortId} terugvalNaam={regel.uursoort} />
          </FormRow>

          <DossierKeuze huidigLabel={regel.dossierLabel} doel={anderDossier ? doel : null} onKies={kiesDossier} />

          {dossierId && (
            <CodeKeuze codes={codes} laden={laden} waarde={code} onChange={setCode} naarAnderDossier={anderDossier} />
          )}

          <FormField label="Opmerking" upper optional>
            <Input value={opmerking} onChange={e => setOpmerking(e.target.value)} placeholder="bv. reistijd naar de werf" />
          </FormField>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[12.5px] leading-relaxed text-neutral-700">
            <div className="flex justify-between gap-4">
              <span>Deze regel</span>
              <span className="tabular-nums">
                {aftrekken && nieuw > 0 ? <><s className="text-neutral-400">{toonUren(regel.uren)}</s> → </> : null}
                <b>{toonUren(aftrekken ? Math.max(rest, 0) : regel.uren)} u</b>
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Nieuwe regel</span>
              <b className="tabular-nums">{toonUren(nieuw)} u</b>
            </div>
            <div className="mt-1 flex justify-between gap-4 border-t border-neutral-200 pt-1">
              <span>Samen op deze dag</span>
              <span className="tabular-nums">
                <b>{toonUren(samen)} u</b>
                <span className="ml-1 text-neutral-500">{aftrekken ? '(blijft gelijk)' : `(was ${toonUren(regel.uren)} u)`}</span>
              </span>
            </div>
          </div>

          {nietsAnders && geldig && (
            <p className="text-[11.5px] leading-snug text-warning-700">
              Kies voor de nieuwe regel een andere uursoort, dossier of code — anders staat hetzelfde
              werk twee keer op één dag.
            </p>
          )}

          <p className="text-[11.5px] leading-snug text-neutral-500">
            De nieuwe regel komt meteen in Bouw7, nog niet goedgekeurd: hij gaat door dezelfde
            goedkeuring als de rest. {anderDossier
              ? 'Op een ander dossier beginnen de teamleider en projectleider van dat dossier.'
              : 'De medewerker krijgt een melding.'}
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
        <Button onClick={bewaar} loading={bezig} disabled={!kan}
          title={nietsAnders && geldig ? 'Kies een andere uursoort, dossier of code voor de nieuwe regel.' : undefined}>
          {aftrekken ? 'Splitsen' : 'Regel toevoegen'}
        </Button>
      </DialogFooter>
    </>
  )
}

function Keuze({ waarde, titel, uitleg }: { waarde: string; titel: string; uitleg: string }) {
  const id = `splits-${waarde}`
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <RadioGroupItem id={id} value={waarde} className="mt-0.5" />
      <span>
        <span className="block text-[13px] font-semibold text-neutral-900">{titel}</span>
        <span className="block text-xs text-neutral-500">{uitleg}</span>
      </span>
    </label>
  )
}
