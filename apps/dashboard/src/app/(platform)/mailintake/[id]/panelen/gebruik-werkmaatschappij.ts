'use client'

/**
 * De werkmaatschappij, afgeleid uit de categorie die op het scherm staat.
 *
 * WAAROM DIT ER MOET ZIJN
 * `keurEnKalibreer` leidt de werkmaatschappij al af tijdens het lezen, maar het
 * scherm deed daar niets mee: het veld begon op de standaardwerkmaatschappij van de
 * postbus, en die is bij de aanvragenbus leeg. Gevolg: de categorie stond goed en
 * de werkmaatschappij moest je er alsnog zelf bij zoeken -- terwijl de regel
 * ("Renovatie, Mutatie en Dagelijks onderhoud zijn Morgenstond; Schilderwerk is
 * Everts Onderhoudsschilders") al in code stond.
 *
 * En de afleiding hoort mee te bewegen. Corrigeer je de categorie van Schilderwerk
 * naar Renovatie, dan klopt de werkmaatschappij van een seconde geleden niet meer.
 * Vandaar een voorstel dat de categorie volgt in plaats van een eenmalige invulling.
 *
 * `aangeraakt` is de grens: zodra jij zelf een werkmaatschappij kiest, houdt de
 * afleiding op. Anders zou een latere categoriewijziging jouw keuze overschrijven,
 * en dat is precies het soort veld waarvan je niet merkt dat het is omgezet.
 *
 * Alleen Bouwkundig Onderhoud blijft een twijfelgeval -- daar beslist de aard van
 * het werk, en zegt die niets, dan blijft het veld leeg en vraagt het scherm erom.
 */

import React from 'react'

import { kiesWerkmaatschappij, type AardVanHetWerk } from '@/lib/mailintake/regels'

export function useWerkmaatschappij(opts: {
  categorieNaam: string | null
  aard: string | null
  werkmaatschappijen: { id: string; naam: string }[]
  /** De standaard van de postbus; terugval als de regel niets oplevert. */
  standaard: string | null
}) {
  const [id, setIdRuw] = React.useState<string>(opts.standaard ?? '')
  const [aangeraakt, setAangeraakt] = React.useState(false)

  const keuze = kiesWerkmaatschappij(
    (opts.aard ?? null) as AardVanHetWerk | null,
    opts.categorieNaam,
    opts.werkmaatschappijen,
  )

  // `via` zegt waaróm: 'categorie' en 'aard' zijn afleidingen, 'voorleggen' betekent
  // dat de stukken het niet zeggen. In dat laatste geval niets invullen -- een gok
  // die er ingevuld uitziet is erger dan een leeg veld dat om aandacht vraagt.
  const voorstel = keuze.id ?? (keuze.via === 'voorleggen' ? '' : (opts.standaard ?? ''))

  React.useEffect(() => {
    if (aangeraakt) return
    setIdRuw(voorstel)
  }, [voorstel, aangeraakt])

  const setId = React.useCallback((v: string) => {
    setIdRuw(v)
    setAangeraakt(true)
  }, [])

  return { werkmaatschappijId: id, setWerkmaatschappijId: setId, via: keuze.via }
}
