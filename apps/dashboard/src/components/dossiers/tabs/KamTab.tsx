import React from 'react'
import DossierSubTabs from '../DossierSubTabs'
import KwaliteitDeel from './kam/KwaliteitDeel'
import FormulierenDeel from './kam/FormulierenDeel'
import OpleveringTab from './OpleveringTab'
import type { DossierSectie } from '../types'

/**
 * KAM/VGM — kwaliteit, arbo en milieu op één tab.
 *
 * Bundelt drie onderdelen die eerder elk een eigen plek in de sidebar hadden: de
 * kwaliteitscontrole en VCA (voorheen de tab "VCA & Kwaliteit"), de oplevering, en de
 * formulier-inzendingen (voorheen de Formulieren-tab, die op de desktop nooit iets deed).
 *
 * De onderdelen wisselen via `?deel=` in plaats van client-state: Oplevering is een zwaar
 * client-eiland met eigen data, en dat hoort niet mee te laden zolang je naar de
 * kwaliteitscontrole kijkt.
 */
export const KAM_DELEN = ['kwaliteit', 'oplevering', 'formulieren'] as const
export type KamDeel = (typeof KAM_DELEN)[number]

/** Waar je landt zonder `?deel=`. */
export function standaardKamDeel(): KamDeel {
  return 'kwaliteit'
}

const LABELS: Record<KamDeel, string> = {
  kwaliteit:   'Kwaliteit & VCA',
  oplevering:  'Oplevering',
  formulieren: 'Formulieren',
}

export default async function KamTab({
  dossierId,
  sectie,
  deel,
  vcaAan,
}: {
  dossierId: string
  sectie: DossierSectie
  deel: KamDeel
  vcaAan: boolean
}) {
  // Servicedesk kent geen oplevering — daar zijn het er twee.
  const beschikbaar = KAM_DELEN.filter(d => d !== 'oplevering' || sectie === 'opdracht')
  const actief: KamDeel = beschikbaar.includes(deel) ? deel : 'kwaliteit'

  return (
    <>
      <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px) 0' }}>
        <DossierSubTabs
          delen={beschikbaar.map(d => ({ deel: d, label: LABELS[d], actief: d === actief }))}
        />
      </div>

      {actief === 'kwaliteit'   && <KwaliteitDeel dossierId={dossierId} vcaAan={vcaAan} />}
      {actief === 'oplevering'  && <OpleveringTab dossierId={dossierId} />}
      {actief === 'formulieren' && <FormulierenDeel dossierId={dossierId} />}
    </>
  )
}
