'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { corrigeerUurregel } from '@/lib/uren/bouw7-goedkeuring'
import { getBewakingscodesVoorUurlog, type BewakingscodeOptie } from '@/lib/dossiers/actions'

/**
 * Een geboekte urenregel aanpassen vóór goedkeuring.
 *
 * Afkeuren bestaat niet: Bouw7 kent alleen goedgekeurd of niet, en een regel heen en weer sturen
 * kost alleen tijd. De goedkeurder zet het hier recht en de medewerker krijgt daar bericht van.
 *
 * De bewakingscodelijst komt hier zónder het prognose-filter binnen: dit is corrigeren, niet
 * invoeren. Een uur dat op de verkeerde code staat moet naar élke code te verplaatsen zijn, ook
 * naar een code waar niets voor begroot is.
 */

export type TeBewerkenRegel = {
  hourLogId: number
  medewerkerNaam: string
  datum: string
  uren: number
  uursoort: string | null
  dossierId: string | null
  dossierLabel: string | null
  bewakingscode: string | null
  opmerking: string | null
}

const veld: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
  color: 'var(--fg-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
}

export default function UurregelBewerken({
  regel, onSluit, onKlaar,
}: {
  regel: TeBewerkenRegel
  onSluit: () => void
  onKlaar: () => void
}) {
  const [uren, setUren] = useState(String(regel.uren).replace('.', ','))
  const [code, setCode] = useState(regel.bewakingscode ?? '')
  const [opmerking, setOpmerking] = useState(regel.opmerking ?? '')
  const [codes, setCodes] = useState<BewakingscodeOptie[]>([])
  const [codesLaden, setCodesLaden] = useState(false)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    if (!regel.dossierId) return
    let levend = true
    setCodesLaden(true)
    getBewakingscodesVoorUurlog(regel.dossierId)
      .then(c => { if (levend) setCodes(c) })
      .finally(() => { if (levend) setCodesLaden(false) })
    return () => { levend = false }
  }, [regel.dossierId])

  async function bewaar() {
    const getal = parseFloat(uren.replace(',', '.'))
    if (Number.isNaN(getal) || !(getal > 0 && getal <= 24)) {
      toast.error('Vul een aantal uren tussen 0 en 24 in.')
      return
    }
    const gekozen = codes.find(c => c.code === code)
    setBezig(true)
    const r = await corrigeerUurregel(regel.hourLogId, {
      ...(getal !== regel.uren ? { uren: getal } : {}),
      ...(code !== (regel.bewakingscode ?? '') ? { bewakingscodePslId: gekozen?.pslId ?? null } : {}),
      ...(opmerking !== (regel.opmerking ?? '') ? { opmerking } : {}),
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aangepast; de medewerker heeft bericht gekregen.')
    onKlaar()
    onSluit()
  }

  const nietsGewijzigd =
    parseFloat(uren.replace(',', '.')) === regel.uren &&
    code === (regel.bewakingscode ?? '') &&
    opmerking === (regel.opmerking ?? '')

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      {/* Geen transform-centrering: dat botst met een transform-animatie en zet het venster scheef. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', background: 'var(--bg-elev)', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
            Uren aanpassen
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
            {regel.medewerkerNaam} · {regel.datum}
            {regel.uursoort ? ` · ${regel.uursoort}` : ''}
            {regel.dossierLabel ? ` · ${regel.dossierLabel}` : ''}
          </p>
        </div>

        <div>
          <label style={labelStijl}>Aantal uren</label>
          <input type="text" inputMode="decimal" value={uren} onChange={e => setUren(e.target.value)}
            style={{ ...veld, width: 120 }} autoFocus />
        </div>

        {regel.dossierId && (
          <div>
            <label style={labelStijl}>Bewakingscode</label>
            <select value={code} onChange={e => setCode(e.target.value)} style={veld} disabled={codesLaden}>
              <option value="">{codesLaden ? 'Bezig met ophalen…' : '— geen code —'}</option>
              {codes.map(c => (
                <option key={c.pslId} value={c.code}>
                  {c.code}{c.naam ? ` · ${c.naam}` : ''}
                  {c.prognoseUren > 0 ? ` (${c.prognoseUren}u begroot)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={labelStijl}>Opmerking</label>
          <input type="text" value={opmerking} onChange={e => setOpmerking(e.target.value)}
            placeholder="Optioneel" style={veld} />
        </div>

        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
          De wijziging gaat meteen naar Bouw7 en de medewerker krijgt een melding. Wat er stond
          blijft in EVA bewaard, zodat later na te gaan is wat er is aangepast.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={onSluit}>Annuleren</Button>
          <Button variant="primary" size="sm" onClick={bewaar} loading={bezig}
            disabled={bezig || nietsGewijzigd}>
            Opslaan
          </Button>
        </div>
      </div>
    </div>
  )
}
