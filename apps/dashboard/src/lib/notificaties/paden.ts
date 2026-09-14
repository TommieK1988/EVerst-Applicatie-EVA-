/**
 * Vertaling van een desktop-pad naar het mobiele equivalent.
 *
 * Bewust een los bestand zonder `server-only`: dit wordt op twee plekken
 * gebruikt die niets met elkaar te maken hebben. De server gebruikt het bij het
 * versturen van een pushmelding (`lib/notificaties/push.ts`, per apparaat), de
 * browser bij het aantikken van een melding in de mobiele meldingenlijst.
 *
 * Waarom het nodig is: de middleware stuurt een telefoon vanaf élke
 * desktop-route naar `/m`. Zonder deze vertaling landt een aangetikte melding
 * op het startscherm in plaats van bij de melding — die zegt dan wel wát er is,
 * maar brengt je er niet heen.
 *
 * De regel voor het onderhouden hiervan: een melding krijgt het **desktop**-pad
 * mee, en dit bestand bepaalt waar dat op een telefoon uitkomt. Alleen meldingen
 * over iets dat op de desktop niet bestaat (verlof, toolbox) dragen meteen een
 * `/m/`-pad; die gaan hieronder ongemoeid door de eerste regel.
 *
 * Paden waarvan géén mobiel scherm bestaat gaan naar het meldingenscherm: daar
 * staat de melding in elk geval nog een keer, met zijn eigen tekst.
 */

/** Dossier-secties op de desktop; op mobiel is er één dossierscherm. */
const DOSSIER_SECTIES = ['aanvragen', 'offertes', 'opdrachten', 'servicedesk']

export function naarMobielPad(pad: string): string {
  if (!pad || pad.startsWith('/m/') || pad === '/m') return pad || '/m'

  const [zonderQuery, query = ''] = pad.split(/[?#]/)
  const delen = zonderQuery.split('/').filter(Boolean)

  if (delen.length >= 2 && DOSSIER_SECTIES.includes(delen[0])) {
    return `/m/dossiers/${delen[1]}`
  }
  // `mijn-taken` is het desktop-scherm met je eigen acties; `taken` het beheer
  // van actielijsten. Op mobiel is dat allebei `/m/taken`.
  if (delen[0] === 'taken' || delen[0] === 'mijn-taken') return '/m/taken'
  if (delen[0] === 'uren') {
    // Het fiatteerscherm is een eigen pagina op mobiel, maar op de desktop een
    // periodekeuze binnen hetzelfde overzicht. Zonder deze regel komt een
    // fiatteer-herinnering uit op je eigen weekstaat — het verkeerde scherm.
    return /(^|&)periode=te_keuren(&|$)/.test(query) ? '/m/uren/keuren' : '/m/uren'
  }
  if (delen[0] === 'planning') return '/m/planning'

  return '/m/notificaties'
}
