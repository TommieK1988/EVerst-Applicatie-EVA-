'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Button, Combobox, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, FormField, Input, type ComboboxOption,
} from '@/components/ui'
import {
  getGoedkeurInstellingen, slaGoedkeurInstellingenOp, type GoedkeurInstellingen,
} from '@/lib/inkoopfacturen/goedkeur-instellingen'
import type { GoedkeurRegel } from '@/lib/inkoopfacturen/goedkeur-route'
import { nlDelen, nlTijdstip } from '@/lib/planning/nl-tijd'

/**
 * De route van de EVA-goedkeuring: vanaf wanneer EVA nieuwe facturen overneemt, wie facturen
 * zonder projectleider krijgt, en boven welk bedrag er een tweede akkoord nodig is. Per
 * administratie mag je afwijken; een leeg veld volgt de standaard.
 */

type Props = { open: boolean; onClose: () => void }

const LEEG = (divisie: number | null): GoedkeurRegel => ({
  divisie_bouw7_id: divisie, terugval_goedkeurder_id: null, drempel_excl: null, drempel_goedkeurder_id: null,
})

function Persoon({ opties, waarde, onChange, leeg }: {
  opties: ComboboxOption[]; waarde: string | null; onChange: (v: string | null) => void; leeg: string
}) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <Combobox options={opties} value={waarde ?? undefined} onChange={v => onChange(v || null)}
        placeholder={leeg} searchPlaceholder="Zoek op naam" emptyText="Niemand gevonden" />
      {waarde && <Button variant="ghost" size="sm" onClick={() => onChange(null)} title="Leegmaken">×</Button>}
    </div>
  )
}

export default function GoedkeurInstellingenDialoog({ open, onClose }: Props) {
  const [data, setData] = useState<GoedkeurInstellingen | null>(null)
  const [vanaf, setVanaf] = useState('')
  const [regels, setRegels] = useState<GoedkeurRegel[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFout(null)
    getGoedkeurInstellingen().then(d => {
      setData(d)
      setVanaf(d.evaVanaf ? nlDelen(d.evaVanaf).datum : '')
      setRegels([
        d.regels.find(r => r.divisie_bouw7_id == null) ?? LEEG(null),
        ...d.administraties.map(a => d.regels.find(r => r.divisie_bouw7_id === a.id) ?? LEEG(a.id)),
      ])
    }).catch(e => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [open])

  const opties: ComboboxOption[] = useMemo(
    () => (data?.medewerkers ?? []).map(m => ({ value: m.id, label: m.naam, sub: m.afdeling ?? undefined })),
    [data],
  )

  function wijzig(divisie: number | null, veld: Partial<GoedkeurRegel>) {
    setRegels(rs => rs.map(r => (r.divisie_bouw7_id === divisie ? { ...r, ...veld } : r)))
  }

  async function opslaan() {
    setBezig(true); setFout(null)
    // Middernacht NL-tijd: de server draait op UTC, zie lib/planning/nl-tijd.ts.
    const res = await slaGoedkeurInstellingenOp({ evaVanaf: vanaf ? nlTijdstip(vanaf, '00:00') : null, regels })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !bezig) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Goedkeurroute inkoopfacturen</DialogTitle>
            <DialogDescription>
              Stap 1 is altijd de projectleider van het dossier. Zonder dossier of projectleider gaat de
              factuur naar de vaste goedkeurder. Boven de drempel (excl. btw) volgt een tweede akkoord.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!data && !fout && <p className="text-[13px] text-neutral-500">Laden…</p>}
          {data && (
            <>
              <FormField upper label="EVA keurt goed vanaf" helper="Facturen die vanaf deze datum in Bouw7 binnenkomen en daar geen goedkeurder hebben, keurt EVA goed. Oudere facturen worden in Bouw7 afgemaakt. Leeg = EVA neemt nog niets over.">
                <Input type="date" value={vanaf} onChange={e => setVanaf(e.target.value)} style={{ maxWidth: 200 }} />
              </FormField>

              {regels.map(r => {
                const naam = r.divisie_bouw7_id == null
                  ? 'Standaard (alle administraties)'
                  : data.administraties.find(a => a.id === r.divisie_bouw7_id)?.naam ?? `Administratie ${r.divisie_bouw7_id}`
                const leeg = r.divisie_bouw7_id == null ? 'Niemand' : 'Volgt standaard'
                return (
                  <div key={r.divisie_bouw7_id ?? 'standaard'} className="rounded-lg border border-neutral-200 p-3">
                    <div className="mb-2 text-[13px] font-semibold text-neutral-900">{naam}</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <FormField upper label="Vaste goedkeurder">
                        <Persoon opties={opties} waarde={r.terugval_goedkeurder_id} leeg={leeg}
                          onChange={v => wijzig(r.divisie_bouw7_id, { terugval_goedkeurder_id: v })} />
                      </FormField>
                      <FormField upper label="Drempel excl. btw">
                        <Input type="number" min={0} step={100} placeholder={r.divisie_bouw7_id == null ? 'Geen' : 'Standaard'}
                          value={r.drempel_excl ?? ''}
                          onChange={e => wijzig(r.divisie_bouw7_id, { drempel_excl: e.target.value === '' ? null : Number(e.target.value) })} />
                      </FormField>
                      <FormField upper label="Tweede akkoord door">
                        <Persoon opties={opties} waarde={r.drempel_goedkeurder_id} leeg={r.divisie_bouw7_id == null ? 'Directie' : 'Volgt standaard'}
                          onChange={v => wijzig(r.divisie_bouw7_id, { drempel_goedkeurder_id: v })} />
                      </FormField>
                    </div>
                  </div>
                )
              })}
            </>
          )}
          {fout && <p className="text-[13px] text-error-700">{fout}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" size="sm" disabled={bezig} onClick={onClose}>Annuleren</Button>
          <Button size="sm" disabled={bezig || !data} onClick={opslaan}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
