import { redirect } from 'next/navigation'

/**
 * De categorieen staan sinds september 2026 samen met de dossier-tabbladen op een scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 */
export default function DossierCategorieenPagina() {
  redirect('/instellingen/dossiers')
}
