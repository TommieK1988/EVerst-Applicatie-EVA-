'use client'

/**
 * De rechterkolom: waarop berust dit, en wat wil je EVA erover zeggen.
 *
 * Eerst de mail zelf met de bijlagen, dan het vak om EVA een aanwijzing te geven,
 * dan de onderbouwing van zijn oordeel. Die volgorde is de leesrichting: je kijkt
 * naar de bron, je ziet dat er iets niet goed uit gelezen is, en je zegt het meteen
 * waar je staat -- niet drie kolommen terug.
 *
 * Staat als eigen component omdat `BerichtBehandelen` tegen de 800 regels aanloopt
 * (zie de schuldteller en DEVELOPMENT_STANDARDS §2.1). Een kolom is een natuurlijke
 * eenheid om eruit te lichten: hij heeft één plek en één verhaal.
 *
 * De props komen via `React.ComponentProps` uit de panelen zelf. Ze hier overtypen
 * zou betekenen dat een wijziging in een paneel stil langs deze doorgeefluik glipt.
 */

import React from 'react'

import MailPaneel from './MailPaneel'
import BeoordelingPaneel from './BeoordelingPaneel'
import AanwijzingPaneel from './AanwijzingPaneel'

type MailProps = React.ComponentProps<typeof MailPaneel>
type BeoordelingProps = React.ComponentProps<typeof BeoordelingPaneel>

export default function RechterKolom({
  mail, beoordeling, aanwijzing, bewerkbaar,
}: {
  mail: MailProps
  /** Zonder `bericht` en `bewerkbaar`: die staan hierboven al. */
  beoordeling: Omit<BeoordelingProps, 'bericht' | 'bewerkbaar'>
  /** `tekst` is wat er nu al bij dit bericht staat. */
  aanwijzing: { postbusId: string | null; tekst: string | null; onKlaar: () => void }
  bewerkbaar: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MailPaneel {...mail} />

      <AanwijzingPaneel
        berichtId={String((mail.bericht as { id: string }).id)}
        postbusId={aanwijzing.postbusId}
        aanwijzing={aanwijzing.tekst}
        bewerkbaar={bewerkbaar}
        onKlaar={aanwijzing.onKlaar}
      />

      <BeoordelingPaneel {...beoordeling} bericht={mail.bericht} bewerkbaar={bewerkbaar} />
    </div>
  )
}
