import type {
  Project, Deelproject, Locatie, Element, Activiteit,
  CalculatieLijn, Scenario, BibliotheekActiviteit,
  Groep, Calculatieregel, Componentregel,
} from './types'

export const mockBibliotheek: BibliotheekActiviteit[] = []
export const mockProjecten: Project[] = []
export const mockDeelprojecten: Deelproject[] = []
export const mockLocaties: Locatie[] = []
export const mockElementen: Element[] = []
export const mockScenarios: Scenario[] = []
export const mockActiviteiten: Activiteit[] = []
export const mockLijnen: CalculatieLijn[] = []
export const mockGroepen: Groep[] = []
export const mockCalculatieregels: Calculatieregel[] = []
export const mockComponentregels: Componentregel[] = []

export const mockGebruiker = {
  id: '',
  naam: '',
  email: '',
  rol: 'admin' as const,
}
