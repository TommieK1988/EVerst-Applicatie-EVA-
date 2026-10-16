/**
 * "Mag ik bellen?" — de melding bovenaan de offertekaart in "Te doen".
 *
 * Dit is de maatregel tegen dubbel bellen. De projectleider die werk zoekt en de assistent die
 * nabelt kijken in dezelfde lijst; vóór iemand de telefoon pakt, moet hij zien wie er aan zet is,
 * wat er het laatst besproken is en tot wanneer we op de klant wachten. Een blokkade is het
 * bewust niet: belt de klant zelf, dan moet je het gesprek gewoon kunnen vastleggen.
 *
 * Pure functie, zodat de tekst per situatie te testen is.
 */

import { kortDatum } from './te-doen'
import type { BewakingWeergave, TijdlijnRegel } from '@/lib/commercie/actions'

export type BellenBanner = {
  toon: 'go' | 'stop' | 'info'
  kop: string
  regels: string[]
}

type Invoer = {
  bewaking: Pick<BewakingWeergave, 'kaart' | 'status' | 'actiehouderNaam' | 'afgerond'>
  tijdlijn: Pick<TijdlijnRegel, 'soort' | 'op' | 'door' | 'tekst' | 'kop'>[]
  mijnId: string | null
  vandaag: string
}

/** Het laatste klantcontact, als "5 okt · Sanne: penningmeester stuurt akkoord". */
function laatsteContact(tijdlijn: Invoer['tijdlijn'], vandaag: string): string | null {
  const r = tijdlijn.find(t => t.soort === 'contact')
  if (!r) return null
  const wie = r.door ? ` · ${r.door}` : ''
  return `Laatste contact ${kortDatum(r.op, vandaag)}${wie}: ${r.tekst ? `"${r.tekst}"` : r.kop}`
}

export function bellenBanner({ bewaking, tijdlijn, mijnId, vandaag }: Invoer): BellenBanner | null {
  const { kaart, status, actiehouderNaam } = bewaking
  if (bewaking.afgerond || status === 'afgerond') return null

  const contact = laatsteContact(tijdlijn, vandaag)
  const metContact = (regels: string[]) => (contact ? [contact, ...regels] : regels)

  if (!kaart || status === 'ongetrieerd' || !kaart.stap_datum) {
    return {
      toon: 'info',
      kop: 'Nog niemand heeft deze offerte opgepakt',
      regels: metContact(['Leg na het gesprek een uitkomst vast. Wie dat doet, wordt eigenaar.']),
    }
  }

  const datum = kortDatum(kaart.stap_datum, vandaag)
  const wachten = kaart.stap_soort === 'wachten'
  const ikBenAanZet = mijnId != null && kaart.actiehouder_id === mijnId
  const naam = actiehouderNaam ?? 'een collega'

  if (ikBenAanZet) {
    if (status === 'verlopen') {
      return { toon: 'go', kop: `Jij bent aan zet: ${kaart.stap_tekst ?? 'actie'}`, regels: metContact([`Dit had op ${datum} gemoeten.`]) }
    }
    if (status === 'nu') {
      return { toon: 'go', kop: `Jij bent aan zet: ${kaart.stap_tekst ?? 'actie'}`, regels: metContact(['Staat voor vandaag.']) }
    }
    if (wachten) {
      return { toon: 'stop', kop: `Nog niet bellen: we wachten tot ${datum}`, regels: metContact([]) }
    }
    return { toon: 'info', kop: `Jij bent aan zet op ${datum}`, regels: metContact([kaart.stap_tekst ?? '']).filter(Boolean) }
  }

  if (wachten && status !== 'verlopen') {
    return {
      toon: 'stop',
      kop: `Niet bellen. ${naam} heeft dit afgestemd`,
      regels: metContact([
        `We wachten tot ${datum}. Daarna komt de offerte vanzelf terug bij ${naam}.`,
        'Belt de klant zelf? Leg het gesprek dan hieronder vast.',
      ]),
    }
  }

  if (status === 'verlopen') {
    return {
      toon: 'stop',
      kop: `${naam} is aan zet en dat had op ${datum} gemoeten`,
      regels: metContact([`Stem even af met ${naam} voordat je belt, anders belt de klant twee keer iemand van ons.`]),
    }
  }

  return {
    toon: 'stop',
    kop: `${naam} is aan zet: ${kaart.stap_tekst ?? 'actie'} (${datum})`,
    regels: metContact([`Stem af met ${naam} voordat je zelf belt.`]),
  }
}
