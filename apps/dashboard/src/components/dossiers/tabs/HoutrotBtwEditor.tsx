'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  laadDossierBtw, laadRelatieBtw, zetDossierBtw, zetRelatieBtw,
  type HoutrotBtwScherm, type WerkzaamheidBtw,
} from '@/services/houtrotherstel/btw-config'
import { tariefKort } from '@/lib/stamdata/btw'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'

/**
 * Btw-tarief per houtrot-werkzaamheid, instelbaar op twee niveaus.
 *
 * De standaard staat in de eenheidsprijs (de calculatiebibliotheek). Hier leg je
 * daar afwijkingen overheen: bij een **opdrachtgever** gelden ze voor al zijn
 * dossiers, bij een **dossier** alleen daar — en het dossier wint. Wat er nu geldt
 * en waar het vandaan komt staat per regel; "Standaard" haalt de afwijking weg.
 *
 * Dezelfde component voor beide niveaus, want het scherm en de regels zijn gelijk;
 * alleen de laad- en bewaaractie verschillen.
 */
export default function HoutrotBtwEditor({
  dossierId, relatieId,
}: { dossierId?: string; relatieId?: string }) {
  const readOnlyDossier = useDossierReadOnly()
  const readOnly = !!dossierId && readOnlyDossier

  const [scherm, setScherm] = useState<HoutrotBtwScherm | null>(null)
  const [open, setOpen] = useState(false)
  const [alles, setAlles] = useState(false)
  const [bezigOp, setBezigOp] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)

  const laad = useCallback(() => {
    const p = dossierId ? laadDossierBtw(dossierId) : relatieId ? laadRelatieBtw(relatieId) : null
    if (!p) return
    p.then(setScherm).catch(e => setMelding(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [dossierId, relatieId])

  useEffect(() => { laad() }, [laad])

  const werkzaamheden = scherm?.werkzaamheden ?? []
  const afwijkend = werkzaamheden.filter(w => w.herkomst === 'dossier' || w.herkomst === 'opdrachtgever')
  const gebruikt = werkzaamheden.filter(w => w.gebruikt)
  // In een dossier standaard alleen wat er daadwerkelijk geregistreerd is; anders
  // scrol je door 100 werkzaamheden op zoek naar de drie die je nodig hebt.
  const heeftGebruiktFilter = !!dossierId && gebruikt.length > 0
  const zichtbaar = heeftGebruiktFilter && !alles
    ? werkzaamheden.filter(w => w.gebruikt || w.herkomst === 'dossier')
    : werkzaamheden

  async function kies(w: WerkzaamheidBtw, tariefId: string | null) {
    setBezigOp(w.recept_id); setMelding(null)
    try {
      const res = dossierId
        ? await zetDossierBtw(dossierId, w.recept_id, tariefId)
        : await zetRelatieBtw(relatieId!, w.recept_id, tariefId)
      if (!res.ok) { setMelding(res.error || 'Opslaan mislukt'); return }
      laad()
    } catch (e) {
      setMelding(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezigOp(null)
    }
  }

  const samenvatting = scherm === null
    ? 'Laden…'
    : afwijkend.length === 0
      ? 'Alles volgens de eenheidsprijzen'
      : `${afwijkend.length} afwijkend${afwijkend.length === 1 ? '' : 'e'} tarie${afwijkend.length === 1 ? 'f' : 'ven'}`

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <div>
          <div className="text-sm font-semibold text-slate-800">Btw-tarieven</div>
          <div className="text-xs text-slate-500">
            {samenvatting}
            {scherm?.opdrachtgever && ` · opdrachtgever: ${scherm.opdrachtgever.naam}`}
          </div>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {scherm === null ? (
            <div className="text-sm text-slate-400">Laden…</div>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                Het btw-percentage van een werkzaamheid komt uit de <strong>eenheidsprijs</strong>.
                {dossierId
                  ? ' Wijk je hier af, dan geldt dat alleen voor dit dossier en gaat het vóór de instelling bij de opdrachtgever.'
                  : ' Wijk je hier af, dan geldt dat voor alle dossiers van deze opdrachtgever — tenzij het dossier zelf iets anders zegt.'}
                {' '}Het tarief bepaalt de btw-opstelling onderaan de houtrot-rapportage.
              </p>

              {heeftGebruiktFilter && (
                <label className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={alles} onChange={e => setAlles(e.target.checked)} />
                  Ook werkzaamheden tonen die in dit dossier niet voorkomen ({werkzaamheden.length} totaal)
                </label>
              )}

              {melding && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {melding}
                </div>
              )}

              {zichtbaar.length === 0 ? (
                <div className="py-4 text-center text-sm text-slate-400">
                  Nog geen werkzaamheden geregistreerd in dit dossier.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="px-3 py-2 text-left">Werkzaamheid</th>
                        <th className="px-3 py-2 text-left">Btw-tarief</th>
                        <th className="px-3 py-2 text-left">Nu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {zichtbaar.map(w => {
                        const eigen = dossierId ? w.herkomst === 'dossier' : w.herkomst === 'opdrachtgever'
                        return (
                          <tr key={w.recept_id} className={bezigOp === w.recept_id ? 'opacity-50' : ''}>
                            <td className="px-3 py-2">
                              <div className="text-slate-700">{w.naam}</div>
                              {w.code && <div className="text-[11px] text-slate-400">{w.code}</div>}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={eigen ? (w.tarief_id ?? '') : ''}
                                disabled={readOnly || bezigOp === w.recept_id}
                                onChange={e => kies(w, e.target.value || null)}
                                className="w-full max-w-[15rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-everts focus:outline-none focus:ring-2 focus:ring-everts/20"
                              >
                                <option value="">Standaard ({w.standaard_pct}%)</option>
                                {scherm.tarieven.map(t => (
                                  <option key={t.id} value={t.id}>{t.label} — {tariefKort(t)}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-medium text-slate-700">{w.pct}%</span>
                              <span className="ml-2 text-[11px] text-slate-400">{HERKOMST[w.herkomst]}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const HERKOMST: Record<WerkzaamheidBtw['herkomst'], string> = {
  dossier: 'dit dossier',
  opdrachtgever: 'opdrachtgever',
  eenheidsprijs: 'eenheidsprijs',
  terugval: 'terugval',
}
