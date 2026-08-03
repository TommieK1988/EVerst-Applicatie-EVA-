'use client'

/**
 * Objectkoppeling op het dossier — één rij in het werkadresblok.
 *
 * Haalt zijn eigen gegevens op zodat de dossierpagina er niets voor hoeft door te geven;
 * dat houdt de wijziging in `InformatieTab.tsx` tot één regel beperkt.
 */

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { VastgoedObject } from '@everts/database'
import { Button, Badge, Input, Spinner } from '@/components/ui'
import { objectAdresRegel } from '@/lib/objecten/adres'
import type { OvernemenKeuze } from '@/lib/objecten/validations'
import { zoekObjecten } from '@/lib/objecten/data'
import {
  getDossierObject, koppelDossierAanObject, ontkoppelDossierVanObject, neemObjectadresOver,
} from '@/app/(platform)/objecten/actions'

type GekoppeldObject = { id: string; naam: string; objectnummer: string; adres: string }

const OVERNEEM_OPTIES: { key: keyof OvernemenKeuze; label: string; uitleg: string }[] = [
  { key: 'werkadres',         label: 'Werkadres',            uitleg: 'straat, huisnummer, postcode en plaats' },
  { key: 'opdrachtgever',     label: 'Opdrachtgever',        uitleg: 'inclusief de vaste contactpersoon' },
  { key: 'vveCode',           label: 'VvE-code',             uitleg: '' },
  { key: 'contactTerPlaatse', label: 'Contact ter plaatse',  uitleg: 'naam, telefoon en e-mail' },
]

export default function ObjectKoppeling({ dossierId, readOnly }: { dossierId: string; readOnly: boolean }) {
  const router = useRouter()
  const [laden, setLaden] = useState(true)
  const [object, setObject] = useState<GekoppeldObject | null>(null)
  const [wijktAf, setWijktAf] = useState(false)
  const [kiezen, setKiezen] = useState(false)
  const [geenToegang, setGeenToegang] = useState(false)
  const [bezig, start] = useTransition()

  async function herlaad() {
    try {
      const res = await getDossierObject(dossierId)
      setObject(res.object)
      setWijktAf(res.wijktAf)
      setGeenToegang(false)
    } catch {
      // Geen leesrecht op objectenbeheer. Het blok verdwijnt dan helemaal — een
      // koppelknop tonen die bij elke klik afketst is erger dan niets tonen.
      setGeenToegang(true)
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => { void herlaad() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dossierId])

  function doe(actie: () => Promise<{ ok: true } | { ok: false; fout: string }>, gelukt: string) {
    start(async () => {
      const res = await actie()
      if (!res.ok) { toast.error(res.fout); return }
      toast.success(gelukt)
      await herlaad()
      router.refresh()
    })
  }

  if (geenToegang) return null
  if (laden) {
    return <div className="flex items-center gap-2 text-[13px] text-[var(--fg-muted)]"><Spinner size="sm" /> Object laden…</div>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">Object</span>

      {object ? (
        <>
          <Link href={`/objecten/${object.id}`} className="text-[13px] font-semibold text-[var(--fg)] no-underline hover:underline">
            {object.naam}
          </Link>
          <Badge tone="neutral">{object.objectnummer}</Badge>
          {object.adres && <span className="text-[12px] text-[var(--fg-muted)]">{object.adres}</span>}

          {wijktAf && (
            <>
              <Badge tone="warning">Werkadres wijkt af</Badge>
              {!readOnly && (
                <button
                  type="button" disabled={bezig}
                  onClick={() => doe(() => neemObjectadresOver(dossierId, object.id), 'Objectadres overgenomen')}
                  className="border-0 bg-transparent p-0 text-[12px] text-[hsl(var(--primary))] underline cursor-pointer"
                >
                  Neem objectadres over
                </button>
              )}
            </>
          )}

          {!readOnly && (
            <button
              type="button" disabled={bezig}
              onClick={() => doe(() => ontkoppelDossierVanObject(dossierId), 'Object ontkoppeld')}
              className="border-0 bg-transparent p-0 text-[12px] text-[var(--fg-muted)] underline cursor-pointer"
            >
              Ontkoppelen
            </button>
          )}
        </>
      ) : readOnly ? (
        <span className="text-[13px] text-[var(--fg-muted)]">Niet gekoppeld</span>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setKiezen(true)}>Koppelen aan object…</Button>
      )}

      {kiezen && (
        <ObjectKiezerDialoog
          onSluit={() => setKiezen(false)}
          onKies={(objectId, overnemen) => {
            setKiezen(false)
            doe(() => koppelDossierAanObject(dossierId, objectId, overnemen), 'Dossier gekoppeld aan object')
          }}
        />
      )}
    </div>
  )
}

/** Zoekdialoog + keuze welke velden van het object worden overgenomen. */
function ObjectKiezerDialoog({
  onSluit, onKies,
}: {
  onSluit: () => void
  onKies: (objectId: string, overnemen: OvernemenKeuze) => void
}) {
  const [term, setTerm] = useState('')
  const [resultaten, setResultaten] = useState<VastgoedObject[]>([])
  const [zoekt, setZoekt] = useState(false)
  const [gekozen, setGekozen] = useState<VastgoedObject | null>(null)
  const [overnemen, setOvernemen] = useState<OvernemenKeuze>({
    werkadres: true, opdrachtgever: true, vveCode: true, contactTerPlaatse: true,
  })

  // Debounce: bij elke toetsaanslag zoeken zou een server-action per letter afvuren.
  useEffect(() => {
    let afgebroken = false
    setZoekt(true)
    const t = setTimeout(async () => {
      try {
        const res = await zoekObjecten(term)
        if (!afgebroken) setResultaten(res)
      } finally {
        if (!afgebroken) setZoekt(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(t) }
  }, [term])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onClick={onSluit}
    >
      <div
        className="w-full max-w-[560px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="m-0 mb-1 text-[15px] font-semibold">Koppelen aan object</h3>
        <p className="m-0 mb-3 text-[12px] text-[var(--fg-muted)]">
          Zoek op naam, objectnummer, VvE-code, straat of postcode.
        </p>

        <Input
          autoFocus value={term} onChange={e => setTerm(e.target.value)}
          placeholder="bv. Complex 1013, HW1013 of 2518 PB"
        />

        <div className="mt-3 max-h-[240px] overflow-y-auto rounded-lg border border-[var(--border)]">
          {zoekt && <div className="p-3 text-[13px] text-[var(--fg-muted)]">Zoeken…</div>}
          {!zoekt && resultaten.length === 0 && (
            <div className="p-3 text-[13px] text-[var(--fg-muted)]">Geen objecten gevonden.</div>
          )}
          {!zoekt && resultaten.map(o => (
            <button
              key={o.id} type="button" onClick={() => setGekozen(o)}
              className={`flex w-full flex-col items-start gap-0.5 border-0 border-b border-[var(--border)] p-2.5 text-left cursor-pointer last:border-b-0 ${
                gekozen?.id === o.id ? 'bg-[var(--bg-subtle)]' : 'bg-transparent'
              }`}
            >
              <span className="text-[13px] font-semibold">{o.naam}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">
                {o.objectnummer}{objectAdresRegel(o) ? ` · ${objectAdresRegel(o)}` : ''}
              </span>
            </button>
          ))}
        </div>

        {gekozen && (
          <div className="mt-3 rounded-lg border border-[var(--border)] p-3">
            <div className="mb-2 text-[12px] font-semibold text-[var(--fg-muted)]">Overnemen van het object</div>
            {OVERNEEM_OPTIES.map(o => (
              <label key={o.key} className="flex items-start gap-2 py-1 text-[13px] cursor-pointer">
                <input
                  type="checkbox" checked={overnemen[o.key]} className="mt-0.5"
                  onChange={e => setOvernemen(v => ({ ...v, [o.key]: e.target.checked }))}
                />
                <span>
                  {o.label}
                  {o.uitleg && <span className="text-[var(--fg-muted)]"> — {o.uitleg}</span>}
                </span>
              </label>
            ))}
            <p className="m-0 mt-2 text-[11px] text-[var(--fg-muted)]">
              Aangevinkte velden overschrijven wat er nu op het dossier staat.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onSluit}>Annuleren</Button>
          <Button variant="primary" disabled={!gekozen} onClick={() => gekozen && onKies(gekozen.id, overnemen)}>
            Koppelen
          </Button>
        </div>
      </div>
    </div>
  )
}
