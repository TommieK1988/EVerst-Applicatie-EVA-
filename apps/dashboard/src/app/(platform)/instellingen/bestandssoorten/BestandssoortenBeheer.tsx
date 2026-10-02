'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button, FormField, Input } from '@/components/ui'
import type { BestandSoortDef } from '@/lib/dossiers/bestand-soort'
import {
  maakBestandSoort, ordenBestandSoorten, werkBestandSoortBij, zetBestandSoortActief, type SoortInvoer,
} from './actions'

const LEEG: SoortInvoer = { naam: '', trefwoorden: '', extensies: '' }

const naarInvoer = (s: BestandSoortDef): SoortInvoer => ({
  naam: s.naam,
  trefwoorden: s.trefwoorden.join(', '),
  extensies: s.extensies.join(', '),
})

/** Naam, trefwoorden en extensies; gedeeld door "nieuw" en "bewerken". */
function SoortVelden({ waarde, onChange, onEnter }: {
  waarde: SoortInvoer
  onChange: (v: SoortInvoer) => void
  onEnter: () => void
}) {
  const opToets = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onEnter() }
  return (
    <div className="grid flex-1 gap-3 md:grid-cols-[1fr_2fr_1fr]">
      <FormField label="Naam" upper>
        <Input inputSize="sm" value={waarde.naam} onKeyDown={opToets}
          onChange={e => onChange({ ...waarde, naam: e.target.value })} placeholder="bv. Tekening" />
      </FormField>
      <FormField label="Trefwoorden" upper>
        <Input inputSize="sm" value={waarde.trefwoorden} onKeyDown={opToets}
          onChange={e => onChange({ ...waarde, trefwoorden: e.target.value })} placeholder="tekening, plattegrond" />
      </FormField>
      <FormField label="Extensies" upper>
        <Input inputSize="sm" value={waarde.extensies} onKeyDown={opToets}
          onChange={e => onChange({ ...waarde, extensies: e.target.value })} placeholder="dwg, dxf" />
      </FormField>
    </div>
  )
}

export default function BestandssoortenBeheer({ initial }: { initial: BestandSoortDef[] }) {
  const router = useRouter()
  const [nieuw, setNieuw] = useState<SoortInvoer>(LEEG)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bewerk, setBewerk] = useState<SoortInvoer>(LEEG)
  const [bezig, setBezig] = useState(false)

  async function voerUit(actie: () => Promise<{ ok: true } | { ok: false; error: string }>, melding?: string) {
    setBezig(true)
    try {
      const res = await actie()
      if (!res.ok) { toast.error(res.error); return false }
      if (melding) toast.success(melding)
      router.refresh()
      return true
    } finally {
      setBezig(false)
    }
  }

  async function toevoegen() {
    if (!nieuw.naam.trim()) return
    if (await voerUit(() => maakBestandSoort(nieuw), 'Soort toegevoegd')) setNieuw(LEEG)
  }

  async function opslaan(id: string) {
    if (await voerUit(() => werkBestandSoortBij(id, bewerk), 'Opgeslagen')) setBewerkId(null)
  }

  function verplaats(index: number, richting: -1 | 1) {
    const ids = initial.map(s => s.id)
    const doel = index + richting
    if (doel < 0 || doel >= ids.length) return
    ;[ids[index], ids[doel]] = [ids[doel], ids[index]]
    void voerUit(() => ordenBestandSoorten(ids))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2 rounded-lg border border-dashed border-neutral-200 p-3">
        <SoortVelden waarde={nieuw} onChange={setNieuw} onEnter={toevoegen} />
        <Button onClick={toevoegen} disabled={bezig || !nieuw.naam.trim()}>Toevoegen</Button>
      </div>

      <div className="flex flex-col gap-2">
        {initial.length === 0 && <p className="text-[13px] text-neutral-500">Nog geen soorten.</p>}
        {initial.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 ${
              s.actief ? 'bg-white' : 'bg-neutral-50 opacity-60'
            }`}
          >
            <div className="flex flex-col">
              <button onClick={() => verplaats(i, -1)} disabled={bezig || i === 0} aria-label={`${s.naam} omhoog`}
                className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => verplaats(i, 1)} disabled={bezig || i === initial.length - 1} aria-label={`${s.naam} omlaag`}
                className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {bewerkId === s.id ? (
              <>
                <SoortVelden waarde={bewerk} onChange={setBewerk} onEnter={() => opslaan(s.id)} />
                <div className="flex gap-2 self-end">
                  <Button size="sm" onClick={() => opslaan(s.id)} disabled={bezig}>Opslaan</Button>
                  <Button size="sm" variant="secondary" onClick={() => setBewerkId(null)}>Annuleer</Button>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-900">
                    {s.naam}
                    {!s.actief && <span className="ml-2 text-[11px] font-normal text-neutral-500">uitgezet</span>}
                  </p>
                  <p className="mt-1 text-[11.5px] text-neutral-500">
                    {[
                      s.trefwoorden.length ? `Trefwoorden: ${s.trefwoorden.join(', ')}` : null,
                      s.extensies.length ? `Extensies: ${s.extensies.map(e => `.${e}`).join(', ')}` : null,
                    ].filter(Boolean).join(' · ') || 'Alleen handmatig te kiezen'}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setBewerkId(s.id); setBewerk(naarInvoer(s)) }}>
                  Bewerk
                </Button>
                <Button size="sm" variant="ghost" disabled={bezig}
                  onClick={() => voerUit(() => zetBestandSoortActief(s.id, !s.actief))}>
                  {s.actief ? 'Uitzetten' : 'Aanzetten'}
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
