import { describe, expect, it } from 'vitest'
import { mapBouw7NaarEvaStatus, servicedeskKolom } from './status-afleiding'

const GEEN_BESTAANDE = [null, null, null] as const

describe('servicedeskKolom: waar een bon op het bord landt', () => {
  /**
   * De fout waar dit tegen beschermt. In Bouw7 is `01. Offerte` de fase waarin een aanvraag
   * binnenkomt en eventueel geprijsd wordt — er is dan nog niets de deur uit. De tabel zette
   * zo'n bon op "Offerte uitgebracht", waar hij met de hand uit gesleept moest worden. Dat het
   * handmatig gebeurde was aan de productiedata te zien: een mutatiebon met
   * `handmatige_velden = ['servicedesk_substatus']` die naar Opgenomen was verplaatst.
   */
  it('zet een verse bon op 01. Offerte op Nieuw', () => {
    expect(servicedeskKolom('01. Offerte', 'Dagelijks onderhoud')).toBe('nieuw')
    expect(servicedeskKolom('01. Offerte', 'Mutatie')).toBe('nieuw')
  })

  it('zet hem op Wachten op opdrachtgever zodra de offerte de deur uit is', () => {
    expect(servicedeskKolom('01. Offerte', 'Dagelijks onderhoud', '03. Verstuurd'))
      .toBe('wacht_op_opdrachtgever')
    expect(servicedeskKolom('01. Offerte', 'Mutatie', '07. Mondelinge toezegging'))
      .toBe('wacht_op_opdrachtgever')
  })

  it('zet een gewonnen offerte op In voorbereiding en een verloren op Vervallen', () => {
    expect(servicedeskKolom('01. Offerte', 'Mutatie', '04. Gewonnen')).toBe('in_voorbereiding')
    expect(servicedeskKolom('01. Offerte', 'Dagelijks onderhoud', '05. Verloren')).toBe('vervallen')
    expect(servicedeskKolom('01. Offerte', 'Dagelijks onderhoud', '06. Vervallen')).toBe('vervallen')
  })

  it('laat een offertestatus zonder uitkomst de bon op Nieuw', () => {
    // "Onderhanden" betekent dat er aan een offerte gewerkt wordt, niet dat hij verstuurd is.
    expect(servicedeskKolom('01. Offerte', 'Dagelijks onderhoud', '02. Onderhanden')).toBe('nieuw')
  })

  it('zet 09. Verzonden offertes op Wachten op opdrachtgever', () => {
    expect(servicedeskKolom('09.Verzonden offertes', 'Dagelijks onderhoud')).toBe('wacht_op_opdrachtgever')
  })

  it('zet 03. Werkvoorbereiding voor elke bon op In voorbereiding', () => {
    expect(servicedeskKolom('03. Werkvoorbereiding', 'Mutatie')).toBe('in_voorbereiding')
    expect(servicedeskKolom('03. Werkvoorbereiding', 'Dagelijks onderhoud')).toBe('in_voorbereiding')
  })

  it('leest 08. Afgewezen als Vervallen', () => {
    expect(servicedeskKolom('08. Afgewezen', 'Dagelijks onderhoud')).toBe('vervallen')
  })

  it('valt terug op Nieuw bij een status die de ladder niet kent', () => {
    expect(servicedeskKolom('99. Onbekend', 'Dagelijks onderhoud')).toBe('nieuw')
  })
})

describe('mapBouw7NaarEvaStatus: een bon blijft een bon', () => {
  /**
   * Een servicedeskbon staat altijd op hoofdstatus 'aanvraag' en draagt geen offerte- of
   * opdracht-substatus. Anders komt hij naast het servicedeskbord óók op Aanvragen of Offertes
   * te staan — precies wat er in productie gebeurde bij zeven bonnen op 01. Offerte.
   */
  it('houdt een DO-bon op aanvraag, zonder offerte- of opdrachtsubstatus', () => {
    const s = mapBouw7NaarEvaStatus('01. Offerte', 'Dagelijks onderhoud', ...GEEN_BESTAANDE)
    expect(s.hoofdstatus).toBe('aanvraag')
    expect(s.offerte_substatus).toBeNull()
    expect(s.opdracht_substatus).toBeNull()
    expect(s.servicedesk_substatus).toBe('nieuw')
  })

  it('laat de categorie winnen van een opdrachtstatus', () => {
    const s = mapBouw7NaarEvaStatus('04. Onderhanden', 'Mutatie', ...GEEN_BESTAANDE)
    expect(s.hoofdstatus).toBe('aanvraag')
    expect(s.servicedesk_substatus).toBe('loopt')
  })

  /**
   * Een lopende bon met een andere categorie hoort niet te bestaan, maar kan in Bouw7 ontstaan. Hij
   * blijft dan een servicedeskbon (met `categorie_conflict` in de database) — anders viel hij op
   * aanvraag/nieuw en stond hij op geen enkel bord (30-09-2026).
   */
  it('houdt een LB.-bon met een andere categorie op de servicedesk', () => {
    const s = mapBouw7NaarEvaStatus('LB. Lopende bonnen', 'Bouwkundig Onderhoud', ...GEEN_BESTAANDE)
    expect(s.hoofdstatus).toBe('aanvraag')
    expect(s.servicedesk_substatus).toBe('nieuw')
  })

  it('zet een LB.-bon met categorie Dagelijks onderhoud op de servicedesk, in Nieuw', () => {
    const s = mapBouw7NaarEvaStatus('LB. Lopende bonnen', 'Dagelijks onderhoud', ...GEEN_BESTAANDE)
    expect(s.hoofdstatus).toBe('aanvraag')
    expect(s.servicedesk_substatus).toBe('nieuw')
  })

  it('laat een gewone aanvraag op 01. Offerte ongemoeid', () => {
    const s = mapBouw7NaarEvaStatus('01. Offerte', 'Schilderwerk', ...GEEN_BESTAANDE)
    expect(s.hoofdstatus).toBe('aanvraag')
    expect(s.servicedesk_substatus).toBeNull()
  })
})
