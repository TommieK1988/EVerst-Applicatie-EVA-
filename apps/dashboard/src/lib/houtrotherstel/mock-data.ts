import type { Profile, Project, StandardRepair, Projectdeel, Locatie, Registratie, Reparatie } from './types'

export const mockProfile: Profile = {
  id: '',
  full_name: '',
  email: '',
  role: 'admin',
  active: true,
  created_at: '',
  updated_at: '',
}

export const mockProjecten: Project[] = []
export const mockRegistraties: Registratie[] = []
export const mockStandaardReparaties: StandardRepair[] = []
export const mockProjectdelen: Projectdeel[] = []
export const mockLocaties: Locatie[] = []
export const mockReparaties: Reparatie[] = []
