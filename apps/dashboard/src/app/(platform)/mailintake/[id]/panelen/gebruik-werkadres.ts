'use client'

/**
 * Het werkadres, met de adresservice erachter.
 *
 * De vier velden horen bij elkaar: wie er één wijzigt, maakt de andere drie
 * onbevestigd, en de service vult aan wat er ontbreekt. Losse `useState`-regels in
 * het behandelscherm lieten dat verband nergens zien -- en precies daar ging het
 * mis: de controle hing alleen aan `onBlur` van huisnummer en postcode, dus een
 * mail die straat, huisnummer en plaats opleverde maar geen postcode liet dat veld
 * leeg tot je er zelf in klikte en er weer uit ging. Onnodig, want alles wat nodig
 * is stond er al.
 *
 * Nu draait de controle ook één keer bij het openen, en hangt hij aan alle vier de
 * velden in plaats van aan twee.
 */

import React from 'react'
import toast from 'react-hot-toast'

import { zoekAdres } from '@/lib/adres/pdok'

export interface Werkadres {
  straat: string
  huisnummer: string
  postcode: string
  stad: string
  /** De adresservice heeft dit adres teruggevonden. */
  bevestigd: boolean
}

export function useWerkadres(begin: {
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  stad: string | null
  /** Bij een afgehandeld of alleen-lezen bericht draait de automatische ronde niet. */
  bewerkbaar: boolean
}) {
  const [straat, setStraat] = React.useState(begin.straat ?? '')
  const [huisnummer, setHuisnummer] = React.useState(begin.huisnummer ?? '')
  const [postcode, setPostcode] = React.useState(begin.postcode ?? '')
  const [stad, setStad] = React.useState(begin.stad ?? '')
  const [bevestigd, setBevestigd] = React.useState(false)

  const genoeg = (pc: string, nr: string, st: string, pl: string) =>
    Boolean((pc && nr) || (st && nr && pl))

  /**
   * Vult het adres aan bij de adresservice.
   *
   * `stil` onderdrukt de foutmelding, voor de automatische ronde hieronder: een
   * toast die bij het openen van het scherm uit zichzelf verschijnt leest als een
   * storing, terwijl het gewoon betekent dat het adres nog aandacht vraagt -- en
   * dat staat al bij het veld.
   */
  const controleer = React.useCallback(async (stil = false) => {
    if (!genoeg(postcode, huisnummer, straat, stad)) return
    try {
      const treffers = await zoekAdres({ postcode, huisnummer, straat, stad, rows: 1 })
      const t = treffers[0]
      if (t) {
        setStraat(t.straat || straat)
        setPostcode(t.postcode || postcode)
        setStad(t.stad || stad)
        setBevestigd(true)
      } else {
        setBevestigd(false)
        if (!stil) toast.error('Dit adres is niet gevonden — controleer postcode en huisnummer.')
      }
    } catch {
      setBevestigd(false)
    }
  }, [postcode, huisnummer, straat, stad])

  // Eén keer op de beginwaarden uit de lezing; daarna stuurt de gebruiker en is
  // `onBlur` aan zet. De ref en niet de state, zodat een tweede render er niet
  // alsnog een tweede PDOK-aanroep van maakt.
  const gedaan = React.useRef(false)
  React.useEffect(() => {
    if (gedaan.current || !begin.bewerkbaar) return
    if (!genoeg(begin.postcode ?? '', begin.huisnummer ?? '', begin.straat ?? '', begin.stad ?? '')) return
    gedaan.current = true
    void controleer(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin.bewerkbaar])

  /** Een veld wijzigen maakt het adres onbevestigd: het is dan een ander adres. */
  const zet = (welk: 'straat' | 'huisnummer' | 'postcode' | 'stad') => (waarde: string) => {
    setBevestigd(false)
    if (welk === 'straat') setStraat(waarde)
    else if (welk === 'huisnummer') setHuisnummer(waarde)
    else if (welk === 'postcode') setPostcode(waarde)
    else setStad(waarde)
  }

  return {
    straat, huisnummer, postcode, stad, bevestigd,
    setStraat: zet('straat'),
    setHuisnummer: zet('huisnummer'),
    setPostcode: zet('postcode'),
    setStad: zet('stad'),
    /** Aan `onBlur` hangen; vult aan en bevestigt. */
    controleer: () => void controleer(),
  }
}
