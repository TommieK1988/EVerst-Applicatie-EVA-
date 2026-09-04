'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import {
  getTeBeoordelenVerlof, keurVerlofGoed, wijsVerlofAf, type VerlofAanvraag,
} from '@/lib/uren/verlof'

/**
 * Verlofaanvragen afhandelen vanaf de medewerkerplanning.
 *
 * Hier hoort het thuis: wie beslist over verlof kijkt naar wie er die week al vrij is en wat er
 * gepland staat, en dat staat op dit scherm. Goedgekeurd verlof verschijnt er ook meteen als
 * afwezigheid in, want de goedkeuring schrijft een `medewerker_afwezigheid`-rij weg.
 *
 * De lijst wordt pas geladen als het paneel opengaat -- de planning zelf is al zwaar genoeg.
 */

function periode(start: string, eind: string) {
  const f = (d: string) => new Date(`${d}T12:00:00`)
    .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return start === eind ? f(start) : `${f(start)} t/m ${f(eind)}`
}

const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

export default function VerlofGoedkeurenKnop() {
  const router = useRouter()
  const [, startT] = useTransition()
  const { vraagTekst } = useDialogen()

  const [open, setOpen] = useState(false)
  const [aanvragen, setAanvragen] = useState<VerlofAanvraag[] | null>(null)
  const [aantal, setAantal] = useState<number | null>(null)
  const [bezig, setBezig] = useState(false)

  const laad = useCallback(async () => {
    const r = await getTeBeoordelenVerlof()
    setAanvragen(r)
    setAantal(r.length)
  }, [])

  // Bij het openen van de pagina alleen tellen, zodat de knop meteen laat zien of er iets ligt.
  useEffect(() => { laad() }, [laad])

  async function goedkeuren(a: VerlofAanvraag) {
    setBezig(true)
    const r = await keurVerlofGoed(a.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(r.bouw7
      ? `Verlof van ${a.medewerkerNaam} goedgekeurd en doorgezet naar Bouw7.`
      : `Verlof van ${a.medewerkerNaam} goedgekeurd. Doorzetten naar Bouw7 lukte niet; dat wordt automatisch opnieuw geprobeerd.`)
    await laad()
    startT(() => router.refresh())
  }

  async function afwijzen(a: VerlofAanvraag) {
    const reden = await vraagTekst({
      titel: `Verlofaanvraag van ${a.medewerkerNaam} afwijzen`,
      omschrijving: 'De medewerker ziet deze reden bij zijn aanvraag.',
      placeholder: 'Bijvoorbeeld: die week staat de oplevering gepland',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Afwijzen',
    })
    if (!reden?.trim()) return
    setBezig(true)
    const r = await wijsVerlofAf(a.id, reden)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aanvraag afgewezen.')
    await laad()
    startT(() => router.refresh())
  }

  return (
    <>
      <Button variant={aantal ? 'primary' : 'ghost'} size="sm" onClick={() => setOpen(true)}>
        Verlofaanvragen{aantal ? ` (${aantal})` : ''}
      </Button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)',
            display: 'grid', placeItems: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(720px, 100%)', maxHeight: '80vh', overflowY: 'auto',
              background: 'var(--bg-elev)', borderRadius: 14,
              boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
                Verlofaanvragen
              </h2>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                waarvan jij de goedkeurder bent
              </span>
              <button type="button" onClick={() => setOpen(false)}
                style={{
                  marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 20, lineHeight: 1, color: 'var(--fg-muted)', padding: 0,
                }}>×</button>
            </div>

            {aanvragen === null ? (
              <p style={leeg}>Bezig met ophalen…</p>
            ) : aanvragen.length === 0 ? (
              <p style={leeg}>Er staan geen verlofaanvragen op jouw akkoord te wachten.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {aanvragen.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                        <strong>{a.medewerkerNaam}</strong>
                        <span style={{ color: 'var(--fg-muted)' }}>
                          {' '}· {a.uursoortNaam} · {periode(a.startDatum, a.eindDatum)} · {uur(a.urenTotaal)} uur
                        </span>
                      </div>
                      {a.toelichting && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                          {a.toelichting}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" size="sm" disabled={bezig} onClick={() => afwijzen(a)}>
                        Afwijzen
                      </Button>
                      <Button variant="primary" size="sm" disabled={bezig} onClick={() => goedkeuren(a)}>
                        Goedkeuren
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const leeg: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0,
}
