'use server'

import { losseTabel, tekst, type Rij } from '@/lib/supabase/losse-tabel'
import { vereisSessie } from '@/lib/auth/rechten'
import { kiesUurtarief, type TariefBron } from '@/lib/houtrotherstel/handmatige-regel'

/**
 * Standaardwaarden voor een handmatige houtrotregel in één dossier: per functie
 * (uursoort) het voorgestelde uurtarief, plus de opslag en eenheden uit
 * Bedrijfsinstellingen. Server action, want de houtrot-client staat op het
 * `houtrotherstel`-schema en kan de stamtabellen in `public` niet lezen.
 */
export type FunctieTarief = {
  naam: string
  verkoop: number
  kostprijs: number
  bron: TariefBron
}

export type HandmatigeStandaarden = {
  functies: FunctieTarief[]
  /** Standaard opslag op materiaal (en op kostprijs-uren zonder verkooptarief). */
  opslagPct: number
  eenheden: string[]
}

/** Zelfde terugval als de regie-facturatie (`lib/dossiers/servicedesk.ts`). */
const OPSLAG_STANDAARD = 25
const EENHEDEN_STANDAARD = ['st', 'm¹', 'm²', 'm³', 'uur', 'dag', 'ltr', 'kg', 'set']

const getalOfNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export async function getHandmatigeStandaarden(dossierId: string): Promise<HandmatigeStandaarden> {
  await vereisSessie()
  const db = losseTabel()

  const [{ data: dossier }, { data: uursoorten }, { data: inst }] = await Promise.all([
    db.from('dossiers').select('klant_id').eq('id', dossierId).maybeSingle(),
    // Stamtabel van een handvol functies; de limiet is een vangnet, geen paginering.
    db.from('planning_uursoorten')
      .select('id, naam, tarief_verkoop, tarief_kostprijs, volgorde')
      .eq('actief', true)
      .order('volgorde')
      .limit(500),
    db.from('bedrijfsinstellingen').select('uurtarieven, overige, eenheden').eq('id', 1).maybeSingle(),
  ])

  const klantId = tekst(dossier, 'klant_id')
  const afspraken = new Map<string, Rij>()
  if (klantId) {
    const { data } = await db.from('relatie_uurtarieven')
      .select('uursoort_id, tarief_verkoop, tarief_kostprijs')
      .eq('relatie_id', klantId)
    for (const r of data ?? []) afspraken.set(tekst(r, 'uursoort_id'), r)
  }

  const overige = (inst?.overige ?? {}) as Rij
  const opslag = getalOfNull(overige.regie_opslag_pct)
  const opslagPct = opslag != null && opslag >= 0 ? opslag : OPSLAG_STANDAARD

  // Bedrijfstarieven op label ("Arbeid timmerman"). Per functie het tarief waarvan het
  // label de functienaam bevat, anders het favoriete (of eerste) tarief.
  const tarieven = (Array.isArray(inst?.uurtarieven) ? inst.uurtarieven : []) as Rij[]
  const favoriet = tarieven.find(t => t.is_favoriet === true) ?? tarieven[0]
  const bedrijfstariefVoor = (naam: string): number | null => {
    const n = naam.toLowerCase()
    const raak = n ? tarieven.find(t => tekst(t, 'label').toLowerCase().includes(n)) : undefined
    return getalOfNull((raak ?? favoriet)?.tarief)
  }

  const functies = (uursoorten ?? []).map((u): FunctieTarief => {
    const naam = tekst(u, 'naam')
    const afspraak = afspraken.get(tekst(u, 'id'))
    return {
      naam,
      ...kiesUurtarief({
        opdrachtgeverVerkoop: getalOfNull(afspraak?.tarief_verkoop),
        opdrachtgeverKostprijs: getalOfNull(afspraak?.tarief_kostprijs),
        functieVerkoop: getalOfNull(u.tarief_verkoop),
        functieKostprijs: getalOfNull(u.tarief_kostprijs),
        bedrijfstarief: bedrijfstariefVoor(naam),
        opslagPct,
      }),
    }
  }).filter(f => f.naam)

  const eenhedenRuw = (Array.isArray(inst?.eenheden) ? inst.eenheden : []) as Rij[]
  const eenheden = eenhedenRuw.map(e => tekst(e, 'afkorting')).filter(Boolean)

  return {
    functies,
    opslagPct,
    eenheden: eenheden.length > 0 ? eenheden : EENHEDEN_STANDAARD,
  }
}
