import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { appBaseUrl } from '@/lib/app-url'
import type { PortaalScope } from '@everts/database/platform-types'

/**
 * beheer.ts — de leeskant van het portaalbeheer in EVA.
 *
 * Los van beheer-actions.ts omdat dat bestand 'use server' is en dus alleen
 * async functies mag exporteren; hier staan de types en de queries die een
 * server-component rechtstreeks aanroept.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type PortaalToegangRij = {
  id: string
  naam: string
  email: string
  scope: PortaalScope
  actief: boolean
  uitgenodigdOp: string | null
  laatstIngelogdOp: string | null
  /** Heeft deze persoon ooit ingelogd? Zo niet, dan is de uitnodiging misschien nooit aangekomen. */
  heeftIngelogd: boolean
}

export type PortaalDossierBeheer = {
  instellingen: {
    actief: boolean
    toon_bestanden: boolean
    toon_fotos: boolean
    toon_facturen: boolean
    toon_formulieren: boolean
    toon_aandachtspunten: boolean
    toon_planning: boolean
    planning_detail: boolean
    toon_chat: boolean
    toon_afspraken: boolean
  }
  /** Wie er via de scope-regel of een losse koppeling bij dit dossier kan. */
  toegang: PortaalToegangRij[]
  /** Contactpersonen van de klant die nog géén portaaltoegang hebben. */
  uitnodigbaar: { contactpersoonId: string; naam: string; email: string; functie: string | null }[]
  klantId: string | null
  klantNaam: string | null
  aantalBestanden: { documenten: number; fotos: number }
  portaalUrl: string
}

const LEGE_INSTELLINGEN = {
  actief: false,
  toon_bestanden: false, toon_fotos: false, toon_facturen: false,
  toon_formulieren: false, toon_aandachtspunten: false, toon_planning: false,
  planning_detail: false, toon_chat: false, toon_afspraken: false,
}

/**
 * Alles wat de Portaal-tab nodig heeft. Vereist leesrecht op de module: deze
 * functie draait op de admin-client en toont e-mailadressen van klanten.
 */
export async function getPortaalDossierBeheer(dossierId: string): Promise<PortaalDossierBeheer> {
  await vereisRecht('klantportaal', 'lezen')

  const [{ data: instellingen }, { data: dossier }] = await Promise.all([
    db().from('portaal_dossier_instellingen')
      .select('actief, toon_bestanden, toon_fotos, toon_facturen, toon_formulieren, toon_aandachtspunten, toon_planning, planning_detail, toon_chat, toon_afspraken')
      .eq('dossier_id', dossierId).maybeSingle(),
    db().from('dossiers')
      .select('klant_id, contactpersoon_id, relaties!klant_id(naam)')
      .eq('id', dossierId).maybeSingle(),
  ])

  const klantId = (dossier?.klant_id as string | null) ?? null
  const klantNaam = (dossier?.relaties as { naam: string } | null)?.naam ?? null

  const [toegang, uitnodigbaar, aantallen] = await Promise.all([
    haalToegang(dossierId, klantId),
    haalUitnodigbaar(klantId),
    telBestanden(dossierId),
  ])

  return {
    instellingen: (instellingen as PortaalDossierBeheer['instellingen']) ?? LEGE_INSTELLINGEN,
    toegang,
    // Wie al toegang heeft, hoeft niet nog eens uitgenodigd te worden.
    uitnodigbaar: uitnodigbaar.filter(u => !toegang.some(t => t.email === u.email)),
    klantId,
    klantNaam,
    aantalBestanden: aantallen,
    portaalUrl: `${appBaseUrl()}/portaal/project/${dossierId}`,
  }
}

/**
 * Iedereen die dit dossier in zijn portaal ziet: de portaalgebruikers van de
 * klant, plus wie er los aan gekoppeld is. Bewust twee bronnen, want een
 * VvE-lid hoeft niet aan de organisatie te hangen.
 */
async function haalToegang(dossierId: string, klantId: string | null): Promise<PortaalToegangRij[]> {
  const gevonden = new Map<string, Record<string, unknown>>()

  if (klantId) {
    const { data } = await db()
      .from('portaal_gebruikers')
      .select('id, email, scope, actief, uitgenodigd_op, laatst_ingelogd_op, contactpersoon_id, particulier_id')
      .eq('relatie_id', klantId)
    ;((data ?? []) as Record<string, unknown>[]).forEach(r => gevonden.set(String(r.id), r))
  }

  const { data: losse } = await db()
    .from('portaal_gebruiker_dossiers')
    .select('portaal_gebruiker_id')
    .eq('dossier_id', dossierId)
  const losseIds = ((losse ?? []) as { portaal_gebruiker_id: string }[]).map(r => r.portaal_gebruiker_id)

  if (losseIds.length > 0) {
    const { data } = await db()
      .from('portaal_gebruikers')
      .select('id, email, scope, actief, uitgenodigd_op, laatst_ingelogd_op, contactpersoon_id, particulier_id')
      .in('id', losseIds)
    ;((data ?? []) as Record<string, unknown>[]).forEach(r => gevonden.set(String(r.id), r))
  }

  const rijen = [...gevonden.values()]
  const namen = await haalNamen(rijen)

  return rijen.map(r => ({
    id: String(r.id),
    naam: namen.get(String(r.id)) ?? String(r.email),
    email: String(r.email),
    scope: r.scope as PortaalScope,
    actief: !!r.actief,
    uitgenodigdOp: (r.uitgenodigd_op as string | null) ?? null,
    laatstIngelogdOp: (r.laatst_ingelogd_op as string | null) ?? null,
    heeftIngelogd: !!r.laatst_ingelogd_op,
  }))
}

async function haalNamen(rijen: Record<string, unknown>[]): Promise<Map<string, string>> {
  const namen = new Map<string, string>()
  const cpIds = rijen.map(r => r.contactpersoon_id).filter(Boolean) as string[]
  const partIds = rijen.map(r => r.particulier_id).filter(Boolean) as string[]

  const [{ data: cp }, { data: part }] = await Promise.all([
    cpIds.length
      ? db().from('contactpersonen').select('id, voornaam, tussenvoegsel, achternaam').in('id', cpIds)
      : Promise.resolve({ data: [] }),
    partIds.length
      ? db().from('particulieren').select('id, voornaam, tussenvoegsel, achternaam').in('id', partIds)
      : Promise.resolve({ data: [] }),
  ])

  const naamPerId = new Map<string, string>()
  for (const p of [...((cp ?? []) as Record<string, unknown>[]), ...((part ?? []) as Record<string, unknown>[])]) {
    naamPerId.set(String(p.id), [p.voornaam, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' '))
  }
  for (const r of rijen) {
    const id = (r.contactpersoon_id ?? r.particulier_id) as string | null
    if (id && naamPerId.has(id)) namen.set(String(r.id), naamPerId.get(id)!)
  }
  return namen
}

/** Contactpersonen van deze klant, als suggestie voor het uitnodigen. */
async function haalUitnodigbaar(klantId: string | null) {
  if (!klantId) return []

  const { data } = await db()
    .from('contactpersoon_organisaties')
    .select('functie, is_primair, contactpersonen!contactpersoon_id(id, voornaam, tussenvoegsel, achternaam, email, actief)')
    .eq('organisatie_id', klantId)
    .order('is_primair', { ascending: false })

  return ((data ?? []) as Record<string, unknown>[])
    .map(r => {
      const cp = r.contactpersonen as Record<string, unknown> | null
      if (!cp || !cp.actief || !cp.email) return null
      return {
        contactpersoonId: String(cp.id),
        naam: [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' '),
        email: String(cp.email).toLowerCase(),
        functie: (r.functie as string | null) ?? null,
      }
    })
    .filter(Boolean) as { contactpersoonId: string; naam: string; email: string; functie: string | null }[]
}

async function telBestanden(dossierId: string): Promise<{ documenten: number; fotos: number }> {
  const tel = async (soort: string) => {
    const { count } = await db()
      .from('portaal_bestanden')
      .select('sleutel', { count: 'exact', head: true })
      .eq('dossier_id', dossierId).eq('zichtbaar', true).eq('soort', soort)
    return count ?? 0
  }
  const [documenten, fotos] = await Promise.all([tel('document'), tel('afbeelding')])
  return { documenten, fotos }
}
