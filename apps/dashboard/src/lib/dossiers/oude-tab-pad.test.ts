import { describe, expect, it } from 'vitest'
import { oudeTabOmleiding } from './oude-tab-pad'

const id = '12033df8-d9e3-414c-8c2d-4f7a13ece937'

describe('oudeTabOmleiding', () => {
  it('stuurt de opgeheven Informatie-tab van een servicedeskbon naar Bon', () => {
    expect(oudeTabOmleiding(`/servicedesk/${id}/informatie`)).toBe(`/servicedesk/${id}/bon?deel=informatie`)
  })
  it('laat Informatie op een opdracht staan', () => {
    expect(oudeTabOmleiding(`/opdrachten/${id}/informatie`)).toBeNull()
  })
  it('kent de algemene opgeheven tabs', () => {
    expect(oudeTabOmleiding(`/opdrachten/${id}/vca`)).toBe(`/opdrachten/${id}/kam`)
  })
  it('negeert bestaande tabs en andere paden', () => {
    expect(oudeTabOmleiding(`/servicedesk/${id}/bon`)).toBeNull()
    expect(oudeTabOmleiding(`/servicedesk/${id}`)).toBeNull()
    expect(oudeTabOmleiding('/instellingen/dossiers/vca')).toBeNull()
  })
})
