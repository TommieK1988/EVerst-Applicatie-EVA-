/**
 * Local data store — slaat projecten, registraties, projectdelen, locaties en reparaties
 * op in localStorage. Wordt gecombineerd met mock data zodat de app werkt zonder database.
 */

import type { Project, Projectdeel, Locatie, Registratie, Reparatie, StandardRepair } from './types'
import { mockProjecten, mockRegistraties, mockProjectdelen, mockLocaties, mockReparaties, mockStandaardReparaties, mockProfile } from './mock-data'

const KEYS = {
  projecten: 'eve_projecten',
  registraties: 'eve_registraties',
  projectdelen: 'eve_projectdelen',
  locaties: 'eve_locaties',
  reparaties: 'eve_reparaties',
  bibliotheek: 'eve_bibliotheek',
  uurtarief: 'eve_uurtarief',
  eenheden: 'eve_eenheden',
  reparatietypes: 'eve_reparatietypes',
  medewerker: 'eve_medewerker',
}

// ─── Medewerker naam ──────────────────────────────────────────────────────────

export function getMedewerkerNaam(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(KEYS.medewerker) || mockProfile.full_name || ''
}

export function setMedewerkerNaam(naam: string): void {
  localStorage.setItem(KEYS.medewerker, naam)
}

// ─── App-instellingen ──────────────────────────────────────────────────────────

export interface ReparatieType {
  id: string
  naam: string
  kleur: string
}

const DEFAULT_EENHEDEN = ['st', 'm1', 'm2', 'm3', 'uur', 'dag']
const DEFAULT_UURTARIEF = 65

export function getUurtarief(): number {
  if (typeof window === 'undefined') return DEFAULT_UURTARIEF
  const raw = localStorage.getItem(KEYS.uurtarief)
  return raw ? parseFloat(raw) : DEFAULT_UURTARIEF
}

export function saveUurtarief(tarief: number): void {
  localStorage.setItem(KEYS.uurtarief, String(tarief))
}

export function getEenheden(): string[] {
  if (typeof window === 'undefined') return DEFAULT_EENHEDEN
  try {
    const raw = localStorage.getItem(KEYS.eenheden)
    return raw ? JSON.parse(raw) : DEFAULT_EENHEDEN
  } catch { return DEFAULT_EENHEDEN }
}

export function saveEenheden(eenheden: string[]): void {
  localStorage.setItem(KEYS.eenheden, JSON.stringify(eenheden))
}

export function getReparatieTypes(): ReparatieType[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEYS.reparatietypes)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveReparatieTypes(types: ReparatieType[]): void {
  localStorage.setItem(KEYS.reparatietypes, JSON.stringify(types))
}

// ─── Projecten ────────────────────────────────────────────────────────────────

export function getLocalProjecten(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEYS.projecten) || '[]')
  } catch {
    return []
  }
}

export function saveProject(project: Project): void {
  const items = getLocalProjecten()
  const idx = items.findIndex(p => p.id === project.id)
  if (idx >= 0) items[idx] = project
  else items.push(project)
  localStorage.setItem(KEYS.projecten, JSON.stringify(items))
}

export function getAllProjecten(): Project[] {
  return [...mockProjecten, ...getLocalProjecten()]
}

// ─── Registraties ─────────────────────────────────────────────────────────────

export function getLocalRegistraties(): Registratie[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEYS.registraties) || '[]')
  } catch {
    return []
  }
}

export function saveRegistratie(reg: Registratie): void {
  const items = getLocalRegistraties()
  const idx = items.findIndex(r => r.id === reg.id)
  if (idx >= 0) items[idx] = reg
  else items.push(reg)
  localStorage.setItem(KEYS.registraties, JSON.stringify(items))
}

export function deleteRegistratie(id: string): void {
  const items = getLocalRegistraties().filter(r => r.id !== id)
  localStorage.setItem(KEYS.registraties, JSON.stringify(items))
}

export function getAllRegistraties(): Registratie[] {
  const local = getLocalRegistraties()
  const localIds = new Set(local.map(r => r.id))
  return [...mockRegistraties.filter(r => !localIds.has(r.id)), ...local]
}

export function getRegistratiesVoorLocatie(locatieId: string): Registratie[] {
  return getAllRegistraties()
    .filter(r => r.locatie_id === locatieId)
    .sort((a, b) => b.datum.localeCompare(a.datum))
}

// ─── Projectdelen ─────────────────────────────────────────────────────────────

export function getLocalProjectdelen(): Projectdeel[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEYS.projectdelen) || '[]')
  } catch {
    return []
  }
}

export function saveProjectdeel(projectdeel: Projectdeel): void {
  const items = getLocalProjectdelen()
  const idx = items.findIndex(g => g.id === projectdeel.id)
  if (idx >= 0) items[idx] = projectdeel
  else items.push(projectdeel)
  localStorage.setItem(KEYS.projectdelen, JSON.stringify(items))
}

export function deleteProjectdeel(id: string): void {
  const items = getLocalProjectdelen().filter(g => g.id !== id)
  localStorage.setItem(KEYS.projectdelen, JSON.stringify(items))
}

export function getAllProjectdelen(): Projectdeel[] {
  return [...mockProjectdelen, ...getLocalProjectdelen()]
}

export function getProjectdelenVoorProject(projectId: string): Projectdeel[] {
  return getAllProjectdelen()
    .filter(g => g.project_id === projectId)
    .sort((a, b) => a.volgorde - b.volgorde)
}

// ─── Locaties ─────────────────────────────────────────────────────────────────

export function getLocalLocaties(): Locatie[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEYS.locaties) || '[]')
  } catch {
    return []
  }
}

export function saveLocatie(locatie: Locatie): void {
  const items = getLocalLocaties()
  const idx = items.findIndex(l => l.id === locatie.id)
  if (idx >= 0) items[idx] = locatie
  else items.push(locatie)
  localStorage.setItem(KEYS.locaties, JSON.stringify(items))
}

export function deleteLocatie(id: string): void {
  const items = getLocalLocaties().filter(l => l.id !== id)
  localStorage.setItem(KEYS.locaties, JSON.stringify(items))
}

export function getAllLocaties(): Locatie[] {
  return [...mockLocaties, ...getLocalLocaties()]
}

export function getLocatiesVoorProjectdeel(projectdeelId: string): Locatie[] {
  return getAllLocaties().filter(l => l.projectdeel_id === projectdeelId)
}

// ─── Reparaties ───────────────────────────────────────────────────────────────

export function getLocalReparaties(): Reparatie[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEYS.reparaties) || '[]')
  } catch {
    return []
  }
}

export function saveReparatie(reparatie: Reparatie): void {
  const items = getLocalReparaties()
  const idx = items.findIndex(r => r.id === reparatie.id)
  if (idx >= 0) items[idx] = reparatie
  else items.push(reparatie)
  localStorage.setItem(KEYS.reparaties, JSON.stringify(items))
}

export function deleteReparatie(id: string): void {
  const items = getLocalReparaties().filter(r => r.id !== id)
  localStorage.setItem(KEYS.reparaties, JSON.stringify(items))
}

export function getAllReparaties(): Reparatie[] {
  const local = getLocalReparaties()
  const localIds = new Set(local.map(r => r.id))
  return [...mockReparaties.filter(r => !localIds.has(r.id)), ...local]
}

export function getReparatiesVoorLocatie(locatieId: string): Reparatie[] {
  return getAllReparaties().filter(r => r.locatie_id === locatieId)
}

export function getReparatiesVoorRegistratie(registratieId: string): Reparatie[] {
  return getAllReparaties().filter(r => r.registratie_id === registratieId)
}

export function getReparatiesVoorProject(projectId: string): Reparatie[] {
  return getAllReparaties().filter(r => r.project_id === projectId)
}

// ─── Bibliotheek (Standaard reparaties) ───────────────────────────────────────

export function getLocalBibliotheek(): StandardRepair[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEYS.bibliotheek) || '[]')
  } catch {
    return []
  }
}

export function getAllBibliotheek(): StandardRepair[] {
  const local = getLocalBibliotheek()
  // Local items can override mock items (by id) or be new additions
  const mockFiltered = mockStandaardReparaties.filter(m => !local.some(l => l.id === m.id))
  return [...mockFiltered, ...local].sort((a, b) => a.code.localeCompare(b.code))
}

export function saveBibliotheekItem(item: StandardRepair): void {
  const items = getLocalBibliotheek()
  const idx = items.findIndex(i => i.id === item.id)
  if (idx >= 0) items[idx] = item
  else items.push(item)
  localStorage.setItem(KEYS.bibliotheek, JSON.stringify(items))
}

export function deleteBibliotheekItem(id: string): void {
  // Mark mock items as deleted by saving a tombstone, remove local items
  const items = getLocalBibliotheek().filter(i => i.id !== id)
  // For mock items, save a deleted marker
  if (mockStandaardReparaties.some(m => m.id === id)) {
    const tombstone = { ...mockStandaardReparaties.find(m => m.id === id)!, active: false, _deleted: true } as StandardRepair & { _deleted: boolean }
    items.push(tombstone)
  }
  localStorage.setItem(KEYS.bibliotheek, JSON.stringify(items))
}

export function getAllBibliotheekActief(): StandardRepair[] {
  return getAllBibliotheek().filter(i => !(i as StandardRepair & { _deleted?: boolean })._deleted)
}
