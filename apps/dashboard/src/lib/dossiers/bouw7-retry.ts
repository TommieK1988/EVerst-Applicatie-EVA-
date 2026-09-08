'use server'

/**
 * Herkansing van write-backs naar Bouw7 die eerder mislukten.
 *
 * Alles wat een gebruiker in EVA wijzigt gaat meteen naar Bouw7; mislukt dat (storing, verlopen
 * sessie, veld dat Bouw7 niet overnam), dan staat de kolom in `handmatige_velden` van de rij en
 * laat de lees-sync hem met rust — anders was de EVA-wijziging de volgende ochtend weg. Deze
 * module probeert die writes opnieuw, vóór de lees-sync draait, en ontmarkeert bij succes zodat
 * Bouw7 en EVA daarna weer gelijk lopen. Zie lib/bouw7/handmatige-velden.ts.
 *
 * Bewust alleen wat naar Bouw7 kán: de servicedesk-kolom heeft geen Bouw7-tegenhanger en het
 * e-mailadres van een medewerker wordt nooit geschreven (dat is in Bouw7 de inlognaam).
 */

import { createAdminClient } from '@everts/database/server'
import { logSync, type SyncResult } from '@/lib/bouw7/sync'
import {
  BOUW7_DOSSIER_ROL_VELDEN, BOUW7_DOSSIER_STATUS_VELDEN, ontmarkeerHandmatig,
} from '@/lib/bouw7/handmatige-velden'
import { BOUW7_PROJECT_SCHRIJFVELDEN } from '@/lib/bouw7/project-velden'
import { schrijfBouw7Medewerker, BOUW7_MEDEWERKER_SCHRIJFVELDEN } from '@/lib/bouw7/employee-write'
import {
  herhaalDossierRollenWriteBack, herhaalDossierStatusWriteBack, herhaalDossierVeldenWriteBack,
} from './actions'
import { schrijfRelatieNaarBouw7 } from '@/lib/relaties/actions'
import { schrijfContactpersoonNaarBouw7 } from '@/lib/relaties/contactpersonen-actions'
import { zetMeerwerkAlsTermijn } from './meerwerk-termijn'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type Telling = { geslaagd: number; mislukt: number; meldingen: string[] }
const tel = (): Telling => ({ geslaagd: 0, mislukt: 0, meldingen: [] })
const noteer = (t: Telling, ok: boolean, label: string, fout?: string) => {
  if (ok) t.geslaagd++
  else { t.mislukt++; if (t.meldingen.length < 3) t.meldingen.push(`${label}: ${fout ?? 'onbekend'}`) }
}

/**
 * Probeert alle openstaande write-backs opnieuw. Met `dossierId` alleen dat ene dossier (de
 * verversknop); relaties, medewerkers en meerwerk draaien dan niet mee. Faalt nooit hard: wat
 * opnieuw mislukt blijft gewoon gemarkeerd tot de volgende run.
 */
export async function herhaalUitgesteldeDossierWrites(opts?: { dossierId?: string }): Promise<SyncResult> {
  const start = Date.now()
  const t = tel()
  const supabase = db()

  // ── Dossiers: rollen, statussen, velden, aanneemsom ────────────────────────────
  try {
    const bereik = [...BOUW7_DOSSIER_ROL_VELDEN, ...BOUW7_DOSSIER_STATUS_VELDEN, ...BOUW7_PROJECT_SCHRIJFVELDEN, 'aanneemsom']
    let q = supabase
      .from('dossiers')
      .select('id, dossiernummer, handmatige_velden')
      .not('bouw7_id', 'is', null)
      .overlaps('handmatige_velden', bereik)
      .limit(500) // meer dan een handvol openstaande writes betekent een storing, geen backlog
    if (opts?.dossierId) q = q.eq('id', opts.dossierId)
    const { data, error } = await q
    if (error) throw new Error(error.message)

    for (const d of (data ?? []) as { id: string; dossiernummer: string | null; handmatige_velden: string[] }[]) {
      const velden = d.handmatige_velden ?? []
      const label = d.dossiernummer ?? d.id.slice(0, 8)
      const heeft = (lijst: readonly string[]) => velden.some(v => lijst.includes(v))
      const uitkomsten: { ok: boolean; error?: string }[] = []
      if (heeft(BOUW7_DOSSIER_ROL_VELDEN)) uitkomsten.push(await herhaalDossierRollenWriteBack(d.id))
      if (heeft(BOUW7_DOSSIER_STATUS_VELDEN)) uitkomsten.push(await herhaalDossierStatusWriteBack(d.id))
      if (heeft(BOUW7_PROJECT_SCHRIJFVELDEN) || velden.includes('aanneemsom')) uitkomsten.push(await herhaalDossierVeldenWriteBack(d.id))
      const mislukt = uitkomsten.filter(u => !u.ok)
      noteer(t, mislukt.length === 0, label, mislukt[0]?.error)
    }
  } catch (e: unknown) {
    noteer(t, false, 'dossiers', e instanceof Error ? e.message : 'Herkansing mislukt')
  }

  if (!opts?.dossierId) {
    // ── Relaties ─────────────────────────────────────────────────────────────────
    try {
      const { data } = await supabase
        .from('relaties')
        .select('id, naam, handmatige_velden')
        .not('bouw7_id', 'is', null)
        .neq('handmatige_velden', '{}')
        .limit(500)
      for (const r of (data ?? []) as { id: string; naam: string; handmatige_velden: string[] }[]) {
        const w = await schrijfRelatieNaarBouw7(supabase, r.id, r.handmatige_velden ?? [])
        noteer(t, w === undefined, r.naam, w)
      }
      // IBAN's die nog niet zijn aangekomen.
      const { data: bank } = await supabase
        .from('relatie_bankgegevens')
        .select('relatie_id, handmatige_velden')
        .neq('handmatige_velden', '{}')
        .limit(500)
      for (const b of (bank ?? []) as { relatie_id: string; handmatige_velden: string[] }[]) {
        const w = await schrijfRelatieNaarBouw7(supabase, b.relatie_id, b.handmatige_velden ?? [])
        noteer(t, w === undefined, `iban ${b.relatie_id.slice(0, 8)}`, w)
      }
    } catch (e: unknown) {
      noteer(t, false, 'relaties', e instanceof Error ? e.message : 'Herkansing mislukt')
    }

    // ── Contactpersonen ──────────────────────────────────────────────────────────
    try {
      const { data } = await supabase
        .from('contactpersonen')
        .select('id, voornaam, achternaam, handmatige_velden')
        .not('bouw7_id', 'is', null)
        .neq('handmatige_velden', '{}')
        .limit(500)
      for (const c of (data ?? []) as { id: string; voornaam: string; achternaam: string; handmatige_velden: string[] }[]) {
        const w = await schrijfContactpersoonNaarBouw7(supabase, c.id, c.handmatige_velden ?? [])
        noteer(t, w === undefined, `${c.voornaam} ${c.achternaam}`, w)
      }
    } catch (e: unknown) {
      noteer(t, false, 'contactpersonen', e instanceof Error ? e.message : 'Herkansing mislukt')
    }

    // ── Medewerkers ──────────────────────────────────────────────────────────────
    try {
      const { data } = await supabase
        .from('medewerkers')
        .select('id, voornaam, achternaam, handmatige_velden')
        .not('bouw7_id', 'is', null)
        .overlaps('handmatige_velden', [...BOUW7_MEDEWERKER_SCHRIJFVELDEN])
        .limit(500)
      for (const m of (data ?? []) as { id: string; voornaam: string; achternaam: string; handmatige_velden: string[] }[]) {
        const open = (m.handmatige_velden ?? []).filter(v => (BOUW7_MEDEWERKER_SCHRIJFVELDEN as readonly string[]).includes(v))
        const res = await schrijfBouw7Medewerker(m.id, open)
        if (res.geschreven.length > 0) await ontmarkeerHandmatig(supabase, 'medewerkers', m.id, res.geschreven).catch(() => {})
        const ok = res.ok && res.nietOvergenomen.length === 0
        noteer(t, ok, `${m.voornaam} ${m.achternaam}`, res.ok ? `niet overgenomen: ${res.nietOvergenomen.join(', ')}` : res.error)
      }
    } catch (e: unknown) {
      noteer(t, false, 'medewerkers', e instanceof Error ? e.message : 'Herkansing mislukt')
    }

    // ── Aangenomen meerwerk waarvan de termijn bij akkoord niet gezet kon worden ────
    // Bewust alléén `bouw7_term_pending`: bij livegang stonden er 118 aangenomen regels zonder
    // termijn-id die destijds met de hand in Bouw7 zijn afgehandeld. Die alsnog schrijven zou
    // dubbele termijnen (en dus dubbele facturen) opleveren.
    try {
      const { data } = await supabase
        .from('meerwerk_regels')
        .select('id, omschrijving, dossiers!dossier_id ( bouw7_id )')
        .eq('bouw7_term_pending', true)
        .is('bouw7_term_id', null)
        .limit(200)
      for (const r of (data ?? []) as { id: string; omschrijving: string | null; dossiers?: { bouw7_id: string | null } | null }[]) {
        if (!r.dossiers?.bouw7_id) continue
        const res = await zetMeerwerkAlsTermijn(r.id)
        // "Geen termijnstaat" is geen storing maar een keuze van de gebruiker; telt niet als fout.
        if (!res.ok && /geen termijnstaat|eigen termijnstaat/i.test(res.error)) continue
        noteer(t, res.ok, `meerwerk ${r.omschrijving ?? r.id.slice(0, 8)}`, res.ok ? undefined : res.error)
      }
    } catch (e: unknown) {
      noteer(t, false, 'meerwerk', e instanceof Error ? e.message : 'Herkansing mislukt')
    }
  }

  const result: SyncResult = { nieuw: 0, bijgewerkt: t.geslaagd, fouten: t.mislukt, overgeslagen: 0 }
  if (t.meldingen.length > 0) result.foutMelding = t.meldingen.join(' | ')
  // Alleen loggen als er iets te doen was: een lege run elke cron vervuilt sync_log.
  if (t.geslaagd + t.mislukt > 0) await logSync('bouw7_writes', 'out', result, Date.now() - start)
  return result
}
