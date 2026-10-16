import 'server-only'

/**
 * Nachtelijke automatisering van de offertebewaking (draait ná de Bouw7-sync en de nabel-sync).
 *
 * 1. **Ontvangstcontrole.** Een verzonden offerte zonder afgesproken stap krijgt drie werkdagen
 *    na verzenden de actie "Ontvangst offerte controleren": bij de managementassistent uit de
 *    instellingen, bij een mega bij de eigenaar, bij een kleine offerte bij niemand. Bron
 *    'automatisch': een actie uit de actielijst of een vastgelegde uitkomst wint altijd.
 * 2. **Kleine offertes vervallen.** Een kleine offerte die niemand nabelt, vervalt 30 dagen na
 *    de geldigheid. Via `updateDossierSubstatus`, zodat Bouw7 meebeweegt (Vervallen).
 *
 * Alleen offertes die verzonden zijn vanaf `offerte_automatisering_vanaf` (instelling): de
 * bestaande voorraad wordt niet ineens over de schutting gegooid. Zonder die instelling doet
 * deze ronde niets.
 */

import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { dagenTussenKalender } from '@/lib/dossiers/datum-regels'
import { updateDossierSubstatus } from '@/lib/dossiers/actions'
import { bedragklasse } from './bedragklassen'
import { offerteBedragen } from './dossier-bedragen'
import { werkdagenVooruit } from './types'
import {
  alsOpvolging, ontvangstcontroleDoor, vervaltAutomatisch,
  ONTVANGSTCONTROLE_TEKST, ONTVANGSTCONTROLE_WERKDAGEN,
} from './opvolging'

/** Een ontvangstcontrole heeft na zoveel dagen geen zin meer; dan is het gewoon nabellen. */
const ONTVANGST_MAX_DAGEN = 10
/** Per nacht hooguit zoveel offertes laten vervallen: een rem als er iets onverwachts gebeurt. */
const MAX_VERVALLEN = 25
const BLOK = 150

export type AutomatiseringResultaat = {
  bekeken: number
  ontvangstcontroles: number
  vervallen: number
  fouten: string[]
  overgeslagen?: string
}

type Dossier = {
  id: string
  verzonden_op: string | null
  calculator_id: string | null
  project_manager_id: string | null
  everts_calc_project_id: string | number | null
}

type Kaart = {
  id: string
  dossier_id: string
  stap_soort: string | null
  eigenaar_id: string | null
  opvolging: string | null
}

function blokken<T>(lijst: T[]): T[][] {
  const uit: T[][] = []
  for (let i = 0; i < lijst.length; i += BLOK) uit.push(lijst.slice(i, i + BLOK))
  return uit
}

export async function automatiseerOffertebewaking(): Promise<AutomatiseringResultaat> {
  const res: AutomatiseringResultaat = { bekeken: 0, ontvangstcontroles: 0, vervallen: 0, fouten: [] }
  const supabase = createAdminClient()
  const vandaag = vandaagNL()

  const { data: inst } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (inst?.overige ?? {}) as Record<string, unknown>
  const vanaf = typeof overige.offerte_automatisering_vanaf === 'string' ? overige.offerte_automatisering_vanaf : null
  if (!vanaf) return { ...res, overgeslagen: 'geen offerte_automatisering_vanaf ingesteld' }
  const assistentId = typeof overige.offerte_ontvangstcontrole_medewerker_id === 'string'
    ? overige.offerte_ontvangstcontrole_medewerker_id : null
  const geldigheidDagen = Number(overige.offerte_geldigheid_dagen) > 0 ? Number(overige.offerte_geldigheid_dagen) : 30

  // ── Open offertes, verzonden vanaf de startdatum ────────────────────────────
  const dossiers = await haalAlleRijen<Dossier>((van, tot) => supabase.from('dossiers')
    .select('id, verzonden_op, calculator_id, project_manager_id, everts_calc_project_id')
    .eq('hoofdstatus', 'offerte')
    .or('offerte_substatus.is.null,offerte_substatus.not.in.(verloren,vervallen,gewonnen)')
    .or('gearchiveerd.is.null,gearchiveerd.eq.false')
    .gte('verzonden_op', vanaf)
    .order('id')
    .range(van, tot))
  res.bekeken = dossiers.length
  if (dossiers.length === 0) return res
  const ids = dossiers.map(d => d.id)

  // ── Kaarten, bedragen en geldigheid ─────────────────────────────────────────
  const kaarten = new Map<string, Kaart>()
  const geldigTot = new Map<string, string>()
  const projectNaarDossier = new Map(
    dossiers.filter(d => d.everts_calc_project_id != null).map(d => [String(d.everts_calc_project_id), d.id]),
  )
  for (const blok of blokken(ids)) {
    const { data } = await supabase.from('commercie_bewaking')
      .select('id, dossier_id, stap_soort, eigenaar_id, opvolging').in('dossier_id', blok)
    for (const k of (data ?? []) as Kaart[]) kaarten.set(k.dossier_id, k)
  }
  // De nieuwste verzonden EVA-offerte per dossier; hangt aan het dossier of aan het calculatieproject.
  const zetGeldig = (rijen: { dossier_id: string | null; project_id: string | number | null; geldig_tot: string | null }[]) => {
    for (const q of rijen) {
      const id = q.dossier_id ?? (q.project_id != null ? projectNaarDossier.get(String(q.project_id)) : undefined)
      if (id && q.geldig_tot && (geldigTot.get(id) ?? '') < q.geldig_tot) geldigTot.set(id, q.geldig_tot)
    }
  }
  const quoteSelect = 'dossier_id, project_id, geldig_tot'
  for (const blok of blokken(ids)) {
    const { data } = await supabase.from('quotes').select(quoteSelect)
      .in('dossier_id', blok).eq('status', 'verzonden').is('meerwerk_regel_id', null).neq('type', 'interne_calculatie')
    zetGeldig(data ?? [])
  }
  for (const blok of blokken([...projectNaarDossier.keys()])) {
    const { data } = await supabase.from('quotes').select(quoteSelect)
      .in('project_id', blok).eq('status', 'verzonden').is('meerwerk_regel_id', null).neq('type', 'interne_calculatie')
    zetGeldig(data ?? [])
  }
  const bedragen = await offerteBedragen(ids)

  // ── Per offerte ─────────────────────────────────────────────────────────────
  for (const d of dossiers) {
    const kaart = kaarten.get(d.id)
    const opvolging = alsOpvolging(kaart?.opvolging)
    const klasse = bedragklasse(bedragen.get(d.id) ?? null)
    const verzonden = d.verzonden_op?.slice(0, 10) ?? null

    // 2. Klein, niet opgevolgd, ruim over de geldigheid: vervallen.
    const geldig = geldigTot.get(d.id) ?? (verzonden ? plusDagen(verzonden, geldigheidDagen) : null)
    if (res.vervallen < MAX_VERVALLEN && vervaltAutomatisch({ klasse, opvolging, geldigTot: geldig, vandaag })) {
      try {
        const r = await updateDossierSubstatus(d.id, 'vervallen', { schrijfBouw7: true })
        if (!r.ok) { res.fouten.push(`${d.id}: ${r.error}`); continue }
        await legRedenVast(d.id)
        if (kaart) {
          await supabase.from('commercie_gebeurtenissen').insert({
            bewaking_id: kaart.id, soort: 'notitie',
            tekst: 'Automatisch vervallen: kleine offerte, 30 dagen na de geldigheid niet opgevolgd.',
          })
        }
        res.vervallen++
      } catch (e) {
        res.fouten.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
      continue
    }

    // 1. Ontvangstcontrole: alleen zonder afgesproken stap, en kort na verzenden.
    if (kaart?.stap_soort || !verzonden) continue
    const dagenSinds = dagenTussenKalender(verzonden, vandaag)
    if (dagenSinds == null || dagenSinds > ONTVANGST_MAX_DAGEN) continue
    // Bij een mega is de projectleider de vanzelfsprekende eigenaar.
    const eigenaarId = kaart?.eigenaar_id ?? (klasse === 'mega' ? d.project_manager_id : d.calculator_id) ?? null
    const door = ontvangstcontroleDoor(klasse, opvolging, { assistentId, eigenaarId })
    if (!door) continue

    const gepland = werkdagenVooruit(verzonden, ONTVANGSTCONTROLE_WERKDAGEN)
    const velden = {
      stap_soort: 'actie', stap_tekst: ONTVANGSTCONTROLE_TEKST,
      stap_datum: gepland < vandaag ? vandaag : gepland, wacht_op: null,
      actiehouder_id: door, eigenaar_id: eigenaarId, stap_bron: 'automatisch',
    }
    const { data: rij, error } = kaart
      ? await supabase.from('commercie_bewaking').update(velden).eq('id', kaart.id).select('id').single()
      : await supabase.from('commercie_bewaking').insert({ dossier_id: d.id, soort: 'offerte', ...velden }).select('id').single()
    if (error || !rij) { res.fouten.push(`${d.id}: ${error?.message ?? 'onbekend'}`); continue }
    await supabase.from('commercie_gebeurtenissen').insert({
      bewaking_id: rij.id, soort: 'stap', naar_actiehouder_id: door,
      tekst: 'EVA heeft de ontvangstcontrole ingepland.',
    })
    res.ontvangstcontroles++
  }

  return res
}

function plusDagen(iso: string, dagen: number): string {
  const [j, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d + dagen)).toISOString().slice(0, 10)
}

/**
 * Zet de reden op de historierij die de DB-trigger zojuist schreef (zelfde aanpak als
 * `legAfsluitRedenVast` in actions.ts: aanvullen, geen tweede rij, anders telt de doorlooptijd dubbel).
 */
async function legRedenVast(dossierId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('dossier_status_historie')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('naar_offerte_substatus', 'vervallen')
    .is('reden', null)
    .order('op', { ascending: false })
    .limit(1)
  const rij = (data ?? [])[0]
  if (rij) {
    await supabase.from('dossier_status_historie')
      .update({ reden: 'Geen reactie meer van klant — automatisch: kleine offerte, niet nagebeld' })
      .eq('id', rij.id)
  }
}
