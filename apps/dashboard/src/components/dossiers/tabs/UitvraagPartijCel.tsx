'use client'

/**
 * De partijkolom van de tab Uitvraag: naam (met link naar de relatie), soort en waarschuwingen,
 * en bij een uitvraag vanuit de calculatie het label "Rekent mee" en de link naar de offerte-pdf.
 */

import Link from 'next/link'
import { uitvraagSoortLabels } from '@everts/database'
import { Badge } from '@/components/ui'
import type { UitvraagView } from '@/lib/dossiers/uitvragen'

export default function UitvraagPartijCel({ rij }: { rij: UitvraagView }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1">
        {rij.relatie_id ? (
          <Link href={`/relaties/${rij.relatie_id}`} className="truncate text-neutral-800 hover:underline">
            {rij.partij_naam}
          </Link>
        ) : (
          <span className="truncate text-neutral-800">{rij.partij_naam}</span>
        )}
        {rij.rekent_mee && (
          <Badge tone="success" size="sm" className="shrink-0" title="De calculatie rekent met deze partij (nog geen gunning)">
            Rekent mee
          </Badge>
        )}
      </div>
      <span className="text-[11px] text-neutral-400">
        {uitvraagSoortLabels[rij.soort]}
        {rij.partij_inactief && <span className="text-warning-600"> · inactief</span>}
        {!rij.partij_email && !rij.laatst_gemaild_naar?.length && (
          <span className="text-warning-600"> · geen e-mailadres</span>
        )}
        {rij.offerte_bestand_url && (
          <>
            {' · '}
            <a
              href={rij.offerte_bestand_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
              title={rij.offerte_bestand_naam ?? 'Ontvangen offerte'}
            >
              pdf
            </a>
          </>
        )}
      </span>
    </div>
  )
}
