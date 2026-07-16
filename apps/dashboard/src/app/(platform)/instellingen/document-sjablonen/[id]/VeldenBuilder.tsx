'use client'

/**
 * Bouwer voor de invoervelden van een sjabloon. Elk veld wordt bij het opstellen
 * gevraagd en is in Word beschikbaar als {invoer.<sleutel>}.
 *
 * De sleutel wordt afgeleid uit het label (naarSleutel) maar blijft handmatig
 * aanpasbaar: hij staat in het Word-bestand en mag niet stilletjes veranderen als
 * iemand later het label bijwerkt.
 */

import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { VELD_TYPES, veldTypeLabels, naarSleutel, type DocumentVeld, type VeldType } from '@/lib/documenten/types'

export default function VeldenBuilder({
  velden,
  onChange,
}: {
  velden: DocumentVeld[]
  onChange: (v: DocumentVeld[]) => void
}) {
  const [open, setOpen] = useState<number | null>(null)

  function voegToe() {
    const nieuw: DocumentVeld = { sleutel: '', label: '', type: 'tekst', verplicht: false, standaard: '' }
    onChange([...velden, nieuw])
    setOpen(velden.length)
  }

  function update(i: number, patch: Partial<DocumentVeld>) {
    onChange(velden.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
  }

  function verwijder(i: number) {
    onChange(velden.filter((_, idx) => idx !== i))
    setOpen(null)
  }

  function verplaats(i: number, richting: -1 | 1) {
    const j = i + richting
    if (j < 0 || j >= velden.length) return
    const kopie = [...velden]
    ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
    onChange(kopie)
    setOpen(j)
  }

  return (
    <div className="space-y-1.5">
      {velden.length === 0 && (
        <p className="text-[11px] text-slate-400 italic">Nog geen invoervelden.</p>
      )}

      {velden.map((veld, i) => (
        <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50">
            <button onClick={() => setOpen(o => (o === i ? null : i))} className="flex-1 text-left min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">
                {veld.label || <span className="text-slate-400 italic">Naamloos veld</span>}
                {veld.verplicht && <span className="text-red-500"> *</span>}
              </div>
              <code className="text-[10px] text-slate-400 font-mono">
                {veld.sleutel ? `{invoer.${veld.sleutel}}` : 'geen sleutel'}
              </code>
            </button>
            <button onClick={() => verplaats(i, -1)} disabled={i === 0}
              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Omhoog">
              <ChevronUp className="w-3 h-3" />
            </button>
            <button onClick={() => verplaats(i, 1)} disabled={i === velden.length - 1}
              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Omlaag">
              <ChevronDown className="w-3 h-3" />
            </button>
            <button onClick={() => verwijder(i)} className="p-1 text-red-400 hover:text-red-600" title="Verwijderen">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {open === i && (
            <div className="p-2 space-y-1.5 bg-white">
              <input
                value={veld.label}
                onChange={e => {
                  const label = e.target.value
                  // Sleutel automatisch meelopen zolang hij nog niet handmatig is gezet.
                  const autoSleutel = !veld.sleutel || veld.sleutel === naarSleutel(veld.label)
                  update(i, autoSleutel ? { label, sleutel: naarSleutel(label) } : { label })
                }}
                placeholder="Label (bv. Omschrijving werkzaamheden)"
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
              <input
                value={veld.sleutel}
                onChange={e => update(i, { sleutel: naarSleutel(e.target.value) })}
                placeholder="sleutel"
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono"
              />
              <select
                value={veld.type}
                onChange={e => update(i, { type: e.target.value as VeldType })}
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              >
                {VELD_TYPES.map(t => <option key={t} value={t}>{veldTypeLabels[t]}</option>)}
              </select>
              {veld.type === 'keuze' && (
                <textarea
                  value={(veld.opties ?? []).join('\n')}
                  onChange={e => update(i, { opties: e.target.value.split('\n') })}
                  rows={3}
                  placeholder={'Eén optie per regel'}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                />
              )}
              <input
                value={veld.standaard ?? ''}
                onChange={e => update(i, { standaard: e.target.value })}
                placeholder="Standaardwaarde (optioneel)"
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
              <input
                value={veld.hint ?? ''}
                onChange={e => update(i, { hint: e.target.value })}
                placeholder="Hint voor de invuller (optioneel)"
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={!!veld.verplicht} onChange={e => update(i, { verplicht: e.target.checked })} />
                Verplicht
              </label>
            </div>
          )}
        </div>
      ))}

      <button onClick={voegToe}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-everts hover:text-everts">
        <Plus className="w-3 h-3" /> Invoerveld toevoegen
      </button>
    </div>
  )
}
