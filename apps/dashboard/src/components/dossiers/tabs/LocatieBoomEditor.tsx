'use client'

import { useEffect, useState } from 'react'
import { getLocatieBoom, setLocatieBoom } from '@/services/houtrotherstel/locatie-config'
import {
  MAX_DIEPTE, kinderen, magKindToevoegen, voegKnoopToe, voegMeerdereToe,
  verwijderKnoop, hernoem, verplaatsBinnenBroers, genereerReeks, genereerLijst,
} from '@/lib/houtrotherstel/locatie-boom'
import type { LocatieBoom, LocatieNode } from '@/lib/houtrotherstel/types'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDialogen } from '@/components/ui/dialogen'

/**
 * De projectleider bouwt per dossier de locatie als boomstructuur: bv.
 * Gevelzijde → Etage → Huisnummer. De vakman kiest daaruit in de app met
 * afhankelijke keuzelijsten. Knopen worden met knoppen opgebouwd; met "Meerdere"
 * genereer je in één keer een reeks (bv. huisnummers 491–509) of een geplakte lijst.
 */
export default function LocatieBoomEditor({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [boom, setBoom] = useState<LocatieBoom | null>(null)
  const [open, setOpen] = useState(false)
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set())
  const [vuil, setVuil] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  // Reeks/lijst-dialog: undefined = dicht, null = onder de wortel, string = onder die knoop.
  const [reeksParent, setReeksParent] = useState<string | null | undefined>(undefined)
  const { bevestig } = useDialogen()

  useEffect(() => {
    getLocatieBoom(dossierId).then(setBoom).catch(() => setBoom({ labels: [], nodes: [] }))
  }, [dossierId])

  const nodes = boom?.nodes ?? []
  const labels = boom?.labels ?? []

  function muteer(fn: (nodes: LocatieNode[]) => LocatieNode[]) {
    setBoom(b => (b ? { ...b, nodes: fn(b.nodes) } : b))
    setVuil(true); setMelding(null)
  }
  function zetLabel(i: number, waarde: string) {
    setBoom(b => {
      if (!b) return b
      const l = [...b.labels]
      while (l.length < MAX_DIEPTE) l.push('')
      l[i] = waarde
      return { ...b, labels: l }
    })
    setVuil(true); setMelding(null)
  }
  function toggle(id: string) {
    setIngeklapt(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  async function opslaan() {
    if (!boom) return
    setBezig(true); setMelding(null)
    try {
      const res = await setLocatieBoom(dossierId, boom)
      if (res.ok) { setVuil(false); setMelding('Opgeslagen') }
      else setMelding(res.error || 'Opslaan mislukt')
    } catch (e) {
      setMelding(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  function renderKnoop(node: LocatieNode, diepte: number): React.ReactNode {
    const broers = kinderen(nodes, node.parent_id ?? null)
    const idx = broers.findIndex(n => n.id === node.id)
    const kind = kinderen(nodes, node.id)
    const heeftKind = kind.length > 0
    const dicht = ingeklapt.has(node.id)
    const kanKind = magKindToevoegen(nodes, node.id)

    return (
      <div key={node.id}>
        <div className="group flex items-center gap-1 rounded hover:bg-slate-50" style={{ paddingLeft: diepte * 20 }}>
          <button type="button" onClick={() => heeftKind && toggle(node.id)}
            className="flex h-6 w-5 items-center justify-center text-slate-400" aria-label="In-/uitklappen">
            {heeftKind ? (dicht ? '▸' : '▾') : ''}
          </button>
          <input
            value={node.naam}
            disabled={readOnly}
            onChange={e => muteer(n => hernoem(n, node.id, e.target.value))}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-slate-300 focus:border-everts focus:outline-none focus:ring-1 focus:ring-everts/20"
          />
          {!readOnly && (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <IconBtn title="Omhoog" disabled={idx <= 0} onClick={() => muteer(n => verplaatsBinnenBroers(n, node.id, 'omhoog'))}>↑</IconBtn>
              <IconBtn title="Omlaag" disabled={idx >= broers.length - 1} onClick={() => muteer(n => verplaatsBinnenBroers(n, node.id, 'omlaag'))}>↓</IconBtn>
              {kanKind && (
                <>
                  <IconBtn title="Subniveau toevoegen" onClick={() => muteer(n => voegKnoopToe(n, node.id, ''))}>＋</IconBtn>
                  <IconBtn title="Meerdere toevoegen (reeks/lijst)" onClick={() => setReeksParent(node.id)}>⋯</IconBtn>
                </>
              )}
              <IconBtn title="Verwijderen" danger
                onClick={async () => {
                  const ok = await bevestig({
                    titel: `"${node.naam || 'Naamloos'}" en alles eronder verwijderen?`,
                    bevestigLabel: 'Verwijderen',
                    destructief: true,
                  })
                  if (ok) muteer(n => verwijderKnoop(n, node.id))
                }}>
                ×
              </IconBtn>
            </div>
          )}
        </div>
        {!dicht && kind.map(k => renderKnoop(k, diepte + 1))}
      </div>
    )
  }

  const wortels = kinderen(nodes, null)

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <div>
          <div className="text-sm font-semibold text-slate-800">Locatie-instellingen</div>
          <div className="text-xs text-slate-500">
            {wortels.length > 0
              ? `${nodes.length} knoop${nodes.length !== 1 ? 'en' : ''} · ${wortels.map(w => w.naam || '—').join(', ')}`
              : 'Nog geen locatieboom — de vakman krijgt één vrij locatieveld.'}
          </div>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {boom === null ? (
            <div className="text-sm text-slate-400">Laden…</div>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                Bouw de locatie als boom, bv. <strong>Gevelzijde → Etage → Huisnummer</strong> (max {MAX_DIEPTE} lagen).
                De vakman kiest in de app per laag; laag 2 toont alleen wat onder de gekozen laag 1 hangt.
              </p>

              {/* Optionele niveaulabels — kop boven de keuzelijst in de app. */}
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                {Array.from({ length: MAX_DIEPTE }).map((_, i) => (
                  <div key={i}>
                    <label className="mb-1 block text-xs text-slate-500">Naam niveau {i + 1} (optioneel)</label>
                    <input
                      value={labels[i] ?? ''}
                      disabled={readOnly}
                      onChange={e => zetLabel(i, e.target.value)}
                      placeholder={['bijv. Gevelzijde', 'bijv. Etage', 'bijv. Huisnummer'][i]}
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-everts focus:outline-none focus:ring-2 focus:ring-everts/20"
                    />
                  </div>
                ))}
              </div>

              {/* De boom */}
              <div className="rounded-lg border border-slate-200 p-2">
                {wortels.length > 0 ? wortels.map(w => renderKnoop(w, 0))
                  : <div className="px-2 py-4 text-center text-sm text-slate-400">Nog geen niveaus. Voeg een hoofdniveau toe.</div>}
              </div>

              {!readOnly && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => muteer(n => voegKnoopToe(n, null, ''))}>＋ Hoofdniveau</Button>
                  <Button variant="outline" size="sm" onClick={() => setReeksParent(null)}>⋯ Meerdere hoofdniveaus</Button>
                  <div className="ml-auto flex items-center gap-3">
                    {melding && <span className="text-sm text-slate-500">{melding}</span>}
                    <Button size="sm" onClick={opslaan} loading={bezig} disabled={!vuil && melding === 'Opgeslagen'}>Opslaan</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {reeksParent !== undefined && (
        <ReeksDialog
          onSluiten={() => setReeksParent(undefined)}
          onToevoegen={namen => { muteer(n => voegMeerdereToe(n, reeksParent, namen)); setReeksParent(undefined) }}
        />
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, disabled, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean
}) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`flex h-6 w-6 items-center justify-center rounded text-sm ${
        disabled ? 'text-slate-200' : danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-200'
      }`}>
      {children}
    </button>
  )
}

/** Dialog om in één keer meerdere knopen te genereren: een reeks of een lijst. */
function ReeksDialog({ onSluiten, onToevoegen }: {
  onSluiten: () => void; onToevoegen: (namen: string[]) => void
}) {
  const [modus, setModus] = useState<'reeks' | 'lijst'>('reeks')
  const [van, setVan] = useState('491')
  const [tot, setTot] = useState('509')
  const [stap, setStap] = useState('2')
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [lijst, setLijst] = useState('')

  const voorbeeld = modus === 'reeks'
    ? genereerReeks({ van: Number(van), tot: Number(tot), stap: Number(stap), prefix, suffix })
    : genereerLijst(lijst)

  return (
    <Dialog open onOpenChange={o => { if (!o) onSluiten() }}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Meerdere toevoegen</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex gap-2">
            {(['reeks', 'lijst'] as const).map(m => (
              <button key={m} type="button" onClick={() => setModus(m)}
                className={`flex-1 rounded-md border-2 px-3 py-2 text-sm font-semibold ${
                  modus === m ? 'border-everts bg-everts/5 text-everts-dark' : 'border-slate-200 text-slate-500'}`}>
                {m === 'reeks' ? 'Reeks (van–tot)' : 'Lijst (plakken)'}
              </button>
            ))}
          </div>

          {modus === 'reeks' ? (
            <div className="grid grid-cols-3 gap-3">
              {[['Van', van, setVan], ['Tot', tot, setTot], ['Stap', stap, setStap]].map(([l, v, s]) => (
                <div key={l as string}>
                  <label className="mb-1 block text-xs text-slate-500">{l as string}</label>
                  <input type="number" value={v as string} onChange={e => (s as (x: string) => void)(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-everts focus:outline-none" />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs text-slate-500">Prefix</label>
                <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="bijv. nr. "
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-everts focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Suffix</label>
                <input value={suffix} onChange={e => setSuffix(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-everts focus:outline-none" />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-slate-500">Waarden (één per regel of komma-gescheiden)</label>
              <textarea value={lijst} onChange={e => setLijst(e.target.value)} rows={5}
                placeholder={'491\n493\n495'}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-everts focus:outline-none" />
            </div>
          )}

          <div className="text-xs text-slate-500">
            {voorbeeld.length > 0
              ? <>Maakt <strong>{voorbeeld.length}</strong> knopen: {voorbeeld.slice(0, 6).join(', ')}{voorbeeld.length > 6 ? '…' : ''}</>
              : 'Nog niets om toe te voegen.'}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
          <Button onClick={() => onToevoegen(voorbeeld)} disabled={voorbeeld.length === 0}>
            {voorbeeld.length > 0 ? `${voorbeeld.length} toevoegen` : 'Toevoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
