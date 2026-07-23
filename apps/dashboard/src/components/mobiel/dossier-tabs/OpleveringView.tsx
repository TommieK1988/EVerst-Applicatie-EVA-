import React from 'react'
import { getDossierOplevering, getOpleverFeedbackSamenvatting, getOpleverToewijsbaar } from '@/lib/dossiers/oplevering'
import OpleveringClient from './OpleveringClient'

/**
 * Oplevering-tab binnen een mobiel dossier (Fase 9).
 *
 * Server-component: de data wordt hier opgehaald en als props doorgegeven, zodat het scherm in één
 * keer compleet in beeld staat. De desktop-tab haalt alles client-side op via useEffect — op een
 * telefoon met 4G levert dat een lege pagina met "laden…" op, precies terwijl je op een dak staat.
 * Zelfde opzet als DetailplanningView → DetailplanningClient.
 */
export default async function OpleveringView({ dossierId }: { dossierId: string }) {
  const [data, feedback, toewijsbaar] = await Promise.all([
    getDossierOplevering(dossierId).catch(() => ({ momenten: [], triage: [], lossePunten: [], afgewezen: [] })),
    getOpleverFeedbackSamenvatting(dossierId).catch(() => ({ aantal: 0, cijfers: [], hoofdscore: null })),
    // Onderaannemers beperkt tot de partijen die op dit dossier zijn besteld.
    getOpleverToewijsbaar(dossierId).catch(() => ({ medewerkers: [], relaties: [] })),
  ])

  return <OpleveringClient dossierId={dossierId} data={data} feedback={feedback} toewijsbaar={toewijsbaar} />
}
