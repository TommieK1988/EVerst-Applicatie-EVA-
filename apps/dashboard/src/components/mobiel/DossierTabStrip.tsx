import React from 'react'
import Link from 'next/link'
import { metTerug } from '@/lib/mobiel/terug'
import { getAppVertaler } from '@/i18n/server'

/**
 * Horizontaal scrollbare sub-tab-strip binnen een mobiel dossier. Vijf tabs;
 * de actieve krijgt de merk-onderstreping. Server-component: de actieve tab
 * wordt als prop meegegeven (uit de route-`[tab]`). De tabnamen staan in
 * `dossiers.tab.<key>`.
 */
export const DOSSIER_TABS = [
  { key: 'informatie' },
  // Planning en Voortgang gaan over uitvoering en verschijnen alleen bij een opdracht of een
  // servicedeskbon; op een aanvraag of offerte bestaan er nog geen activiteiten of
  // bewakingscodes en waren die tabs dus altijd leeg.
  { key: 'planning' },
  // Werkplan hoort bij een opdracht, net als op de desktop (OPDRACHT_TABS).
  { key: 'werkplan' },
  { key: 'voortgang' },
  // Houtrot verschijnt alleen als de dossier-toggle `houtrot_registreren` aanstaat
  // (zelfde patroon als VCA op de desktop, zie TAB_TOGGLE_GATES).
  { key: 'houtrot' },
  // Opname verschijnt alleen met de dossier-toggle `mutatie_opname`. Anders dan Houtrot óók bij
  // een aanvraag: de mutatie-opname gaat juist vooraf aan de offerte.
  { key: 'opname' },
  // Oplevering is Fase 9 en hoort dus bij een opdracht; op de desktop staat hij daarom in
  // OPDRACHT_TABS en niet bij aanvragen of servicedesk. Zelfde regel hier.
  { key: 'oplevering' },
  { key: 'formulieren' },
  { key: 'bestanden' },
] as const

export type DossierTabKey = (typeof DOSSIER_TABS)[number]['key']

export default async function DossierTabStrip({
  id, active, houtrotAan = false, opnameAan = false, isOpdracht = false,
  isUitvoering = false, isServicedesk = false, terug = null,
}: {
  id: string
  active: DossierTabKey
  houtrotAan?: boolean
  opnameAan?: boolean
  isOpdracht?: boolean
  /** Opdracht of servicedeskbon — draagt Planning en Voortgang. */
  isUitvoering?: boolean
  /**
   * Servicedeskbon: geen Voortgang en geen Formulieren. Bij een bon bewaakt niemand een % gereed
   * per code, en het afronden gaat via "Bon gereed melden" op de Info-tab.
   */
  isServicedesk?: boolean
  /**
   * Waar de terugknop van dit dossier heen wijst. Moet mee in elke tab-link: zonder dat ben
   * je na één tabwissel je herkomst kwijt en val je terug op de dossierlijst.
   */
  terug?: string | null
}) {
  const t = await getAppVertaler('dossiers')
  const tabs = DOSSIER_TABS
    .filter(t => (t.key !== 'planning' && t.key !== 'voortgang') || isUitvoering)
    .filter(t => t.key !== 'houtrot' || houtrotAan)
    .filter(t => t.key !== 'opname' || opnameAan)
    .filter(t => (t.key !== 'oplevering' && t.key !== 'werkplan') || isOpdracht)
    .filter(t => !isServicedesk || (t.key !== 'voortgang' && t.key !== 'formulieren'))

  return (
    <div
      style={{
        display: 'flex', gap: 4, overflowX: 'auto', padding: '0 12px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)',
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
      {tabs.map(({ key }) => {
        const isActief = key === active
        return (
          <Link
            key={key}
            href={metTerug(`/m/dossiers/${id}/${key}`, terug)}
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
            {t(`tab.${key}`)}
          </Link>
        )
      })}
    </div>
  )
}
