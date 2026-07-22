import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { isDossierAfgesloten } from '@/components/dossiers/types'

/**
 * Is het dossier nog bewerkbaar? Niet-gooiende variant van `assertDossierBewerkbaar`, voor paden
 * waar een afgesloten dossier geen fout is maar simpelweg betekent dat we niets doen — zoals het
 * materialiseren van aandachtspunten uit een formulier dat een bewoner via een publieke link
 * indient. Die bewoner mag geen 500 krijgen omdat het dossier intussen is afgesloten.
 *
 * Bewust tolerant: een onbekend dossier (bijv. losse calc zonder dossier) geldt als bewerkbaar —
 * we blokkeren alleen wanneer het dossier aantoonbaar afgesloten is.
 */
export async function isDossierBewerkbaar(dossierId: string | null | undefined): Promise<boolean> {
  if (!dossierId) return true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select('hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, bouw7_projectstatus_naam')
    .eq('id', dossierId)
    .maybeSingle()

  return !(data && isDossierAfgesloten(data))
}

/**
 * Server-side vangnet: gooit `GeenToegangError` als het dossier definitief is afgesloten
 * (Financieel afgesloten / Verloren / Vervallen, of Bouw7-projectstatus '07.'). Zulke dossiers
 * zijn overal **alleen-lezen** — roep dit aan bovenin elke muterende server-action die op een
 * dossier werkt, zodat een afgesloten dossier ook via een kale RPC-aanroep onwijzigbaar blijft.
 */
export async function assertDossierBewerkbaar(dossierId: string | null | undefined): Promise<void> {
  if (!(await isDossierBewerkbaar(dossierId))) {
    throw new GeenToegangError('Dit dossier is afgesloten en alleen-lezen')
  }
}

/**
 * Rolkolommen op `dossiers` die iemand tot betrokkene bij het project maken. Gelijk aan
 * `DOSSIER_ROL_KOLOMMEN` in `actions.ts`, die bepaalt welke dossiers je in "mijn dossiers" ziet.
 * Blijven die twee lijsten uit elkaar lopen, dan zie je op mobiel een dossier dat je vervolgens
 * niet mag openen (of andersom).
 */
const PROJECTROL_KOLOMMEN = [
  'project_manager_id',
  'teamleider_id',
  'werkvoorbereider_id',
  'calculator_id',
  'uitvoerder_id',
  'controller_id',
] as const

/**
 * Heeft deze medewerker een projectrol op dit dossier?
 *
 * De mobiele dossierlijst toont alleen je eigen dossiers, maar de detailroutes draaien op de
 * admin-client en checkten dat niet: met een geraden id opende een deeplink elk dossier. Gebruik
 * dit op de mobiele oplever-schermen, waar je punten kunt wijzigen en laat ondertekenen.
 */
export async function heeftProjectrol(
  dossierId: string | null | undefined,
  medewerkerId: string | null | undefined,
): Promise<boolean> {
  if (!dossierId || !medewerkerId) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select(PROJECTROL_KOLOMMEN.join(', '))
    .eq('id', dossierId)
    .maybeSingle()
  if (!data) return false
  return PROJECTROL_KOLOMMEN.some(kolom => data[kolom] === medewerkerId)
}
