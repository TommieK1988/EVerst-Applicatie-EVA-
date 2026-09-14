import { redirect } from 'next/navigation'

/**
 * De redencodes staan sinds september 2026 op het Facturatie-scherm.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * RedencodesBeheer blijft hier staan; /instellingen/facturatie importeert het.
 */
export default function DebiteurRedencodesPagina() {
  redirect('/instellingen/facturatie')
}
