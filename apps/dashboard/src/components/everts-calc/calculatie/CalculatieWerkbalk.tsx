'use client'

import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  GitBranch, Undo2, Check, CloudUpload, TriangleAlert, ChevronDown, ChevronsUp, ChevronsDown,
  Library, BookOpen, Paintbrush, Package, Keyboard, MoreHorizontal, Copy, FileUp, FileDown, Table2,
  FileText, ClipboardList, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader } from '@/components/ui/popover'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'

export type BibliotheekSoort = 'recepten' | 'schilderwerk' | 'materialen'
export type SyncStatus = 'idle' | 'bezig' | 'gelukt' | 'fout'

interface Props {
  readOnly: boolean
  boomOpen: boolean
  onToggleBoom: () => void
  undoCount: number
  onUndo: () => void
  syncStatus: SyncStatus
  /** Moment van de laatste geslaagde opslag in deze sessie; null = nog niet opgeslagen. */
  opgeslagenOp: Date | null
  onOpslaan: () => void
  onBibliotheek: (soort: BibliotheekSoort) => void
  /** Meetstaat- en behandeling-per-code-knop; die dragen hun eigen dialogen. */
  toevoegen: ReactNode
  allesIngeklapt: boolean
  onToggleInklap: () => void
  kanKopieren: boolean
  onKopieer: () => void
  kanReviseren: boolean
  onReviseer: () => void
  onImporteer: () => void
  onCufExport: () => void
  onExcelExport: () => void
  /** Offerte en interne begroting: alleen binnen een dossier en niet bevroren. */
  kanOfferte: boolean
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
  ['Esc',          'Selectie opheffen'],
]

const ddContent = 'bg-white rounded-[10px] shadow-xl border border-neutral-200 py-1 min-w-[220px] z-[200]'
const ddItem = 'flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer outline-none rounded-md mx-1 data-[disabled]:opacity-40 data-[disabled]:cursor-default'
const ddKop = 'px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400'
const ddScheiding = 'h-px bg-neutral-100 my-1'

function tijd(d: Date) {
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Werkbalk van de calculatie. Links wat je tijdens het rekenen steeds gebruikt (structuur,
 * ongedaan, opslagstatus) en het blok Toevoegen; rechts inklappen, kolommen en sneltoetsen,
 * de zeldzame acties onder Meer en de offerte als laatste stap.
 */
export default function CalculatieWerkbalk(p: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-white border-b border-neutral-200 flex-shrink-0">
      <Button
        variant="outline" size="sm" onClick={p.onToggleBoom}
        className={p.boomOpen ? 'border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-50' : undefined}
        title={p.boomOpen ? 'Structuur sluiten' : 'Structuur openen — groepen en volgorde'}
        aria-pressed={p.boomOpen}
      >
        <GitBranch className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Structuur</span>
      </Button>

      <Button
        variant="outline" size="sm" onClick={p.onUndo}
        disabled={p.undoCount === 0 || p.readOnly}
        title={p.readOnly ? 'Bevroren' : p.undoCount > 0 ? `Ongedaan maken (Ctrl+Z)` : 'Niets om ongedaan te maken'}
      >
        <Undo2 className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Ongedaan{p.undoCount > 0 ? ` (${p.undoCount})` : ''}</span>
      </Button>

      {!p.readOnly && <OpslagStatus status={p.syncStatus} opgeslagenOp={p.opgeslagenOp} onOpslaan={p.onOpslaan} />}

      <span className="w-px h-4 bg-neutral-200 mx-2" />

      <span className="hidden xl:inline text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400 mr-1">
        Toevoegen
      </span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" size="sm" title="Bibliotheek openen">
            <Library className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Bibliotheek</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={ddContent} align="start" sideOffset={4}>
            <DropdownMenu.Item className={ddItem} onSelect={() => p.onBibliotheek('recepten')}>
              <BookOpen className="w-3.5 h-3.5 text-neutral-400" /> Recepten
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ddItem} onSelect={() => p.onBibliotheek('schilderwerk')}>
              <Paintbrush className="w-3.5 h-3.5 text-neutral-400" /> Schilderwerk
            </DropdownMenu.Item>
            <DropdownMenu.Item className={ddItem} onSelect={() => p.onBibliotheek('materialen')}>
              <Package className="w-3.5 h-3.5 text-neutral-400" /> Materialen
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {p.toevoegen}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline" size="icon-sm" onClick={p.onToggleInklap}
          title={p.allesIngeklapt ? 'Alles uitklappen — alle regels zichtbaar' : 'Inklappen — alleen de groepen zichtbaar'}
        >
          {p.allesIngeklapt ? <ChevronsDown className="w-3.5 h-3.5" /> : <ChevronsUp className="w-3.5 h-3.5" />}
        </Button>
        {/* Kolom-layouts en kolommen: het rekenblad zet zijn knoppen hier via een portal. */}
        <div id="calc-grid-toolbar-slot" className="flex items-center gap-1" />
        <Sneltoetsen />
        <span className="w-px h-4 bg-neutral-200 mx-1" />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" title="Versies, importeren en exporteren">
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Meer</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={ddContent} align="end" sideOffset={4}>
              {(p.kanKopieren || p.kanReviseren) && (
                <>
                  <div className={ddKop}>Versie</div>
                  {p.kanKopieren && (
                    <DropdownMenu.Item className={ddItem} onSelect={p.onKopieer}>
                      <Copy className="w-3.5 h-3.5 text-neutral-400" /> Kopiëren als nieuwe versie
                    </DropdownMenu.Item>
                  )}
                  {p.kanReviseren && (
                    <DropdownMenu.Item className={ddItem} onSelect={p.onReviseer}>
                      <Copy className="w-3.5 h-3.5 text-neutral-400" /> Reviseren (nieuwe versie)
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className={ddScheiding} />
                </>
              )}
              <div className={ddKop}>Bestanden</div>
              <DropdownMenu.Item className={ddItem} onSelect={p.onImporteer} disabled={p.readOnly}>
                <FileUp className="w-3.5 h-3.5 text-neutral-400" /> Importeren (CUF / C4Y)
              </DropdownMenu.Item>
              <DropdownMenu.Item className={ddItem} onSelect={p.onCufExport}>
                <FileDown className="w-3.5 h-3.5 text-neutral-400" /> Exporteren naar CUF
              </DropdownMenu.Item>
              <DropdownMenu.Item className={ddItem} onSelect={p.onExcelExport}>
                <Table2 className="w-3.5 h-3.5 text-brand-500" /> Exporteren naar Excel
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary" size="sm" title="Offerte, interne begroting en voorwaarden, tekst & bijlages">
              <FileText className="w-3.5 h-3.5" />
              Offerte
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={ddContent} align="end" sideOffset={4}>
              {p.kanOfferte && (
                <>
                  <DropdownMenu.Item className={ddItem} onSelect={() => p.onStartOfferte('verkoopofferte')}>
                    <FileText className="w-3.5 h-3.5 text-neutral-400" /> Offerte aanmaken
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={ddItem} onSelect={() => p.onStartOfferte('interne_calculatie')}>
                    <ClipboardList className="w-3.5 h-3.5 text-neutral-400" /> Interne begroting
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className={ddScheiding} />
                </>
              )}
              <DropdownMenu.Item className={`${ddItem} items-start`} onSelect={p.onInstellingen} disabled={p.readOnly}>
                <Receipt className="w-3.5 h-3.5 text-neutral-400 mt-px" />
                <span>
                  Voorwaarden, tekst &amp; bijlages
                  <span className="block text-[11px] text-neutral-400">Betalingscondities, inleiding, PDF-bijlages</span>
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
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
  return (
    <Button
      variant="ghost" size="sm" onClick={onOpslaan} disabled={status === 'bezig'}
      loading={status === 'bezig'}
      className={`font-medium ${kleur}`}
      title="Wijzigingen worden automatisch opgeslagen — klik om nu op te slaan"
    >
      {status === 'fout' ? <TriangleAlert className="w-3.5 h-3.5" />
        : status !== 'bezig' && (opgeslagenOp ? <Check className="w-3.5 h-3.5" /> : <CloudUpload className="w-3.5 h-3.5" />)}
      <span className="hidden xl:inline">
        {status === 'bezig' ? 'Opslaan…'
          : status === 'fout' ? 'Niet opgeslagen — opnieuw'
          : opgeslagenOp ? `Opgeslagen ${tijd(opgeslagenOp)}` : 'Opslaan'}
      </span>
    </Button>
  )
}

/** Sneltoetsen als naslag: op klik, niet bij hover, zodat hij niet open springt als je
 *  er met de muis langs gaat. */
function Sneltoetsen() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" title="Sneltoetsen">
          <Keyboard className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 z-[200]">
        <PopoverHeader>Sneltoetsen</PopoverHeader>
        <table className="w-full text-xs my-1">
          <tbody>
            {SNELTOETSEN.map(([toets, label]) => (
              <tr key={toets}>
                <td className="px-3.5 py-1 font-medium text-neutral-800 whitespace-nowrap">{toets}</td>
                <td className="px-3.5 py-1 text-neutral-500">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  )
}
