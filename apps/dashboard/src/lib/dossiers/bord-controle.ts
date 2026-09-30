import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { logFout } from '@/lib/fouten/log'

/**
 * Vangnet achter de bordindeling (kolom `dossiers.bord`, zie 20260930j_dossier_bord.sql).
 *
 * Elk dossier staat per constructie op één bord, maar twee dingen kunnen daar nog scheef naast
 * liggen, en die moet iemand zien vóórdat een collega "ik kan dossier X niet vinden" meldt:
 *
 *  1. **LB met een verkeerde categorie** (`categorie_conflict`). EVA blokkeert die combinatie,
 *     maar in Bouw7 zelf kan hij ontstaan. Het dossier staat dan met een rode markering op
 *     Servicedesk; de projectleider krijgt één melding per dossier.
 *  2. **EVA-status past niet bij het bord** — bv. een opdracht waarvan Bouw7 op 08 staat. Het bord
 *     zet zo'n kaart in de eerste kolom met een waarschuwing; hier komt de lijst in de foutenlog,
 *     zodat het ook opvalt als niemand dat bord toevallig opent.
 *
 * Draait na de Bouw7-sync (run-cron-sync). Gooit niet: een controle mag de sync niet laten falen.
 */

/** Bovengrens per controle. Normaal zijn het er een handvol; meer is zelf al het signaal. */
const MAX = 500

type Rij = {
  id: string
  dossiernummer: string | null
  titel: string | null
  bord: string
  hoofdstatus: string | null
  servicedesk_substatus: string | null
  bouw7_projectstatus_naam: string | null
  bouw7_categorie_naam: string | null
  project_manager_id: string | null
}

const KOLOMMEN = 'id, dossiernummer, titel, bord, hoofdstatus, servicedesk_substatus, bouw7_projectstatus_naam, bouw7_categorie_naam, project_manager_id'

export async function controleerBordindeling(): Promise<{ conflicten: number; gemeld: number; afwijkend: number }> {
  const supabase = createAdminClient()
  let conflicten = 0
  let gemeld = 0
  let afwijkend = 0

  try {
    // ── 1. LB met een verkeerde categorie ──────────────────────────────────
    const { data: conflictRijen } = await supabase
      .from('dossiers')
      .select(KOLOMMEN)
      .eq('categorie_conflict', true)
      .order('id')
      .limit(MAX)
    const conflict = (conflictRijen ?? []) as Rij[]
    conflicten = conflict.length

    if (conflict.length > 0) {
      // Eén melding per dossier: wie al gewaarschuwd is, krijgt er niet elke sync een bij.
      const { data: eerder } = await supabase
        .from('notificaties')
        .select('dossier_id')
        .eq('type', 'bord_conflict')
        .in('dossier_id', conflict.map(r => r.id))
      const alGemeld = new Set((eerder ?? []).map(r => (r as { dossier_id: string }).dossier_id))

      const plIds = [...new Set(conflict.map(r => r.project_manager_id).filter((v): v is string => !!v))]
      const { data: pls } = plIds.length
        ? await supabase.from('medewerkers').select('id, auth_user_id').in('id', plIds)
        : { data: [] }
      const userVan = new Map((pls ?? []).map(p => [p.id as string, p.auth_user_id as string | null]))

      for (const r of conflict) {
        if (alGemeld.has(r.id)) continue
        const uid = r.project_manager_id ? userVan.get(r.project_manager_id) : null
        if (!uid) continue
        await maakNotificatie({
          user_id: uid,
          type: 'bord_conflict',
          titel: 'Lopende bon met verkeerde categorie',
          body: `Staat in Bouw7 op LB. Lopende bonnen met categorie ${r.bouw7_categorie_naam ?? '(leeg)'}. `
            + 'Zet de categorie in Bouw7 op Dagelijks onderhoud of Mutatie.',
          url: `/servicedesk/${r.id}`,
          dossier_id: r.id,
          dossier_naam: [r.dossiernummer, r.titel].filter(Boolean).join(' · ') || null,
        })
        gemeld++
      }
    }

    // ── 2. EVA-status past niet bij het bord ───────────────────────────────
    const { data: afwijkRijen } = await supabase
      .from('dossiers')
      .select(KOLOMMEN)
      .in('bord', ['aanvragen', 'offertes', 'opdrachten', 'servicedesk'])
      .or(
        'and(bord.eq.aanvragen,or(hoofdstatus.neq.aanvraag,servicedesk_substatus.not.is.null)),' +
        'and(bord.eq.offertes,hoofdstatus.neq.offerte),' +
        'and(bord.eq.opdrachten,hoofdstatus.neq.opdracht),' +
        'and(bord.eq.servicedesk,servicedesk_substatus.is.null)',
      )
      .order('id')
      .limit(MAX)
    const afwijking = (afwijkRijen ?? []) as Rij[]
    afwijkend = afwijking.length

    if (afwijking.length > 0) {
      await logFout({
        omgeving: 'cron',
        bron: 'bouw7-sync/bordcontrole',
        soort: 'bordindeling',
        melding: `${afwijking.length} dossier(s) met een EVA-status die niet bij hun bord past`,
        extra: {
          dossiers: afwijking.slice(0, 50).map(r => ({
            dossiernummer: r.dossiernummer,
            titel: r.titel,
            bord: r.bord,
            hoofdstatus: r.hoofdstatus,
            servicedesk_substatus: r.servicedesk_substatus,
            bouw7_status: r.bouw7_projectstatus_naam,
          })),
        },
      })
    }
  } catch (e) {
    await logFout({
      omgeving: 'cron',
      bron: 'bouw7-sync/bordcontrole',
      melding: e instanceof Error ? e.message : String(e),
    })
  }

  return { conflicten, gemeld, afwijkend }
}
