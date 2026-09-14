import { redirect } from 'next/navigation'

/**
 * Functies, afdelingen en ploegen zijn sinds september 2026 een tabblad van het Medewerkers-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * FunctiesAfdelingenBeheer en actions blijven hier staan; /instellingen/medewerkers importeert ze.
 */
export default function FunctiesAfdelingenPagina() {
  redirect('/instellingen/medewerkers?deel=functies')
}
