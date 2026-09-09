/**
 * Parser voor de ULU Cartracker parking-export als CSV.
 *
 * De dagelijkse export die ULU mailt is CSV; de handmatige download uit het
 * ULU-dashboard is xlsx. Beide leveren dezelfde kolommen, en beide lopen na het
 * uitlezen door dezelfde veldinterpretatie (`ulu-parking-velden.ts`).
 *
 * De tekst komt hier al gedecodeerd binnen (string, geen Buffer): het omzetten
 * van Windows-1252 gebeurt in de app, die `iconv-lite` al heeft. Dit package
 * hoeft daar dan geen afhankelijkheid voor te krijgen.
 */

import * as XLSX from 'xlsx'
import {
  rijenNaarParkingResultaat,
  type ParsedUluParkingResult,
  type RawRow,
} from './ulu-parking-velden'

/**
 * Bepaalt het scheidingsteken aan de hand van de kopregel.
 *
 * Een Nederlandse export gebruikt `;` (want de komma is het decimaalteken), maar
 * een export met Engelse regionale instellingen gebruikt `,`. Tellen op de
 * kopregel is betrouwbaarder dan op een datarij: kopteksten bevatten geen
 * bedragen en dus geen decimaaltekens.
 */
export function bepaalScheidingsteken(tekst: string): ';' | ',' | '\t' {
  const kop = tekst.split(/\r?\n/).find((r) => r.trim().length > 0) ?? ''
  const tel = (teken: string) => kop.split(teken).length - 1
  const puntkomma = tel(';')
  const tab = tel('\t')
  const komma = tel(',')
  if (puntkomma >= komma && puntkomma >= tab && puntkomma > 0) return ';'
  if (tab > komma && tab > 0) return '\t'
  return ','
}

/**
 * ULU laat elke datarij met spaties beginnen:
 *
 *     Parkeerlocatie,Naam voertuig,Kenteken,...
 *       "7106 Burggravenlaan, Leiden",Peugeot 3008,P-355-JG,...
 *
 * Een CSV-lezer beschouwt een aanhalingsteken alleen als veldbegrenzing wanneer
 * het direct achter het scheidingsteken staat. Door die twee spaties telt de
 * quote niet, wordt de komma bínnen de locatie als scheiding gelezen, en schuift
 * de hele rij een kolom op: het kenteken wordt dan de voertuignaam. Alle 35
 * rijen van de eerste echte export sneuvelden hierop.
 *
 * Vandaar dat we per regel de leidende witruimte weghalen. Alleen aan het begin
 * van de regel — spaties binnen een veld ("Mazda ") blijven staan.
 */
function haalLeidendeWitruimteWeg(tekst: string): string {
  return tekst
    .split(/\r?\n/)
    .map((regel) => regel.replace(/^[ \t]+/, ''))
    .join('\n')
}

export function parseUluParkingCsv(tekst: string): ParsedUluParkingResult {
  const schoon = haalLeidendeWitruimteWeg(tekst.replace(/^﻿/, '')) // BOM van een Excel-export
  if (!schoon.trim()) {
    return { rows: [], errors: [{ row: 1, error: 'Leeg bestand.' }], periode: { start: null, eind: null } }
  }

  // `raw: true` houdt alle cellen als tekst. Dat is hier gewenst: SheetJS' eigen
  // datum- en getalherkenning gaat uit van Amerikaanse notatie en zou een NL-datum
  // (08-09-2026) of een bedrag met komma verkeerd interpreteren. De velden-module
  // leest de tekst zelf, mét de juiste tijdzone en het juiste decimaalteken.
  const workbook = XLSX.read(schoon, {
    type: 'string',
    raw: true,
    FS: bepaalScheidingsteken(schoon),
  })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) {
    return { rows: [], errors: [{ row: 1, error: 'Geen leesbare inhoud.' }], periode: { start: null, eind: null } }
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null })
  return rijenNaarParkingResultaat(rows)
}
