// Schrijft de gespiegelde meetstaat (zie spiegel.ts) naar de eigen tabellen.
//
// Wordt aangeroepen vanuit bewaarCalculatieSnapshot, ná een geslaagde opslag van de
// snapshot. De snapshot blijft in fase 1a de bron van waarheid: deze spiegel mag de
// opslag nooit laten mislukken. Fouten gaan naar het foutenlog en verder niet.
//
// Archiveren, niet verwijderen (DEVELOPMENT_STANDARDS §5.5): een regel die uit de
// meetstaat verdwijnt krijgt `vervallen_op`; een meetstaat die uit de calculatie
// verdwijnt krijgt status `gearchiveerd`. Komt een regel terug, dan zet de upsert
// `vervallen_op` weer op null.

import { logFout } from '@/lib/fouten/log'
import { spiegelRijen, type SpiegelInvoer } from './spiegel'

// De nieuwe tabellen staan (nog) niet in de gegenereerde types. De aanroeper geeft
// zijn eigen client mee; hier is alleen `from()` nodig.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (tabel: string) => any }

type DbFout = { code?: string; message: string } | null

/** Tabel bestaat nog niet: de migratie is nog niet toegepast. Dan stil overslaan. */
function tabelOntbreekt(fout: DbFout): boolean {
  return !!fout && (fout.code === '42P01' || fout.code === 'PGRST205')
}

function check(fout: DbFout, stap: string) {
  if (fout) throw Object.assign(new Error(`${stap}: ${fout.message}`), { code: fout.code })
}

export async function spiegelMeetstaten(db: Db, projectId: string, invoer: SpiegelInvoer): Promise<void> {
  try {
    // Eerst: welke meetstaten hingen hier al aan. Geen meetstaat nu en geen eerder:
    // niets te doen, en dat is verreweg het vaakst (de meeste calculaties hebben er geen).
    const { data: eerder, error: eerderFout } = await db
      .from('meetstaat_gebruik')
      .select('meetstaat_id')
      .eq('project_id', projectId)
    if (tabelOntbreekt(eerderFout)) return
    check(eerderFout, 'gebruik lezen')
    const eerderIds: string[] = [...new Set<string>((eerder ?? []).map((r: { meetstaat_id: string }) => r.meetstaat_id))]
    if ((invoer.meetstaten ?? []).length === 0 && eerderIds.length === 0) return

    const { data: dossier, error: dossierFout } = await db
      .from('dossiers')
      .select('id, object_id')
      .eq('everts_calc_project_id', projectId)
      .maybeSingle()
    check(dossierFout, 'dossier zoeken')
    // Calculatie zonder dossier (losse calculatie): geen plek om aan te hangen.
    if (!dossier) return

    const nu = new Date().toISOString()
    const rijen = spiegelRijen(invoer, {
      projectId,
      dossierId: dossier.id as string,
      objectId: (dossier.object_id as string | null) ?? null,
      nu,
    })
    const huidig = new Set(rijen.meetstaten.map(m => m.id))
    const verdwenen = eerderIds.filter(id => !huidig.has(id))

    if (rijen.meetstaten.length > 0) {
      check((await db.from('meetstaten')
        .upsert(rijen.meetstaten.map(m => ({ ...m, status: 'actief', bijgewerkt_op: nu })), { onConflict: 'id' })).error,
        'meetstaten')
    }
    if (rijen.delen.length > 0) {
      check((await db.from('gebouw_delen')
        .upsert(rijen.delen.map(d => ({ ...d, bijgewerkt_op: nu })), { onConflict: 'id' })).error,
        'delen')
    }
    if (rijen.regels.length > 0) {
      check((await db.from('meetstaat_regels')
        .upsert(rijen.regels.map(r => ({ ...r, bijgewerkt_op: nu })), { onConflict: 'id' })).error,
        'regels')
    }
    if (rijen.gebruik.length > 0) {
      check((await db.from('meetstaat_gebruik')
        .upsert(rijen.gebruik, { onConflict: 'meetstaat_id,project_id,scenario_id' })).error,
        'gebruik')
    }

    // Regels die uit een meetstaat verdwenen zijn: afsluiten.
    for (const m of rijen.meetstaten) {
      const ids = rijen.regels.filter(r => r.meetstaat_id === m.id).map(r => r.id)
      let q = db.from('meetstaat_regels')
        .update({ vervallen_op: nu, bijgewerkt_op: nu })
        .eq('meetstaat_id', m.id)
        .is('vervallen_op', null)
      if (ids.length > 0) q = q.not('id', 'in', `(${ids.join(',')})`)
      check((await q).error, 'regels afsluiten')
    }

    if (verdwenen.length > 0) {
      check((await db.from('meetstaten')
        .update({ status: 'gearchiveerd', bijgewerkt_op: nu })
        .in('id', verdwenen)
        .eq('status', 'actief')).error,
        'meetstaten archiveren')
    }
  } catch (e) {
    if (tabelOntbreekt(e as DbFout)) return
    await logFout({
      omgeving: 'server',
      bron: 'meetstaat/spiegel',
      melding: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack ?? null : null,
      extra: { projectId },
    })
  }
}
