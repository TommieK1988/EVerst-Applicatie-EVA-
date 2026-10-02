import { describe, expect, it } from 'vitest'
import {
  regelVanHandmatig, handmatigVanRegel, regelVanLijn, valideerHandmatigeRegel, verkoopMateriaal,
  kiesUurtarief, telRegels, tariefVoorFunctie, type HandmatigeRegel,
} from './handmatige-regel'
import { registratieVerkoop, registratieArbeid, registratieMateriaal, registratieUren,
  registratieVerkoopHandmatig, registratieVerkoopMeerwerk, werkzaamhedenTekst } from './bedragen'
import { telWerkzaamheden, type BtwWijzer } from './werkzaamheden-totaal'
import { bepaalBtw, btwOpstelling } from './btw'
import type { RegistratieRegelForm, RepairRegistration, RepairRegistrationLine } from './types'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const arbeid: HandmatigeRegel = {
  type: 'arbeid', omschrijving: 'Kozijnhout uitzagen', categorie: 'reparatie', btw_tarief: 'laag',
  functie: 'Timmerman', uren: 2.5, uurtarief: 58, kostprijs_per_uur: 48,
}
const materiaal: HandmatigeRegel = {
  type: 'materiaal', omschrijving: 'Meranti 44×69', categorie: 'meerwerk', btw_tarief: 'hoog',
  aantal: 3, eenheid: 'm¹', inkoopprijs: 10, opslag_pct: 25,
}
const bibliotheek: RegistratieRegelForm = {
  bron: 'bibliotheek', categorie: 'reparatie', recept_id: 'rec-1', aantal: 2,
  repair_code_snapshot: 'EP-K-001', repair_name_snapshot: 'Epoxyherstel klein', unit_snapshot: 'st',
  labor_hours_snapshot: 0.5, labor_rate_snapshot: 48, labor_cost_snapshot: 24,
  material_cost_snapshot: 6, cost_price_snapshot: 30, sale_price_snapshot: 40,
}

/** Zoals de database een regel teruggeeft: met de gegenereerde regeltotalen. */
function alsLijn(r: RegistratieRegelForm, i: number): RepairRegistrationLine {
  const a = r.aantal
  return {
    id: `l${i}`, registration_id: 'reg', created_at: '', volgorde: i,
    recept_id: r.recept_id ?? null, aantal: a,
    repair_code_snapshot: r.repair_code_snapshot ?? null, repair_name_snapshot: r.repair_name_snapshot ?? null,
    repair_description_snapshot: null, unit_snapshot: r.unit_snapshot ?? null,
    labor_hours_snapshot: r.labor_hours_snapshot ?? null, labor_rate_snapshot: r.labor_rate_snapshot ?? null,
    labor_cost_snapshot: r.labor_cost_snapshot ?? null, material_cost_snapshot: r.material_cost_snapshot ?? null,
    cost_price_snapshot: r.cost_price_snapshot ?? null, sale_price_snapshot: r.sale_price_snapshot ?? null,
    line_cost_total: Math.round(a * (r.cost_price_snapshot ?? 0) * 100) / 100,
    line_sale_total: Math.round(a * (r.sale_price_snapshot ?? 0) * 100) / 100,
    bron: r.bron ?? null, regel_type: r.regel_type ?? null, categorie: r.categorie ?? null,
    functie: r.functie ?? null, opslag_pct: r.opslag_pct ?? null, btw_tarief: r.btw_tarief ?? null,
    notitie: r.notitie ?? null, foto_pad: r.foto_pad ?? null,
  }
}

const registratie = (regels: RegistratieRegelForm[]): RepairRegistration =>
  ({ id: 'reg', lines: regels.map(alsLijn) } as unknown as RepairRegistration)

const regels = () => [bibliotheek, regelVanHandmatig(arbeid, 1), regelVanHandmatig(materiaal, 2)]

describe('handmatige regel aanmaken', () => {
  it('arbeid: uren als aantal, uurtarief als verkoop, kostprijs per uur als arbeidskosten', () => {
    const r = regelVanHandmatig(arbeid, 3)
    expect(r).toMatchObject({
      bron: 'handmatig', regel_type: 'arbeid', categorie: 'reparatie', btw_tarief: 'laag',
      functie: 'Timmerman', aantal: 2.5, unit_snapshot: 'uur', labor_hours_snapshot: 1,
      labor_rate_snapshot: 58, labor_cost_snapshot: 48, material_cost_snapshot: 0,
      cost_price_snapshot: 48, sale_price_snapshot: 58, repair_name_snapshot: 'Kozijnhout uitzagen', volgorde: 3,
    })
    expect(r.recept_id).toBeUndefined()
  })

  it('materiaal: verkoopprijs is inkoop plus opslag', () => {
    const r = regelVanHandmatig(materiaal, 0)
    expect(verkoopMateriaal(10, 25)).toBe(12.5)
    expect(r).toMatchObject({
      bron: 'handmatig', regel_type: 'materiaal', categorie: 'meerwerk', aantal: 3, unit_snapshot: 'm¹',
      labor_hours_snapshot: 0, labor_cost_snapshot: 0, material_cost_snapshot: 10,
      cost_price_snapshot: 10, sale_price_snapshot: 12.5, opslag_pct: 25,
    })
  })

  it('weigert lege omschrijving en negatieve of ontbrekende getallen', () => {
    expect(valideerHandmatigeRegel({ ...arbeid, omschrijving: '  ' }))
      .toEqual({ ok: false, fout: 'Omschrijving is verplicht.' })
    expect(valideerHandmatigeRegel({ ...arbeid, uurtarief: -1 }).ok).toBe(false)
    expect(valideerHandmatigeRegel({ ...arbeid, uren: 0 }).ok).toBe(false)
    expect(valideerHandmatigeRegel({ ...arbeid, uren: NaN }).ok).toBe(false)
    expect(valideerHandmatigeRegel({ ...materiaal, inkoopprijs: -0.01 }).ok).toBe(false)
    expect(valideerHandmatigeRegel({ ...materiaal, opslag_pct: -5 }).ok).toBe(false)
    expect(valideerHandmatigeRegel({ ...materiaal, aantal: -2 }).ok).toBe(false)
    expect(valideerHandmatigeRegel(materiaal).ok).toBe(true)
    expect(valideerHandmatigeRegel({ ...materiaal, inkoopprijs: 0 }).ok).toBe(true)
  })

  it('bewerken: terug naar de invoer en weer opgeslagen geeft dezelfde regel', () => {
    for (const h of [arbeid, materiaal]) {
      const r = regelVanHandmatig(h, 1)
      expect(regelVanHandmatig(handmatigVanRegel(r), 1)).toEqual(r)
    }
  })

  it('een opgeslagen regel komt met bron, categorie en foto terug (bewerken verliest niets)', () => {
    const r = { ...regelVanHandmatig(materiaal, 2), foto_pad: 'regels/d/x.jpg', notitie: 'achtergevel' }
    expect(regelVanLijn(alsLijn(r, 2))).toMatchObject({
      bron: 'handmatig', regel_type: 'materiaal', categorie: 'meerwerk', btw_tarief: 'hoog',
      foto_pad: 'regels/d/x.jpg', notitie: 'achtergevel', aantal: 3, sale_price_snapshot: 12.5,
    })
    // Rijen van vóór de handmatige regels hebben geen bron: die zijn bibliotheek.
    const oud = { ...alsLijn(bibliotheek, 0), bron: undefined, categorie: undefined }
    expect(regelVanLijn(oud)).toMatchObject({ bron: 'bibliotheek', categorie: 'reparatie', recept_id: 'rec-1' })
  })
})

describe('standaard uurtarief', () => {
  const basis = { opslagPct: 25 }

  it('afgesproken tarief van de opdrachtgever gaat voor alles', () => {
    expect(kiesUurtarief({ ...basis, opdrachtgeverVerkoop: 62, functieVerkoop: 55, functieKostprijs: 40, bedrijfstarief: 48 }))
      .toEqual({ verkoop: 62, kostprijs: 40, bron: 'opdrachtgever' })
  })

  it('daarna het verkooptarief van de functie', () => {
    expect(kiesUurtarief({ ...basis, functieVerkoop: 55, bedrijfstarief: 48 }))
      .toEqual({ verkoop: 55, kostprijs: 48, bron: 'functie' })
  })

  it('zonder verkooptarief: kostprijs plus opslag, met het bedrijfstarief als kostprijs', () => {
    expect(kiesUurtarief({ ...basis, bedrijfstarief: 48 }))
      .toEqual({ verkoop: 60, kostprijs: 48, bron: 'kostprijs_opslag' })
    expect(kiesUurtarief({ ...basis, functieKostprijs: 40, bedrijfstarief: 48 }))
      .toEqual({ verkoop: 50, kostprijs: 40, bron: 'kostprijs_opslag' })
  })

  it('in de app (tarief niet zichtbaar): standaard van de functie, of het tarief van kantoor', () => {
    const std = [{ naam: 'Timmerman', verkoop: 60, kostprijs: 48 }, { naam: 'Schilder', verkoop: 55, kostprijs: 44 }]
    expect(tariefVoorFunctie('Schilder', std)).toEqual({ uurtarief: 55, kostprijs_per_uur: 44 })
    // Kantoor zette 58 op deze timmermansregel: bewerken in het veld laat dat staan…
    expect(tariefVoorFunctie('Timmerman', std, arbeid)).toEqual({ uurtarief: 58, kostprijs_per_uur: 48 })
    // …maar een andere functie krijgt het standaardtarief van die functie.
    expect(tariefVoorFunctie('Schilder', std, arbeid)).toEqual({ uurtarief: 55, kostprijs_per_uur: 44 })
    expect(tariefVoorFunctie('Metselaar', std)).toEqual({ uurtarief: 0, kostprijs_per_uur: 0 })
  })

  it('niets bekend: nul, zodat de gebruiker het zelf invult', () => {
    expect(kiesUurtarief(basis)).toEqual({ verkoop: 0, kostprijs: 0, bron: 'geen' })
    expect(kiesUurtarief({ ...basis, opdrachtgeverVerkoop: -5 }).bron).toBe('geen')
  })
})

describe('totalen: bibliotheek en handmatig samen, arbeid en materiaal gesplitst', () => {
  // bibliotheek 2 × (24 arbeid + 6 mat, verkoop 40) · arbeid 2,5 u × 48/58 · materiaal 3 × 10/12,50
  it('in de modal (vóór opslaan)', () => {
    expect(telRegels(regels())).toEqual({
      uren: 3.5, arbeid: 168, materiaal: 42, kostprijs: 210,
      verkoop: 262.5, verkoopHandmatig: 182.5, verkoopMeerwerk: 37.5,
    })
  })

  it('per registratie (na opslaan) komen op hetzelfde uit', () => {
    const r = registratie(regels())
    expect(registratieVerkoop(r)).toBe(262.5)
    expect(registratieArbeid(r)).toBe(168)
    expect(registratieMateriaal(r)).toBe(42)
    expect(registratieUren(r)).toBe(3.5)
    expect(registratieVerkoopHandmatig(r)).toBe(182.5)
    expect(registratieVerkoopMeerwerk(r)).toBe(37.5)
  })

  it('handmatige regels staan gemarkeerd in de werkzaamhedentekst', () => {
    expect(werkzaamhedenTekst(registratie(regels()))).toBe(
      '2× Epoxyherstel klein · 2,5 uur Kozijnhout uitzagen (handmatig) · 3 m¹ Meranti 44×69 (handmatig)',
    )
  })
})

describe('doorstroom naar de afrekenregels (totaalblad + btw-opstelling)', () => {
  const tarieven: BtwTariefKeuze[] = [
    { id: 'h', label: 'Hoog 21%', percentage: 21, verlegd: false, bouw7_id: null },
    { id: 'l', label: 'Laag 9%', percentage: 9, verlegd: false, bouw7_id: null },
  ]
  // Zoals de rapportage: recept → code uit de bibliotheek, anders de code op de regel.
  const receptCodes = new Map([['rec-1', 'hoog']])
  const btwVan: BtwWijzer = l => bepaalBtw({
    basisCode: l.recept_id ? receptCodes.get(l.recept_id) ?? null : l.btw_tarief ?? null,
    tarieven,
  })

  it('handmatige regels worden eigen regels met hun eigen btw, en tellen mee in het totaal', () => {
    const r1 = registratie(regels())
    const r2 = registratie([regelVanHandmatig({ ...arbeid, uren: 1 }, 0)])
    const { regels: blad, btwRegels } = telWerkzaamheden([r1, r2], btwVan, true)

    const handArbeid = blad.find(b => b.naam === 'Kozijnhout uitzagen (handmatig)')
    expect(handArbeid).toMatchObject({
      bron: 'Handmatig', categorie: 'Reparatie', eenheid: 'uur', aantal_num: 3.5,
      btw_pct_num: 9, totaal_num: 203, uren: '3,50',
    })
    expect(blad.find(b => b.code === 'EP-K-001')).toMatchObject({ bron: '', totaal_num: 80, btw_pct_num: 21 })
    expect(blad.find(b => b.naam.startsWith('Meranti'))).toMatchObject({
      bron: 'Handmatig', categorie: 'Aanvullende werkzaamheden', totaal_num: 37.5, btw_pct_num: 21,
    })

    const opstelling = btwOpstelling(btwRegels)
    expect(opstelling.excl).toBe(registratieVerkoop(r1) + registratieVerkoop(r2))
    expect(opstelling.groepen.map(g => [g.label, g.excl])).toEqual([['21%', 117.5], ['9%', 203]])
    expect(opstelling.btw).toBe(42.95) // 24,68 + 18,27
  })

  it('een handmatige regel bundelt nooit met een bibliotheekregel van dezelfde naam', () => {
    const zelfdeNaam = regelVanHandmatig({ ...materiaal, omschrijving: 'Epoxyherstel klein', categorie: 'reparatie' }, 1)
    const { regels: blad } = telWerkzaamheden([registratie([bibliotheek, zelfdeNaam])], btwVan, true)
    expect(blad).toHaveLength(2)
  })
})
