'use client'

/**
 * De projectomschrijving, in de drie delen waarin hij ook in Bouw7 terechtkomt:
 * Scope, Buiten scope en Aandachtspunten.
 *
 * Waarom drie vakken en niet één. Ze staan in Bouw7 elk onder een eigen kopje, en
 * een uitsluiting die tussen de werkzaamheden staat leest als werk -- precies de
 * verwarring die je bij een calculatie niet wilt. Bovendien mag Buiten scope leeg
 * blijven: een verzonnen uitsluiting leest later als een afspraak met de klant.
 *
 * De tekst is een voorstel; wie hem bijschaaft slaat dát op bij het aanmaken. De
 * tussentijdse bewaring bij `onBlur` is er zodat een aanscherping niet verdwijnt
 * als iemand het scherm verlaat zonder een dossier te maken.
 *
 * De waarden zelf leven bij het behandelscherm -- die gaan mee naar `maakAanvraag`.
 * Alleen het opnieuw laten samenvatten en het bewaren horen hier.
 */

import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Button, BulletTextarea, useDialogen } from '@/components/ui'
import { hervatSamenvatting, bewaarSamenvatting } from '@/lib/mailintake/actions'

import { klein, veldStijl } from './velden'



type Deel = 'scope' | 'buiten_scope' | 'aandachtspunten'

export interface OmschrijvingWaarden {
  scope: string
  buitenScope: string
  aandachtspunten: string
}

/** Eén tekstvak met zijn eigen kopje en bewaring. */
function Vak({
  berichtId, deel, kop, uitleg, opgeslagen, waarde, opWijzig, bewerkbaar, minRows,
}: {
  berichtId: string
  deel: Deel
  kop: string
  uitleg?: string
  opgeslagen: string | null
  waarde: string
  opWijzig: (tekst: string) => void
  bewerkbaar: boolean
  minRows: number
}) {
  async function bewaren() {
    if ((opgeslagen ?? '') === waarde) return
    await bewaarSamenvatting(berichtId, waarde, deel).catch(() => {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={klein}>{kop}</span>
      <BulletTextarea
        value={waarde}
        onChange={opWijzig}
        onBlur={bewaren}
        minRows={minRows}
        maxRows={16}
        toonKnop={bewerkbaar}
        disabled={!bewerkbaar}
        placeholder={uitleg}
        // Dezelfde omlijsting als de andere velden op dit scherm. Dat scherm werkt
        // met inline stijlen en niet met Tailwind-klassen, dus die gaan hier mee.
        style={veldStijl}
      />
    </div>
  )
}

export default function WerkzaamhedenBlok({
  berichtId, opgeslagen, bronnen, gemist, waarden, opWijzig, bewerkbaar,
}: {
  berichtId: string
  /** Wat er bij het bericht staat; bepaalt of `onBlur` iets te bewaren heeft. */
  opgeslagen: OmschrijvingWaarden
  bronnen: string[] | null
  gemist: string[] | null
  waarden: OmschrijvingWaarden
  opWijzig: (nieuw: OmschrijvingWaarden) => void
  bewerkbaar: boolean
}) {
  const { bevestig } = useDialogen()
  const [bezig, setBezig] = useState(false)

  async function opnieuwSamenvatten() {
    // Stond er al tekst, dan is die mogelijk met de hand aangescherpt. Niet zomaar weg.
    const erIsTekst = Boolean(
      waarden.scope.trim() || waarden.buitenScope.trim() || waarden.aandachtspunten.trim(),
    )
    if (erIsTekst) {
      const ok = await bevestig({
        titel: 'Omschrijving opnieuw opstellen?',
        omschrijving:
          'Alle drie de delen worden vervangen door een nieuwe lezing van de mail en de bijlagen.',
        bevestigLabel: 'Opnieuw samenvatten',
      })
      if (!ok) return
    }
    setBezig(true)
    try {
      const res = await hervatSamenvatting(berichtId)
      if (!res.ok) { toast.error(res.error ?? 'Samenvatten mislukt'); return }
      opWijzig({
        scope: res.tekst ?? '',
        buitenScope: res.buitenScope ?? '',
        aandachtspunten: res.aandachtspunten ?? '',
      })
      toast.success('Omschrijving bijgewerkt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Omschrijving van het project</span>
        {bewerkbaar && (
          <Button variant="ghost" onClick={opnieuwSamenvatten} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Opnieuw samenvatten'}
          </Button>
        )}
      </div>

      <Vak
        berichtId={berichtId} deel="scope" kop="Scope — wat er gevraagd wordt"
        uitleg="Nog geen samenvatting opgesteld."
        opgeslagen={opgeslagen.scope} waarde={waarden.scope}
        opWijzig={t => opWijzig({ ...waarden, scope: t })}
        bewerkbaar={bewerkbaar} minRows={6}
      />

      <Vak
        berichtId={berichtId} deel="buiten_scope" kop="Buiten scope — alleen wat er letterlijk is uitgesloten"
        uitleg="Leeg laten als de aanvraag niets uitsluit."
        opgeslagen={opgeslagen.buitenScope} waarde={waarden.buitenScope}
        opWijzig={t => opWijzig({ ...waarden, buitenScope: t })}
        bewerkbaar={bewerkbaar} minRows={2}
      />

      <Vak
        berichtId={berichtId} deel="aandachtspunten" kop="Aandachtspunten — voorwaarden en open punten"
        uitleg="Bijvoorbeeld bereikbaarheid, bewoners, asbest, of wat nog nagevraagd moet worden."
        opgeslagen={opgeslagen.aandachtspunten} waarde={waarden.aandachtspunten}
        opWijzig={t => opWijzig({ ...waarden, aandachtspunten: t })}
        bewerkbaar={bewerkbaar} minRows={3}
      />

      {(bronnen?.length ?? 0) > 0 && (
        <span style={klein}>
          Uit de mail en {bronnen!.length} {bronnen!.length === 1 ? 'bijlage' : 'bijlagen'}.
        </span>
      )}
      {(gemist?.length ?? 0) > 0 && (
        <span style={{ ...klein, color: 'var(--wa-800, #92400e)' }}>
          Niet meegelezen: {gemist!.join(', ')}.
        </span>
      )}
    </div>
  )
}
