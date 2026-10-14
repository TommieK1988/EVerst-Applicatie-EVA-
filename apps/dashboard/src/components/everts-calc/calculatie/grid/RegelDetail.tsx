'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2, MessageSquare, X, PaintBucket, ImagePlus } from 'lucide-react'
import { BulletTextarea } from '@/components/ui/bullet-textarea'
import type { Calculatieregel, Componentregel, EenheidConfig } from '@/lib/everts-calc/types'
import SchilderbehandelingZoekveld from '@/components/everts-calc/calculatie/SchilderbehandelingZoekveld'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import type { ColId } from './kolommen'
import { ComponentRegelRij } from './ComponentRegelRij'

/**
 * Het uitklapdeel onder een calculatieregel: de werkomschrijving met afbeeldingen, en
 * de normen (componentregels) met opmerking en schilderbehandeling. Staat los van de
 * regel zelf, zodat die rij leesbaar blijft.
 */

export function WerkomschrijvingRij({ regel, colOrder, indent, onWijzig }: {
  regel: Calculatieregel
  colOrder: ColId[]
  indent: number
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
}) {
  return (
      <tr className={`border-b border-slate-100 ${regel.gemarkeerd ? 'bg-orange-50/60' : 'bg-slate-50/30'}`}>
        <td colSpan={colOrder.length} className="pb-2 pt-1 space-y-2" style={{ paddingLeft: `${indent + 8}px`, paddingRight: '12px' }}>
          <BulletTextarea
            autoFocus
            value={regel.werkomschrijving ?? ''}
            onChange={tekst => onWijzig(regel.id, { werkomschrijving: tekst })}
            placeholder="Uitgebreide werkomschrijving..."
            minRows={3}
            maxRows={30}
            toolbarClassName="-mt-0.5"
            className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-white
              focus:outline-none focus:border-everts/40 focus:ring-1 focus:ring-everts/20
              text-slate-600 placeholder-slate-300 leading-relaxed"
          />
          {/* Afbeeldingen */}
          <div className="flex flex-wrap items-center gap-2">
            {(regel.werkomschrijving_afbeeldingen ?? []).map((src, idx) => (
              <div key={idx} className="relative group/img flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Afbeelding ${idx + 1}`}
                  className="w-24 h-20 object-contain border border-slate-200 rounded bg-white"
                />
                <button
                  onClick={() => {
                    const imgs = [...(regel.werkomschrijving_afbeeldingen ?? [])]
                    imgs.splice(idx, 1)
                    onWijzig(regel.id, { werkomschrijving_afbeeldingen: imgs.length ? imgs : undefined })
                  }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full
                    flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                  title="Afbeelding verwijderen"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {/* Upload knop */}
            <label
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-everts
                border border-dashed border-slate-300 hover:border-everts rounded cursor-pointer transition-colors"
              title="Afbeelding toevoegen"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => {
                    const dataUrl = ev.target?.result as string
                    const huidige = regel.werkomschrijving_afbeeldingen ?? []
                    onWijzig(regel.id, { werkomschrijving_afbeeldingen: [...huidige, dataUrl] })
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''  // reset zodat hetzelfde bestand opnieuw gekozen kan worden
                }}
              />
            </label>
          </div>
        </td>
      </tr>
  )
}

export function RegelComponentenBlok({
  regel, regelComps, colOrder, indent, opslag, uurtarieven, eenheden, behandelingen, heeftBehandeling,
  opmerkingOpen, setOpmerkingOpen, schilderbehandelingOpen, setSchilderbehandelingOpen,
  onWijzig, onWijzigComponentExtra, onVerwijderComponent, onVoegComponentToe,
}: {
  regel: Calculatieregel
  regelComps: Componentregel[]
  colOrder: ColId[]
  indent: number
  opslag: number
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  behandelingen: SchilderBehandeling[]
  heeftBehandeling: boolean
  opmerkingOpen: boolean
  setOpmerkingOpen: Dispatch<SetStateAction<boolean>>
  schilderbehandelingOpen: boolean
  setSchilderbehandelingOpen: Dispatch<SetStateAction<boolean>>
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVerwijderComponent: (compId: string) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type']) => void
}) {
  return (
      <>
        {regelComps.map(comp => (
          <ComponentRegelRij
            key={comp.id}
            comp={comp}
            uurtarieven={uurtarieven}
            eenheden={eenheden}
            colOrder={colOrder}
            indent={indent}
            regelOmschrijving={regel.omschrijving}
            regelOpslag={opslag}
            onWijzig={patch => onWijzigComponentExtra(comp.id, patch)}
            onVerwijder={() => onVerwijderComponent(comp.id)}
          />
        ))}
        <tr className="border-b border-slate-100 bg-slate-50/30">
          <td colSpan={colOrder.length} className="py-1" style={{ paddingLeft: `${indent + 20}px` }}>
            <div className="flex gap-2">
              <button
                onClick={() => onVoegComponentToe(regel.id, 'arbeid')}
                className="text-[11px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" /> Arbeid
              </button>
              <button
                onClick={() => onVoegComponentToe(regel.id, 'materieel')}
                className="text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" /> Materiaal
              </button>
              <button
                onClick={() => onVoegComponentToe(regel.id, 'onderaanneming')}
                className="text-[11px] text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" /> OA
              </button>
              <span className="text-slate-200 mx-1">|</span>
              <button
                onClick={() => setOpmerkingOpen(v => !v)}
                className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors ${
                  opmerkingOpen || regel.opmerking
                    ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
                title="Interne opmerking"
              >
                <MessageSquare className="w-3 h-3" /> Opmerking
              </button>
              <button
                onClick={() => setSchilderbehandelingOpen(v => !v)}
                className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-0.5 transition-colors ${
                  schilderbehandelingOpen || heeftBehandeling
                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
                title="Schilderbehandeling (zichtbaar op behandelingsblad)"
              >
                <PaintBucket className="w-3 h-3" /> Behandeling
              </button>
            </div>
          </td>
        </tr>
        {opmerkingOpen && (
          <tr className="border-b border-amber-100 bg-amber-50/30">
            <td colSpan={colOrder.length} className="px-3 py-2" style={{ paddingLeft: `${indent + 20}px` }}>
              <div className="flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-1.5 flex-shrink-0" />
                <textarea
                  value={regel.opmerking ?? ''}
                  placeholder="Interne opmerking (niet zichtbaar voor opdrachtgever)..."
                  rows={2}
                  className="flex-1 text-xs px-2 py-1.5 border border-amber-200 rounded bg-white
                    focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100
                    resize-none text-slate-700 placeholder-slate-300"
                  onChange={e => onWijzig(regel.id, { opmerking: e.target.value || undefined })}
                />
                {regel.opmerking && (
                  <button
                    onClick={() => { onWijzig(regel.id, { opmerking: undefined }); setOpmerkingOpen(false) }}
                    className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors mt-0.5"
                    title="Opmerking verwijderen"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </td>
          </tr>
        )}
        {schilderbehandelingOpen && (
          <tr className="border-b border-blue-100 bg-blue-50/30">
            <td colSpan={colOrder.length} className="px-3 py-2" style={{ paddingLeft: `${indent + 20}px` }}>
              <SchilderbehandelingZoekveld
                behandelingId={regel.schilderbehandeling_id}
                behandelingTekst={regel.schilderbehandeling}
                bibliotheek={behandelingen}
                // Alleen de koppeling vastleggen — de tekst wordt pas bevroren bij het
                // opstellen van de offerte, zodat de calculatie de bibliotheek volgt.
                onSelecteer={b => onWijzig(regel.id, {
                  schilderbehandeling_id: b.id,
                  schilderbehandeling: undefined,
                })}
                onWis={() => {
                  onWijzig(regel.id, { schilderbehandeling: undefined, schilderbehandeling_id: undefined })
                  setSchilderbehandelingOpen(false)
                }}
              />
            </td>
          </tr>
        )}
      </>
  )
}
