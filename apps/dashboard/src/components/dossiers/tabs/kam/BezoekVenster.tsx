'use client'

/**
 * Een projectbezoek bewerken vanaf de desktop.
 *
 * Hergebruikt **dezelfde doorloop als de telefoon** in plaats van er een tweede te bouwen.
 * Dat is een bewuste keuze: het bezoek kent tien serveracties en een reeks regels over wat
 * wanneer mag (een discipline met punten mag niet weg, een opgepakt aandachtspunt mag niet
 * worden ingetrokken). Twee schermen die dat allebei nabouwen lopen gegarandeerd uit elkaar,
 * en dan is de vraag "welk scherm heeft gelijk" niet meer te beantwoorden.
 *
 * De doorloop is voor een telefoon ontworpen, dus hij staat hier in een smalle kolom — dat is
 * eerlijker dan hem over de volle breedte uit te rekken, waar een strook van 1400 px met
 * invoervelden ontstaat.
 *
 * `getBezoek()` wordt hier opnieuw aangeroepen na elke wijziging: in het venster is de context
 * client-state, dus `router.refresh()` alleen zou het scherm op oude gegevens laten staan.
 */

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDialogen } from '@/components/ui/dialogen'
import { getBezoek, heropenBezoek } from '@/lib/bezoek/bezoeken'
import { bezoekKenmerk, type BezoekContext } from '@/lib/bezoek/types'
import BezoekDoorloop from '@/components/mobiel/bezoek/BezoekDoorloop'

export default function BezoekVenster({
  bezoekId,
  volgnummer,
  definitief,
}: {
  bezoekId: string
  volgnummer: number
  definitief: boolean
}) {
  const { vraagTekst } = useDialogen()
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<BezoekContext | null>(null)
  const [bezig, setBezig] = useState(false)

  const haalOp = useCallback(async () => {
    const c = await getBezoek(bezoekId)
    if (!c) { toast.error('Bezoek niet gevonden'); setOpen(false); return }
    setContext(c)
  }, [bezoekId])

  useEffect(() => {
    if (!open) return
    void haalOp()
  }, [open, haalOp])

  // Escape sluit het venster.
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  async function openen() {
    setContext(null)
    setOpen(true)
  }

  async function heropenen() {
    const reden = await vraagTekst({
      titel: 'Bezoek heropenen',
      omschrijving: 'Waarom wordt dit afgeronde bezoek weer opengezet? De reden blijft bij het bezoek staan.',
      label: 'Reden',
      placeholder: 'Bijvoorbeeld: foto van de achtergevel ontbrak',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Heropenen',
    })
    if (!reden?.trim()) return
    setBezig(true)
    const r = await heropenBezoek(bezoekId, reden)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Bezoek heropend')
    await openen()
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={openen}
          style={knop}
        >
          {definitief ? 'Bekijken' : 'Aanvullen'}
        </button>
        {definitief && (
          <button type="button" onClick={heropenen} disabled={bezig} style={knop}>
            {bezig ? 'Bezig…' : 'Heropenen'}
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[400] flex items-start justify-center bg-black/40 p-6"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            style={{ maxWidth: 520, marginTop: '4vh' }}
          >
            <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
              <div className="text-[13.5px] font-semibold text-neutral-800">
                {bezoekKenmerk(volgnummer)}
                {context?.dossier.titel ? ` · ${context.dossier.titel}` : ''}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded p-1.5 text-neutral-400 hover:bg-neutral-100"
                aria-label="Sluiten"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="eva flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
              {context
                ? <BezoekDoorloop context={context} herlaad={haalOp} />
                : <p style={{ padding: 24, fontSize: 13, color: 'var(--fg-muted)' }}>Bezig met laden…</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const knop: React.CSSProperties = {
  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--fg)',
  cursor: 'pointer', whiteSpace: 'nowrap',
}
