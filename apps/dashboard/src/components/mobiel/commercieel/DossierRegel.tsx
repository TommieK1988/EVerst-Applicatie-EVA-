'use client'

/**
 * Eén dossierregel in het klantbeeld: titel, nummer, adres, status en bedrag.
 *
 * Linkt naar de **mobiele** dossierroute en niet naar `RelatieDossier.href` — dat is de
 * desktoproute (`/opdrachten/<id>`), en daar wil je vanaf `/m` niet belanden. Is `href` leeg,
 * dan weet de leeslaag geen zeker segment; dan wordt het een gewone regel zonder link in
 * plaats van een gok die op een foutpagina uitkomt.
 *
 * `terugNaar` reist mee als `?terug=`: zonder dat wijst de terugknop op het dossier naar de
 * dossierlijst en ben je de klant kwijt die je aan de lijn had.
 */

import React from 'react'
import Link from 'next/link'
import {
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_ALLE_STATUSSEN,
} from '@/components/dossiers/types'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import { metTerug } from '@/lib/mobiel/terug'
import { GRIJS, GROEN, RAND, TEKST, lijstRij } from './stijl'

const ALLE_STATUSSEN = [
  ...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN, ...SERVICEDESK_ALLE_STATUSSEN,
]

/**
 * Label en kleur bij de actieve substatus.
 *
 * Eigen variant van `components/mobiel/dossier-status.ts`: die verwacht een volledige
 * `Dossier`-rij, en het klantbeeld heeft alleen de vier statuskolommen. De keuze van de
 * kolom en de kleuren zijn gelijkgehouden zodat een dossier hier niet anders oplicht dan in
 * de dossierlijst — inclusief de aanvraagkolom, anders draagt een afgewezen aanvraag de
 * grijze badge "Aanvraag" terwijl hij in de dossierlijst rood "Afgewezen" heet.
 */
function statusVan(d: RelatieDossier): { label: string; kleur: string } {
  const sleutel =
    d.servicedesk_substatus
    ?? (d.hoofdstatus === 'opdracht' ? d.opdracht_substatus
      : d.hoofdstatus === 'offerte' ? d.offerte_substatus
      : d.aanvraag_substatus)

  // Een afgesloten dossier zonder substatus: de trigger heeft 'gewonnen' weggeschreven, of
  // het is een oude import. "Afgerond" is dan eerlijker dan een lege badge.
  if (!sleutel) {
    return d.fase === 'afgesloten'
      ? { label: 'Afgerond', kleur: '#6b757c' }
      : { label: d.hoofdstatus === 'aanvraag' ? 'Aanvraag' : 'Lopend', kleur: '#6b757c' }
  }

  const label = ALLE_STATUSSEN.find(x => x.key === sleutel)?.label ?? sleutel
  const kleur =
    ['verloren', 'vervallen', 'afgewezen'].includes(sleutel) ? '#e8453b' :
    ['gewonnen', 'offerte_gereed', 'financieel_afgesloten'].includes(sleutel) ? '#009439' :
    ['verzonden', 'nabellen', 'in_behandeling', 'mondelinge_toezegging', 'onderhanden', 'uitvoering_gereed'].includes(sleutel) ? '#2e90fa' :
    '#6b757c'
  return { label, kleur }
}

const euro = (n: number): string =>
  n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function DossierRegel({
  dossier, toonBedrag = false, bedrag, toonJaar = false,
  terugNaar = null, pdfHref = null, pdfLabel = null,
}: {
  dossier: RelatieDossier
  /** Bij uitgevoerd werk is het gefactureerde bedrag het interessantste getal. */
  toonBedrag?: boolean
  /**
   * Bedrag dat in plaats van `dossier.bedrag` getoond wordt. Bij een offerte is dat het
   * offertebedrag excl. btw: gefactureerde omzet bestaat daar nog niet.
   */
  bedrag?: number | null
  toonJaar?: boolean
  /** Het scherm waar deze regel op staat; wordt de terugknop van het dossier. */
  terugNaar?: string | null
  /** Link naar de offerte-PDF; zonder link blijft de knop weg. */
  pdfHref?: string | null
  /**
   * Naam van het document op de knop. Bij een Bouw7-bestand is de keuze een beste gok op de
   * bestandsnaam, dus je hoort te zien wát je opent voordat je hem voor een klant openklapt.
   */
  pdfLabel?: string | null
}) {
  const { label, kleur } = statusVan(dossier)
  const teTonenBedrag = bedrag !== undefined ? bedrag : (toonBedrag ? dossier.bedrag : null)

  const inhoud = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: TEKST, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {dossier.titel}
        </span>
        {teTonenBedrag != null && teTonenBedrag > 0 && (
          <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: TEKST }}>
            {euro(teTonenBedrag)}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: kleur,
          padding: '2px 7px', borderRadius: 999,
        }}>
          {label}
        </span>
        {toonJaar && dossier.jaar && (
          <span style={{ fontSize: 12, color: GRIJS }}>{dossier.jaar}</span>
        )}
        {dossier.dossiernummer && (
          <span style={{ fontSize: 12, color: GRIJS }}>{dossier.dossiernummer}</span>
        )}
      </div>

      {dossier.adres && (
        <div style={{
          fontSize: 12.5, color: GRIJS, marginTop: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {dossier.adres}
        </div>
      )}
    </>
  )

  const dossierHref = dossier.href
    ? metTerug(`/m/dossiers/${dossier.id}/informatie`, terugNaar)
    : null

  if (!pdfHref) {
    if (!dossierHref) return <div style={{ ...lijstRij, cursor: 'default' }}>{inhoud}</div>
    return <Link href={dossierHref} style={lijstRij}>{inhoud}</Link>
  }

  // Met PDF-knop wordt de rij een kaartje met twee aparte doelen. De hele regel één grote link
  // maken kan hier niet: een <a> in een <a> is ongeldige HTML en de browser sluit de buitenste
  // dan vroegtijdig af, waarna de knop buiten de kaart valt.
  return (
    <div style={{ ...lijstRij, display: 'block', padding: 0, overflow: 'hidden' }}>
      {dossierHref ? (
        <Link href={dossierHref} style={{ display: 'block', padding: '13px 14px', textDecoration: 'none', color: TEKST }}>
          {inhoud}
        </Link>
      ) : (
        <div style={{ padding: '13px 14px' }}>{inhoud}</div>
      )}
      <a
        href={pdfHref}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '11px 14px', borderTop: `1px solid ${RAND}`,
          fontSize: 13.5, fontWeight: 700, color: GROEN, textDecoration: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pdfLabel || 'Offerte openen'}
        </span>
        <span style={{ flexShrink: 0, marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: GRIJS }}>PDF</span>
      </a>
    </div>
  )
}
