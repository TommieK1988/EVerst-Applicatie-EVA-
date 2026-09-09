import { redirect } from 'next/navigation'

/**
 * De offertemail wordt sinds september 2026 beheerd tussen alle andere mailsjablonen. Deze route
 * blijft bestaan omdat hij in bladwijzers en oudere links staat.
 */
export default function OfferteMailInstellingenPagina() {
  redirect('/instellingen/mailsjablonen')
}
