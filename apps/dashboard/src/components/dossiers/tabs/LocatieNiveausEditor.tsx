'use client'

import { useEffect, useState } from 'react'
import { getLocatieNiveaus, setLocatieNiveaus } from '@/services/houtrotherstel/locatie-config'
import type { LocatieNiveau } from '@/lib/houtrotherstel/types'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'

/** Bewerkbaar niveau in dit scherm: opties als vrije tekst (één per regel). */
type NiveauEdit = { naam: string; optiesText: string }

const MAX_NIVEAUS = 3

/**
 * De projectleider bepaalt per dossier tot 3 locatieniveaus (naam + keuzes)
 * waaruit de vakman in de app kiest. Bijv. Gevelzijde → Voorgevel/Achtergevel,
 * Etage → 1e/2e/…, Huisnummer → 491/493.
 */
export default function LocatieNiveausEditor({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [niveaus, setNiveaus] = useState<NiveauEdit[] | null>(null)
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  useEffect(() => {
    getLocatieNiveaus(dossierId)
      .then(n => setNiveaus(n.map(x => ({ naam: x.naam, optiesText: x.opties.join('\n') }))))
      .catch(() => setNiveaus([]))
  }, [dossierId])

  function wijzig(i: number, patch: Partial<NiveauEdit>) {
    setNiveaus(prev => prev!.map((n, idx) => (idx === i ? { ...n, ...patch } : n)))
    setMelding(null)
  }
  function verwijder(i: number) {
    setNiveaus(prev => prev!.filter((_, idx) => idx !== i)); setMelding(null)
  }
  function toevoegen() {
    setNiveaus(prev => [...(prev ?? []), { naam: '', optiesText: '' }]); setMelding(null)
  }

  async function opslaan() {
    setBezig(true); setMelding(null)
    try {
      const payload: LocatieNiveau[] = (niveaus ?? [])
        .map(n => ({
          naam: n.naam.trim(),
          opties: n.optiesText.split('\n').map(s => s.trim()).filter(Boolean),
        }))
        .filter(n => n.naam.length > 0)
      const res = await setLocatieNiveaus(dossierId, payload)
      setMelding(res.ok ? 'Opgeslagen' : (res.error || 'Opslaan mislukt'))
    } catch (e) {
      setMelding(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  const aantal = niveaus?.length ?? 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-slate-800">Locatie-instellingen</div>
          <div className="text-xs text-slate-500">
            {aantal > 0
              ? `${aantal} niveau${aantal !== 1 ? "'s" : ''}: ${niveaus!.map(n => n.naam || '—').join(' · ')}`
              : 'Nog geen niveaus ingesteld — de vakman krijgt één vrij locatieveld.'}
          </div>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="mb-3 text-xs text-slate-500">
            Stel tot 3 niveaus in waaruit de vakman de locatie kiest. Zet de keuzes onder elkaar,
            één per regel (bijv. Voorgevel / Achtergevel).
          </p>

          {niveaus === null ? (
            <div className="text-sm text-slate-400">Laden…</div>
          ) : (
            <div className="flex flex-col gap-4">
              {niveaus.map((n, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={n.naam}
                      disabled={readOnly}
                      onChange={e => wijzig(i, { naam: e.target.value })}
                      placeholder={`Naam niveau ${i + 1} (bijv. Gevelzijde)`}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-everts focus:outline-none focus:ring-2 focus:ring-everts/20"
                    />
                    {!readOnly && (
                      <button type="button" onClick={() => verwijder(i)}
                        className="rounded-md border border-slate-200 px-2 py-2 text-red-600 hover:bg-red-50" aria-label="Niveau verwijderen">
                        ×
                      </button>
                    )}
                  </div>
                  <textarea
                    value={n.optiesText}
                    disabled={readOnly}
                    onChange={e => wijzig(i, { optiesText: e.target.value })}
                    placeholder={'Keuzes, één per regel\nVoorgevel\nAchtergevel'}
                    rows={3}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-everts focus:outline-none focus:ring-2 focus:ring-everts/20"
                  />
                </div>
              ))}

              {!readOnly && (
                <div className="flex items-center gap-3">
                  {niveaus.length < MAX_NIVEAUS && (
                    <button type="button" onClick={toevoegen}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      + Niveau toevoegen
                    </button>
                  )}
                  <button type="button" onClick={opslaan} disabled={bezig}
                    className="rounded-lg bg-everts px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {bezig ? 'Opslaan…' : 'Opslaan'}
                  </button>
                  {melding && <span className="text-sm text-slate-500">{melding}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
