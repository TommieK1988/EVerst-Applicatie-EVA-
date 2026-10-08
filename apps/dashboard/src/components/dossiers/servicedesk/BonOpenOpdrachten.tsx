'use client'

/**
 * "Opdrachten in de wacht" op een servicedeskbon: opdrachten die zijn vastgelegd maar nog niet
 * in Bouw7 staan. Meestal omdat ze boven de inkoopdrempel op akkoord wachten; soms omdat de stap
 * naar Bouw7 halverwege misging.
 *
 * Hier maak je ze af zonder alles opnieuw te typen. Een bon heeft geen Werkbegroting-tab, dus
 * zonder deze lijst was een opdracht die op akkoord wachtte nergens meer terug te vinden.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Badge } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type { WerkbegrotingBestelling } from '@/lib/everts-calc/types'
import {
  getOpenBonOpdrachten, maakBonOpdrachtVanConcept, vraagAccorderingVoorBonConcept, gooiBonConceptWeg,
  keurBonOpdrachtGoed, stuurBonOpdrachtTerug, type OpenBonOpdracht,
} from '@/app/(platform)/everts-calc/actions/bon-opdracht'
import AccorderingVenster, { type AccorderingStand } from './AccorderingVenster'
import OpdrachtMailVenster from './OpdrachtMailVenster'

const KNOP = 'h-auto min-h-8 justify-center whitespace-normal py-1.5 leading-tight'

/**
 * Het bestelvenster staat in een andere kolom van het Servicedesk-blok (`BonActies`) dan deze
 * lijst. Na het vastleggen van een opdracht seint het venster dit event, zodat de lijst hem meteen
 * toont zonder dat beide onder één gedeelde ouder hoeven te hangen.
 */
const GEWIJZIGD = 'eva:bon-opdrachten-gewijzigd'

export function meldBonOpdrachtenGewijzigd(): void {
  window.dispatchEvent(new Event(GEWIJZIGD))
}

export default function BonOpenOpdrachten({ dossierId, alleenLezen }: {
  dossierId: string
  alleenLezen: boolean
}) {
  const router = useRouter()
  const { bevestig, vraagTekst } = useDialogen()
  const [lijst, setLijst] = useState<OpenBonOpdracht[]>([])
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [akkoord, setAkkoord] = useState<{ id: string; stand: AccorderingStand } | null>(null)
  const [mail, setMail] = useState<WerkbegrotingBestelling | null>(null)

  const laad = useCallback(() => {
    getOpenBonOpdrachten(dossierId).then(setLijst).catch(() => setLijst([]))
  }, [dossierId])

  useEffect(() => {
    laad()
    window.addEventListener(GEWIJZIGD, laad)
    return () => window.removeEventListener(GEWIJZIGD, laad)
  }, [laad])

  function klaar() {
    laad()
    router.refresh()
  }

  async function vraagAan(id: string, beoordelaarId: string | null = null) {
    setBezigId(id)
    try {
      const r = await vraagAccorderingVoorBonConcept(dossierId, id, beoordelaarId)
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      if (r.status === 'vrij') { setAkkoord(null); toast('Er is geen accordering meer nodig.') }
      else setAkkoord({ id, stand: r })
      klaar()
    } finally {
      setBezigId(null)
    }
  }

  /** Beoordelaar: deze opdracht mag de deur uit. */
  async function keurGoed(o: OpenBonOpdracht) {
    if (!o.goedkeuringId) return
    const ok = await bevestig({
      titel: 'Opdracht goedkeuren?',
      omschrijving: `"${o.omschrijving}"${o.relatieNaam ? ` aan ${o.relatieNaam}` : ''} voor ${formatEuro(o.bedrag)}. Daarna kan de opdracht naar de partij.`,
      bevestigLabel: 'Goedkeuren',
    })
    if (!ok) return
    setBezigId(o.id)
    try {
      const r = await keurBonOpdrachtGoed(o.goedkeuringId)
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      toast.success('Opdracht goedgekeurd')
      klaar()
    } finally {
      setBezigId(null)
    }
  }

  /** Beoordelaar: terug naar de aanvrager, met de reden erbij. */
  async function stuurTerug(o: OpenBonOpdracht) {
    if (!o.goedkeuringId) return
    const reden = await vraagTekst({
      titel: 'Opdracht terugsturen?',
      omschrijving: 'De aanvrager krijgt je opmerking te zien en kan de opdracht aanpassen of opnieuw aanvragen.',
      label: 'Opmerking',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Terugsturen',
    })
    if (reden == null) return
    setBezigId(o.id)
    try {
      const r = await stuurBonOpdrachtTerug(o.goedkeuringId, reden)
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      toast.success('Opdracht teruggestuurd')
      klaar()
    } finally {
      setBezigId(null)
    }
  }

  async function maak(id: string) {
    setBezigId(id)
    try {
      const r = await maakBonOpdrachtVanConcept(dossierId, id)
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); klaar(); return }
      toast.success(`${r.nummer ?? 'Opdracht'} staat als concept in Bouw7 — verstuur hem nu`)
      setMail(r.bestelling)
      klaar()
    } finally {
      setBezigId(null)
    }
  }

  async function weg(o: OpenBonOpdracht) {
    const ok = await bevestig({
      titel: 'Opdracht weggooien?',
      omschrijving: `"${o.omschrijving}" gaat van de bon af. Stonden de regels al als verwachte kosten in Bouw7, dan worden ze daar op nul gezet.`,
      bevestigLabel: 'Weggooien',
    })
    if (!ok) return
    setBezigId(o.id)
    try {
      const r = await gooiBonConceptWeg(dossierId, o.id)
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      if (r.waarschuwing) toast(r.waarschuwing, { icon: '⚠️', duration: 8000 })
      else toast.success('Opdracht weggegooid')
      klaar()
    } finally {
      setBezigId(null)
    }
  }

  if (lijst.length === 0 && !mail) return null

  return (
    <>
      {lijst.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            Opdrachten in de wacht
          </div>
          <div className="flex flex-col divide-y divide-neutral-200">
            {lijst.map(o => (
              <div key={o.id} className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-neutral-800 dark:text-neutral-100">{o.omschrijving}</div>
                    <div className="text-[11px] text-neutral-500">
                      {[o.relatieNaam, formatEuro(o.bedrag)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Badge size="sm" className="shrink-0" tone={o.staat === 'klaar' ? 'success' : o.staat === 'wacht' ? 'warning' : 'neutral'}>
                    {o.staat === 'klaar' ? 'Geaccordeerd' : o.staat === 'wacht' ? 'Wacht op akkoord' : 'Accordering nodig'}
                  </Badge>
                </div>
                {o.staat === 'wacht' && (
                  <span className="text-[11px] leading-snug text-neutral-500">
                    {o.beoordelaarNaam ? `Ligt bij ${o.beoordelaarNaam}.` : 'De aanvraag ligt bij de beoordelaar.'}
                  </span>
                )}
                {o.teruggestuurd && (
                  <span className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                    Teruggestuurd: {o.teruggestuurd}
                  </span>
                )}
                {!alleenLezen && (
                  <div className="flex flex-wrap gap-2">
                    {o.staat === 'wacht' && o.magBeoordelen && (
                      <>
                        <Button variant="primary" className={KNOP} loading={bezigId === o.id}
                          disabled={bezigId != null} onClick={() => void keurGoed(o)}>
                          Goedkeuren
                        </Button>
                        <Button variant="secondary" className={KNOP} disabled={bezigId != null}
                          onClick={() => void stuurTerug(o)}>
                          Terugsturen
                        </Button>
                      </>
                    )}
                    {o.staat === 'klaar' && (
                      <Button variant="primary" className={KNOP} loading={bezigId === o.id}
                        disabled={bezigId != null} onClick={() => void maak(o.id)}>
                        {o.soort === 'inkooporder' ? 'Bestelling maken' : 'Opdracht maken'}
                      </Button>
                    )}
                    {o.staat === 'aanvragen' && (
                      <Button variant="primary" className={KNOP} loading={bezigId === o.id}
                        disabled={bezigId != null} onClick={() => void vraagAan(o.id)}>
                        Accordering aanvragen
                      </Button>
                    )}
                    <Button variant="outline" className={KNOP} disabled={bezigId != null} onClick={() => void weg(o)}>
                      Weggooien
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {akkoord && (
        <AccorderingVenster
          stand={akkoord.stand}
          bezig={bezigId === akkoord.id}
          onKies={id => void vraagAan(akkoord.id, id)}
          onSluit={() => setAkkoord(null)}
        />
      )}

      {mail && (
        <OpdrachtMailVenster
          key={mail.id}
          dossierId={dossierId}
          bestelling={mail}
          titel={mail.soort === 'inkooporder' ? 'Bestelling versturen' : 'Opdracht versturen'}
          onLater={() => setMail(null)}
          onVerstuurd={() => { setMail(null); klaar() }}
        />
      )}
    </>
  )
}
