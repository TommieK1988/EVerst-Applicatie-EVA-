'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PortaalChatBericht } from '@/lib/portaal/chat'
import type { PortaalBerichtBijlage } from '@everts/database/platform-types'
import { datumTijd } from '@/lib/portaal/format'
import {
  portaalPlaatsBericht, portaalUploadBijlage, portaalMarkeerBerichtenGelezen,
} from '../../../actions'

const MAX_BIJLAGEN = 5

/**
 * De chat van de klant. Bewust simpel: één draad per project, tekst en foto's,
 * geen bewerken of verwijderen. Wat verstuurd is, is verstuurd — dat past bij
 * een gesprek dat later teruggelezen moet kunnen worden.
 *
 * Bijlagen gaan in een eigen stap naar de server, vóór het bericht. Zo blijft
 * het versturen van de tekst snel, en zie je meteen of een foto te groot is.
 */
export function Chat({
  dossierId,
  berichten,
  compact = false,
}: {
  dossierId: string
  berichten: PortaalChatBericht[]
  /**
   * Zijkolom-variant: lagere draad en geen eigen omlijsting, want hij zit dan al
   * in een Kaart. Op de eigen pagina blijft het de volle hoogte.
   */
  compact?: boolean
}) {
  const router = useRouter()
  const [tekst, setTekst] = useState('')
  const [bijlagen, setBijlagen] = useState<PortaalBerichtBijlage[]>([])
  const [bezig, setBezig] = useState(false)
  const [uploadt, setUploadt] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const bestandRef = useRef<HTMLInputElement>(null)
  const onderkant = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onderkant.current?.scrollIntoView({ block: 'end' })
    void portaalMarkeerBerichtenGelezen(dossierId)
  }, [dossierId, berichten.length])

  async function kiesBestand(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0]
    e.target.value = ''
    if (!bestand) return
    if (bijlagen.length >= MAX_BIJLAGEN) { setFout(`Maximaal ${MAX_BIJLAGEN} bijlagen per bericht.`); return }

    setUploadt(true); setFout(null)
    const fd = new FormData()
    fd.set('bestand', bestand)
    const r = await portaalUploadBijlage(dossierId, fd)
    setUploadt(false)
    if (!r.ok) { setFout(r.error); return }
    setBijlagen(b => [...b, r.bijlage])
  }

  async function versturen(e: React.FormEvent) {
    e.preventDefault()
    if (bezig || uploadt) return
    if (!tekst.trim() && bijlagen.length === 0) return

    setBezig(true); setFout(null)
    const r = await portaalPlaatsBericht(dossierId, tekst, bijlagen)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }

    setTekst(''); setBijlagen([])
    router.refresh()
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-neutral-200 bg-white'}>
      <div className={`space-y-3 overflow-y-auto ${compact ? 'max-h-[34vh]' : 'max-h-[55vh] px-4 py-4'}`}>
        {berichten.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-neutral-500">
            Nog geen berichten. Stel hier gerust uw vraag — het projectteam krijgt er een melding van.
          </p>
        ) : (
          berichten.map(b => (
            <div key={b.id} className={b.vanKlant ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  b.vanKlant
                    ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2.5 text-white'
                    : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-neutral-100 px-3.5 py-2.5'
                }
              >
                {!b.vanKlant && (
                  <p className="mb-0.5 text-[11px] font-bold text-neutral-500">{b.auteur}</p>
                )}
                {b.bericht && <p className="whitespace-pre-wrap text-sm">{b.bericht}</p>}
                {b.bijlagen.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {b.bijlagen.map((bl, i) => (
                      <a
                        key={i}
                        href={bl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          b.vanKlant
                            ? 'block truncate text-xs font-medium text-white/90 underline'
                            : 'block truncate text-xs font-medium text-brand-600 underline'
                        }
                      >
                        {bl.naam}
                      </a>
                    ))}
                  </div>
                )}
                <p className={b.vanKlant ? 'mt-1 text-[10px] text-white/70' : 'mt-1 text-[10px] text-neutral-400'}>
                  {datumTijd(b.op)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={onderkant} />
      </div>

      <form onSubmit={versturen} className={compact ? 'mt-3 border-t border-neutral-100 pt-3' : 'border-t border-neutral-200 px-4 py-3'}>
        {bijlagen.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {bijlagen.map((b, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-[11px]">
                <span className="max-w-[160px] truncate">{b.naam}</span>
                <button
                  type="button"
                  onClick={() => setBijlagen(l => l.filter((_, j) => j !== i))}
                  className="font-bold text-neutral-400 hover:text-neutral-700"
                  aria-label={`${b.naam} verwijderen`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {fout && <p className="mb-2 text-[13px] text-error-600">{fout}</p>}

        <div className="flex items-end gap-2">
          <textarea
            value={tekst}
            onChange={e => setTekst(e.target.value)}
            rows={2}
            placeholder="Typ uw bericht…"
            className="min-h-[46px] flex-1 resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <input
            ref={bestandRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={kiesBestand}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => bestandRef.current?.click()}
            disabled={uploadt}
            className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            title="Foto of PDF toevoegen"
          >
            {uploadt ? '…' : '📎'}
          </button>
          <button
            type="submit"
            disabled={bezig || uploadt || (!tekst.trim() && bijlagen.length === 0)}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {bezig ? '…' : 'Versturen'}
          </button>
        </div>
      </form>
    </div>
  )
}
