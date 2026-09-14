import { redirect } from 'next/navigation'

/**
 * Uursoorten en uurtarieven zijn sinds september 2026 tabbladen van het Uren-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 */
export default function UursoortenTarievenPagina() {
  redirect('/instellingen/uren?deel=uursoorten')
}
