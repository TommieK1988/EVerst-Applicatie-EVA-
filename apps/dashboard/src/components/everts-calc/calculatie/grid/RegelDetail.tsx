'use client'

import { Trash2, MessageSquare, X, ImagePlus } from 'lucide-react'
import { BulletTextarea } from '@/components/ui/bullet-textarea'
import type { Calculatieregel, Componentregel, EenheidConfig } from '@/lib/everts-calc/types'
import type { ColId } from './kolommen'
import { ComponentRegelRij } from './ComponentRegelRij'
import { NieuweNormInvoer } from './NieuweNormInvoer'

/**
 * Het uitklapdeel onder een calculatieregel: de werkomschrijving met afbeeldingen, en
 * de normen (componentregels) met de lege normregel eronder. Staat los van de
 * regel zelf, zodat die rij leesbaar blijft.
 */

/**
 * Aantal kolommen vóór de omschrijving. De uitklaprijen (werkomschrijving, opmerking,
 * nieuwe norm, behandeling) beginnen daar, zodat hun tekst onder de regelnaam staat.
 */
export function voorOmschrijving(colOrder: ColId[]): number {
  return Math.max(0, colOrder.indexOf('omschrijving'))
}

export function WerkomschrijvingRij({ regel, colOrder, onWijzig, focus = false, onSluit }: {
  regel: Calculatieregel
  colOrder: ColId[]
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  /** Alleen bij zelf openen: met Tonen › alles zou elke regel om de focus vechten. */
  focus?: boolean
  onSluit?: () => void
}) {
  return (
      <tr className={`border-b border-slate-100 ${regel.gemarkeerd ? 'bg-orange-50/60' : 'bg-slate-50/30'}`}>
        {voorOmschrijving(colOrder) > 0 && <td colSpan={voorOmschrijving(colOrder)} />}
        <td colSpan={colOrder.length - voorOmschrijving(colOrder)} className="pb-2 pt-1.5 pr-3">
         <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 max-w-4xl rounded-[10px] border border-neutral-200 bg-white px-2 pb-1.5 pt-1">
            <BulletTextarea
              autoFocus={focus}
              onKeyDown={e => {
                if (e.key === 'Escape' || (e.key === 'Enter' && e.shiftKey && (e.ctrlKey || e.metaKey))) {
                  e.preventDefault(); onSluit?.()
                }
              }}
              value={regel.werkomschrijving ?? ''}
              onChange={tekst => onWijzig(regel.id, { werkomschrijving: tekst })}
              placeholder="Uitgebreide werkomschrijving voor de offerte… (Esc of Ctrl+Shift+Enter om te sluiten)"
              label={<span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Werkomschrijving</span>}
              streepjeWordtBullet
              minRows={2}
              maxRows={30}
              toolbarClassName="-mt-0.5"
              className="text-xs px-1 py-1 border-0 rounded bg-white focus:outline-none text-neutral-700 placeholder-neutral-300 leading-relaxed"
            />
          </div>
          {/* Afbeeldingen, rechts naast de tekst */}
          <div className="flex flex-wrap items-start gap-2 pt-1 max-w-[260px]">
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
         </div>
        </td>
      </tr>
  )
}

/**
 * Interne opmerking: een eigen rij direct onder de regel, uitgelijnd op de omschrijving.
 * Hoort bij de markering (⚑): je markeert een regel en schrijft hier wát er is.
 */
export function OpmerkingRij({ regel, colOrder, onWijzig, onSluit }: {
  regel: Calculatieregel
  colOrder: ColId[]
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onSluit: () => void
}) {
  const voor = voorOmschrijving(colOrder)
  return (
    <tr className="border-b border-warning-100 bg-warning-50/60">
      {voor > 0 && <td colSpan={voor} />}
      <td colSpan={colOrder.length - voor} className="py-1.5 pr-3">
        <div className="flex items-start gap-2 border-l-2 border-warning-300 pl-2">
          <MessageSquare className="w-3.5 h-3.5 text-warning-500 mt-1.5 flex-shrink-0" />
          <textarea
            autoFocus={!regel.opmerking}
            value={regel.opmerking ?? ''}
            placeholder="Interne opmerking (niet zichtbaar voor de opdrachtgever)…"
            rows={2}
            className="flex-1 max-w-3xl text-xs px-2 py-1.5 border border-warning-300/60 rounded bg-white
              focus:outline-none focus:border-warning-500 focus:ring-1 focus:ring-warning-100
              resize-y text-neutral-700 placeholder-neutral-400"
            onChange={e => onWijzig(regel.id, { opmerking: e.target.value || undefined })}
            onKeyDown={e => { if (e.key === 'Escape') onSluit() }}
          />
          <button
            onClick={() => {
              onWijzig(regel.id, { gemarkeerd: !regel.gemarkeerd })
              if (regel.gemarkeerd && !regel.opmerking) onSluit()
            }}
            className="mt-0.5 whitespace-nowrap rounded border border-warning-300/60 bg-white px-2 py-1 text-[11px] text-warning-700 hover:border-warning-500"
            title={regel.gemarkeerd ? 'Markering weghalen; de opmerking blijft staan' : 'Regel markeren'}
          >
            {regel.gemarkeerd ? 'Markering opheffen' : 'Markeren'}
          </button>
          <button onClick={onSluit} className="p-1 text-neutral-400 hover:text-neutral-700 rounded mt-0.5" title="Inklappen (Esc)">
            <X className="w-3 h-3" />
          </button>
          {regel.opmerking && (
            <button
              onClick={() => { onWijzig(regel.id, { opmerking: undefined }); onSluit() }}
              className="p-1 text-neutral-300 hover:text-red-500 rounded transition-colors mt-0.5"
              title="Opmerking verwijderen"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export function RegelComponentenBlok({
  regel, regelComps, colOrder, indent, opslag, uurtarieven, eenheden, tijdfactor = 1,
  onWijzigComponentExtra, onVerwijderComponent, onVoegComponentToe,
}: {
  regel: Calculatieregel
  regelComps: Componentregel[]
  colOrder: ColId[]
  indent: number
  opslag: number
  uurtarieven: { label: string; tarief: number }[]
  eenheden: EenheidConfig[]
  tijdfactor?: number
  onWijzigComponentExtra: (compId: string, patch: Partial<Componentregel>) => void
  onVerwijderComponent: (compId: string) => void
  onVoegComponentToe: (regelId: string, type: Componentregel['type'], omschrijving?: string, extra?: Partial<Componentregel>) => void
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
            tijdfactor={tijdfactor}
            onWijzig={patch => onWijzigComponentExtra(comp.id, patch)}
            onVerwijder={() => onVerwijderComponent(comp.id)}
          />
        ))}
        <tr className="border-b border-slate-100 bg-slate-50/30">
          {voorOmschrijving(colOrder) > 0 && <td colSpan={voorOmschrijving(colOrder)} />}
          <td colSpan={colOrder.length - voorOmschrijving(colOrder)} className="py-1 pr-3" style={{ paddingLeft: '16px' }}>
            <NieuweNormInvoer onVoeg={(type, oms, extra) => onVoegComponentToe(regel.id, type, oms || undefined, extra)} />
          </td>
        </tr>
      </>
  )
}
