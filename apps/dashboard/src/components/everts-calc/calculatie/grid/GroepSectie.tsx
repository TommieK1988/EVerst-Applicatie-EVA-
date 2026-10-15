'use client'

import { useState, useEffect } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { berekenGroepKostprijs, berekenGroepVP, berekenGroepUren, berekenGroepMaterieel, berekenGroepOA, formatEuro, formatGetal } from '@/lib/everts-calc/calculations'
import type { Groep, Calculatieregel, Componentregel, EenheidConfig } from '@/lib/everts-calc/types'
import { isTekstregel } from '@/lib/everts-calc/types'
import ConfirmDialog from '@/components/everts-calc/shared/ConfirmDialog'
import ActiviteitToevoegenModal from '@/components/everts-calc/calculatie/ActiviteitToevoegenModal'
import { type BtwTariefKeuze } from '@/lib/stamdata/btw'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import type { BibliotheekItemVereenvoudigd } from '@/lib/everts-calc/types'
import { type ColId, NIVEAU_INSPRING, COL_MAP, groepsGrenzen, GRENS_STIJL } from './kolommen'
import { TekstregelRij } from './TekstregelRij'
import { CalculatieregelRij } from './CalculatieregelRij'
import { ActieMenu, type RegelActie } from './ActieMenu'
import { InvoegRij } from './InvoegRij'

// ─── GroepSectie (recursief) ──────────────────────────────────────────────────

export interface GroepSectieProps {
  groep: Groep
  diepte: number
  alleGroepen: Groep[]
  alleRegels: Calculatieregel[]
  alleComponenten: Componentregel[]
  nummers: Map<string, string>
  isActief: boolean
  defaultOpslag: number
  standaardTarief?: number
  colOrder: ColId[]
  btwTarieven: BtwTariefKeuze[]
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  scenarioId: string
  onHerlaad: () => void
  onKlik: (id: string) => void
  onRegelWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onRegelComponentWijzig: (id: string, type: Componentregel['type'], norm: number, tarief: number) => void
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type']) => void
  onVerwijderComponent: (compId: string) => void
  onVerwijderRegel: (id: string) => void
  onVerwijderGroep: (id: string) => void
  onWijzigGroep: (id: string, patch: Partial<Groep>) => void
  /** Klap één groep in/uit — apart van onWijzigGroep, want in-/uitklappen is geen inhoudelijke wijziging. */
  onToggleInklap: (id: string) => void
  onVoegRegelToe: (groepId: string) => void
  onVoegTekstregelToe: (groepId: string) => void
  onVoegSubgroepToe: (groep: Groep) => void
  /** Groep waarboven een régel hangt — voor de blauwe ring bij regel-drops. */
  dragOverGroepId: string | null
  sleepRegelId: string | null
  /** Alle regels die met de huidige sleep meegaan (bij een multiselectie meer dan één). */
  sleepRegelIds: Set<string>
  onDragOver: (e: React.DragEvent, groep: Groep) => void
  onDrop: (e: React.DragEvent, doelGroep: Groep) => void
  onDragEnd: () => void
  onRegelDragStartNaarGroep: (regelId: string) => void
  onRegelDragEnd: () => void
  onRegelVerplaatsNaarPositie: (regelIds: string[], doelGroepId: string, voorRegelId: string | null) => void
  bibliotheekItems?: BibliotheekItemVereenvoudigd[]
  /** Bibliotheek van schilderbehandelingen; één keer geladen door het grid. */
  behandelingen?: SchilderBehandeling[]
  geselecteerdeRegels?: Set<string>
  onSelecteerRegel?: (regelId: string, ctrlKey: boolean, shiftKey: boolean) => void
  /** Acties uit het ⋯-menu van een regel (dupliceren, kopiëren, verplaatsen, verwijderen). */
  onRegelActie?: (regelId: string, actie: RegelActie) => void
  collapseSignal?: number
  readOnly?: boolean
}

export function GroepSectie({
  groep, diepte, alleGroepen, alleRegels, alleComponenten, nummers,
  isActief, defaultOpslag, standaardTarief, colOrder, btwTarieven, uurtarieven, eenheden, scenarioId, onHerlaad,
  onKlik, onRegelWijzig, onRegelComponentWijzig, onWijzigComponentExtra,
  onVoegComponentToe, onVerwijderComponent,
  onVerwijderRegel, onVerwijderGroep, onWijzigGroep, onToggleInklap, onVoegRegelToe, onVoegTekstregelToe, onVoegSubgroepToe,
  dragOverGroepId, sleepRegelId, sleepRegelIds, onDragOver, onDrop, onDragEnd,
  onRegelDragStartNaarGroep, onRegelDragEnd, onRegelVerplaatsNaarPositie,
  bibliotheekItems, behandelingen = [],
  geselecteerdeRegels, onSelecteerRegel, onRegelActie,
  collapseSignal, readOnly = false,
}: GroepSectieProps) {
  const ingeklapt = groep.ingeklapt ?? false
  const [confirmVerwijder, setConfirmVerwijder] = useState(false)
  const [editingNaam,     setEditingNaam]     = useState(false)
  const [biblOpen,        setBiblOpen]        = useState(false)
  const [naamEdit,        setNaamEdit]        = useState(groep.naam)
  useEffect(() => { setNaamEdit(groep.naam) }, [groep.naam])
  const [dragOverRegelId, setDragOverRegelId] = useState<string | null>(null)
  const directeRegels = alleRegels.filter(r => r.groep_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
  const subGroepen    = alleGroepen.filter(g => g.parent_id === groep.id).sort((a, b) => a.volgorde - b.volgorde)
  const kostprijs     = berekenGroepKostprijs(groep.id, alleGroepen, alleRegels, alleComponenten)
  const nummer        = nummers.get(groep.id) ?? ''
  const isRegelDropTarget   = sleepRegelId !== null && dragOverGroepId === groep.id
  const colCount      = colOrder.length
  const grenzen       = groepsGrenzen(colOrder)

  // Alle regels die met deze sleep meegaan — bij een multiselectie is dat de hele
  // selectie, anders alleen de opgepakte regel. Het grid bepaalt de set.
  const handleRegelDragStart = (_e: React.DragEvent, id: string) => {
    onRegelDragStartNaarGroep(id)
  }
  const handleRegelDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (sleepRegelId && !sleepRegelIds.has(id)) setDragOverRegelId(id)
  }
  const handleRegelDrop = (targetId: string) => {
    setDragOverRegelId(null)
    // Op een regel die zelf meegesleept wordt kun je niet droppen.
    if (!sleepRegelId || sleepRegelIds.has(targetId)) return
    onRegelVerplaatsNaarPositie([...sleepRegelIds], groep.id, targetId)
  }
  const handleRegelDragEnd = () => {
    setDragOverRegelId(null)
    onRegelDragEnd()
  }

  // Groepstotalen — getoond in een eigen rij ónder de groep, per kolom uitgelijnd.
  // Alleen doorrekenen als er iets te tonen valt: elke berekening loopt de hele
  // subboom af en dat gebeurt bij elke render van elke groep opnieuw. Een groep
  // met alleen minderwerk komt negatief uit en heeft net zo goed een totaalrij.
  const toonTotalen = kostprijs !== 0
  const groepVP   = toonTotalen ? berekenGroepVP(groep.id, alleGroepen, alleRegels, alleComponenten, defaultOpslag) : 0
  const groepUren = toonTotalen ? berekenGroepUren(groep.id, alleGroepen, alleRegels, alleComponenten) : 0
  const groepMT   = toonTotalen ? berekenGroepMaterieel(groep.id, alleGroepen, alleRegels, alleComponenten) : 0
  const groepOA   = toonTotalen ? berekenGroepOA(groep.id, alleGroepen, alleRegels, alleComponenten) : 0

  const kopStijlen = [
    'text-white',
    'text-white border-b border-white/10',
    'bg-slate-100 text-slate-700 border-b border-slate-200',
  ]
  const kopBgStijlen: React.CSSProperties[] = [
    { backgroundColor: '#054f2e' },
    { backgroundColor: '#013a20' },
    {},
  ]
  const kopStijl   = kopStijlen[diepte] ?? kopStijlen[2]
  const kopBgStijl = kopBgStijlen[diepte] ?? kopBgStijlen[2]
  const kopPadding = diepte === 0 ? 'py-2.5' : 'py-1.5'
  const kopTekst   = diepte === 0 ? 'text-sm font-bold' : diepte === 1 ? 'text-xs font-semibold' : 'text-xs font-medium'
  /** Zichtbare inspringing per niveau, zodat de nesting af te lezen is. */
  const indent     = 4 + diepte * NIVEAU_INSPRING

  /** Totaalrij: hoe dieper de groep, hoe rustiger de streep eronder. */
  const totaalRijCls   = diepte === 0
    ? 'border-t-2 border-b-2 border-everts/30'
    : 'border-t border-b border-slate-200'
  const totaalRijStijl: React.CSSProperties = { backgroundColor: diepte === 0 ? 'rgba(5,79,46,0.07)' : 'rgba(241,245,249,0.9)' }
  const totaalTekst    = diepte === 0 ? 'text-everts-dark' : 'text-slate-600'

  return (
    <>
      <tr
        id={`groepkop-${groep.id}`}
        className={`border-b cursor-pointer group/kop select-none ${kopStijl} ${isActief ? 'ring-1 ring-inset ring-everts/50' : ''} ${isRegelDropTarget ? 'ring-2 ring-inset ring-blue-400' : ''}`}
        style={kopBgStijl}
        onClick={() => onKlik(groep.id)}
        onDragOver={e => onDragOver(e, groep)}
        onDrop={e => onDrop(e, groep)}
        onDragEnd={onDragEnd}
      >
        <td colSpan={colCount} className={kopPadding} style={{ paddingLeft: `${indent}px` }}>
          <div className="flex items-center gap-2">
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onToggleInklap(groep.id) }}
              className={`p-0.5 rounded cursor-pointer ${diepte <= 1 ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
            >
              {ingeklapt ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
            <span className={` opacity-50 text-[11px] ${diepte <= 1 ? 'text-white' : ''}`}>{nummer}</span>
            {editingNaam ? (
              <input
                autoFocus
                value={naamEdit}
                onChange={e => setNaamEdit(e.target.value)}
                onBlur={() => {
                  setEditingNaam(false)
                  if (naamEdit.trim() && naamEdit.trim() !== groep.naam)
                    onWijzigGroep(groep.id, { naam: naamEdit.trim() })
                  else setNaamEdit(groep.naam)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') { setNaamEdit(groep.naam); setEditingNaam(false) }
                }}
                onClick={e => e.stopPropagation()}
                className={`bg-transparent border-b border-current/40 focus:outline-none ${kopTekst} min-w-[80px]`}
              />
            ) : (
              <span
                className={`${kopTekst} ${groep.optioneel ? 'italic opacity-60' : ''} cursor-text`}
                onDoubleClick={e => { e.stopPropagation(); setEditingNaam(true) }}
              >
                {groep.naam}
              </span>
            )}
            {groep.optioneel && (
              <span className={`text-[10.5px] px-1.5 py-0.5 rounded font-medium ${diepte <= 1 ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-600 border border-neutral-200'}`}>
                OPTIONEEL · telt niet mee
              </span>
            )}
            <span className={`text-[11px] opacity-50 ${diepte <= 1 ? 'text-white' : 'text-slate-500'}`}>
              {directeRegels.length > 0 && `${directeRegels.length} regel${directeRegels.length !== 1 ? 's' : ''}`}
              {subGroepen.length > 0 && ` · ${subGroepen.length} subgroep${subGroepen.length !== 1 ? 'en' : ''}`}
            </span>
            <div className="flex-1" />
            {/* De groepstotalen staan bewust niet meer hier maar in een eigen rij
                onder de groep, uitgelijnd op de bijbehorende kolommen. */}
            <div className="sticky right-2 flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onVoegRegelToe(groep.id)}
                  title="Regel toevoegen aan deze groep (Ctrl+R)"
                  className={`text-[11px] font-semibold flex items-center gap-0.5 px-2 py-0.5 rounded ${diepte <= 1 ? 'text-white/80 hover:text-white hover:bg-white/15' : 'text-neutral-500 hover:text-brand-700 hover:bg-brand-50'}`}
                >
                  <Plus className="w-3 h-3" /> Regel
                </button>
              )}
              <ActieMenu
                label={`Acties voor groep ${groep.naam}`}
                licht={diepte <= 1}
                items={readOnly ? [
                  { label: ingeklapt ? 'Regels uitklappen' : 'Regels inklappen', onSelect: () => onToggleInklap(groep.id) },
                ] : [
                  { soort: 'kop', label: 'Toevoegen' },
                  { label: 'Regel', onSelect: () => onVoegRegelToe(groep.id), sneltoets: 'Ctrl R' },
                  { label: 'Tekstregel', onSelect: () => onVoegTekstregelToe(groep.id), sneltoets: 'Ctrl ⇧ R' },
                  groep.niveau < 3 && { label: 'Subgroep', onSelect: () => onVoegSubgroepToe(groep) },
                  { label: 'Uit bibliotheek…', onSelect: () => setBiblOpen(true) },
                  { soort: 'scheiding' },
                  { label: 'Hernoemen', onSelect: () => setEditingNaam(true) },
                  {
                    label: groep.optioneel ? 'Niet meer optioneel' : 'Optioneel maken',
                    extra: !groep.optioneel ? <span className="text-[10.5px] text-neutral-400">telt niet mee</span> : undefined,
                    onSelect: () => onWijzigGroep(groep.id, { optioneel: !groep.optioneel }),
                  },
                  { label: ingeklapt ? 'Regels uitklappen' : 'Regels inklappen', onSelect: () => onToggleInklap(groep.id) },
                  { soort: 'scheiding' },
                  { label: 'Groep verwijderen…', gevaarlijk: true, onSelect: () => setConfirmVerwijder(true) },
                ]}
              />
            </div>
          </div>
        </td>
      </tr>

      {!ingeklapt && (
        <>
          {directeRegels.map(r => isTekstregel(r) ? (
            <TekstregelRij
              key={r.id} regel={r} colOrder={colOrder}
              onWijzig={onRegelWijzig}
              onVerwijder={() => onVerwijderRegel(r.id)}
              isGeselecteerd={geselecteerdeRegels?.has(r.id)}
              onSelecteer={(ctrl, shift) => onSelecteerRegel?.(r.id, ctrl, shift)}
              onActie={actie => onRegelActie?.(r.id, actie)}
              isDragging={sleepRegelIds.has(r.id)}
              isDragOver={dragOverRegelId === r.id}
              onDragStart={e => handleRegelDragStart(e, r.id)}
              onDragOver={e => handleRegelDragOver(e, r.id)}
              onDrop={() => handleRegelDrop(r.id)}
              onDragEnd={handleRegelDragEnd}
              readOnly={readOnly}
            />
          ) : (
            <CalculatieregelRij
              key={r.id} regel={r} componenten={alleComponenten}
              diepte={diepte + 1} defaultOpslag={defaultOpslag} standaardTarief={standaardTarief} colOrder={colOrder} btwTarieven={btwTarieven}
              uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={onHerlaad}
              onWijzig={onRegelWijzig} onWijzigComponent={onRegelComponentWijzig}
              onWijzigComponentExtra={onWijzigComponentExtra}
              onVoegComponentToe={onVoegComponentToe}
              onVerwijderComponent={onVerwijderComponent}
              onVerwijder={() => onVerwijderRegel(r.id)}
              bibliotheekItems={bibliotheekItems}
              behandelingen={behandelingen}
              isGeselecteerd={geselecteerdeRegels?.has(r.id)}
              onSelecteer={(ctrl, shift) => onSelecteerRegel?.(r.id, ctrl, shift)}
              onActie={actie => onRegelActie?.(r.id, actie)}
              isDragging={sleepRegelIds.has(r.id)}
              isDragOver={dragOverRegelId === r.id}
              onDragStart={e => handleRegelDragStart(e, r.id)}
              onDragOver={e => handleRegelDragOver(e, r.id)}
              onDrop={() => handleRegelDrop(r.id)}
              onDragEnd={handleRegelDragEnd}
              collapseSignal={collapseSignal}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <InvoegRij
              colCount={colCount} indent={indent + 18}
              kanSubgroep={groep.niveau < 3}
              onRegel={() => onVoegRegelToe(groep.id)}
              onTekstregel={() => onVoegTekstregelToe(groep.id)}
              onSubgroep={() => onVoegSubgroepToe(groep)}
              onBibliotheek={() => setBiblOpen(true)}
            />
          )}
          {subGroepen.map(sub => (
            <GroepSectie
              key={sub.id} groep={sub} diepte={diepte + 1}
              alleGroepen={alleGroepen} alleRegels={alleRegels} alleComponenten={alleComponenten}
              nummers={nummers} isActief={isActief} defaultOpslag={defaultOpslag} standaardTarief={standaardTarief} colOrder={colOrder} btwTarieven={btwTarieven}
              uurtarieven={uurtarieven} eenheden={eenheden} scenarioId={scenarioId} onHerlaad={onHerlaad}
              onKlik={onKlik} onRegelWijzig={onRegelWijzig} onRegelComponentWijzig={onRegelComponentWijzig}
              onWijzigComponentExtra={onWijzigComponentExtra}
              onVoegComponentToe={onVoegComponentToe} onVerwijderComponent={onVerwijderComponent}
              onVerwijderRegel={onVerwijderRegel} onVerwijderGroep={onVerwijderGroep}
              onWijzigGroep={onWijzigGroep} onToggleInklap={onToggleInklap}
              onVoegRegelToe={onVoegRegelToe} onVoegTekstregelToe={onVoegTekstregelToe} onVoegSubgroepToe={onVoegSubgroepToe}
              dragOverGroepId={dragOverGroepId} sleepRegelId={sleepRegelId} sleepRegelIds={sleepRegelIds}
              onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
              onRegelDragStartNaarGroep={onRegelDragStartNaarGroep}
              onRegelDragEnd={onRegelDragEnd}
              onRegelVerplaatsNaarPositie={onRegelVerplaatsNaarPositie}
              bibliotheekItems={bibliotheekItems}
              behandelingen={behandelingen}
              geselecteerdeRegels={geselecteerdeRegels}
              onSelecteerRegel={onSelecteerRegel}
              onRegelActie={onRegelActie}
              collapseSignal={collapseSignal}
              readOnly={readOnly}
            />
          ))}

        </>
      )}

      {/* Groepstotaal — onderaan de groep, elk bedrag in zijn eigen kolom.
          Blijft ook zichtbaar als de groep is ingeklapt. */}
      {toonTotalen && (
        <tr className={totaalRijCls} style={totaalRijStijl}>
          {colOrder.map(id => {
            const grens = grenzen.has(id) ? GRENS_STIJL : undefined
            const uitlijning = COL_MAP[id].align === 'right' ? 'text-right' : COL_MAP[id].align === 'center' ? 'text-center' : 'text-left'
            const cel = (inhoud: React.ReactNode, extra = '') => (
              <td key={id} data-col={id} className={`px-2 py-1.5 ${uitlijning} ${extra}`} style={grens}>{inhoud}</td>
            )
            switch (id) {
              case 'omschrijving': return (
                <td key={id} data-col={id} className="py-1.5 pr-2" style={{ paddingLeft: `${indent + 18}px` }}>
                  <span className={`text-xs font-semibold ${totaalTekst}`}>Totaal {groep.naam}</span>
                </td>
              )
              case 'tot_uren':  return cel(groepUren !== 0 ? <span className="text-xs font-semibold text-blue-700">{formatGetal(groepUren, 1)}</span> : null)
              case 'bedrag_mt': return cel(groepMT  !== 0 ? <span className="text-xs font-semibold text-red-700">{formatEuro(groepMT)}</span> : null)
              case 'bedrag_oa': return cel(groepOA  !== 0 ? <span className="text-xs font-semibold text-purple-700">{formatEuro(groepOA)}</span> : null)
              case 'tot_kp':    return cel(<span className="text-xs font-semibold text-everts-dark">{formatEuro(kostprijs)}</span>)
              case 'tot_vp':    return cel(<span className="text-xs font-bold text-everts">{formatEuro(groepVP)}</span>)
              default:          return <td key={id} data-col={id} className="py-1.5" style={grens} />
            }
          })}
        </tr>
      )}

      <ActiviteitToevoegenModal
        open={biblOpen}
        onClose={() => setBiblOpen(false)}
        elementId={groep.id}
        scenarioId={scenarioId}
        onToegevoegd={() => { setBiblOpen(false); onHerlaad() }}
        bibliotheekItems={bibliotheekItems}
      />

      <ConfirmDialog
        open={confirmVerwijder}
        onOpenChange={setConfirmVerwijder}
        title="Groep verwijderen?"
        description={`Groep "${groep.naam}" en alle onderliggende regels worden definitief verwijderd.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => { setConfirmVerwijder(false); onVerwijderGroep(groep.id) }}
      />
    </>
  )
}
