import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { isServicedeskDossier } from '@/components/dossiers/types'

/**
 * Inkoop-gate: moet elke werkbegrotingregel achter een bestelling geaccordeerd zijn
 * voordat de order of onderaannemersopdracht de deur uit mag?
 *
 * Op een opdracht: altijd. Daar is de werkbegroting het gecontroleerde budget en is een
 * bestelling de uitgave die daarop drukt.
 *
 * Op een servicedeskbon werkt dat niet. Een lekkage wordt dezelfde dag verholpen; wachten
 * op een accordering voor twee dakpannen van € 80 betekent dat er buiten EVA om besteld
 * wordt en de kosten nergens meer op afboeken. Daarom hetzelfde regime als bij de
 * offerte-goedkeuring: pas accorderen vanaf een instelbaar drempelbedrag.
 *
 * De afbakening "servicedesk" is dezelfde als overal elders (`isServicedeskDossier`):
 * Bouw7-projectstatus LB.* of categorie Dagelijks onderhoud/Mutatie. Kan het dossier niet
 * bepaald worden, dan geldt de strenge regel — een onbekend dossier is geen vrijbrief.
 */

const DREMPEL_DEFAULT = 1000


const db = () => createAdminClient()

/** Instelbaar drempelbedrag uit bedrijfsinstellingen.overige.goedkeuring_drempel_inkoop. */
export async function getInkoopDrempel(): Promise<number> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const waarde = (data?.overige as Record<string, unknown> | null)?.goedkeuring_drempel_inkoop
  const n = typeof waarde === 'number' ? waarde : typeof waarde === 'string' ? parseFloat(waarde) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DREMPEL_DEFAULT
}

/**
 * Het regime voor één werkbegroting: `null` = altijd accorderen, een getal = accorderen
 * vanaf dat bedrag. Eén lees-actie, zodat een scherm dat tien voorstellen toetst niet
 * tien keer dezelfde twee rijen ophaalt.
 */
export async function getInkoopDrempelVoorWerkbegroting(werkbegrotingId: string): Promise<number | null> {
  const { data: wb } = await db()
    .from('werkbegrotingen')
    .select('dossier_id')
    .eq('id', werkbegrotingId)
    .maybeSingle()

  // Onbekend dossier is geen vrijbrief: dan geldt de strenge regel.
  if (!wb?.dossier_id) return null

  const { data: dossier } = await db()
    .from('dossiers')
    .select('bouw7_projectstatus_naam, bouw7_categorie_naam')
    .eq('id', wb.dossier_id)
    .maybeSingle()

  if (!dossier || !isServicedeskDossier(dossier)) return null

  return getInkoopDrempel()
}

export type InkoopAccordering = {
  /** Moeten de regels achter deze bestelling geaccordeerd zijn? */
  vereist: boolean
  reden: 'altijd' | 'drempel' | 'onder_drempel'
  /** Drempelbedrag, of null wanneer accordering altijd verplicht is. */
  drempel: number | null
  /** Bedrag (excl. btw) waarop de drempel is getoetst. */
  bedrag: number
}

/**
 * Bepaalt of de accorderingspoort geldt voor een bestelling van `bedrag` onder
 * werkbegroting `werkbegrotingId`.
 */
export async function inkoopAccorderingVereist(
  werkbegrotingId: string,
  bedrag: number,
): Promise<InkoopAccordering> {
  const drempel = await getInkoopDrempelVoorWerkbegroting(werkbegrotingId)
  if (drempel == null) return { vereist: true, reden: 'altijd', drempel: null, bedrag }

  const vereist = bedrag >= drempel
  return { vereist, reden: vereist ? 'drempel' : 'onder_drempel', drempel, bedrag }
}
