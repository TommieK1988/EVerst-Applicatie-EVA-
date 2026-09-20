'use server'

/**
 * Contactpersonen ontdubbelen.
 *
 * Bouw7 kan een contactpersoon maar aan één contact hangen, dus wie voor twee bedrijven werkt
 * staat er twee keer — en die duplicaten kwamen één-op-één EVA binnen. Hier zitten de
 * suggesties (welke rijen zijn waarschijnlijk dezelfde mens?) en het samenvoegen zelf.
 *
 * Het samenvoegen gebeurt in de database (`contactpersoon_samenvoegen`), niet hier: er worden
 * zeven tabellen omgehangen en dat moet één transactie zijn. Deze laag doet de rechtencheck,
 * de terugkoppeling en het opnieuw ophalen.
 *
 * Nooit automatisch samenvoegen. Uit de productiedata (sep 2026) bleek waarom: vier
 * "personen" deelden crediteuren@schepvastgoed.nl en drie deelden het klantcontactcentrum van
 * Vidomes. Dat zijn gedeelde postbussen, geen dubbele mensen.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type { ContactpersoonSoort } from '@everts/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActionResult = { ok: true; waarschuwing?: string } | { ok: false; error: string }

/* ─── normalisatie ────────────────────────────────────────────────── */

/**
 * Naamsleutel zonder de ruis die Bouw7-duplicaten juist kenmerkt: dubbele spaties
 * ("Jasmijn  Bihari" staat letterlijk naast "Jasmijn Bihari"), hoofdletters, accenten
 * ("Karagül") en leestekens.
 */
function naamSleutel(p: { voornaam: string | null; tussenvoegsel?: string | null; achternaam: string | null }): string {
  return [p.voornaam, p.tussenvoegsel, p.achternaam]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function emailSleutel(email: string | null): string | null {
  const e = (email ?? '').trim().toLowerCase()
  return e.includes('@') ? e : null
}

function telefoonSleutel(nr: string | null): string | null {
  const cijfers = (nr ?? '').replace(/\D/g, '').replace(/^0031/, '0').replace(/^31/, '0')
  // Alleen mobiele nummers: een vast bedrijfsnummer delen collega's, dat zegt niets.
  return /^06\d{8}$/.test(cijfers) ? cijfers : null
}

/**
 * Postbussen die een heel kantoor deelt. Deze adressen mogen nóóit tot een suggestie leiden:
 * drie collega's van dezelfde beheerder zijn geen dubbele persoon.
 */
const POSTBUS_LOKAAL = new RegExp(
  '^(' + [
    'info', 'contact', 'mail', 'post', 'algemeen', 'secretariaat', 'administratie',
    'boekhouding', 'crediteuren', 'debiteuren', 'facturen', 'factuur', 'facturatie',
    'klantcontact', 'klantcontactcentrum', 'kcc', 'klantenservice', 'servicedesk', 'service',
    'services', 'beheer', 'vve', 'planning', 'werkvoorbereiding', 'onderhoud', 'storing',
    'storingen', 'melding', 'meldingen', 'verhuur', 'techniek', 'support', 'office', 'backoffice',
    'bo', 'frontoffice', 'balie', 'receptie', 'noreply', 'no-reply',
  ].join('|') + ')([.\\-_+].*)?$'
)

/** True als dit adres een gedeelde postbus is in plaats van dat van één mens. */
function postbusCheck(email: string | null): boolean {
  const e = emailSleutel(email)
  if (!e) return false
  return POSTBUS_LOKAAL.test(e.split('@')[0])
}

/* ─── kandidaten ──────────────────────────────────────────────────── */

export type DubbelPersoon = {
  id: string
  naam: string
  email: string | null
  telefoon: string | null
  mobiel: string | null
  functie: string | null
  soort: ContactpersoonSoort
  bouw7: boolean
  organisaties: { id: string; naam: string }[]
  /** Aantal dossiers waarop deze persoon de contactpersoon is; zwaarder weegt = houd deze. */
  dossiers: number
  laatst: string
}

export type DubbelGroep = {
  sleutel: string
  /** `zeker` = naam én e-mail gelijk, `waarschijnlijk` = e-mail of mobiel, `mogelijk` = alleen de naam. */
  zekerheid: 'zeker' | 'waarschijnlijk' | 'mogelijk'
  reden: string
  /** De aanbevolen blijver staat vooraan: meeste dossiers, dan meeste ingevulde velden. */
  personen: DubbelPersoon[]
}

const ZEKERHEID_ORDE = { zeker: 0, waarschijnlijk: 1, mogelijk: 2 } as const

/**
 * Mogelijke duplicaten, gegroepeerd en gescoord. Leest alles en groepeert in geheugen: met
 * ~350 personen is dat één query, en een SQL-variant met drie self-joins is hier niet sneller
 * maar wel onleesbaar.
 */
export async function getDubbelKandidaten(): Promise<DubbelGroep[]> {
  await vereisRecht('relaties', 'lezen')
  const supabase = db()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personen = await haalAlleRijen<any>((van, tot) => supabase
    .from('contactpersonen')
    .select('id, voornaam, tussenvoegsel, achternaam, email, telefoon, mobiel, soort, bouw7_id, updated_at, samengevoegd_in')
    .is('samengevoegd_in', null)
    .order('id')
    .range(van, tot),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const koppels = await haalAlleRijen<any>((van, tot) => supabase
    .from('contactpersoon_organisaties')
    .select('contactpersoon_id, functie, organisatie:relaties(id, naam)')
    .order('id')
    .range(van, tot),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossiers = await haalAlleRijen<any>((van, tot) => supabase
    .from('dossiers')
    .select('contactpersoon_id')
    .not('contactpersoon_id', 'is', null)
    .order('id')
    .range(van, tot),
  )

  const dossierTelling = new Map<string, number>()
  for (const d of dossiers ?? []) {
    dossierTelling.set(d.contactpersoon_id, (dossierTelling.get(d.contactpersoon_id) ?? 0) + 1)
  }

  const orgPerPersoon = new Map<string, { id: string; naam: string }[]>()
  const functiePerPersoon = new Map<string, string | null>()
  for (const k of koppels ?? []) {
    if (k.organisatie) {
      const lijst = orgPerPersoon.get(k.contactpersoon_id) ?? []
      lijst.push({ id: k.organisatie.id, naam: k.organisatie.naam })
      orgPerPersoon.set(k.contactpersoon_id, lijst)
    }
    if (k.functie && !functiePerPersoon.get(k.contactpersoon_id)) {
      functiePerPersoon.set(k.contactpersoon_id, k.functie)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alsPersoon = (p: any): DubbelPersoon => ({
    id: p.id,
    naam: [p.voornaam, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    email: p.email, telefoon: p.telefoon, mobiel: p.mobiel,
    functie: functiePerPersoon.get(p.id) ?? null,
    soort: (p.soort ?? 'persoon') as ContactpersoonSoort,
    bouw7: p.bouw7_id != null,
    organisaties: orgPerPersoon.get(p.id) ?? [],
    dossiers: dossierTelling.get(p.id) ?? 0,
    laatst: p.updated_at,
  })

  // Alleen echte mensen; een als contactpersoon geregistreerde VvE of postbus doet niet mee.
  const kandidaten = (personen ?? []).filter((p: { soort?: string }) => (p.soort ?? 'persoon') === 'persoon')

  const perNaam = new Map<string, string[]>()
  const perEmail = new Map<string, string[]>()
  const perMobiel = new Map<string, string[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const index = new Map<string, any>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of kandidaten as any[]) {
    index.set(p.id, p)
    const n = naamSleutel(p)
    if (n) perNaam.set(n, [...(perNaam.get(n) ?? []), p.id])
    const e = emailSleutel(p.email)
    if (e && !postbusCheck(p.email)) perEmail.set(e, [...(perEmail.get(e) ?? []), p.id])
    const m = telefoonSleutel(p.mobiel) ?? telefoonSleutel(p.telefoon)
    if (m) perMobiel.set(m, [...(perMobiel.get(m) ?? []), p.id])
  }

  const groepen = new Map<string, DubbelGroep>()
  const voegToe = (ids: string[], zekerheid: DubbelGroep['zekerheid'], reden: string) => {
    if (ids.length < 2) return
    const sleutel = [...ids].sort().join('|')
    const bestaand = groepen.get(sleutel)
    if (bestaand && ZEKERHEID_ORDE[bestaand.zekerheid] <= ZEKERHEID_ORDE[zekerheid]) return
    groepen.set(sleutel, {
      sleutel,
      zekerheid,
      reden,
      personen: ids.map(id => alsPersoon(index.get(id)))
        // De aanbevolen blijver eerst: de rij waar het meeste werk aan hangt, dan de volledigste.
        .sort((a, b) =>
          b.dossiers - a.dossiers
          || b.organisaties.length - a.organisaties.length
          || Number(Boolean(b.email)) - Number(Boolean(a.email))
          || Number(Boolean(b.mobiel)) - Number(Boolean(a.mobiel))
          || a.naam.length - b.naam.length),
    })
  }

  for (const [e, ids] of perEmail) {
    if (ids.length < 2) continue
    const namen = new Set(ids.map(id => naamSleutel(index.get(id))))
    if (namen.size === 1) voegToe(ids, 'zeker', `Zelfde naam én e-mailadres (${e})`)
    else voegToe(ids, 'waarschijnlijk', `Zelfde e-mailadres (${e}), andere schrijfwijze van de naam`)
  }
  for (const [m, ids] of perMobiel) {
    if (ids.length < 2) continue
    voegToe(ids, 'waarschijnlijk', `Zelfde mobiele nummer (${m})`)
  }
  for (const [, ids] of perNaam) {
    if (ids.length < 2) continue
    // Alleen dezelfde naam is zwak: twee naamgenoten bij twee opdrachtgevers komt voor.
    voegToe(ids, 'mogelijk', 'Zelfde naam, verder geen overeenkomst')
  }

  return [...groepen.values()].sort((a, b) =>
    ZEKERHEID_ORDE[a.zekerheid] - ZEKERHEID_ORDE[b.zekerheid]
    || a.personen[0].naam.localeCompare(b.personen[0].naam))
}

/* ─── samenvoegen ─────────────────────────────────────────────────── */

/**
 * Voeg één of meer contactpersonen samen in `blijverId`. Per verliezer een eigen aanroep van
 * de database-functie, zodat een fout op de derde de eerste twee niet terugdraait; wat lukt,
 * lukt. Retourneert de log-ids waarmee het terug te draaien is.
 */
export async function voegContactpersonenSamen(
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
    const { data, error } = await supabase.rpc('contactpersoon_samenvoegen', {
      p_blijver: blijverId,
      p_verliezer: verliezerId,
      p_door: medewerker.auth_user_id,
    })
    if (error) fouten.push(error.message)
    else if (data) logIds.push(data as string)
  }

  if (logIds.length === 0) {
    return { ok: false, error: fouten[0] ?? 'Er is niets samengevoegd.' }
  }

  revalidatePath('/relaties')
  revalidatePath(`/relaties/contactpersonen/${blijverId}`)
  return {
    ok: true,
    logIds,
    waarschuwing: fouten.length > 0 ? `${fouten.length} van de ${verliezerIds.length} mislukten: ${fouten[0]}` : undefined,
  }
}

/** Draai een samenvoeging terug: alles wat toen is verplaatst gaat terug naar de oude persoon. */
export async function maakSamenvoegingOngedaan(logId: string): Promise<ActionResult> {
  try {
    await vereisRecht('relaties', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt geen rechten om relaties te wijzigen.' }
    throw e
  }

  const supabase = db()
  const { error } = await supabase.rpc('contactpersoon_samenvoegen_ongedaan', { p_log: logId })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/relaties')
  return { ok: true }
}

export type SamenvoegingLog = {
  id: string
  blijver_id: string
  verliezer_id: string
  verliezer_naam: string
  blijver_naam: string
  created_at: string
  teruggedraaid_op: string | null
}

/** De laatste samenvoegingen, voor de knop "ongedaan maken" op het dubbelenscherm. */
export async function getRecenteSamenvoegingen(limiet = 15): Promise<SamenvoegingLog[]> {
  await vereisRecht('relaties', 'lezen')
  const { data } = await db()
    .from('contactpersoon_samenvoegingen')
    .select('id, blijver_id, verliezer_id, created_at, teruggedraaid_op, blijver:contactpersonen!blijver_id(voornaam, tussenvoegsel, achternaam), verliezer:contactpersonen!verliezer_id(voornaam, tussenvoegsel, achternaam)')
    .order('created_at', { ascending: false })
    .limit(limiet)

  const naam = (p?: { voornaam?: string; tussenvoegsel?: string | null; achternaam?: string } | null) =>
    p ? [p.voornaam, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ') : '?'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    blijver_id: r.blijver_id,
    verliezer_id: r.verliezer_id,
    blijver_naam: naam(r.blijver),
    verliezer_naam: naam(r.verliezer),
    created_at: r.created_at,
    teruggedraaid_op: r.teruggedraaid_op,
  }))
}

export type ZoekResultaat = {
  id: string
  naam: string
  email: string | null
  organisaties: string[]
}

/**
 * Zoek een andere contactpersoon om handmatig mee samen te voegen — voor de gevallen die de
 * suggestielijst niet vindt (roepnaam versus voorletters, een gewijzigde achternaam).
 */
export async function zoekContactpersonenVoorSamenvoegen(
  zoekterm: string,
  behalveId: string,
): Promise<ZoekResultaat[]> {
  await vereisRecht('relaties', 'lezen')
  const term = zoekterm.trim()
  if (term.length < 2) return []

  const patroon = `%${term.replace(/[%_]/g, '')}%`
  const { data } = await db()
    .from('contactpersonen')
    .select('id, voornaam, tussenvoegsel, achternaam, email, contactpersoon_organisaties(organisatie:relaties(naam))')
    .is('samengevoegd_in', null)
    .neq('id', behalveId)
    .or(`voornaam.ilike.${patroon},achternaam.ilike.${patroon},email.ilike.${patroon}`)
    .order('achternaam')
    .limit(25)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    naam: [p.voornaam, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' '),
    email: p.email,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    organisaties: (p.contactpersoon_organisaties ?? []).map((k: any) => k.organisatie?.naam).filter(Boolean),
  }))
}

/**
 * Markeer een rij als gedeelde postbus of als object (een VvE die in Bouw7 als contactpersoon
 * staat). Die vallen daarna uit de suggesties — samenvoegen zou ze juist kapotmaken.
 */
export async function zetContactpersoonSoort(id: string, soort: ContactpersoonSoort): Promise<ActionResult> {
  try {
    await vereisRecht('relaties', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt geen rechten om relaties te wijzigen.' }
    throw e
  }
  const { error } = await db().from('contactpersonen').update({ soort }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/relaties')
  revalidatePath(`/relaties/contactpersonen/${id}`)
  return { ok: true }
}
