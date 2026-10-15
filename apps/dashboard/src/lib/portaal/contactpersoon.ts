import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { PortaalGebruiker, PortaalScope } from '@everts/database/platform-types'
import {
  getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang,
} from '@/lib/auth/rechten'
import { getPortaalDossierIds } from './auth'

/**
 * contactpersoon.ts — het klantportaal vanuit de contactpersoon bekeken.
 *
 * Toegang tot het portaal is per persoon: één account, met een bereik (alleen eigen
 * dossiers, of alle dossiers van de organisatie). Nieuwe dossiers binnen dat bereik zet de
 * database vanzelf open (trigger uit migratie 20261015d). Dit bestand levert wat het
 * Klantportaal-blok op de contactpersoonpagina nodig heeft, plus de standaard welke
 * onderdelen er bij dat automatisch openzetten aangaan.
 */

const db = () => createAdminClient()

export type PortaalAccountVanContactpersoon = {
  id: string
  email: string
  scope: PortaalScope
  actief: boolean
  relatieId: string | null
  relatieNaam: string | null
  uitgenodigdOp: string | null
  laatstIngelogdOp: string | null
  /** Hoeveel dossiers deze persoon nu in zijn portaal ziet (alleen bij een actief account). */
  aantalDossiers: number
}

export type PortaalContactpersoonBeheer = {
  accounts: PortaalAccountVanContactpersoon[]
  /** De organisaties waar deze persoon voor werkt: de keuze bij "alle dossiers van …". */
  organisaties: { id: string; naam: string; isPrimair: boolean }[]
  /** Het adres waar een nieuwe uitnodiging standaard naartoe gaat. */
  standaardEmail: string | null
  /** Mag deze medewerker uitnodigen en het bereik wijzigen (recht `beheren`)? */
  magBeheren: boolean
}

/**
 * Alles voor het Klantportaal-blok op de contactpersoonpagina. `null` betekent: geen
 * leesrecht op de module — het blok verdwijnt dan, net als het blok in het dossier.
 */
export async function getPortaalVoorContactpersoon(
  contactpersoonId: string,
): Promise<PortaalContactpersoonBeheer | null> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return null
  const rechten = await getEffectieveRechten(medewerker)
  if (!heeftModuleToegang(rechten, 'klantportaal', 'lezen')) return null

  // Begrensd: per contactpersoon zijn er hooguit een handvol accounts en organisaties.
  const [{ data: gebruikers }, { data: koppelingen }, { data: cp }] = await Promise.all([
    db().from('portaal_gebruikers')
      .select('id, auth_user_id, email, contactpersoon_id, particulier_id, relatie_id, scope, actief, uitgenodigd_op, uitgenodigd_door, laatste_link_op, laatst_ingelogd_op, created_at, updated_at')
      .eq('contactpersoon_id', contactpersoonId)
      .order('created_at'),
    db().from('contactpersoon_organisaties')
      .select('is_primair, organisatie:relaties!organisatie_id(id, naam)')
      .eq('contactpersoon_id', contactpersoonId)
      .order('is_primair', { ascending: false }),
    db().from('contactpersonen').select('email').eq('id', contactpersoonId).maybeSingle(),
  ])

  const organisaties = (koppelingen ?? [])
    .map(k => {
      const org = k.organisatie as { id: string; naam: string } | null
      return org ? { id: org.id, naam: org.naam, isPrimair: !!k.is_primair } : null
    })
    .filter((o): o is { id: string; naam: string; isPrimair: boolean } => o !== null)

  const rijen = (gebruikers ?? []) as PortaalGebruiker[]

  // De relatie van een account hoort normaal bij de organisaties hierboven, maar kan er
  // ook buiten vallen (koppeling later verwijderd). Dan alsnog de naam erbij zoeken.
  const ontbrekend = [...new Set(rijen.map(r => r.relatie_id).filter(
    (id): id is string => !!id && !organisaties.some(o => o.id === id),
  ))]
  const extraNamen = new Map<string, string>()
  if (ontbrekend.length > 0) {
    const { data } = await db().from('relaties').select('id, naam').in('id', ontbrekend)
    ;(data ?? []).forEach(r => extraNamen.set(r.id, r.naam))
  }
  const naamVan = (id: string | null) =>
    id ? organisaties.find(o => o.id === id)?.naam ?? extraNamen.get(id) ?? null : null

  const accounts = await Promise.all(rijen.map(async (g): Promise<PortaalAccountVanContactpersoon> => ({
    id: g.id,
    email: g.email,
    scope: g.scope,
    actief: g.actief,
    relatieId: g.relatie_id,
    relatieNaam: naamVan(g.relatie_id),
    uitgenodigdOp: g.uitgenodigd_op,
    laatstIngelogdOp: g.laatst_ingelogd_op,
    // Dezelfde resolver als het portaal zelf: het getal is dus precies wat de klant ziet.
    aantalDossiers: g.actief ? (await getPortaalDossierIds(g)).length : 0,
  })))

  return {
    accounts,
    organisaties,
    standaardEmail: cp?.email?.trim().toLowerCase() || null,
    magBeheren: heeftModuleToegang(rechten, 'klantportaal', 'beheren'),
  }
}

/* ── Automatisch openzetten ──────────────────────────────────────────────── */

export type PortaalStandaardOnderdelen = {
  toon_bestanden: boolean
  toon_fotos: boolean
  toon_facturen: boolean
  toon_formulieren: boolean
  toon_aandachtspunten: boolean
  toon_planning: boolean
  toon_chat: boolean
}

/** De onderdelen die aangaan als een dossier automatisch wordt opengezet. */
export async function getPortaalStandaardOnderdelen(): Promise<PortaalStandaardOnderdelen> {
  const { data } = await db()
    .from('portaal_standaard_onderdelen')
    .select('toon_bestanden, toon_fotos, toon_facturen, toon_formulieren, toon_aandachtspunten, toon_planning, toon_chat')
    .eq('id', true)
    .maybeSingle()

  // Ontbreekt de rij, dan staat alles uit: liever te weinig tonen dan te veel.
  return {
    toon_bestanden: !!data?.toon_bestanden,
    toon_fotos: !!data?.toon_fotos,
    toon_facturen: !!data?.toon_facturen,
    toon_formulieren: !!data?.toon_formulieren,
    toon_aandachtspunten: !!data?.toon_aandachtspunten,
    toon_planning: !!data?.toon_planning,
    toon_chat: !!data?.toon_chat,
  }
}

/**
 * Zet alle lopende dossiers binnen het bereik van deze portaalgebruiker open. Aanroepen na
 * uitnodigen, heractiveren en een bereikwijziging — daarna houdt de databasetrigger het bij.
 *
 * Gooit niet: lukt het niet, dan heeft de persoon wel zijn toegang, alleen staan bestaande
 * dossiers nog dicht. Dat is te herstellen; een mislukte uitnodiging om deze reden niet.
 */
export async function openPortaalDossiersVoor(portaalGebruikerId: string): Promise<number> {
  const { data, error } = await db().rpc('portaal_gebruiker_dossiers_openen', {
    p_gebruiker_id: portaalGebruikerId,
  })
  if (error) {
    console.error('[portaal] dossiers openzetten mislukt', error)
    return 0
  }
  return data ?? 0
}
