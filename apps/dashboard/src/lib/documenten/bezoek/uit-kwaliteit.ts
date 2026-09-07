/**
 * uit-kwaliteit.ts — een kwaliteitsronde als bezoekrapport.
 *
 * Zuivere remap van het bestaande `KwaliteitBlok`: `bouwKwaliteitBlok` blijft ongewijzigd en
 * doet al het reken- en laadwerk. Er verandert dus geen enkele query, en het bestaande
 * `kwaliteitsrapport`-sjabloon met `{kwaliteit.*}`-tags blijft gewoon werken — de
 * contextbouwer vult vanaf nu beide blokken.
 *
 * Wat een kwaliteitsronde níét kent: handtekeningen. Een ronde wordt niet ondertekend, dus
 * dat hoofdstuk verdwijnt vanzelf uit het sjabloon.
 */

import 'server-only'
import type { KwaliteitBlok } from '../kwaliteit-rapport'
import { knipInPaginas } from '../rapport-paginas'
import type { BezoekOpties } from '../bezoek-opties'
import {
  LEEG_BEZOEK_BLOK, LEGE_BEVINDING, BEZOEK_SOORT_LABELS, bezoekDisclaimer,
  type BezoekBlok, type BezoekBevinding, type Rij,
} from './contract'

const tekst = (v: unknown) => String(v ?? '')

export function kwaliteitNaarBezoek(blok: KwaliteitBlok, keuze: BezoekOpties): BezoekBlok {
  if (!blok.aanwezig) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }

  const bevindingen: BezoekBevinding[] = (blok.afwijkingen as Rij[]).map((a, i) => ({
    ...LEGE_BEVINDING,
    nummer: tekst(a.nummer),
    volgnummer: i + 1,
    // Een kwaliteitsafwijking heeft geen aparte titel; het controlepunt is het kortste
    // dat een lezer als kop herkent.
    titel: tekst(a.code) || tekst(a.discipline),
    omschrijving: tekst(a.omschrijving),
    omschrijving_kort: tekst(a.omschrijving_kort),
    locatie: tekst(a.locatie),
    groep: tekst(a.discipline),
    ernst: tekst(a.ernst),
    ernst_label: tekst(a.ernst),
    is_kritiek: a.kritiek === true,
    status: tekst(a.status),
    status_label: tekst(a.status),
    is_open: a.hersteld !== true,
    is_opgelost: a.hersteld === true,
    eis: tekst(a.eis),
    eis_kort: tekst(a.eis_kort),
    meting: tekst(a.meting),
    actie: tekst(a.actie),
    actie_kort: tekst(a.actie_kort),
    datum: tekst(a.datum),
    hersteldatum: tekst(a.hersteldatum),
    foto: keuze.toon_fotos ? tekst(a.foto) : '',
    heeft_foto: keuze.toon_fotos && !!a.foto,
    // De herstelfoto wordt in kwaliteit-rapport wél opgehaald maar nergens getoond;
    // hier landt hij als na-foto.
    foto_na: keuze.toon_fotos && keuze.toon_voor_na ? tekst(a.foto_na) : '',
    heeft_foto_na: keuze.toon_fotos && keuze.toon_voor_na && !!a.foto_na,
  }))

  const kengetallen: Rij[] = [
    { label: 'Beoordeelde controlepunten', waarde: blok.totaal_beoordeeld },
    { label: 'Voldoet aan de eis', waarde: blok.totaal_voldoet },
    { label: 'Voldoet niet', waarde: blok.totaal_voldoet_niet, is_negatief: true },
    { label: 'Waarvan kritiek', waarde: blok.aantal_kritiek, is_negatief: true },
    { label: 'Niet beoordeeld', waarde: blok.totaal_niet_beoordeeld },
    { label: 'Nader onderzoek', waarde: blok.totaal_nader_onderzoek },
    { label: 'Niet van toepassing', waarde: blok.totaal_nvt },
  ].filter(k => Number(k.waarde) > 0)

  const punten = keuze.toon_niet_beoordeeld
    ? blok.punten
    : blok.punten.filter(p => p.niet_beoordeeld !== true)

  return {
    ...LEEG_BEZOEK_BLOK,
    aanwezig: true,
    soort: 'kwaliteit',
    soort_label: BEZOEK_SOORT_LABELS.kwaliteit,
    titel: `${BEZOEK_SOORT_LABELS.kwaliteit} ${blok.inspectienummer}`.trim(),
    kenmerk: blok.inspectienummer,
    datum: blok.datum,
    tijd: blok.tijd,
    uitvoerder: blok.inspecteur,
    locatie: blok.gebied,
    werkzaamheden: blok.werkzaamheden,
    omstandigheden: blok.weer,
    inleiding: keuze.inleiding || STANDAARD_INLEIDING,
    samenvatting_regel: [blok.samenvatting_regel, blok.steekproef].filter(Boolean).join(' '),
    kengetallen,
    heeft_kengetallen: kengetallen.length > 0,
    alle_bevindingen: bevindingen,
    paginas: knipInPaginas(bevindingen, { perPagina: keuze.per_pagina, itemVeld: 'bevindingen' }),
    heeft_bevindingen: bevindingen.length > 0,
    aantal_bevindingen: bevindingen.length,
    aantal_open: bevindingen.filter(b => b.is_open).length,
    metingen: blok.metingen,
    heeft_metingen: blok.heeft_metingen,
    punten,
    heeft_punten: punten.length > 0,
    waarnemingen: keuze.toon_waarnemingen ? blok.waarnemingen : [],
    heeft_waarnemingen: keuze.toon_waarnemingen && blok.heeft_waarnemingen,
    opvolging: blok.opvolging,
    heeft_opvolging: blok.heeft_opvolging,
    opvolging_regel: blok.opvolging_regel,
    // Een kwaliteitsronde wordt niet ondertekend.
    handtekeningen: [],
    heeft_handtekeningen: false,
    opmerkingen: blok.algemene_opmerkingen,
    disclaimer: bezoekDisclaimer('kwaliteit'),
    per_pagina: keuze.per_pagina,
  }
}

const STANDAARD_INLEIDING =
  'Tijdens deze periodieke ronde zijn de op dat moment zichtbare, bereikbare en beoordeelbare '
  + 'werkzaamheden steekproefsgewijs gecontroleerd op technische uitvoering, duurzaamheid en '
  + 'esthetische eindkwaliteit. Vastgelegde punten worden binnen het project opgevolgd.'
