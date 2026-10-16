'use client'

import { useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowLeft, GitBranch, Undo2, Check, CloudUpload, TriangleAlert, ChevronDown, ChevronsUpDown,
  Library, BookOpen, Paintbrush, Package, Keyboard, MoreHorizontal, Copy, FileUp, FileDown, Table2,
  FileText, ClipboardList, Receipt, ListChecks, PencilLine, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import { type Weergave, WEERGAVE_LABEL } from './grid/weergave'
import { menuInhoud, menuItem, menuKop, menuScheiding, menuUitleg, LABEL_2XL, LABEL_RUIM } from './werkbalk-menu'

export type BibliotheekSoort = 'recepten' | 'schilderwerk' | 'materialen'
export type SyncStatus = 'idle' | 'bezig' | 'gelukt' | 'fout'

interface Props {
  readOnly: boolean
  /** Terug naar het overzicht waar deze calculatie uit geopend is (versies, meerwerk, …). */
  terug?: { label: string; onClick: () => void }
  boomOpen: boolean
  onToggleBoom: () => void
  undoCount: number
  onUndo: () => void
  syncStatus: SyncStatus
  /** Moment van de laatste geslaagde opslag in deze sessie; null = nog niet opgeslagen. */
  opgeslagenOp: Date | null
  onOpslaan: () => void
  onBibliotheek: (soort: BibliotheekSoort) => void
  /** Meetstaat-knop; draagt zijn eigen scherm en venster. */
  meetstaat: ReactNode
  onBehandelingPerCode: () => void
  onUrenPerGroep: () => void
  weergave: Weergave
  onWeergave: (w: Weergave) => void
  kanKopieren: boolean
  onKopieer: () => void
  kanReviseren: boolean
  onReviseer: () => void
  onImporteer: () => void
  onCufExport: () => void
  onExcelExport: () => void
  /** Offerte en interne begroting: alleen binnen een dossier en niet bevroren. */
  kanOfferte: boolean
  /** Knop Controle met tellers (rood = houdt de offerte tegen, oranje = nakijken). */
  controle: { rood: number; oranje: number; open: boolean; onToggle: () => void }
  /** Knop Uitvraag (alleen binnen een dossier); draagt zelf zijn paneel. */
  uitvraagKnop?: ReactNode
  onStartOfferte: (type: QuoteType) => void
  onInstellingen: () => void
}

const SNELTOETSEN: [string, string][] = [
  ['Ctrl+R',       'Nieuwe regel in actieve groep'],
  ['Ctrl+G',       'Nieuwe hoofdgroep'],
  ['Ctrl+C',       'Kopiëren'],
  ['Ctrl+X',       'Knippen'],
  ['Ctrl+V',       'Plakken'],
  ['Ctrl+D',       'Dupliceren'],
  ['Ctrl+M',       'Verplaatsen naar groep'],
  ['Ctrl+Shift+R', 'Verwijderen'],
  ['Ctrl+Z',       'Ongedaan maken'],
  ['Ctrl+Enter',   'Normen van de regel open/dicht'],
  ['Ctrl+Shift+Enter', 'Werkomschrijving open/dicht'],
  ['Ctrl+Alt+Enter', 'Markering & interne opmerking open/dicht'],
  ['↑ / ↓',        'Vorige/volgende regel, zelfde kolom'],
  ['Esc',          'Selectie opheffen'],
]

const actiefStijl = 'border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-50'

function tijd(d: Date) {
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function Scheiding() {
  return <span className="w-px h-4 bg-neutral-200 mx-1 flex-shrink-0" />
}

/**
 * Werkbalk van de calculatie, op één regel (EVA CalculatieGrid.html › calc-toolbar). Links:
 * terug, structuur, ongedaan en wat je toevoegt of in één keer bewerkt. Rechts: de opslagstatus,
 * hoe het rekenblad eruitziet, Meer, en de stappen naar de offerte op volgorde: uitvragen,
 * controleren, offerte. Acties zijn knoppen zonder kader, keuzelijsten hebben een kader, alleen
 * Offerte is groen. Onder 2xl tonen de minder gebruikte knoppen alleen hun icoon (naam in de
 * tooltip), zodat de balk ook op een laptop met de zijbalk open op één regel past.
 */
export default function CalculatieWerkbalk(p: Props) {
  const [sneltoetsenOpen, setSneltoetsenOpen] = useState(false)
  const aantalControle = p.controle.rood + p.controle.oranje
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-white border-b border-neutral-200 flex-shrink-0">
      {p.terug && (
        <>
          <Button variant="ghost" size="sm" onClick={p.terug.onClick} title={`Terug naar ${p.terug.label.toLowerCase()}`}>
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="sr-only">{p.terug.label}</span>
          </Button>
          <Scheiding />
        </>
      )}

      <Button
        variant="ghost" size="sm" onClick={p.onToggleBoom}
        className={p.boomOpen ? actiefStijl : undefined}
        title={p.boomOpen ? 'Structuur sluiten' : 'Structuur openen — groepen en volgorde'}
        aria-pressed={p.boomOpen}
      >
        <GitBranch className="w-3.5 h-3.5" />
        <span className={LABEL_2XL}>Structuur</span>
      </Button>
      <Button
        variant="ghost" size="sm" onClick={p.onUndo}
        disabled={p.undoCount === 0 || p.readOnly}
        title={p.readOnly ? 'Bevroren' : p.undoCount > 0 ? `Ongedaan maken (Ctrl+Z) — ${p.undoCount} stap${p.undoCount === 1 ? '' : 'pen'}` : 'Niets om ongedaan te maken'}
      >
        <Undo2 className="w-3.5 h-3.5" />
        {p.undoCount > 0 && !p.readOnly && <Teller kleur="bg-neutral-100 text-neutral-600">{p.undoCount}</Teller>}
      </Button>
      <Scheiding />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" size="sm" title="Bibliotheek: recepten, schilderwerk en materialen">
            <Library className="w-3.5 h-3.5" />
            <span className={LABEL_RUIM}>Bibliotheek</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuInhoud} align="start" sideOffset={4}>
            <DropdownMenu.Item className={menuItem} onSelect={() => p.onBibliotheek('recepten')}>
              <BookOpen className="w-3.5 h-3.5 text-neutral-400" /> Recepten
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => p.onBibliotheek('schilderwerk')}>
              <Paintbrush className="w-3.5 h-3.5 text-neutral-400" /> Schilderwerk
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => p.onBibliotheek('materialen')}>
              <Package className="w-3.5 h-3.5 text-neutral-400" /> Materialen
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {p.meetstaat}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" size="sm" title="Bewerken: behandeling per code, uren per groep">
            <PencilLine className="w-3.5 h-3.5" />
            <span className={LABEL_2XL}>Bewerken</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${menuInhoud} w-[280px]`} align="start" sideOffset={4}>
            <DropdownMenu.Item className={`${menuItem} items-start`} onSelect={p.onBehandelingPerCode} disabled={p.readOnly}>
              <ListChecks className="w-3.5 h-3.5 text-neutral-400 mt-px" />
              <span>Behandeling per code<span className={menuUitleg}>Per bestekscode in één keer een behandeling koppelen</span></span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={`${menuItem} items-start`} onSelect={p.onUrenPerGroep}>
              <Clock className="w-3.5 h-3.5 text-neutral-400 mt-px" />
              <span>Uren per groep &amp; tijdtoeslag<span className={menuUitleg}>Uren nakijken en per groep een toeslag geven</span></span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="ml-auto flex items-center gap-1">
        {!p.readOnly && (
          <>
            <OpslagStatus status={p.syncStatus} opgeslagenOp={p.opgeslagenOp} onOpslaan={p.onOpslaan} />
            <Scheiding />
          </>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" title={`Tonen: ${WEERGAVE_LABEL[p.weergave]}`}>
              <ChevronsUpDown className="w-3.5 h-3.5" />
              <span className={LABEL_RUIM}>Tonen</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuInhoud} align="end" sideOffset={4}>
              <div className={menuKop}>Tonen</div>
              {(Object.keys(WEERGAVE_LABEL) as Weergave[]).map(w => (
                <DropdownMenu.Item key={w} className={menuItem} onSelect={() => p.onWeergave(w)}>
                  <span className="w-3.5">{p.weergave === w && <Check className="w-3.5 h-3.5 text-brand-700" />}</span>
                  <span className={p.weergave === w ? 'font-semibold text-brand-700' : ''}>{WEERGAVE_LABEL[w]}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {/* Kolom-layouts en kolommen: het rekenblad zet zijn knoppen hier via een portal. */}
        <div id="calc-grid-toolbar-slot" className="flex items-center gap-1" />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" title="Meer: versies, importeren, exporteren en sneltoetsen">
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span className="sr-only">Meer</span>
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuInhoud} align="end" sideOffset={4}>
              {(p.kanKopieren || p.kanReviseren) && (
                <>
                  <div className={menuKop}>Versie</div>
                  {p.kanKopieren && (
                    <DropdownMenu.Item className={menuItem} onSelect={p.onKopieer}>
                      <Copy className="w-3.5 h-3.5 text-neutral-400" /> Kopiëren als nieuwe versie
                    </DropdownMenu.Item>
                  )}
                  {p.kanReviseren && (
                    <DropdownMenu.Item className={menuItem} onSelect={p.onReviseer}>
                      <Copy className="w-3.5 h-3.5 text-neutral-400" /> Reviseren (nieuwe versie)
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className={menuScheiding} />
                </>
              )}
              <div className={menuKop}>Bestanden</div>
              <DropdownMenu.Item className={menuItem} onSelect={p.onImporteer} disabled={p.readOnly}>
                <FileUp className="w-3.5 h-3.5 text-neutral-400" /> Importeren (CUF / C4Y)
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={p.onCufExport}>
                <FileDown className="w-3.5 h-3.5 text-neutral-400" /> Exporteren naar CUF
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={p.onExcelExport}>
                <Table2 className="w-3.5 h-3.5 text-brand-500" /> Exporteren naar Excel
              </DropdownMenu.Item>
              <DropdownMenu.Separator className={menuScheiding} />
              <DropdownMenu.Item className={menuItem} onSelect={() => setSneltoetsenOpen(true)}>
                <Keyboard className="w-3.5 h-3.5 text-neutral-400" /> Sneltoetsen
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Scheiding />

        {p.uitvraagKnop}
        <Button
          variant="outline" size="sm" onClick={p.controle.onToggle} aria-pressed={p.controle.open}
          className={p.controle.open ? actiefStijl : undefined}
          title={aantalControle === 0
            ? 'Controle: alles in orde'
            : `Controle: ${p.controle.rood} op te lossen, ${p.controle.oranje} nakijken`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span className={LABEL_2XL}>Controle</span>
          {p.controle.rood > 0 && <Teller kleur="bg-error-500 text-white">{p.controle.rood}</Teller>}
          {p.controle.oranje > 0 && <Teller kleur="bg-warning-500 text-white">{p.controle.oranje}</Teller>}
          {aantalControle === 0 && <Check className="w-3.5 h-3.5 text-brand-500" />}
        </Button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary" size="sm" title="Offerte, interne begroting en voorwaarden, tekst & bijlages">
              <FileText className="w-3.5 h-3.5" />
              Offerte
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuInhoud} align="end" sideOffset={4}>
              {p.kanOfferte && (
                <>
                  <DropdownMenu.Item className={menuItem} onSelect={() => p.onStartOfferte('verkoopofferte')}>
                    <FileText className="w-3.5 h-3.5 text-neutral-400" /> Offerte aanmaken
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={menuItem} onSelect={() => p.onStartOfferte('interne_calculatie')}>
                    <ClipboardList className="w-3.5 h-3.5 text-neutral-400" /> Interne begroting
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className={menuScheiding} />
                </>
              )}
              <DropdownMenu.Item className={`${menuItem} items-start`} onSelect={p.onInstellingen} disabled={p.readOnly}>
                <Receipt className="w-3.5 h-3.5 text-neutral-400 mt-px" />
                <span>
                  Voorwaarden, tekst &amp; bijlages
                  <span className={menuUitleg}>Betalingscondities, inleiding, PDF-bijlages</span>
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <Sneltoetsen open={sneltoetsenOpen} onOpenChange={setSneltoetsenOpen} />
    </div>
  )
}

/**
 * Opslaan gaat automatisch; dit is een melding, geen knop die je moet onthouden. Klikken
 * slaat wel direct op, voor wie het zeker wil weten.
 */
function OpslagStatus({ status, opgeslagenOp, onOpslaan }: {
  status: SyncStatus; opgeslagenOp: Date | null; onOpslaan: () => void
}) {
  const kleur =
    status === 'fout' ? 'text-error-700 hover:bg-error-50' :
    status === 'bezig' ? 'text-neutral-500' :
    opgeslagenOp ? 'text-brand-700 hover:bg-brand-50' : 'text-neutral-500'
  const tekst =
    status === 'bezig' ? 'Opslaan…'
    : status === 'fout' ? 'Niet opgeslagen — opnieuw'
    : opgeslagenOp ? `Opgeslagen ${tijd(opgeslagenOp)}` : 'Opslaan'
  return (
    <Button
      variant="ghost" size="sm" onClick={onOpslaan} disabled={status === 'bezig'}
      loading={status === 'bezig'}
      className={`font-medium ${kleur}`}
      title={`${tekst}. Wijzigingen worden automatisch opgeslagen — klik om nu op te slaan.`}
    >
      {status === 'fout' ? <TriangleAlert className="w-3.5 h-3.5" />
        : status !== 'bezig' && (opgeslagenOp ? <Check className="w-3.5 h-3.5" /> : <CloudUpload className="w-3.5 h-3.5" />)}
      {/* Een fout blijft altijd leesbaar. Opgeslagen: alleen de tijd, het woord pas op een ruim scherm. */}
      {status === 'idle' || status === 'gelukt'
        ? opgeslagenOp && <span><span className={LABEL_RUIM}>Opgeslagen </span>{tijd(opgeslagenOp)}</span>
        : <span className={status === 'fout' ? '' : LABEL_2XL}>{tekst}</span>}
    </Button>
  )
}

/** Sneltoetsen als naslag, onder Meer. */
function Sneltoetsen({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Sneltoetsen</DialogTitle></DialogHeader>
        <DialogBody>
          <table className="w-full text-xs">
            <tbody>
              {SNELTOETSEN.map(([toets, label]) => (
                <tr key={toets}>
                  <td className="pr-4 py-1 font-medium text-neutral-800 whitespace-nowrap">{toets}</td>
                  <td className="py-1 text-neutral-500">{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Teller({ kleur, children }: { kleur: string; children: ReactNode }) {
  return (
    <span className={`${kleur} min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold leading-[18px] text-center`}>
      {children}
    </span>
  )
}
