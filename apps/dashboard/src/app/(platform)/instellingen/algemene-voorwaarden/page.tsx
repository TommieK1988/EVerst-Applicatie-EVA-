import { redirect } from 'next/navigation'

/**
 * De algemene voorwaarden zijn sinds september 2026 een tabblad van het Offertes-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * AlgemeneVoorwaardenBeheer en actions blijven hier staan; /instellingen/offertes importeert ze.
 */
export default function AlgemeneVoorwaardenPagina() {
  redirect('/instellingen/offertes?deel=voorwaarden')
}
