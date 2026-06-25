import type { DossierRij } from '@/components/dossiers/types'
import type { FormField } from './types'

/**
 * Variabelen die als "Dossier-gegeven"-veld in een formulier kunnen worden
 * opgenomen. De waarde wordt bij het invullen automatisch (en alleen-lezen)
 * uit het gekoppelde dossier gehaald.
 */
export type DossierVariabele = {
  key: string
  label: string
  resolve: (d: DossierRij) => string
}

/** Format een ISO-datum (YYYY-MM-DD…) naar dd-mm-jjjj. Lege/ongeldige → ''. */
function formatDatum(iso: string | null): string {
  if (!iso) return ''
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

/** Format een bedrag in euro's (nl-NL). null → ''. */
function formatBedrag(n: number | null): string {
  if (n === null || n === undefined) return ''
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function samengesteldAdres(d: DossierRij): string {
  const straat = d.werkadres_straat ?? ''
  const pcStad = [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' ')
  return [straat, pcStad].filter(Boolean).join(', ')
}

export const DOSSIER_VARIABELEN: DossierVariabele[] = [
  { key: 'dossiernummer',           label: 'Dossiernummer',          resolve: d => d.dossiernummer ?? '' },
  { key: 'titel',                   label: 'Projecttitel',           resolve: d => d.titel ?? '' },
  { key: 'klant_naam',              label: 'Klant',                  resolve: d => d.klant_naam ?? '' },
  { key: 'referentie',              label: 'Referentie',             resolve: d => d.referentie ?? '' },
  { key: 'opdracht_referentie',     label: 'Opdracht-referentie',    resolve: d => d.opdracht_referentie ?? '' },
  { key: 'categorie',               label: 'Categorie',              resolve: d => d.categorie ?? '' },
  { key: 'werkadres',               label: 'Werkadres (volledig)',   resolve: samengesteldAdres },
  { key: 'werkadres_straat',        label: 'Werkadres — straat',     resolve: d => d.werkadres_straat ?? '' },
  { key: 'werkadres_postcode',      label: 'Werkadres — postcode',   resolve: d => d.werkadres_postcode ?? '' },
  { key: 'werkadres_stad',          label: 'Werkadres — plaats',     resolve: d => d.werkadres_stad ?? '' },
  { key: 'projectleider_naam',      label: 'Projectleider',          resolve: d => d.projectleider_naam ?? '' },
  { key: 'teamleider_naam',         label: 'Teamleider',             resolve: d => d.teamleider_naam ?? '' },
  { key: 'werkvoorbereider_naam',   label: 'Werkvoorbereider',       resolve: d => d.werkvoorbereider_naam ?? '' },
  { key: 'calculator_naam',         label: 'Calculator',             resolve: d => d.calculator_naam ?? '' },
  { key: 'uitvoerder_naam',         label: 'Uitvoerder',             resolve: d => d.uitvoerder_naam ?? '' },
  { key: 'contactpersoon_naam',     label: 'Contactpersoon',         resolve: d => d.contactpersoon_naam ?? '' },
  { key: 'contactpersoon_email',    label: 'Contactpersoon — e-mail', resolve: d => d.contactpersoon_email ?? '' },
  { key: 'contactpersoon_telefoon', label: 'Contactpersoon — telefoon', resolve: d => d.contactpersoon_telefoon ?? '' },
  { key: 'bedrag_excl_btw',         label: 'Bedrag (excl. btw)',     resolve: d => formatBedrag(d.bedrag_excl_btw) },
  { key: 'bedrag_incl_btw',         label: 'Bedrag (incl. btw)',     resolve: d => formatBedrag(d.bedrag_incl_btw) },
  { key: 'verwacht_startdatum',     label: 'Verwachte startdatum',   resolve: d => formatDatum(d.verwacht_startdatum) },
  { key: 'verwacht_einddatum',      label: 'Verwachte einddatum',    resolve: d => formatDatum(d.verwacht_einddatum) },
]

const VARIABELE_BY_KEY = new Map(DOSSIER_VARIABELEN.map(v => [v.key, v]))

export function dossierVariabeleLabel(key: string | undefined): string {
  if (!key) return '—'
  return VARIABELE_BY_KEY.get(key)?.label ?? key
}

/**
 * Loop (recursief, incl. sub-velden van herhalende secties) door het schema en
 * resolveer alle `dossier`-velden naar hun waarde uit het gekoppelde dossier.
 * Geeft een `{ [field.id]: waarde }`-map terug die als pre-fill kan dienen.
 */
export function resolveDossierVariabelen(
  fields: FormField[],
  dossier: DossierRij,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const loop = (list: FormField[]) => {
    for (const f of list) {
      if (f.type === 'dossier' && f.dossierVariabele) {
        const v = VARIABELE_BY_KEY.get(f.dossierVariabele)
        out[f.id] = v ? v.resolve(dossier) : ''
      }
      if (f.children?.length) loop(f.children)
    }
  }
  loop(fields)
  return out
}
