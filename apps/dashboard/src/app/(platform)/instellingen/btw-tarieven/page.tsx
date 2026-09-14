import { redirect } from 'next/navigation'

/**
 * De BTW-tarieven staan sinds september 2026 samen met de kostensoorten op een scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * BtwTarievenBeheer blijft hier staan; /instellingen/btw-kostensoorten importeert het.
 */
export default function BtwTarievenPagina() {
  redirect('/instellingen/btw-kostensoorten')
}
