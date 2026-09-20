/**
 * Toets op de begin-filters van OverzichtTabel.
 *
 * Draaien: npx tsx scratch/toets-beginfilters.ts
 *
 * De vraag die dit beantwoordt: krijgt iemand die een scherm al eens heeft geopend een later
 * toegevoegd standaardfilter alsnog te zien, zonder dat het daarna elke keer terugkomt als hij
 * het zelf wegklikt? Zonder de markering `beginFilters` zou het eerste niet gebeuren (zijn
 * bewaarde lege filterlijst wint) of het tweede juist wél (het filter dringt zich elke keer op).
 *
 * Deze toets raakt geen database en geen netwerk — `werkstand.ts` is een pure module.
 */
import {
  standaardStand, standUitWerkstand, werkstandUitStand,
  type KolomBasis, type TabelStand,
} from '../apps/dashboard/src/components/overzicht/werkstand'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`${gelukt ? 'OK  ' : 'FOUT'}  ${naam}${detail ? `  — ${detail}` : ''}`)
}

const KOLOMMEN: KolomBasis[] = [
  { key: 'naam', filterType: 'tekst' },
  { key: 'status', filterType: 'select' },
]
const BEGIN = [{ id: 'status', value: ['Actief'] }]
const BEGIN_ID = JSON.stringify(BEGIN)

const filterVan = (stand: TabelStand | null) => JSON.stringify(stand?.columnFilters ?? null)

// 1. Nog nooit geopend: geen werkstand, dus de standaardstand geldt.
const vers = standaardStand(KOLOMMEN, undefined, BEGIN)
toets('verse gebruiker krijgt het standaardfilter', filterVan(vers) === JSON.stringify(BEGIN), filterVan(vers))

// 2. Oude werkstand zonder markering: het standaardfilter wordt één keer opgedrongen.
const oud = werkstandUitStand(standaardStand(KOLOMMEN), null)
const naOud = standUitWerkstand(oud, KOLOMMEN, vers, BEGIN_ID)
toets('bestaande gebruiker krijgt het alsnog', filterVan(naOud) === JSON.stringify(BEGIN), filterVan(naOud))

// 3. Die stand wordt bewaard mét markering; daarna telt weer wat de gebruiker zelf doet.
const bewaard = werkstandUitStand(naOud!, null, BEGIN_ID)
toets('de markering wordt meegeschreven', bewaard.beginFilters === BEGIN_ID, String(bewaard.beginFilters))

// 4. Gebruiker wist het filter bewust. Dat moet blijven staan, ook na herladen.
const gewist = werkstandUitStand({ ...naOud!, columnFilters: [] }, null, BEGIN_ID)
const naWissen = standUitWerkstand(gewist, KOLOMMEN, vers, BEGIN_ID)
toets('zelf gewist blijft gewist', filterVan(naWissen) === '[]', filterVan(naWissen))

// 5. Gebruiker kiest iets anders. Ook dat blijft staan.
const eigen = werkstandUitStand({ ...naOud!, columnFilters: [{ id: 'status', value: ['Inactief'] }] }, null, BEGIN_ID)
const naEigen = standUitWerkstand(eigen, KOLOMMEN, vers, BEGIN_ID)
toets('eigen keuze wint', filterVan(naEigen) === JSON.stringify([{ id: 'status', value: ['Inactief'] }]), filterVan(naEigen))

// 6. Schermen zonder begin-filters mogen hier niets van merken.
const zonder = standUitWerkstand(gewist, KOLOMMEN, standaardStand(KOLOMMEN))
toets('scherm zonder begin-filters ongemoeid', filterVan(zonder) === '[]', filterVan(zonder))

console.log(fouten === 0 ? '\nAlles goed' : `\n${fouten} fout(en)`)
process.exit(fouten === 0 ? 0 : 1)
