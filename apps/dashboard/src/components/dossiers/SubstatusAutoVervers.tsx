'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ververseSubstatussenActie } from '@/app/(platform)/instellingen/integraties/actions'

/**
 * Haalt bij het openen van de Aanvragen-/Offertes-pagina de verse substatussen op uit Bouw7.
 *
 * Het maatwerkveld "Offerte Sub-status" wordt óók door een tweede app op Bouw7 geschreven; die
 * wijzigingen mogen niet tot de volgende cron-run wachten. Dit is bewust de lichte variant van de
 * sync: één `GET /list/projects` en alleen een DB-update voor dossiers die daadwerkelijk afwijken.
 *
 * Stil op de achtergrond — geen spinner, geen toast. Lukt het niet (Bouw7 plat, geen config), dan
 * toont de pagina gewoon de laatst bekende stand. Bij een wijziging volgt een router.refresh() zodat
 * de kaart/rij vanzelf naar de juiste kolom springt.
 *
 * `alleenBijVerouderd` houdt het bij hooguit één Bouw7-call per vijf minuten voor het hele bedrijf.
 * Die ene `GET /list/projects` haalt álle projecten op (~1,3 MB) en duurt bijna een seconde; bij elk
 * paginabezoek opnieuw doen — ook als je alleen even heen en weer klikt — is verspilling voor een
 * veld dat een paar keer per dag wijzigt. De drempel zit op de server, zodat hij voor iedereen
 * tegelijk geldt en niet per browsertab.
 */
export function SubstatusAutoVervers({ scope }: { scope: 'aanvraag' | 'offerte' }) {
  const router = useRouter()
  const gedaan = useRef(false)

  useEffect(() => {
    // Ref-guard: in React StrictMode draait het effect in dev twee keer.
    if (gedaan.current) return
    gedaan.current = true

    let actief = true
    ververseSubstatussenActie(scope, { alleenBijVerouderd: true })
      .then((r) => {
        if (actief && r.ok && r.bijgewerkt > 0) router.refresh()
      })
      .catch(() => {
        /* stil: de pagina toont de laatst bekende stand */
      })

    return () => {
      actief = false
    }
  }, [scope, router])

  return null
}
