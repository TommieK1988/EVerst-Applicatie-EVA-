import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { dossierPad } from '@/components/dossiers/open-dossier'
import type { DossierSectie } from '@/components/dossiers/types'

/**
 * "Er is een actie aan je toegewezen."
 *
 * Dit was het grootste gat in de meldingen: het hele actielijsten-apparaat draait
 * — sjablonen, triggers, rol-koppeling, herhaling — en de ontvanger merkte er
 * niets van tot hij toevallig in Mijn taken keek.
 *
 * ROEP DIT AAN OP ELKE PLEK WAAR EEN MENS IEMAND IETS TOEWIJST. `task_assignees`
 * wordt op een stuk of acht plaatsen geschreven en niet allemaal verdienen ze een
 * melding; de afweging per plek:
 *
 *   * wél — nieuwe actie met toewijzing, toewijzing wijzigen, sjabloon activeren
 *     op een dossier of medewerker, de aanpas-actie na een afgekeurde begroting;
 *   * niet — het kopiëren van een sjabloonlijst (dat maakt sjabloontaken, geen
 *     echt werk), de Bouw7-to-do-import (een sync die bij een herbouw honderden
 *     regels kan aanraken) en het klaarzetten van een toolbox (die heeft een
 *     eigen melding met een eigen bestemming).
 *
 * Gooit niet: een toewijzing mag niet mislukken omdat de melding mislukt.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type TaakContext = {
  titel: string
  deadline: string | null
  prioriteit: string | null
  dossierId: string | null
  dossierNaam: string | null
  dossierSectie: DossierSectie | null
}

async function haalTaakContext(taskId: string): Promise<TaakContext | null> {
  const { data } = await db()
    .from('tasks')
    .select(`
      titel, deadline, prioriteit,
      dossier:dossiers ( id, titel, hoofdstatus ),
      lijst:task_lists ( dossier_id, dossiers ( id, titel, hoofdstatus ) )
    `)
    .eq('id', taskId)
    .maybeSingle()
  if (!data) return null

  // Directe dossierkoppeling (losse actie) gaat vóór de koppeling via de lijst —
  // zelfde volgorde als `getMijnTaken`, anders wijst de melding een ander dossier
  // aan dan het scherm.
  const dossier = data.dossier ?? data.lijst?.dossiers ?? null

  return {
    titel: data.titel,
    deadline: data.deadline ?? null,
    prioriteit: data.prioriteit ?? null,
    dossierId: dossier?.id ?? null,
    dossierNaam: dossier?.titel ?? null,
    dossierSectie: (dossier?.hoofdstatus as DossierSectie | null) ?? null,
  }
}

/** Een deadline is alleen het noemen waard als hij dichtbij is. */
function deadlineTekst(deadline: string | null): string | null {
  if (!deadline) return null
  const dag = deadline.slice(0, 10)
  const vandaag = new Date().toISOString().slice(0, 10)
  if (dag < vandaag) return 'deadline verstreken'
  if (dag === vandaag) return 'deadline vandaag'

  const dagen = Math.round(
    (Date.parse(`${dag}T12:00:00Z`) - Date.parse(`${vandaag}T12:00:00Z`)) / 86_400_000,
  )
  if (dagen === 1) return 'deadline morgen'
  if (dagen <= 7) return `deadline over ${dagen} dagen`
  return `deadline ${new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`
}

export async function meldTaakToegewezen(
  taskId: string,
  userIds: (string | null | undefined)[],
  opts?: {
    /**
     * Wie de toewijzing deed. Die krijgt geen melding: een melding over je eigen
     * klik is ruis, en hij is de enige die al weet dat het gebeurd is.
     */
    doorUserId?: string | null
  },
): Promise<void> {
  try {
    const ontvangers = [...new Set(userIds.filter(Boolean) as string[])]
      .filter(uid => uid !== opts?.doorUserId)
    if (ontvangers.length === 0) return

    const taak = await haalTaakContext(taskId)
    if (!taak) return

    const urgent = taak.prioriteit === 'urgent' || taak.prioriteit === 'hoog'
    const staart = [taak.dossierNaam, deadlineTekst(taak.deadline)].filter(Boolean).join(' · ')

    // De desktop krijgt het dossier als bestemming (daar staat de actie in context),
    // anders het eigen actieoverzicht. `naarMobielPad` maakt er op een telefoon
    // `/m/dossiers/<id>` of `/m/taken` van.
    const url = taak.dossierId && taak.dossierSectie
      ? dossierPad(taak.dossierSectie, taak.dossierId)
      : '/mijn-taken'

    await Promise.all(
      ontvangers.map(uid =>
        maakNotificatie({
          user_id: uid,
          type: 'taak',
          titel: urgent ? `Actie voor jou (${taak.prioriteit}): ${taak.titel}` : `Actie voor jou: ${taak.titel}`,
          body: staart || null,
          url,
          dossier_id: taak.dossierId,
          dossier_naam: taak.dossierNaam,
        }),
      ),
    )
  } catch {
    // bewust stil — zie de kop van dit bestand
  }
}
