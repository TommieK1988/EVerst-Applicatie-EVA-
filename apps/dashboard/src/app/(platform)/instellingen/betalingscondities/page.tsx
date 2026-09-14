import { redirect } from 'next/navigation'

/**
 * De betalingscondities zijn sinds september 2026 een tabblad van het Offertes-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * BetalingsconditiesBeheer en actions blijven hier staan; /instellingen/offertes importeert ze.
 */
export default function BetalingsconditiesPagina() {
  redirect('/instellingen/offertes?deel=condities')
}
