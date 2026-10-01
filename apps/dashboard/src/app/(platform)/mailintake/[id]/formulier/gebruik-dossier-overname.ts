'use client'

/**
 * Het gekozen dossier de velden laten vullen.
 *
 * Hoort de mail bij een bestaand dossier -- meerwerk op een lopende opdracht, of een
 * opdracht op een offerte -- dan staan opdrachtgever, werkadres, categorie,
 * werkmaatschappij en de rollen daar allang in. Het scherm vond dat dossier wel, maar
 * deed er niets mee: je zat velden na te lopen die het dossier zelf had kunnen
 * invullen, en liep het risico er iets anders in te zetten dan er op het dossier staat.
 *
 * Het dossier blijft leidend: dit vult het scherm, maar bevestigen schrijft die
 * waarden niet terug. Wijkt de mail af, dan kleurt het veld oranje met beide waarden
 * erbij -- een signaal om naar te kijken, geen stille overschrijving.
 */

import React from 'react'

import { getDossierOvername, type DossierOvername } from '@/lib/mailintake/dossier-overnemen'
import type { Rolbezetting } from './RollenSectie'

/** De setters die het formulier aanbiedt; alleen wat het dossier kan vullen. */
export interface OvernameDoel {
  zetKlant: (id: string, naam: string) => void
  zetContactpersoon: (id: string) => void
  zetCategorie: (id: number) => void
  zetWerkmaatschappij: (id: string) => void
  zetObject: (id: string) => void
  zetAdres: (v: { straat?: string | null; huisnummer?: string | null; postcode?: string | null; stad?: string | null }) => void
  zetOmschrijving: (v: string) => void
  zetVveCode: (v: string) => void
  zetReferentie: (v: string) => void
  zetDeadline: (v: string) => void
  zetRollen: (bij: Rolbezetting) => void
  /** Wat er nu op het scherm staat; bepaalt wat het dossier nog mag invullen. */
  huidig: { omschrijving: string; vveCode: string; referentie: string; deadline: string }
}

export function useDossierOvername(dossierId: string | null, doel: OvernameDoel) {
  const [uitDossier, setUitDossier] = React.useState<DossierOvername | null>(null)

  React.useEffect(() => {
    if (!dossierId) { setUitDossier(null); return }
    let weg = false
    getDossierOvername(dossierId)
      .then(d => { if (!weg) setUitDossier(d) })
      .catch(() => { if (!weg) setUitDossier(null) })
    return () => { weg = true }
  }, [dossierId])

  /**
   * Overnemen zodra het dossier binnen is.
   *
   * Opdrachtgever, contactpersoon, adres, categorie en werkmaatschappij komen altijd
   * van het dossier: dat is per definitie de waarheid over een lopende opdracht. De
   * vrije velden alleen als ze nog leeg zijn -- wie iets invult wil niet dat het
   * dossier dat een seconde later overschrijft.
   */
  React.useEffect(() => {
    if (!uitDossier) return
    const d = uitDossier
    if (d.klantId) doel.zetKlant(d.klantId, d.klantNaam ?? '')
    if (d.contactpersoonId) doel.zetContactpersoon(d.contactpersoonId)
    if (d.categorieId != null) doel.zetCategorie(d.categorieId)
    if (d.werkmaatschappijId) doel.zetWerkmaatschappij(d.werkmaatschappijId)
    if (d.objectId) doel.zetObject(d.objectId)
    doel.zetAdres({
      straat: d.werkadresStraat, huisnummer: d.werkadresHuisnummer,
      postcode: d.werkadresPostcode, stad: d.werkadresStad,
    })
    if (!doel.huidig.omschrijving.trim() && d.titel) doel.zetOmschrijving(d.titel)
    if (!doel.huidig.vveCode.trim() && d.vveCode) doel.zetVveCode(d.vveCode)
    if (!doel.huidig.referentie.trim() && d.referentie) doel.zetReferentie(d.referentie)
    if (!doel.huidig.deadline && d.deadline) doel.zetDeadline(d.deadline.slice(0, 10))
    doel.zetRollen(
      Object.fromEntries(Object.entries(d.rollen).filter(([, v]) => v != null)) as Rolbezetting,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uitDossier])

  return uitDossier
}
