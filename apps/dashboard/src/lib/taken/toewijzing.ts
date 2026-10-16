import type { TaskAssigneeRol } from '@/lib/taken/supabase/database.types'

export type NieuweToewijzing = { user_id: string; rol?: TaskAssigneeRol }

type Koppelingen = {
  lijst_id?: string | null
  dossier_id?: string | null
  medewerker_id?: string | null
  parent_task_id?: string | null
}

/**
 * Of een actie nergens aan vastzit. "Mijn acties" (widget, /mijn-taken, /m/taken) leest
 * alleen `task_assignees`; een actielijst, dossier, medewerker of bovenliggende actie toont
 * hem daarnaast op hun eigen pagina. Zonder koppeling en zonder toewijzing staat hij nergens.
 */
export function hangtNergensAan(k: Koppelingen): boolean {
  return !k.lijst_id && !k.dossier_id && !k.medewerker_id && !k.parent_task_id
}

/**
 * De toewijzingen waarmee een nieuwe actie wordt opgeslagen. Een losse actie die aan niemand
 * is toegewezen verdween: de maker dacht een actie te hebben aangemaakt en zag hem nooit meer
 * terug. Die komt dus bij de maker zelf, zoals EVA Mobiel al standaard deed.
 */
export function toewijzingenVoorNieuweActie(
  data: Koppelingen & { assignees?: NieuweToewijzing[] },
  makerId: string,
): NieuweToewijzing[] {
  if (data.assignees?.length) return data.assignees
  return hangtNergensAan(data) ? [{ user_id: makerId, rol: 'verantwoordelijke' }] : []
}

/** Kleine letters, zonder accenten: "Jäger" vind je ook met "jager". */
function normaliseer(tekst: string): string {
  return tekst.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * De medewerkers die bij een zoekterm passen, in de volgorde van de lijst. Elk woord moet
 * ergens in de naam staan, in willekeurige volgorde: "vries jan" vindt Jan de Vries. Een lege
 * zoekterm geeft iedereen.
 */
export function zoekOpNaam<T extends { naam: string }>(lijst: T[], zoekterm: string): T[] {
  const woorden = normaliseer(zoekterm).split(/\s+/).filter(Boolean)
  if (!woorden.length) return lijst
  return lijst.filter(m => {
    const naam = normaliseer(m.naam)
    return woorden.every(w => naam.includes(w))
  })
}
