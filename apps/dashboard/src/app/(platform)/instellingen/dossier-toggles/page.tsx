import { redirect } from 'next/navigation'

/**
 * De tabblad-schakelaars staan sinds september 2026 samen met de dossiercategorieen op een scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * DossierTogglesBeheer en actions blijven hier staan; /instellingen/dossiers importeert ze.
 */
export default function DossierTogglesPagina() {
  redirect('/instellingen/dossiers')
}
