'use server'

/**
 * Het kwaliteitsafwijkingenregister: opvolging en hercontrole.
 *
 * Bewust een eigen register naast `oplever_punten` (expliciete keuze van de opdrachtgever). Een
 * kwaliteitsafwijking draagt discipline, controlepunt, gemeten waarde, technische eis, ernst en
 * hercontrole — velden die op een opleverpunt betekenisloos zijn.
 *
 * Er hangen bewust GEEN taken of meldingen aan een afwijking: het register is voorlopig de enige
 * opvolging. Wie dat later wil, haakt aan op `setAfwijkingStatus`.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  KwaliteitAfwijking,
  KwaliteitAfwijkingHistorie,
  KwaliteitAfwijkingStatus,
} from '@everts/database/kwaliteit-types'
import { KWALITEIT_AFWIJKING_TRANSITIES } from '@everts/database/kwaliteit-types'
import { vereisSessie } from '@/lib/auth/rechten'
import type { HercontroleUitkomst } from './regels'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const AFGEROND: KwaliteitAfwijkingStatus[] = ['hersteld_akkoord', 'geaccepteerde_afwijking']

export type AfwijkingRij = KwaliteitAfwijking & {
  dossiernummer: string | null
  projectnaam: string
  inspectienummer: string | null
  controlepunt_titel: string | null
  discipline_naam: string | null
  verantwoordelijke: string | null
  fotoUrls: string[]
  dagen_open: number
}

/**
 * Het register, met alles wat de lijst nodig heeft. Filters zijn optioneel; zonder filter krijg je
 * alle openstaande afwijkingen over alle projecten.
 */
export async function getAfwijkingen(filters?: {
  dossierId?: string
  status?: string
  ernst?: string
  disciplineCode?: string
  alleenOpen?: boolean
  limiet?: number
}): Promise<AfwijkingRij[]> {
  await vereisSessie()
  const supabase = db()

  let q = supabase
    .from('kwaliteit_afwijkingen')
    .select(`
      *,
      dossier:dossiers!dossier_id ( dossiernummer, titel ),
      inspectie:kwaliteit_inspecties!inspectie_id ( inspectienummer ),
      punt:kwaliteit_controlepunten!controlepunt_id ( titel ),
      medewerker:medewerkers!verantwoordelijke_medewerker_id ( voornaam, tussenvoegsel, achternaam ),
      relatie:relaties!verantwoordelijke_relatie_id ( naam )
    `)
    .order('datum_constatering', { ascending: false })
    .limit(filters?.limiet ?? 500)

  if (filters?.dossierId) q = q.eq('dossier_id', filters.dossierId)
  if (filters?.status && filters.status !== 'alle') q = q.eq('status', filters.status)
  if (filters?.ernst && filters.ernst !== 'alle') q = q.eq('ernst', filters.ernst)
  if (filters?.disciplineCode) q = q.eq('discipline_code', filters.disciplineCode)
  if (filters?.alleenOpen) q = q.not('status', 'in', `("${AFGEROND.join('","')}")`)

  const { data } = await q
  const rijen = (data ?? []) as Record<string, any>[]
  if (rijen.length === 0) return []

  const [{ data: fotos }, { data: disciplines }] = await Promise.all([
    supabase.from('kwaliteit_fotos').select('afwijking_id, url, soort').in('afwijking_id', rijen.map(r => r.id)),
    supabase.from('kwaliteit_disciplines').select('code, naam'),
  ])
  const perAfwijking = new Map<string, string[]>()
  for (const f of (fotos ?? []) as { afwijking_id: string; url: string }[]) {
    perAfwijking.set(f.afwijking_id, [...(perAfwijking.get(f.afwijking_id) ?? []), f.url])
  }
  const disciplineNaam = new Map<string, string>(
    ((disciplines ?? []) as { code: string; naam: string }[]).map(d => [d.code, d.naam]),
  )

  const vandaag = new Date()
  return rijen.map(r => {
    const geconstateerd = new Date(r.datum_constatering)
    const dagen = Math.max(0, Math.round((vandaag.getTime() - geconstateerd.getTime()) / 86400000))
    return {
      ...(r as KwaliteitAfwijking),
      dossiernummer: r.dossier?.dossiernummer ?? null,
      projectnaam: r.dossier?.titel ?? '—',
      inspectienummer: r.inspectie?.inspectienummer ?? null,
      controlepunt_titel: r.punt?.titel ?? null,
      discipline_naam: r.discipline_code ? disciplineNaam.get(r.discipline_code) ?? r.discipline_code : null,
      verantwoordelijke: r.medewerker
        ? [r.medewerker.voornaam, r.medewerker.tussenvoegsel, r.medewerker.achternaam].filter(Boolean).join(' ')
        : r.relatie?.naam ?? null,
      fotoUrls: perAfwijking.get(r.id) ?? [],
      // Bij een afgeronde afwijking is "dagen open" misleidend; dan is het 0.
      dagen_open: AFGEROND.includes(r.status) ? 0 : dagen,
    }
  })
}

/** Openstaande afwijkingen van één dossier — voedt het blok op de dossiertab. */
export async function getOpenAfwijkingen(dossierId: string): Promise<AfwijkingRij[]> {
  return getAfwijkingen({ dossierId, alleenOpen: true })
}

export async function getAfwijkingHistorie(afwijkingId: string): Promise<KwaliteitAfwijkingHistorie[]> {
  await vereisSessie()
  const { data } = await db()
    .from('kwaliteit_afwijking_historie')
    .select('*')
    .eq('afwijking_id', afwijkingId)
    .order('op', { ascending: false })
  return (data ?? []) as KwaliteitAfwijkingHistorie[]
}

/**
 * Statuswijziging met transitie-guard.
 *
 * De guard staat hier en niet in de UI, want een action is als kale RPC aanroepbaar. De logging
 * gebeurt door een database-trigger, zodat de historie niet afhangt van welk scherm er schrijft.
 */
export async function setAfwijkingStatus(
  afwijkingId: string,
  nieuweStatus: KwaliteitAfwijkingStatus,
  opmerking?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()

  const { data: huidig } = await supabase
    .from('kwaliteit_afwijkingen')
    .select('status, dossier_id')
    .eq('id', afwijkingId)
    .maybeSingle()
  if (!huidig) return { ok: false, error: 'Afwijking niet gevonden' }

  const toegestaan = KWALITEIT_AFWIJKING_TRANSITIES[huidig.status as KwaliteitAfwijkingStatus] ?? []
  if (huidig.status !== nieuweStatus && !toegestaan.includes(nieuweStatus)) {
    return { ok: false, error: `Overgang van "${huidig.status}" naar "${nieuweStatus}" is niet toegestaan.` }
  }

  const patch: Record<string, unknown> = { status: nieuweStatus }
  if (opmerking !== undefined) patch.herstelopmerking = opmerking

  const { error } = await supabase.from('kwaliteit_afwijkingen').update(patch).eq('id', afwijkingId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/kam/kwaliteit/afwijkingen')
  revalidatePath(`/opdrachten/${huidig.dossier_id}/vca`)
  return { ok: true }
}

export async function updateAfwijking(
  afwijkingId: string,
  patch: Partial<Pick<KwaliteitAfwijking,
    'ernst' | 'omschrijving' | 'voorgestelde_actie' | 'gewenste_hersteldatum' | 'herstelopmerking'
    | 'verantwoordelijke_type' | 'verantwoordelijke_medewerker_id' | 'verantwoordelijke_relatie_id'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: rij } = await supabase
    .from('kwaliteit_afwijkingen').select('dossier_id').eq('id', afwijkingId).maybeSingle()
  const { error } = await supabase.from('kwaliteit_afwijkingen').update(patch).eq('id', afwijkingId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kam/kwaliteit/afwijkingen')
  if (rij) revalidatePath(`/opdrachten/${rij.dossier_id}/vca`)
  return { ok: true }
}

/* ────────────────────────────── Hercontrole ──────────────────────────────── */

// HercontroleUitkomst en HERCONTROLE_LABELS staan in regels.ts: een 'use server'-module mag alleen
// async functies exporteren, en de mobiele knoppen hebben die labels client-side nodig.

/**
 * Registreert de uitkomst van een hercontrole tijdens een volgende ronde.
 *
 * `niet_gecontroleerd` laat de afwijking bewust ongemoeid: dat de opzichter er deze ronde niet aan
 * toe kwam is geen statuswijziging en hoort niet in de historie.
 *
 * `hersteld` gaat in twee stappen naar `hersteld_akkoord` wanneer de afwijking nog niet op
 * "gereed voor hercontrole" stond — anders zou de transitie-guard hem tegenhouden en zou de
 * opzichter op locatie vastlopen op een administratieve regel.
 */
export async function registreerHercontrole(
  afwijkingId: string,
  inspectieId: string,
  uitkomst: HercontroleUitkomst,
  opmerking?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  if (uitkomst === 'niet_gecontroleerd') return { ok: true }

  const supabase = db()
  const { data: huidig } = await supabase
    .from('kwaliteit_afwijkingen')
    .select('status, dossier_id')
    .eq('id', afwijkingId)
    .maybeSingle()
  if (!huidig) return { ok: false, error: 'Afwijking niet gevonden' }

  const doelStatus: Record<Exclude<HercontroleUitkomst, 'niet_gecontroleerd'>, KwaliteitAfwijkingStatus> = {
    nog_open:             huidig.status as KwaliteitAfwijkingStatus,
    hersteld:             'hersteld_akkoord',
    onvoldoende_hersteld: 'niet_akkoord',
    nader_onderzoek:      'nader_onderzoek',
  }
  const doel = doelStatus[uitkomst]

  // Tussenstap wanneer de administratieve status achterloopt op de werkelijkheid op de steiger.
  const toegestaan = KWALITEIT_AFWIJKING_TRANSITIES[huidig.status as KwaliteitAfwijkingStatus] ?? []
  if (doel !== huidig.status && !toegestaan.includes(doel)) {
    if (doel === 'hersteld_akkoord' || doel === 'niet_akkoord') {
      await supabase.from('kwaliteit_afwijkingen')
        .update({ status: 'gereed_voor_hercontrole' })
        .eq('id', afwijkingId)
    } else {
      return { ok: false, error: `Overgang van "${huidig.status}" naar "${doel}" is niet toegestaan.` }
    }
  }

  const patch: Record<string, unknown> = {
    status: doel,
    hercontrole_inspectie_id: inspectieId,
    hercontrole_datum: new Date().toISOString().slice(0, 10),
    hercontroleur_id: medewerker.id,
  }
  if (opmerking) patch.herstelopmerking = opmerking

  const { error } = await supabase.from('kwaliteit_afwijkingen').update(patch).eq('id', afwijkingId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/kam/kwaliteit/afwijkingen')
  revalidatePath(`/kam/kwaliteit/${inspectieId}`)
  revalidatePath(`/opdrachten/${huidig.dossier_id}/vca`)
  return { ok: true }
}

/* ─────────────────────── Samenvatting per dossier ────────────────────────── */

export type DossierKwaliteitSamenvatting = {
  aantalInspecties: number
  laatsteInspectie: { id: string; nummer: string; datum: string; inspecteur: string | null } | null
  dagenSindsLaatste: number | null
  openKritiek: number
  openTechnisch: number
  openEsthetisch: number
  openObservatie: number
  afgerond: number
  positieveFotos: { url: string; omschrijving: string | null }[]
}

/** Het kwaliteitsblok op de dossiertab en het KAM-dashboard. */
export async function getDossierKwaliteit(dossierId: string): Promise<DossierKwaliteitSamenvatting> {
  await vereisSessie()
  const supabase = db()

  const [{ data: inspecties }, { data: afwijkingen }] = await Promise.all([
    supabase
      .from('kwaliteit_inspecties')
      .select('id, inspectienummer, datum, status, inspecteur:medewerkers!inspecteur_id(voornaam, tussenvoegsel, achternaam)')
      .eq('dossier_id', dossierId)
      .order('datum', { ascending: false }),
    supabase.from('kwaliteit_afwijkingen').select('status, ernst').eq('dossier_id', dossierId),
  ])

  const rijen = (inspecties ?? []) as Record<string, any>[]
  const laatste = rijen[0] ?? null

  // Positieve waarnemingsfoto's van de meest recente rondes; het rapport en het dossierblok tonen
  // bewust ook wat er goed gaat.
  let positieveFotos: { url: string; omschrijving: string | null }[] = []
  if (rijen.length > 0) {
    const { data: waarnemingen } = await supabase
      .from('kwaliteit_waarnemingen')
      .select('id, omschrijving')
      .in('inspectie_id', rijen.slice(0, 5).map(r => r.id))
      .limit(30)
    const ids = ((waarnemingen ?? []) as { id: string }[]).map(w => w.id)
    if (ids.length > 0) {
      const { data: fotos } = await supabase
        .from('kwaliteit_fotos')
        .select('url, waarneming_id')
        .in('waarneming_id', ids)
        .limit(12)
      const omschrijvingen = new Map<string, string>(
        ((waarnemingen ?? []) as { id: string; omschrijving: string }[]).map(w => [w.id, w.omschrijving]),
      )
      positieveFotos = ((fotos ?? []) as { url: string; waarneming_id: string }[])
        .map(f => ({ url: f.url, omschrijving: omschrijvingen.get(f.waarneming_id) ?? null }))
    }
  }

  const alle = (afwijkingen ?? []) as { status: string; ernst: string }[]
  const open = alle.filter(a => !AFGEROND.includes(a.status as KwaliteitAfwijkingStatus))

  const dagen = laatste
    ? Math.max(0, Math.round((Date.now() - new Date(laatste.datum).getTime()) / 86400000))
    : null

  return {
    aantalInspecties: rijen.length,
    laatsteInspectie: laatste
      ? {
          id: laatste.id,
          nummer: laatste.inspectienummer,
          datum: laatste.datum,
          inspecteur: laatste.inspecteur
            ? [laatste.inspecteur.voornaam, laatste.inspecteur.tussenvoegsel, laatste.inspecteur.achternaam].filter(Boolean).join(' ')
            : null,
        }
      : null,
    dagenSindsLaatste: dagen,
    openKritiek:    open.filter(a => a.ernst === 'kritiek').length,
    openTechnisch:  open.filter(a => a.ernst === 'technisch').length,
    openEsthetisch: open.filter(a => a.ernst === 'esthetisch').length,
    openObservatie: open.filter(a => a.ernst === 'observatie').length,
    afgerond: alle.length - open.length,
    positieveFotos,
  }
}
