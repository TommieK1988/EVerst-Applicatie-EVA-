import { redirect } from 'next/navigation'

/**
 * De eigen velden zijn sinds september 2026 een tabblad van het Medewerkers-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * AttribuutDefinitiesBeheer blijft hier staan; /instellingen/medewerkers importeert het.
 */
export default function MedewerkerAttributenPagina() {
  redirect('/instellingen/medewerkers?deel=attributen')
}
