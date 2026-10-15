import type { KolomConfig } from '@everts/database/platform-types'

// ─── Kolom definities ─────────────────────────────────────────────────────────

export type ColId =
  'kostengroep' | 'omschrijving' | 'normen' | 'omschr' | 'code' | 'aant' | 'eenh' | 'stelpost' | 'verrekenbaar' | 'markeer' |
  'uur_eenh' | 'min_eenh' | 'tarief_ab' | 'bedrag_ab' |
  'prijs_mt' | 'bedrag_mt' | 'prijs_oa' | 'bedrag_oa' |
  'tot_uren' |
  'kp_eenh' | 'tot_kp' | 'opslag_pct' | 'vp_eenh' | 'tot_vp' |
  'btw_pct' | 'acties' |
  /** Vinkjeskolom: altijd vooraan, hoort niet bij een kolomindeling (zie SELECTIE_COL). */
  'selectie'

export interface ColDef {
  id: ColId; label: string; title?: string
  dw: number; minW: number; align: 'left' | 'right' | 'center'
  thCls?: string; tdCls?: string
  thStyle?: React.CSSProperties; tdStyle?: React.CSSProperties
}

export const COL_DEFS: ColDef[] = [
  { id: 'kostengroep',  label: 'Kostengroep',  dw: 100, minW: 60,  align: 'left' },
  { id: 'omschrijving', label: 'Omschrijving', dw: 320, minW: 100, align: 'left' },
  // Twee vaste knoppen naast de omschrijving: normen en werkomschrijving open/dicht.
  { id: 'normen',       label: 'Norm', title: 'Normen tonen of verbergen (Ctrl+Enter)', dw: 52, minW: 44, align: 'center' },
  { id: 'omschr',       label: '¶', title: 'Werkomschrijving tonen of verbergen (Ctrl+Shift+Enter)', dw: 40, minW: 36, align: 'center' },
  { id: 'code',         label: 'Code', title: 'Bestekscode uit de meetstaat', dw: 56, minW: 40, align: 'left' },
  { id: 'aant',         label: 'Aant.',        dw: 56,  minW: 40,  align: 'right' },
  { id: 'eenh',         label: 'Eenh.',        dw: 44,  minW: 36,  align: 'left' },
  { id: 'stelpost',     label: 'STP', title: 'Stelpost (provisorische som)', dw: 32, minW: 28, align: 'center' },
  { id: 'verrekenbaar', label: 'VRR', title: 'Verrekenbaar (wordt apart getoond in offerte)', dw: 32, minW: 28, align: 'center' },
  { id: 'markeer',      label: '⚑', title: 'Markeren met interne opmerking (Ctrl+Alt+Enter)', dw: 32, minW: 28, align: 'center' },
  { id: 'uur_eenh',  label: 'Uur/e.',    dw: 56,  minW: 40, align: 'right', thStyle: { color: '#1f6feb' } },
  { id: 'min_eenh',  label: 'Min/e.',    dw: 56,  minW: 40, align: 'right', thStyle: { color: '#1f6feb' } },
  { id: 'tarief_ab', label: 'Tarief AB', dw: 64,  minW: 48, align: 'right', thStyle: { color: '#1f6feb' } },
  { id: 'bedrag_ab', label: 'Bedrag AB', dw: 76,  minW: 56, align: 'right', thStyle: { color: '#1f6feb' } },
  { id: 'prijs_mt',  label: 'Prijs MA',  dw: 68,  minW: 48, align: 'right', thStyle: { color: '#c2185b' } },
  { id: 'bedrag_mt', label: 'Bedrag MA', dw: 76,  minW: 56, align: 'right', thStyle: { color: '#c2185b' } },
  { id: 'prijs_oa',  label: 'Prijs OA',  dw: 68,  minW: 48, align: 'right', thStyle: { color: '#7b1fa2' } },
  { id: 'bedrag_oa', label: 'Bedrag OA', dw: 76,  minW: 56, align: 'right', thStyle: { color: '#7b1fa2' } },
  { id: 'tot_uren',  label: 'Tot. Uren', dw: 64,  minW: 48, align: 'right', thStyle: { color: '#1f6feb' } },
  { id: 'kp_eenh',   label: 'KP/e.',    dw: 68,  minW: 48, align: 'right', thStyle: { color: '#009439' } },
  { id: 'tot_kp',    label: 'Tot. KP',  dw: 80,  minW: 60, align: 'right', thStyle: { color: '#009439' } },
  { id: 'opslag_pct',label: 'Opsl.%',   dw: 52,  minW: 44, align: 'right', thStyle: { color: '#009439' } },
  { id: 'vp_eenh',   label: 'VP/e.',    dw: 68,  minW: 48, align: 'right', thStyle: { color: '#057a5c' } },
  { id: 'tot_vp',    label: 'Tot. VP',  dw: 80,  minW: 60, align: 'right', thStyle: { color: '#057a5c' } },
  { id: 'btw_pct',   label: 'BTW',     dw: 96,  minW: 64, align: 'right', thStyle: { color: '#b85a00' } },
  { id: 'acties',    label: '',         dw: 28,  minW: 28, align: 'center' },
]

/**
 * Inspringing per groepsniveau (px) — puur visueel, zodat de nesting in het rekenblad
 * af te lezen is. Groepen herordenen doe je in de structuurboom, niet hier.
 */
export const NIVEAU_INSPRING = 24

/** Regelvelden die alleen tekst zijn: wijzigen verandert geen bedrag. */
export const TEKSTVELDEN = new Set(['omschrijving', 'werkomschrijving', 'werkomschrijving_afbeeldingen', 'opmerking'])

/**
 * De vinkjeskolom staat bewust niet in COL_DEFS: hij hoort niet in een opgeslagen
 * kolomindeling, is niet te verbergen of te verslepen, en staat altijd vooraan.
 * Het grid zet hem pas bij het tekenen voor de zichtbare kolommen.
 */
export const SELECTIE_COL: ColDef = { id: 'selectie', label: '', dw: 40, minW: 40, align: 'center' }

export const COL_MAP     = Object.fromEntries([...COL_DEFS, SELECTIE_COL].map(c => [c.id, c])) as Record<ColId, ColDef>
export const DEFAULT_ORDER  = COL_DEFS.map(c => c.id) as ColId[]
export const DEFAULT_WIDTHS = Object.fromEntries([...COL_DEFS, SELECTIE_COL].map(c => [c.id, c.dw])) as Record<ColId, number>

/** Kostensoort per kolom: tussen twee soorten staat een dunne scheidingslijn. */
const KOLOM_SOORT: Partial<Record<ColId, string>> = {
  uur_eenh: 'arbeid', min_eenh: 'arbeid', tarief_ab: 'arbeid', bedrag_ab: 'arbeid',
  prijs_mt: 'materiaal', bedrag_mt: 'materiaal',
  prijs_oa: 'oa', bedrag_oa: 'oa',
  tot_uren: 'uren',
  kp_eenh: 'kostprijs', tot_kp: 'kostprijs', opslag_pct: 'kostprijs',
  vp_eenh: 'verkoop', tot_vp: 'verkoop',
  btw_pct: 'btw',
}

/**
 * Kolommen waar links een scheidingslijn hoort: daar begint een andere kostensoort
 * dan in de kolom ervoor. Volgt de werkelijke volgorde, dus ook na verslepen.
 */
export function groepsGrenzen(colOrder: ColId[]): Set<ColId> {
  const uit = new Set<ColId>()
  colOrder.forEach((id, i) => {
    if (i === 0 || id === 'acties') return
    const soort = KOLOM_SOORT[id], vorige = KOLOM_SOORT[colOrder[i - 1]]
    if (soort !== vorige && (soort || vorige)) uit.add(id)
  })
  return uit
}

/** Scheidingslijn als inset-schaduw: verandert geen breedte en botst niet met randen. */
export const GRENS_STIJL: React.CSSProperties = { boxShadow: 'inset 1px 0 0 #e2e8f0' }

// ─── Kolom-layouts (per gebruiker, tabel gebruiker_layouts, scherm 'evc_calculatie') ──
export const LAYOUT_SCHERM = 'evc_calculatie'
/**
 * Eigen kolomnamen staan los van de layouts: ze horen bij de gebruiker, niet bij
 * een bepaalde kolomindeling. Daarom één vaste rij per gebruiker onder een eigen
 * scherm-sleutel, die direct wordt bewaard zodra je een kop hernoemt.
 */
export const NAMEN_SCHERM = 'evc_calculatie_kolomnamen'
export const NON_HIDEABLE_COLS: ColId[] = ['omschrijving', 'acties']

/** Huidige gridstaat → KolomConfig[] voor opslag. */
export function stateNaarLayout(order: ColId[], hidden: Set<ColId>, widths: Record<ColId, number>): KolomConfig[] {
  return order.map((id, i) => ({ key: id, zichtbaar: !hidden.has(id), volgorde: i, breedte: widths[id] }))
}

/** Opgeslagen KolomConfig[] → gridstaat, tolerant voor toegevoegde/verwijderde kolommen. */
export function layoutNaarState(cfg: KolomConfig[]): { colOrder: ColId[]; hiddenCols: Set<ColId>; colWidths: Record<ColId, number> } {
  const geldig = cfg.filter(c => (c.key as ColId) in COL_MAP)
  const gesorteerd = [...geldig].sort((a, b) => a.volgorde - b.volgorde).map(c => c.key as ColId)
  // Ontbrekende kolommen (nieuw sinds opslaan) zichtbaar toevoegen, direct achter hun
  // standaard-buurman: een nieuwe kolom als Code hoort naast Omschrijving, niet achteraan.
  const colOrder = [...gesorteerd]
  DEFAULT_ORDER.forEach((id, i) => {
    if (colOrder.includes(id)) return
    const voorganger = i > 0 ? colOrder.indexOf(DEFAULT_ORDER[i - 1]) : -1
    colOrder.splice(voorganger + 1, 0, id)
  })
  const hiddenCols = new Set<ColId>(
    geldig.filter(c => !c.zichtbaar).map(c => c.key as ColId).filter(id => !NON_HIDEABLE_COLS.includes(id)),
  )
  const colWidths: Record<ColId, number> = { ...DEFAULT_WIDTHS }
  for (const c of geldig) {
    if (typeof c.breedte === 'number') {
      const min = COL_MAP[c.key as ColId]?.minW ?? 28
      colWidths[c.key as ColId] = Math.max(min, c.breedte)
    }
  }
  return { colOrder, hiddenCols, colWidths }
}
