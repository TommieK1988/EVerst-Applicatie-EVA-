'use client'

/**
 * Eén dossierregel in het klantbeeld: titel, nummer, adres, status en bedrag.
 *
 * Linkt naar de **mobiele** dossierroute en niet naar `RelatieDossier.href` — dat is de
 * desktoproute (`/opdrachten/<id>`), en daar wil je vanaf `/m` niet belanden. Is `href` leeg,
 * dan weet de leeslaag geen zeker segment; dan wordt het een gewone regel zonder link in
 * plaats van een gok die op een foutpagina uitkomt.
 */

import React from 'react'
import Link from 'next/link'
import {
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_ALLE_STATUSSEN,
} from '@/components/dossiers/types'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import { GRIJS, TEKST, lijstRij } from './stijl'

const ALLE_STATUSSEN = [
  ...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN, ...SERVICEDESK_ALLE_STATUSSEN,
]

/**
 * Label en kleur bij de actieve substatus.
 *
 * Eigen variant van `components/mobiel/dossier-status.ts`: die verwacht een volledige
 * `Dossier`-rij, en het klantbeeld heeft alleen de vier statuskolommen. De kleuren zijn
 * gelijkgehouden zodat een dossier hier niet anders oplicht dan in de dossierlijst.
 */
function statusVan(d: RelatieDossier): { label: string; kleur: string } {
  const sleutel =
    d.servicedesk_substatus
    ?? (d.hoofdstatus === 'opdracht' ? d.opdracht_substatus
      : d.hoofdstatus === 'offerte' ? d.offerte_substatus
      : null)

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
  dossier, toonBedrag = false, toonJaar = false,
}: {
  dossier: RelatieDossier
  /** Bij uitgevoerd werk is het gefactureerde bedrag het interessantste getal. */
  toonBedrag?: boolean
  toonJaar?: boolean
}) {
  const { label, kleur } = statusVan(dossier)

  const inhoud = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: TEKST, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {dossier.titel}
        </span>
        {toonBedrag && dossier.bedrag != null && dossier.bedrag > 0 && (
          <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: TEKST }}>
            {euro(dossier.bedrag)}
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

  if (!dossier.href) {
    return <div style={{ ...lijstRij, cursor: 'default' }}>{inhoud}</div>
  }
  return (
    <Link href={`/m/dossiers/${dossier.id}/informatie`} style={lijstRij}>
      {inhoud}
    </Link>
  )
}
