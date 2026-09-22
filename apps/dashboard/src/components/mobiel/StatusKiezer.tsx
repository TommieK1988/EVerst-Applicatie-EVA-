'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BottomSheet from './BottomSheet'
import StatusBadge from './StatusBadge'
import { substatusKleur } from './dossier-status'
import {
  wijzigSubstatusMobiel, wijzigServicedeskSubstatusMobiel, volgBouw7SubstatusMobiel,
} from '@/app/m/dossiers/actions'
import type { DossierSectie, DossierSubstatus, StatusDef } from '@/components/dossiers/types'

/**
 * De statuskiezer op het mobiele dossier.
 *
 * Zonder het recht `dossiers.status_wijzigen` (kanaal mobiel) is dit gewoon de badge die er
 * altijd al stond — geen uitgegrijsde knop die iets belooft wat niet mag. De server-action
 * controleert hetzelfde recht nog een keer; dit is de zichtbaarheidskant.
 *
 * Alles speelt zich af in ÉÉN bottom sheet, in drie standen: kiezen, doorvragen bij een
 * afsluitende status, en de uitweg bij een Bouw7-conflict. Bewust niet de gedeelde
 * `useDialogen()`-bevestiging zoals op de desktop: die opent een tweede overlay bovenop het
 * paneel, en op een telefoonscherm stapelen die twee ongelukkig.
 */

type Stand =
  | { soort: 'kies' }
  | { soort: 'afsluiten'; keuze: StatusDef<string> }
  | { soort: 'conflict'; keuze: StatusDef<string>; bouw7Label: string }

export default function StatusKiezer({
  dossierId, sectie, huidig, opties, afsluitend, magWijzigen,
}: {
  dossierId: string
  sectie: DossierSectie
  /** Sleutel van de huidige substatus. */
  huidig: string
  /** De kiesbare statussen, met de labels uit de ladder van dít dossier. */
  opties: StatusDef<string>[]
  /** Sleutels die het dossier definitief afsluiten; daar wordt eerst op doorgevraagd. */
  afsluitend: string[]
  magWijzigen: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [stand, setStand] = React.useState<Stand>({ soort: 'kies' })
  const [bezig, setBezig] = React.useState(false)
  // Optimistisch: de badge springt meteen mee, `router.refresh()` bevestigt het daarna.
  const [gekozen, setGekozen] = React.useState(huidig)
  React.useEffect(() => { setGekozen(huidig) }, [huidig])

  const huidigLabel = opties.find(o => o.key === gekozen)?.label ?? gekozen
  const kleur = substatusKleur(gekozen)

  if (!magWijzigen) return <StatusBadge label={huidigLabel} color={kleur} lg />

  function sluit() {
    setOpen(false)
    setStand({ soort: 'kies' })
  }

  async function voerUit(keuze: StatusDef<string>, forceerBouw7 = false) {
    const vorige = gekozen
    setBezig(true)
    setGekozen(keuze.key)

    const res = sectie === 'servicedesk'
      ? await wijzigServicedeskSubstatusMobiel(dossierId, keuze.key)
      : await wijzigSubstatusMobiel(dossierId, keuze.key as DossierSubstatus, { forceerBouw7 })

    setBezig(false)

    if (res.ok) {
      if (res.bouw7 && !res.bouw7.ok) {
        toast.error(`Bijgewerkt in EVA, maar niet in Bouw7: ${res.bouw7.error}`)
      } else {
        toast.success(`Status is nu ${keuze.label}.`)
      }
      sluit()
      router.refresh()
      return
    }

    setGekozen(vorige)
    // Botst de wijziging met de tweede Bouw7-app, dan is dit geen fout maar een keuze.
    if (res.conflict) {
      setStand({ soort: 'conflict', keuze, bouw7Label: res.conflict.bouw7Label })
      return
    }
    toast.error(res.error)
    sluit()
  }

  async function volgBouw7() {
    if (sectie !== 'aanvraag' && sectie !== 'offerte') { sluit(); return }
    setBezig(true)
    const res = await volgBouw7SubstatusMobiel(dossierId, sectie)
    setBezig(false)
    toast[res.ok ? 'success' : 'error'](
      res.ok ? 'Stand uit Bouw7 overgenomen.' : `Ophalen uit Bouw7 mislukt: ${res.error}`,
    )
    sluit()
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <StatusBadge label={huidigLabel} color={kleur} lg />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6b757c' }}>Wijzigen</span>
      </button>

      {open && (
        <BottomSheet
          titel={stand.soort === 'kies' ? 'Status wijzigen' : 'Weet je het zeker?'}
          sluitLabel={stand.soort === 'kies' ? 'Sluiten' : 'Annuleren'}
          onSluit={() => { if (!bezig) sluit() }}
        >
          {stand.soort === 'kies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {opties.map(o => (
                <button
                  key={o.key}
                  type="button"
                  disabled={bezig}
                  onClick={() => {
                    if (o.key === gekozen) { sluit(); return }
                    if (afsluitend.includes(o.key)) { setStand({ soort: 'afsluiten', keuze: o }); return }
                    void voerUit(o)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    minHeight: 52, padding: '0 14px', borderRadius: 12, textAlign: 'left',
                    background: o.key === gekozen ? 'color-mix(in srgb, #009439 8%, transparent)' : 'var(--bg)',
                    border: `1px solid ${o.key === gekozen ? '#009439' : 'var(--border)'}`,
                    fontSize: 16, fontWeight: o.key === gekozen ? 700 : 600,
                    color: 'var(--fg)', fontFamily: 'inherit',
                    opacity: bezig ? 0.55 : 1,
                  }}
                >
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: substatusKleur(o.key),
                  }} />
                  {o.label}
                  {o.key === gekozen && (
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: '#009439' }}>Nu</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {stand.soort === 'afsluiten' && (
            <Doorvragen
              tekst={
                `Het dossier gaat naar "${stand.keuze.label}". Daarna is het overal alleen-lezen `
                + 'en kun je dat in de app niet meer terugdraaien.'
              }
              knop={`Ja, ${stand.keuze.label.toLowerCase()}`}
              rood
              bezig={bezig}
              onTerug={() => setStand({ soort: 'kies' })}
              onDoor={() => void voerUit(stand.keuze)}
            />
          )}

          {stand.soort === 'conflict' && (
            <Doorvragen
              tekst={
                `In Bouw7 staat nu "${stand.bouw7Label}". Dat kan betekenen dat iemand daar zojuist `
                + 'iets wijzigde, of dat EVA eerder is vooruitgelopen. Neem de stand uit Bouw7 over, '
                + 'of overschrijf hem met jouw keuze.'
              }
              knop="Toch overschrijven"
              tweedeKnop="Bouw7 volgen"
              bezig={bezig}
              onTerug={() => void volgBouw7()}
              onDoor={() => void voerUit(stand.keuze, true)}
            />
          )}
        </BottomSheet>
      )}
    </>
  )
}

/** Tweede stand van het paneel: één vraag, twee uitwegen, allebei even groot als doelwit. */
function Doorvragen({
  tekst, knop, tweedeKnop = 'Terug', rood = false, bezig, onTerug, onDoor,
}: {
  tekst: string
  knop: string
  tweedeKnop?: string
  rood?: boolean
  bezig: boolean
  onTerug: () => void
  onDoor: () => void
}) {
  const basis: React.CSSProperties = {
    minHeight: 52, borderRadius: 12, fontSize: 16, fontWeight: 700,
    fontFamily: 'inherit', cursor: 'pointer', opacity: bezig ? 0.55 : 1,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#6b757c' }}>{tekst}</p>
      <button
        type="button" disabled={bezig} onClick={onDoor}
        style={{ ...basis, background: rood ? '#e8453b' : '#009439', color: '#fff', border: 'none' }}
      >
        {bezig ? 'Bezig…' : knop}
      </button>
      <button
        type="button" disabled={bezig} onClick={onTerug}
        style={{ ...basis, background: 'var(--bg-elev)', color: 'var(--fg)', border: '1px solid var(--border)' }}
      >
        {tweedeKnop}
      </button>
    </div>
  )
}
