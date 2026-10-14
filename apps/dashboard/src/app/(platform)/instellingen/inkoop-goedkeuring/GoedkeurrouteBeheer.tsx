'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card, CardBody, Combobox, FormField, Input, type ComboboxOption } from '@/components/ui'
import { slaGoedkeurInstellingenOp, type GoedkeurInstellingen } from '@/lib/inkoopfacturen/goedkeur-instellingen'
import {
  ALLE_DOSSIER_ROLLEN, DOSSIER_ROLLEN, type DossierRol, type GoedkeurRegel, type ProjectRoute,
} from '@/lib/inkoopfacturen/goedkeur-route'
import { nlDelen, nlTijdstip } from '@/lib/planning/nl-tijd'

/**
 * De route van de EVA-goedkeuring: vanaf wanneer EVA nieuwe facturen overneemt, wie facturen
 * zonder projectleider krijgt, en boven welk bedrag er een tweede akkoord nodig is. Per
 * administratie mag je afwijken; een leeg veld volgt de standaard.
 *
 * Staat bewust in Bedrijfsinstellingen en niet op het inkoopscherm: wie wat mag goedkeuren is
 * gevoelig, en is daarom alleen voor `instellingen: beheren` (pagina én server-actions).
 */

type Props = { data: GoedkeurInstellingen }

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

export default function GoedkeurrouteBeheer({ data }: Props) {
  const [vanaf, setVanaf] = useState(data.evaVanaf ? nlDelen(data.evaVanaf).datum : '')
  const [regels, setRegels] = useState<GoedkeurRegel[]>(() => [
    data.regels.find(r => r.divisie_bouw7_id == null) ?? LEEG(null),
    ...data.administraties.map(a => data.regels.find(r => r.divisie_bouw7_id === a.id) ?? LEEG(a.id)),
  ])
  const [grootboek, setGrootboek] = useState<{ nummer: string; goedkeurder_id: string | null }[]>(data.grootboek)
  const [project, setProject] = useState<ProjectRoute>(data.project)
  const [bezwaarTaak, setBezwaarTaak] = useState<string | null>(data.bezwaarTaakMedewerkerId)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [opgeslagen, setOpgeslagen] = useState(false)

  const opties: ComboboxOption[] = useMemo(
    () => (data?.medewerkers ?? []).map(m => ({ value: m.id, label: m.naam, sub: m.afdeling ?? undefined })),
    [data],
  )

  const rekeningOpties: ComboboxOption[] = useMemo(() => {
    const lijst = data?.rekeningen ?? []
    // Een ingestelde rekening die Bouw7 niet (meer) teruggeeft blijft kiesbaar, anders verdwijnt hij uit beeld.
    const extra = grootboek.filter(g => !lijst.some(r => r.nummer === g.nummer)).map(g => ({ nummer: g.nummer, naam: '' }))
    return [...lijst, ...extra].map(r => ({ value: r.nummer, label: r.naam ? `${r.nummer} ${r.naam}` : r.nummer }))
  }, [data, grootboek])

  function wijzigGrootboek(i: number, veld: Partial<{ nummer: string; goedkeurder_id: string | null }>) {
    setGrootboek(gs => gs.map((g, j) => (j === i ? { ...g, ...veld } : g)))
  }

  function verplaatsRol(i: number, richting: -1 | 1) {
    setProject(p => {
      const rollen = [...p.rollen]
      const j = i + richting
      if (j < 0 || j >= rollen.length) return p
      ;[rollen[i], rollen[j]] = [rollen[j], rollen[i]]
      return { ...p, rollen }
    })
  }

  const rolOpties: ComboboxOption[] = ALLE_DOSSIER_ROLLEN
    .filter(r => !project.rollen.includes(r))
    .map(r => ({ value: r, label: DOSSIER_ROLLEN[r].label }))

  function wijzig(divisie: number | null, veld: Partial<GoedkeurRegel>) {
    setRegels(rs => rs.map(r => (r.divisie_bouw7_id === divisie ? { ...r, ...veld } : r)))
  }

  async function opslaan() {
    setBezig(true); setFout(null); setOpgeslagen(false)
    // Middernacht NL-tijd: de server draait op UTC, zie lib/planning/nl-tijd.ts.
    const gekozen = grootboek.filter(g => g.nummer)
    if (gekozen.some(g => !g.goedkeurder_id)) { setBezig(false); setFout('Kies bij elke grootboekrekening een goedkeurder, of haal de regel weg.'); return }
    const res = await slaGoedkeurInstellingenOp({
      evaVanaf: vanaf ? nlTijdstip(vanaf, '00:00') : null,
      regels,
      grootboek: gekozen.map(g => ({ nummer: g.nummer, goedkeurder_id: g.goedkeurder_id! })),
      project,
      bezwaarTaakMedewerkerId: bezwaarTaak,
    })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setOpgeslagen(true)
  }

  return (
    <Card style={{ maxWidth: 880 }}>
      <CardBody>
        <div className="space-y-4">
            <>
              <FormField upper label="EVA keurt goed vanaf" helper="Vanaf deze datum keurt EVA goed: alle facturen op concept in Bouw7 (die hebben geen fiatteur, ook oudere) en nieuwe facturen zonder goedkeurder. Facturen met een goedkeurder in Bouw7 worden daar afgemaakt. Leeg = EVA neemt nog niets over.">
                <Input type="date" value={vanaf} onChange={e => setVanaf(e.target.value)} style={{ maxWidth: 200 }} />
              </FormField>

              <FormField upper label="Taak bij bezwaar naar"
                helper="Wie een taak krijgt als iemand bezwaar maakt tegen een factuur, om de leverancier om een creditnota te vragen. Leeg = niemand.">
                <div style={{ maxWidth: 320 }}>
                  <Persoon opties={opties} waarde={bezwaarTaak} leeg="Niemand" onChange={setBezwaarTaak} />
                </div>
              </FormField>

              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="mb-1 text-[13px] font-semibold text-neutral-900">Projectfacturen</div>
                <p className="mb-3 text-xs text-neutral-500">
                  Een factuur met een dossier gaat naar de eerste rol in deze lijst die op het dossier is ingevuld.
                  Is geen van deze rollen ingevuld, dan gaat hij naar de vaste goedkeurder hieronder.
                </p>
                <div className="space-y-1.5">
                  {project.rollen.map((r, i) => (
                    <div key={r} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs text-neutral-500">{i + 1}.</span>
                      <span className="min-w-[120px] text-[13px] text-neutral-900">{DOSSIER_ROLLEN[r].label}</span>
                      <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => verplaatsRol(i, -1)} title="Hoger">↑</Button>
                      <Button variant="ghost" size="sm" disabled={i === project.rollen.length - 1} onClick={() => verplaatsRol(i, 1)} title="Lager">↓</Button>
                      <Button variant="ghost" size="sm" disabled={project.rollen.length === 1}
                        onClick={() => setProject(p => ({ ...p, rollen: p.rollen.filter(x => x !== r) }))}>Weghalen</Button>
                    </div>
                  ))}
                </div>
                {rolOpties.length > 0 && (
                  <div className="mt-2" style={{ maxWidth: 240 }}>
                    <Combobox options={rolOpties} placeholder="Rol toevoegen" searchPlaceholder="Zoek een rol" emptyText="Geen rol"
                      onChange={v => { if (v) setProject(p => ({ ...p, rollen: [...p.rollen, v as DossierRol] })) }} />
                  </div>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FormField upper label="Drempel projecten excl. btw" helper="Leeg = geen tweede akkoord op projectfacturen.">
                    <Input type="number" min={0} step={100} placeholder="Geen"
                      value={project.drempel_excl ?? ''}
                      onChange={e => setProject(p => ({ ...p, drempel_excl: e.target.value === '' ? null : Number(e.target.value) }))} />
                  </FormField>
                  <FormField upper label="Tweede akkoord projecten">
                    <Persoon opties={opties} waarde={project.drempel_goedkeurder_id} leeg="Directie"
                      onChange={v => setProject(p => ({ ...p, drempel_goedkeurder_id: v }))} />
                  </FormField>
                </div>
              </div>

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
                      <FormField upper label="Drempel overhead excl. btw">
                        <Input type="number" min={0} step={100} placeholder={r.divisie_bouw7_id == null ? 'Geen' : 'Standaard'}
                          value={r.drempel_excl ?? ''}
                          onChange={e => wijzig(r.divisie_bouw7_id, { drempel_excl: e.target.value === '' ? null : Number(e.target.value) })} />
                      </FormField>
                      <FormField upper label="Tweede akkoord overhead">
                        <Persoon opties={opties} waarde={r.drempel_goedkeurder_id} leeg={r.divisie_bouw7_id == null ? 'Directie' : 'Volgt standaard'}
                          onChange={v => wijzig(r.divisie_bouw7_id, { drempel_goedkeurder_id: v })} />
                      </FormField>
                    </div>
                  </div>
                )
              })}
            </>
            <div className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-1 text-[13px] font-semibold text-neutral-900">Overhead per grootboekrekening</div>
              <p className="mb-3 text-xs text-neutral-500">
                Alleen 4000-rekeningen, voor alle administraties. Staan er meerdere op één factuur, dan telt de
                rekening met het hoogste bedrag. Niet ingesteld = de vaste goedkeurder.
              </p>
              {data.rekeningenFout && (
                <p className="mb-2 text-xs text-error-700">De rekeningen uit Bouw7 konden niet worden geladen: {data.rekeningenFout}</p>
              )}
              <div className="space-y-2">
                {grootboek.map((g, i) => (
                  <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Combobox options={rekeningOpties} value={g.nummer || undefined}
                      onChange={v => wijzigGrootboek(i, { nummer: v })}
                      placeholder="Kies een rekening" searchPlaceholder="Zoek op nummer of naam" emptyText="Geen rekening gevonden" />
                    <Persoon opties={opties} waarde={g.goedkeurder_id} leeg="Kies een goedkeurder"
                      onChange={v => wijzigGrootboek(i, { goedkeurder_id: v })} />
                    <Button variant="ghost" size="sm" onClick={() => setGrootboek(gs => gs.filter((_, j) => j !== i))}>Weghalen</Button>
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" className="mt-2"
                onClick={() => setGrootboek(gs => [...gs, { nummer: '', goedkeurder_id: null }])}>
                Rekening toevoegen
              </Button>
            </div>

          {fout && <p className="text-[13px] text-error-700">{fout}</p>}
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={bezig} onClick={opslaan}>Opslaan</Button>
            {opgeslagen && <span className="text-[13px] text-success-700">Opgeslagen.</span>}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
