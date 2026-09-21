/**
 * Van schermtoestand naar de velden die het dossier krijgt.
 *
 * Een platte afbeelding, meer niet — maar wel de plek waar de twee bronnen bij
 * elkaar komen: wat de behandelaar heeft ingevuld wint, en wat hij niet heeft
 * aangeraakt komt uit de lezing van EVA. Dat onderscheid is de reden dat dit een
 * eigen functie is en geen object halverwege een klikafhandelaar.
 *
 * Dezelfde uitkomst gaat naar de proef én naar het aanmaken. Dat moet zo blijven:
 * zou de proef iets anders samenstellen dan wat er wordt weggeschreven, dan toont
 * de voorvertoning een voorstel dat niet bestaat.
 */

import type { IntakeFase } from '@/lib/mailintake/types'

export interface AanmaakSchermToestand {
  /** De ruwe lezing van het model; levert de velden die niet op het scherm staan. */
  velden: Record<string, unknown>
  categorieen: { id: number; name: string }[]
  klantId: string | null
  klantNaam: string
  contactpersoonId: string | null
  objectId: string | null
  calculatorId: string
  projectOmschrijving: { scope: string; buitenScope: string; aandachtspunten: string }
  omschrijving: string
  straat: string
  huisnummer: string
  postcode: string
  stad: string
  adresBevestigd: boolean
  referentie: string
  vveCode: string
  categorieId: number | ''
  werkmaatschappijId: string
  deadline: string
  mandaat: string
  regie: boolean
  opmerkingen: string
  factuuradres: {
    naam: string | null
    straat: string | null
    postcode: string | null
    plaats: string | null
  } | null
  /** De eerste actie op het nieuwe dossier; zonder titel gebeurt er niets. */
  actie: { titel: string; medewerkerId: string; dagen: number }
  /** Waar het dossier terechtkomt: aanvraag, opdracht of servicedesk. */
  fase: IntakeFase
}

export function bouwVeldenVoorAanmaak(s: AanmaakSchermToestand) {
  const v = s.velden

  return {
    fase: s.fase,
    relatieId: s.klantId as string,
    contactpersoonId: s.contactpersoonId,
    objectId: s.objectId,
    calculatorId: s.calculatorId || null,

    // De drie delen van de omschrijving, zoals ze op het scherm staan.
    gevraagdeWerkzaamheden: s.projectOmschrijving.scope.trim() || null,
    buitenScope: s.projectOmschrijving.buitenScope.trim() || null,
    aandachtspunten: s.projectOmschrijving.aandachtspunten.trim() || null,

    omschrijving: s.omschrijving.trim(),
    klantNaam: s.klantNaam,
    // Deze drie komen van de gekozen contactpersoon en niet uit de mail; ze worden
    // hier bewust leeg gelaten zodat een oude waarde uit de lezing niet meelift.
    contactpersoonNaam: null,
    contactpersoonEmail: null,
    contactpersoonTelefoon: null,

    werkadresStraat: s.straat,
    werkadresHuisnummer: s.huisnummer,
    werkadresPostcode: s.postcode,
    werkadresStad: s.stad,
    adresBevestigd: s.adresBevestigd,

    referentie: s.referentie.trim() || null,
    onzeReferentie: (v.onze_offerte_referentie as string | null) ?? null,
    vveCode: s.vveCode.trim() || null,
    bouw7CategorieId: s.categorieId === '' ? null : Number(s.categorieId),
    categorieNaam: s.categorieen.find(c => c.id === s.categorieId)?.name ?? null,
    werkmaatschappijId: s.werkmaatschappijId || null,

    aanvraagdatum: (v.aanvraagdatum as string | null) ?? null,
    deadline: s.deadline || null,
    opdrachtdatum: (v.opdrachtdatum as string | null) ?? null,
    opdrachtReferentie: (v.opdracht_referentie as string | null) ?? null,

    // Komma als decimaalteken: dat is wat mensen intikken.
    mandaatBedrag: s.mandaat.trim() ? Number(s.mandaat.replace(',', '.')) : null,
    regie: s.regie,
    regieAanwijzing: (v.regie_aanwijzing as string | null) ?? null,
    factuuradres: s.factuuradres,

    klantOpmerkingen: (v.klant_opmerkingen as string | null) ?? null,
    bedragExclBtw: (v.bedrag_excl_btw as number | null) ?? null,
    spoed: Boolean(v.spoed),
    opmerkingen: s.opmerkingen.trim() || null,
    meerdereWerkadressen: false,
    vertrouwen: {},

    // Zonder titel gebeurt er niets. Een lege eigenaar betekent "dezelfde als de
    // calculator"; dat wordt bij het aanmaken ingevuld.
    actie: s.actie.titel.trim()
      ? {
          titel: s.actie.titel.trim(),
          medewerkerId: s.actie.medewerkerId || null,
          dagen: s.actie.dagen,
        }
      : null,
  }
}
