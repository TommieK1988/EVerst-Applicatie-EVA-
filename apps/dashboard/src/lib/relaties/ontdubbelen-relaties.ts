'use server'

/**
 * Relaties ontdubbelen: één bedrijf dat in Bouw7 twee keer staat.
 *
 * Bouw7 geeft een contact precies één type. Een bedrijf dat zowel opdrachtgever als
 * leverancier of onderaannemer is, heeft daar dus twee contacten — en die kwamen één-op-één
 * EVA binnen. Het datamodel kan het wél aan: `relaties.types` is een array. Gemeten op
 * 20 september 2026: van de 672 relaties droegen er 666 precies één type.
 *
 * Aan beide kanten van zo'n paar hangt echte administratie. VZB Vastgoed had 7 dossiers en
 * 9 debiteurenregels op de opdrachtgever-rij, en 1 dossier plus een inkoopfactuur op de
 * leverancier-rij. Wie alleen het ene scherm kent, mist de helft.
 *
 * Het samenvoegen zelf gebeurt in de database (`relatie_samenvoegen`), niet hier: er hangen
 * dertig verwijzende kolommen aan `relaties` en dat moet één transactie zijn. Deze laag doet
 * de suggesties, de rechtencheck en de terugkoppeling.
 *
 * Nooit automatisch samenvoegen. De productiedata laat precies zien waarom: "Nationaal
 * Grondbezit B.V.", "… Alfa B.V." en "… Romeo Foxtrot B.V." lijken sterk op elkaar en delen
 * een postcode, maar zijn drie eigen rechtspersonen. Zo ook Flextra Teamwork Oost en West.
 * Daarom is een gelijkende naam hier nooit meer dan `mogelijk`.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'

const db = () => createAdminClient()

type ActionResult = { ok: true; waarschuwing?: string } | { ok: false; error: string }

/* ─── normalisatie ────────────────────────────────────────────────── */

/**
 * Naamsleutel zonder de ruis die de Bouw7-duplicaten juist kenmerkt: rechtsvorm ("B.V.",
 * "v.o.f."), hoofdletters, accenten en leestekens. "Golfbaanbentwoud" en "golfbaanbentwoud"
 * worden hetzelfde, "Technische Unie B.V" en "Technische Unie B.V." ook.
 *
 * De rechtsvorm mag eruit omdat hij in de praktijk willekeurig wel of niet is ingetypt. Een
 * ónderscheidend woord zoals "Oost", "Alfa" of "Projecten" blijft juist staan — dat is vaak
 * het enige verschil tussen twee échte bedrijven.
 */
function naamSleutel(naam: string): string {
  return naam
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|c\.?v\.?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** KvK-nummer als kale cijferreeks; alleen een plausibel nummer telt als sleutel. */
function kvkSleutel(kvk: string | null): string | null {
  const cijfers = (kvk ?? '').replace(/\D/g, '')
  return cijfers.length >= 8 ? cijfers : null
}

function postcodeSleutel(pc: string | null): string | null {
  const s = (pc ?? '').replace(/\s/g, '').toUpperCase()
  return s.length >= 6 ? s : null
}

/** Ruwe trigram-gelijkenis, genoeg om bijna-gelijke namen te vinden zonder pg_trgm. */
function gelijkenis(a: string, b: string): number {
  const tri = (s: string) => {
    const p = `  ${s} `
    const set = new Set<string>()
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3))
    return set
  }
  const A = tri(a), B = tri(b)
  if (A.size === 0 || B.size === 0) return 0
  let gedeeld = 0
  for (const t of A) if (B.has(t)) gedeeld++
  return gedeeld / (A.size + B.size - gedeeld)
}

/* ─── kandidaten ──────────────────────────────────────────────────── */

export type DubbelRelatie = {
  id: string
  naam: string
  types: string[]
  kvk: string | null
  email: string | null
  telefoon: string | null
  plaats: string | null
  bouw7: boolean
  actief: boolean
  /** Waar deze rij aan vastzit; zwaarder weegt = houd deze als blijver. */
  dossiers: number
  inkoopfacturen: number
  debiteuren: number
  contactpersonen: number
}

export type DubbelRelatieGroep = {
  sleutel: string
  /** `zeker` = zelfde KvK, `waarschijnlijk` = identieke naam, `mogelijk` = gelijkende naam. */
  zekerheid: 'zeker' | 'waarschijnlijk' | 'mogelijk'
  reden: string
  /** De aanbevolen blijver staat vooraan: de rij waar het meeste werk aan hangt. */
  relaties: DubbelRelatie[]
}

const ZEKERHEID_ORDE = { zeker: 0, waarschijnlijk: 1, mogelijk: 2 } as const

type KandidaatRij = {
  id: string
  naam: string
  types: string[] | null
  kvk_nummer: string | null
  email: string | null
  telefoon: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  bouw7_id: string | null
  actief: boolean
}

/**
 * Mogelijke duplicaten, gegroepeerd en gescoord. Leest alles en groepeert in geheugen: met
 * ~670 relaties is dat één query, en een SQL-variant met self-joins is hier niet sneller maar
 * wel een stuk lastiger te lezen.
 */
export async function getDubbeleRelaties(): Promise<DubbelRelatieGroep[]> {
  await vereisRecht('relaties', 'lezen')
  const supabase = db()

  const relaties = await haalAlleRijen<KandidaatRij>((van, tot) => supabase
    .from('relaties')
    .select('id, naam, types, kvk_nummer, email, telefoon, adres_postcode, adres_plaats, bouw7_id, actief')
    .is('samengevoegd_in', null)
    .order('id')
    .range(van, tot),
  )

  // Wat er per relatie aan vastzit. Vier gepagineerde scans in plaats van 4×N losse counts;
  // gepagineerd omdat inkoopfacturen en dossiers allang boven de 1000 rijen zitten en
  // PostgREST daar stil afkapt — dan zou de teller te laag uitvallen en zou het scherm de
  // verkeerde rij als blijver aanbevelen.
  const telOp = <T,>(rijen: T[], kies: (r: T) => string | null): Map<string, number> => {
    const map = new Map<string, number>()
    for (const r of rijen) {
      const id = kies(r)
      if (id) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }

  const [dossierRijen, inkoopRijen, debRijen, cpRijen] = await Promise.all([
    haalAlleRijen<{ klant_id: string | null }>((van, tot) => supabase
      .from('dossiers').select('klant_id').not('klant_id', 'is', null).order('id').range(van, tot))
      .catch(() => []),
    haalAlleRijen<{ leverancier_relatie_id: string | null }>((van, tot) => supabase
      .from('inkoopfacturen').select('leverancier_relatie_id')
      .not('leverancier_relatie_id', 'is', null).order('id').range(van, tot))
      .catch(() => []),
    haalAlleRijen<{ klant_relatie_id: string | null }>((van, tot) => supabase
      .from('debiteuren').select('klant_relatie_id')
      .not('klant_relatie_id', 'is', null).order('id').range(van, tot))
      .catch(() => []),
    haalAlleRijen<{ organisatie_id: string | null }>((van, tot) => supabase
      .from('contactpersoon_organisaties').select('organisatie_id')
      .not('organisatie_id', 'is', null).order('id').range(van, tot))
      .catch(() => []),
  ])

  const dossierTel = telOp(dossierRijen, r => r.klant_id)
  const inkoopTel = telOp(inkoopRijen, r => r.leverancier_relatie_id)
  const debTel = telOp(debRijen, r => r.klant_relatie_id)
  const cpTel = telOp(cpRijen, r => r.organisatie_id)

  const alsRelatie = (r: KandidaatRij): DubbelRelatie => ({
    id: r.id,
    naam: r.naam,
    types: r.types ?? [],
    kvk: r.kvk_nummer,
    email: r.email,
    telefoon: r.telefoon,
    plaats: r.adres_plaats,
    bouw7: r.bouw7_id != null,
    actief: r.actief,
    dossiers: dossierTel.get(r.id) ?? 0,
    inkoopfacturen: inkoopTel.get(r.id) ?? 0,
    debiteuren: debTel.get(r.id) ?? 0,
    contactpersonen: cpTel.get(r.id) ?? 0,
  })

  const index = new Map<string, KandidaatRij>()
  const perKvk = new Map<string, string[]>()
  const perNaam = new Map<string, string[]>()

  for (const r of relaties) {
    index.set(r.id, r)
    const k = kvkSleutel(r.kvk_nummer)
    if (k) perKvk.set(k, [...(perKvk.get(k) ?? []), r.id])
    const n = naamSleutel(r.naam)
    if (n) perNaam.set(n, [...(perNaam.get(n) ?? []), r.id])
  }

  const groepen = new Map<string, DubbelRelatieGroep>()
  const voegToe = (ids: string[], zekerheid: DubbelRelatieGroep['zekerheid'], reden: string) => {
    if (ids.length < 2) return
    const sleutel = [...ids].sort().join('|')
    const bestaand = groepen.get(sleutel)
    if (bestaand && ZEKERHEID_ORDE[bestaand.zekerheid] <= ZEKERHEID_ORDE[zekerheid]) return
    groepen.set(sleutel, {
      sleutel,
      zekerheid,
      reden,
      relaties: ids.flatMap(id => { const r = index.get(id); return r ? [alsRelatie(r)] : [] })
        // De aanbevolen blijver eerst: de rij waar de meeste administratie aan hangt.
        .sort((a, b) =>
          (b.dossiers + b.debiteuren) - (a.dossiers + a.debiteuren)
          || (b.inkoopfacturen + b.contactpersonen) - (a.inkoopfacturen + a.contactpersonen)
          || Number(b.actief) - Number(a.actief)
          || Number(Boolean(b.kvk)) - Number(Boolean(a.kvk))
          || a.naam.length - b.naam.length),
    })
  }

  // 1. Zelfde KvK-nummer — de sterkste sleutel die we hebben; dit ís dezelfde rechtspersoon.
  for (const [k, ids] of perKvk) {
    if (ids.length < 2) continue
    voegToe(ids, 'zeker', `Zelfde KvK-nummer (${k})`)
  }

  // 2. Identieke naam na normalisatie. Sterk, maar niet onfeilbaar: twee vestigingen van
  //    hetzelfde concern kunnen bewust apart staan.
  for (const [, ids] of perNaam) {
    if (ids.length < 2) continue
    const kvks = new Set(ids.flatMap(id => { const k = kvkSleutel(index.get(id)?.kvk_nummer ?? null); return k ? [k] : [] }))
    // Twee verschillende KvK-nummers onder dezelfde naam: dat zijn twee rechtspersonen.
    if (kvks.size > 1) continue
    voegToe(ids, 'waarschijnlijk', 'Zelfde naam')
  }

  // 3. Gelijkende naam plus een tweede signaal (postcode of KvK). Nooit hoger dan `mogelijk`:
  //    dit is precies de laag waar "Nationaal Grondbezit Alfa" naast "Nationaal Grondbezit"
  //    opduikt, en dat zijn twee bedrijven.
  const lijst = relaties.filter(r => naamSleutel(r.naam).length > 4)
  for (let i = 0; i < lijst.length; i++) {
    for (let j = i + 1; j < lijst.length; j++) {
      const a = lijst[i], b = lijst[j]
      const na = naamSleutel(a.naam), nb = naamSleutel(b.naam)
      if (na === nb) continue // al afgevangen in stap 2
      const pcA = postcodeSleutel(a.adres_postcode), pcB = postcodeSleutel(b.adres_postcode)
      const kA = kvkSleutel(a.kvk_nummer), kB = kvkSleutel(b.kvk_nummer)
      const tweedeSignaal = (pcA != null && pcA === pcB) || (kA != null && kA === kB)
      if (!tweedeSignaal) continue
      if (kA && kB && kA !== kB) continue // verschillende KvK = verschillende rechtspersoon
      const score = gelijkenis(na, nb)
      if (score < 0.5) continue
      voegToe([a.id, b.id], 'mogelijk',
        `Gelijkende naam${pcA && pcA === pcB ? ' op hetzelfde adres' : ''}`)
    }
  }

  return [...groepen.values()].sort((a, b) =>
    ZEKERHEID_ORDE[a.zekerheid] - ZEKERHEID_ORDE[b.zekerheid]
    || a.relaties[0].naam.localeCompare(b.relaties[0].naam))
}

/* ─── samenvoegen ─────────────────────────────────────────────────── */

/**
 * Voeg één of meer relaties samen in `blijverId`. Per verliezer een eigen aanroep van de
 * database-functie, zodat een fout op de derde de eerste twee niet terugdraait; wat lukt, lukt.
 * Retourneert de log-ids waarmee het terug te draaien is.
 */
export async function voegRelatiesSamen(
  blijverId: string,
  verliezerIds: string[],
): Promise<{ ok: true; logIds: string[]; waarschuwing?: string } | { ok: false; error: string }> {
  let medewerker
  try {
    ({ medewerker } = await vereisRecht('relaties', 'schrijven'))
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt geen rechten om relaties te wijzigen.' }
    throw e
  }

  const supabase = db()
  const logIds: string[] = []
  const fouten: string[] = []

  for (const verliezerId of verliezerIds.filter(id => id !== blijverId)) {
    const { data, error } = await supabase.rpc('relatie_samenvoegen', {
      p_blijver: blijverId,
      p_verliezer: verliezerId,
      p_door: medewerker.auth_user_id ?? undefined,
    })
    if (error) fouten.push(error.message)
    else if (data) logIds.push(data as string)
  }

  if (logIds.length === 0) {
    return { ok: false, error: fouten[0] ?? 'Er is niets samengevoegd.' }
  }

  revalidatePath('/relaties')
  revalidatePath(`/relaties/${blijverId}`)
  return {
    ok: true,
    logIds,
    waarschuwing: fouten.length > 0 ? `${fouten.length} van de ${verliezerIds.length} mislukten: ${fouten[0]}` : undefined,
  }
}

/** Draai een samenvoeging terug: alles wat toen is verplaatst gaat terug naar de oude relatie. */
export async function maakRelatieSamenvoegingOngedaan(logId: string): Promise<ActionResult> {
  try {
    await vereisRecht('relaties', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt geen rechten om relaties te wijzigen.' }
    throw e
  }

  const { error } = await db().rpc('relatie_samenvoegen_ongedaan', { p_log: logId })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/relaties')
  return { ok: true }
}

export type RelatieSamenvoegingLog = {
  id: string
  blijver_id: string
  verliezer_id: string
  blijver_naam: string
  verliezer_naam: string
  created_at: string
  teruggedraaid_op: string | null
}

type LogRij = {
  id: string
  blijver_id: string
  verliezer_id: string
  created_at: string
  teruggedraaid_op: string | null
  blijver: { naam: string } | null
  verliezer: { naam: string } | null
}

/** De laatste samenvoegingen, voor de knop "ongedaan maken" op het dubbelenscherm. */
export async function getRecenteRelatieSamenvoegingen(limiet = 15): Promise<RelatieSamenvoegingLog[]> {
  await vereisRecht('relaties', 'lezen')
  const { data } = await db()
    .from('relatie_samenvoegingen')
    .select('id, blijver_id, verliezer_id, created_at, teruggedraaid_op, blijver:relaties!blijver_id(naam), verliezer:relaties!verliezer_id(naam)')
    .order('created_at', { ascending: false })
    .limit(limiet)

  return ((data ?? []) as unknown as LogRij[]).map(r => ({
    id: r.id,
    blijver_id: r.blijver_id,
    verliezer_id: r.verliezer_id,
    blijver_naam: r.blijver?.naam ?? '?',
    verliezer_naam: r.verliezer?.naam ?? '?',
    created_at: r.created_at,
    teruggedraaid_op: r.teruggedraaid_op,
  }))
}
