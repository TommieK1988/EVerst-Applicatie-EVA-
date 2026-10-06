'use client'

/**
 * Zeg EVA wat hij met deze mail moet doen.
 *
 * WAAROM DIT ÉÉN INVOERVAK IS MET TWEE KNOPPEN
 * Er zijn twee soorten dingen die je EVA wil vertellen, en vooraf weet je zelden
 * welke van de twee je aan het typen bent. "De opdrachtgever is de VvE en niet de
 * beheerder" geldt misschien alleen hier, misschien altijd voor deze afzender. Dat
 * blijkt vaak pas als je het voor de derde keer typt. Daarom één vak en twee
 * knoppen: *alleen deze mail* of *altijd zo doen*. Het tweede bewaart precies
 * dezelfde zin als werkafspraak.
 *
 * EVA ANTWOORDT
 * Een aanwijzing in gewone taal kan anders landen dan hij bedoeld was. Door hem
 * terug te laten zeggen staat de misvatting er terwijl je er nog naar kijkt, in
 * plaats van tien mails later. Dat antwoord is ook de plek waar EVA nee zegt: "splits
 * deze mail op in twee aanvragen" is een redelijke opdracht die het intakeformulier
 * niet kan uitvoeren, en dan hoort daar een eerlijk antwoord op te komen.
 *
 * De aanwijzing blijft op het bericht staan. Hij hoort bij elke volgende herlezing
 * mee te doen -- anders ben je hem na één klik op "opnieuw lezen" weer kwijt.
 */

import React from 'react'

import { Button, Card } from '@/components/ui'
import { geefAanwijzing, wisAanwijzing } from '@/lib/mailintake/werkafspraak-actions'

import { klein, veldStijl } from './velden'

export default function AanwijzingPaneel({
  berichtId, postbusId, aanwijzing, bewerkbaar, onKlaar,
}: {
  berichtId: string
  /** Voor "altijd zo doen": de afspraak hangt dan aan deze postbus. */
  postbusId: string | null
  /** Wat er nu al bij dit bericht staat, als er iets staat. */
  aanwijzing: string | null
  bewerkbaar: boolean
  /** Na een herlezing moet het scherm de nieuwe lezing ophalen. */
  onKlaar: () => void
}) {
  const [tekst, setTekst] = React.useState('')
  const [bezig, setBezig] = React.useState<'nu' | 'altijd' | 'wissen' | null>(null)
  const [antwoord, setAntwoord] = React.useState<{ uitleg: string; volledig: boolean } | null>(null)
  const [fout, setFout] = React.useState<string | null>(null)

  const verstuur = async (onthouden: boolean) => {
    setBezig(onthouden ? 'altijd' : 'nu')
    setFout(null)
    setAntwoord(null)
    try {
      const res = await geefAanwijzing(berichtId, tekst, { onthouden, postbusId })
      if (!res.ok) setFout(res.error ?? 'Het is niet gelukt.')
      if (res.uitleg) setAntwoord({ uitleg: res.uitleg, volledig: res.volledig !== false })
      if (res.ok) { setTekst(''); onKlaar() }
    } catch {
      setFout('Het is niet gelukt.')
    } finally {
      setBezig(null)
    }
  }

  const wis = async () => {
    setBezig('wissen')
    setFout(null)
    setAntwoord(null)
    try {
      const res = await wisAanwijzing(berichtId)
      if (!res.ok) setFout(res.error ?? 'Het is niet gelukt.')
      else onKlaar()
    } finally {
      setBezig(null)
    }
  }

  if (!bewerkbaar && !aanwijzing) return null

  return (
    <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Zeg EVA wat hij moet doen</div>
        <span style={klein}>
          Bijvoorbeeld: de opdrachtgever is de VvE, niet de beheerder. Of: het bonnummer staat in
          de onderwerpregel.
        </span>
      </div>

      {/* Wat er al staat. Bovenaan, want het verklaart de lezing die je eronder ziet. */}
      {aanwijzing && (
        <div className="rounded-md border border-info-300 bg-info-50 px-2.5 py-2 text-[12.5px] leading-normal text-info-700">
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Aanwijzing bij dit bericht</div>
          {aanwijzing}
          {bewerkbaar && (
            <button
              type="button"
              onClick={() => void wis()}
              disabled={bezig != null}
              style={{
                display: 'block', marginTop: 4, background: 'none', border: 'none', padding: 0,
                font: 'inherit', textDecoration: 'underline', cursor: 'pointer', color: 'inherit',
              }}
            >
              {bezig === 'wissen' ? 'Bezig…' : 'Haal weg en lees opnieuw'}
            </button>
          )}
        </div>
      )}

      {bewerkbaar && (
        <>
          <textarea
            value={tekst}
            onChange={e => setTekst(e.target.value)}
            disabled={bezig != null}
            rows={3}
            placeholder="Typ hier wat EVA moet weten over deze mail…"
            style={{ ...veldStijl, resize: 'vertical', minHeight: 60 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Button onClick={() => void verstuur(false)} disabled={tekst.trim().length < 3 || bezig != null}>
              {bezig === 'nu' ? 'EVA leest opnieuw…' : 'Alleen deze mail'}
            </Button>
            <Button
              variant="outline"
              onClick={() => void verstuur(true)}
              disabled={tekst.trim().length < 3 || bezig != null}
              // Dit legt een regel vast voor alle post die hierna binnenkomt; dat
              // hoort niet dezelfde knop te zijn als een eenmalige aanwijzing.
              title="Bewaart dit ook als werkafspraak, voor elke volgende mail"
            >
              {bezig === 'altijd' ? 'Bezig…' : 'Altijd zo doen'}
            </Button>
            <span style={klein}>EVA leest de mail opnieuw met jouw aanwijzing erbij.</span>
          </div>
        </>
      )}

      {/* Het antwoord van EVA. Oranje als hij zegt dat hij het niet (helemaal) kan:
          dan is er een verwachting die niet uitkomt, en dat hoort op te vallen. */}
      {antwoord && (
        <div
          className={antwoord.volledig
            ? 'rounded-md border border-success-300 px-2.5 py-2 text-[12.5px] leading-normal'
            : 'rounded-md border border-warning-300 bg-warning-50 px-2.5 py-2 text-[12.5px] leading-normal text-warning-700'}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>EVA</div>
          {antwoord.uitleg}
        </div>
      )}

      {fout && (
        <div className="rounded-md border border-error-300 bg-error-50 px-2.5 py-2 text-[12.5px] text-error-700">
          {fout}
        </div>
      )}
    </Card>
  )
}
