export { TEMPLATE_STANDAARD } from './standaard'
export { TEMPLATE_UITGEBREID } from './uitgebreid'
export { TEMPLATE_BEKNOPT } from './beknopt'

export const STANDAARD_TEMPLATES = [
  {
    id: 'standaard',
    naam: 'Standaard Zakelijke Offerte',
    beschrijving: 'Professionele offerte met voorblad, specificatie en voorwaarden. Kleur instelbaar.',
    template: () => import('./standaard').then(m => m.TEMPLATE_STANDAARD),
  },
  {
    id: 'uitgebreid',
    naam: 'Uitgebreide Calculatie Offerte',
    beschrijving: 'Volledige calculatie met kostprijs, uren en marges. Geschikt voor intern gebruik.',
    template: () => import('./uitgebreid').then(m => m.TEMPLATE_UITGEBREID),
  },
  {
    id: 'beknopt',
    naam: 'Beknopte Aanbieding',
    beschrijving: 'Compact overzicht per sectie. Geen detailregels, focus op prijs en voorwaarden.',
    template: () => import('./beknopt').then(m => m.TEMPLATE_BEKNOPT),
  },
] as const
