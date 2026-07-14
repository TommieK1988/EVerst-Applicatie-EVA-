/**
 * De ladder van het Bouw7-maatwerkveld "Offerte Sub-status" (`caOfferteSubstatus`, id 20987) ⇄
 * de EVA-substatussen. Eén dropdown op projectniveau die zowel de aanvraag- (01–06) als de
 * offerte-fase (07–13) dekt; de waarde in de API is de letterlijke labelstring.
 *
 * Dit veld is de **gedeelde bron** met de tweede app op Bouw7: die leest en schrijft dezelfde kolom.
 * Elke substatus die EVA in de aanvraag- of offertefase kan zetten heeft hier een label, zodat een
 * wijziging in EVA het maatwerkveld altijd vult.
 *
 * Deze module is bewust puur (geen API-/DB-imports), zodat zowel de lees- (`sync.ts`) als de
 * schrijfkant (`substatus-attr.ts`) hem kan gebruiken zonder importcyclus — zelfde opzet als
 * `status-map.ts` voor de opdracht-fase. Houd deze tabel leidend; niet dupliceren.
 */

import type { AanvraagSubstatus, OfferteSubstatus } from '@everts/database'

export type SubstatusSectie = 'aanvraag' | 'offerte'

/**
 * De dertien dropdownwaarden in Bouw7-volgorde, met de EVA-substatus per fase.
 *
 * De meeste labels horen bij precies één fase. Drie zijn **fase-overstijgend**, omdat EVA ze in
 * beide fases kent: "12. Verloren" (aanvraag `afgewezen` / offerte `verloren`) en "13. Vervallen"
 * (beide `vervallen`). Voor die labels beslist de fase waarin het dossier al staat — zie
 * `bouw7SubstatusNaarEva`. "07. Verzonden" staat bewust alleen als offerte: een aanvraag die op
 * verzonden gaat, promoveert in EVA direct naar de offertefase (DB-trigger).
 */
const LADDER: {
  label: string
  aanvraag?: AanvraagSubstatus
  offerte?: OfferteSubstatus
}[] = [
  { label: '01. Nieuw',                 aanvraag: 'nieuw' },
  { label: '02. Inlezen aanvraag',      aanvraag: 'inlezen_aanvraag' },
  { label: '03. Werkopname',            aanvraag: 'werkopname' },
  { label: '04. Uitwerken begroting',   aanvraag: 'uitwerken_begroting' },
  { label: '05. Controle begroting',    aanvraag: 'controle_begroting' },
  { label: '06. Offerte gereed',        aanvraag: 'offerte_gereed' },
  { label: '07. Verzonden',                                     offerte: 'verzonden' },
  { label: '08. Nabellen',                                      offerte: 'nabellen' },
  { label: '09. In behandeling',                                offerte: 'in_behandeling' },
  { label: '10. Mondelinge toezegging',                         offerte: 'mondelinge_toezegging' },
  { label: '11. Gewonnen',                                      offerte: 'gewonnen' },
  { label: '12. Verloren',              aanvraag: 'afgewezen',  offerte: 'verloren' },
  { label: '13. Vervallen',             aanvraag: 'vervallen',  offerte: 'vervallen' },
]

/** Statusvelden zoals ze op het dossier landen wanneer het maatwerkveld leidend is. */
export type SubstatusUitBouw7 = {
  hoofdstatus: SubstatusSectie
  aanvraag_substatus: AanvraagSubstatus | null
  offerte_substatus: OfferteSubstatus | null
}

/**
 * Bouw7-label → EVA-statusvelden. Matcht op het nummerprefix (`01.`–`13.`), zodat een cosmetische
 * hernoeming van een dropdownwaarde in Bouw7 de koppeling niet breekt. `null` bij een leeg of
 * onbekend label; de aanroeper valt dan terug op de oude afleiding uit project-/offertestatus.
 *
 * `huidigeFase` is de fase waarin het dossier nu in EVA staat. Die beslist bij de fase-overstijgende
 * labels (Verloren/Vervallen): een afgewezen **aanvraag** blijft zo op de Aanvragen-tab staan in
 * plaats van naar Offertes te springen. Zonder `huidigeFase` valt zo'n label terug op de offertefase.
 */
export function bouw7SubstatusNaarEva(
  raw: string | null | undefined,
  huidigeFase?: SubstatusSectie | null,
): SubstatusUitBouw7 | null {
  const label = (raw ?? '').trim()
  if (!label) return null

  const prefix = label.slice(0, 3) // "07." uit "07. Verzonden"
  const hit = LADDER.find((l) => l.label.startsWith(prefix)) ?? LADDER.find((l) => l.label === label)
  if (!hit) return null

  // Kent dit label beide fases, dan blijft het dossier waar het staat; anders bepaalt het label zelf.
  const blijftAanvraag = hit.aanvraag != null && (hit.offerte == null || huidigeFase === 'aanvraag')

  return blijftAanvraag
    ? { hoofdstatus: 'aanvraag', aanvraag_substatus: hit.aanvraag!, offerte_substatus: null }
    : { hoofdstatus: 'offerte',  aanvraag_substatus: null,          offerte_substatus: hit.offerte! }
}

/**
 * EVA-substatus → Bouw7-label. Elke aanvraag- en offerte-substatus heeft een label, dus een
 * wijziging in EVA vult het maatwerkveld altijd. `null` alleen bij een onbekende waarde.
 */
export function evaSubstatusNaarBouw7(sectie: SubstatusSectie, substatus: string): string | null {
  return LADDER.find((l) => l[sectie] === substatus)?.label ?? null
}
