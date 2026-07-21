import React from 'react'
import Link from 'next/link'

/**
 * Horizontaal scrollbare sub-tab-strip binnen een mobiel dossier. Vijf tabs;
 * de actieve krijgt de merk-onderstreping. Server-component: de actieve tab
 * wordt als prop meegegeven (uit de route-`[tab]`).
 */
export const DOSSIER_TABS = [
  { key: 'informatie', label: 'Info' },
  { key: 'planning', label: 'Planning' },
  { key: 'voortgang', label: 'Voortgang' },
  // Houtrot verschijnt alleen als de dossier-toggle `houtrot_registreren` aanstaat
  // (zelfde patroon als VCA op de desktop, zie TAB_TOGGLE_GATES).
  { key: 'houtrot', label: 'Houtrot' },
  { key: 'formulieren', label: 'Formulieren' },
  { key: 'bestanden', label: 'Bestanden' },
] as const

export type DossierTabKey = (typeof DOSSIER_TABS)[number]['key']

export default function DossierTabStrip({
  id, active, houtrotAan = false,
}: {
  id: string
  active: DossierTabKey
  houtrotAan?: boolean
}) {
  const tabs = DOSSIER_TABS.filter(t => t.key !== 'houtrot' || houtrotAan)

  return (
    <div
      style={{
        display: 'flex', gap: 4, overflowX: 'auto', padding: '0 12px',
        borderBottom: '1px solid #e3e8ea', background: '#fff',
        position: 'sticky', top: 0, zIndex: 5,
        scrollbarWidth: 'none',
        // LET OP — niet weghalen. Deze strook is een flex-item in de verticale
        // kolom van MobielLayout. Door `overflow-x: auto` valt zijn `min-height:
        // auto` terug op 0, dus zonder deze regel drukt de browser hem plat tot
        // 1px (alleen de rand) zodra de tab-inhoud hoger is dan het scherm — de
        // sub-tabs zijn dan onvindbaar, terwijl de kopbalk blijft staan.
        flexShrink: 0,
      }}
    >
      {tabs.map(({ key, label }) => {
        const isActief = key === active
        return (
          <Link
            key={key}
            href={`/m/dossiers/${id}/${key}`}
            style={{
              flexShrink: 0,
              padding: '13px 12px 11px',
              fontSize: 13,
              fontWeight: isActief ? 700 : 500,
              color: isActief ? '#009439' : '#6b757c',
              borderBottom: `2px solid ${isActief ? '#009439' : 'transparent'}`,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
