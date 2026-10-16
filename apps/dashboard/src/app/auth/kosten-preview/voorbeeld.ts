import type { KostenPost } from '@/lib/uren/onkosten-goedkeuring'

/**
 * Verzonnen kostenposten voor de voorbeeldpagina's (`/auth/kosten-preview` en
 * `/auth/app-taal-preview?kosten=1`). Alle standen van de goedkeuring zitten erin: bij jou als
 * projectleider, bij jou zonder project, bij een ander, goedgekeurd, afgekeurd en nog concept.
 */

const basis: Omit<KostenPost, 'id' | 'datum' | 'medewerkerNaam' | 'soort' | 'bedrag'> = {
  weekStart: '2026-10-12', medewerkerId: 'mw', vervoermiddel: null, km: null, omschrijving: null,
  bonUrl: null, dossierId: 'd1', project: '20261.00412 · Kerkstraat 12, Zwolle', status: 'open',
  teBeoordelen: true, goedkeurderId: 'ik', goedkeurderNaam: 'Bas de Vries', rol: 'projectleider',
  beoordeeldOp: null, beoordeeldDoorNaam: null, afkeurReden: null,
}

export const VOORBEELD_KOSTEN: KostenPost[] = [
  { ...basis, id: 'k1', datum: '2026-10-12', medewerkerNaam: 'Kasun Perera', soort: 'parkeren', bedrag: 7.5,
    omschrijving: 'Parkeergarage centrum' },
  { ...basis, id: 'k2', datum: '2026-10-13', medewerkerNaam: 'Piotr Nowak', soort: 'reiskosten',
    vervoermiddel: 'auto', km: 42, bedrag: 12.6 },
  { ...basis, id: 'k3', datum: '2026-10-14', medewerkerNaam: 'Sanne Jansen', soort: 'overig', bedrag: 23.95,
    omschrijving: 'Kitpistool bij de bouwmarkt', dossierId: null, project: null, rol: 'goedkeurder' },
  { ...basis, id: 'k4', datum: '2026-10-13', medewerkerNaam: 'Kasun Perera', soort: 'parkeren', bedrag: 4.2,
    dossierId: 'd2', project: '20261.00388 · VvE De Linde, Deventer', goedkeurderId: 'mw-ander',
    goedkeurderNaam: 'Sanne Jansen' },
  { ...basis, id: 'k5', datum: '2026-10-08', medewerkerNaam: 'Piotr Nowak', soort: 'reiskosten',
    vervoermiddel: 'ov', bedrag: 9.8, status: 'goedgekeurd', teBeoordelen: false,
    beoordeeldOp: '2026-10-09T08:12:00Z', beoordeeldDoorNaam: 'Bas de Vries' },
  { ...basis, id: 'k6', datum: '2026-10-07', medewerkerNaam: 'Kasun Perera', soort: 'parkeren', bedrag: 18,
    status: 'afgekeurd', teBeoordelen: false, beoordeeldOp: '2026-10-08T14:40:00Z',
    beoordeeldDoorNaam: 'Bas de Vries', afkeurReden: 'Bonnetje is onleesbaar, graag opnieuw indienen' },
  { ...basis, id: 'k7', datum: '2026-10-15', medewerkerNaam: 'Sanne Jansen', soort: 'parkeren', bedrag: 3.6,
    teBeoordelen: false },
]

/** Wat bij "mij" (goedkeurder `ik`) ligt. */
export const VOORBEELD_TE_KEUREN = VOORBEELD_KOSTEN.filter(k => k.teBeoordelen && k.goedkeurderId === 'ik')
