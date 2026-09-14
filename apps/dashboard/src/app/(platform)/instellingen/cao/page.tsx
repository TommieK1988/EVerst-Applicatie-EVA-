import { redirect } from 'next/navigation'

/**
 * Het CAO-beheer is sinds september 2026 een tabblad van het Medewerkers-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * CaoBeheer en actions blijven hier staan; /instellingen/medewerkers importeert ze.
 */
export default function CaoPagina() {
  redirect('/instellingen/medewerkers?deel=cao')
}
