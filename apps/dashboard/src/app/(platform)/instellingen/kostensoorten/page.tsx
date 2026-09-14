import { redirect } from 'next/navigation'

/**
 * De kostensoorten staan sinds september 2026 samen met de BTW-tarieven op een scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 */
export default function KostensoortenPagina() {
  redirect('/instellingen/btw-kostensoorten')
}
