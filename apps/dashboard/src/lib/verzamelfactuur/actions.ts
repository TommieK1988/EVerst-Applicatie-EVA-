'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { losseTabel } from '@/lib/supabase/losse-tabel'
import { vereisRecht, getCurrentMedewerker } from '@/lib/auth/rechten'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { tekstNaarBouw7RichText } from '@/lib/bouw7/rich-text'
import { ververSnapshotsNaSchrijven } from '@/lib/bouw7/snapshot'
import { leesBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'
import { maakConceptVerzamelfactuur } from '@/lib/bouw7/verzamelfactuur'
import { boekRegieFactuurAf } from '@/lib/dossiers/regie-factuur-afboeken'
import { bouwDossierOpbouw, laadBtwInfo, naarHoofdstuk, type DossierBron, type DossierOpbouw } from './opbouw'
import { controleerVerzamelfacturen } from './opvolging'
import { AFREKENWIJZE_VELDEN } from '@/lib/dossiers/regie-opdracht'
import { opRegie, type AfrekenwijzeVelden } from '@/components/dossiers/types'
import type {
  BtwGroep, Factuurpartij, KandidaatDossier, VerzamelVoorbeeld, VerzamelfactuurRij, Werkmaatschappij,
} from './types'

/**
 * Verzamelfactuur: servicedeskbonnen op Kosten compleet van één factuurpartij samen op één
 * conceptfactuur in Bouw7. Zie `lib/bouw7/verzamelfactuur.ts` voor hoe Bouw7 dat zelf opbouwt.
 */

const rond = (n: number): number => Math.round(n * 100) / 100

// Een deel van deze tabellen staat nog niet in de gegenereerde types.
const db = losseTabel

/** Voert `fn` uit over `lijst`, met hooguit `n` tegelijk — elke bon doet een paar Bouw7-aanroepen. */
async function perBlok<T, R>(lijst: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const uit: R[] = []
  for (let i = 0; i < lijst.length; i += n) uit.push(...await Promise.all(lijst.slice(i, i + n).map(fn)))
  return uit
}

export async function getWerkmaatschappijen(): Promise<Werkmaatschappij[]> {
  await vereisRecht('financieel', 'lezen')
  const { data } = await db().from('bedrijfsgegevens')
    .select('id, naam, bouw7_branch_id').eq('type', 'werkmaatschappij').not('bouw7_branch_id', 'is', null).order('naam')
  return ((data ?? []) as unknown as { id: string; naam: string; bouw7_branch_id: number }[])
    .map(w => ({ id: w.id, naam: w.naam, bouw7BranchId: Number(w.bouw7_branch_id) }))
}

type KandidaatRij = {
  id: string; dossiernummer: string | null; titel: string | null; referentie: string | null; bouw7_id: string
  klant: { naam: string | null; bouw7_id: string | null } | null
  factuuradres: { label: string | null; bouw7_contact_id: string | null } | null
}

/**
 * Alle factuurpartijen met servicedeskbonnen op Kosten compleet binnen deze werkmaatschappij.
 * De factuurpartij is het factuuradres van de bon, en zonder factuuradres de opdrachtgever.
 */
export async function getVerzamelKandidaten(werkmaatschappijId: string): Promise<Factuurpartij[]> {
  await vereisRecht('financieel', 'lezen')
  // Begrensd door de stand Kosten compleet: dat zijn er tientallen, geen duizend.
  const { data, error } = await db().from('dossiers')
    .select('id, dossiernummer, titel, referentie, bouw7_id, '
      + 'klant:relaties!dossiers_klant_id_fkey(naam, bouw7_id), '
      + 'factuuradres:relatie_factuuradressen!dossiers_factuuradres_id_fkey(label, bouw7_contact_id)')
    .eq('servicedesk_substatus', 'kosten_compleet')
    .eq('werkmaatschappij_id', werkmaatschappijId)
    .not('bouw7_id', 'is', null)
    .order('dossiernummer')
  if (error) throw new Error(error.message)
  const rijen = (data ?? []) as unknown as KandidaatRij[]

  const concepten = await conceptPerDossier(rijen.map(r => r.id))

  const partijen = new Map<string, Factuurpartij>()
  for (const r of rijen) {
    const viaAdres = r.factuuradres?.bouw7_contact_id != null
    const contactId = viaAdres ? r.factuuradres!.bouw7_contact_id : r.klant?.bouw7_id
    if (!contactId) continue
    const naam = (viaAdres ? r.factuuradres!.label : r.klant?.naam) ?? 'Onbekend'
    const p = partijen.get(contactId) ?? { bouw7ContactId: contactId, naam, viaFactuuradres: viaAdres, dossiers: [] }
    const dossier: KandidaatDossier = {
      id: r.id, dossiernummer: r.dossiernummer, titel: r.titel, referentie: r.referentie,
      opdrachtgever: r.klant?.naam ?? null, opConcept: concepten.get(r.id) ?? null,
    }
    p.dossiers.push(dossier)
    partijen.set(contactId, p)
  }
  return [...partijen.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
}

/** Bonnen die al op een verzamelfactuur staan die nog als concept klaarstaat. */
async function conceptPerDossier(dossierIds: string[]): Promise<Map<string, KandidaatDossier['opConcept']>> {
  const uit = new Map<string, KandidaatDossier['opConcept']>()
  if (dossierIds.length === 0) return uit
  const { data } = await db().from('verzamelfactuur_dossiers')
    .select('dossier_id, verzamelfacturen!inner(id, status, bouw7_invoice_id)')
    .in('dossier_id', dossierIds)
    .eq('verzamelfacturen.status', 'concept')
  for (const r of (data ?? []) as unknown as { dossier_id: string; verzamelfacturen: { id: string; bouw7_invoice_id: string | null } }[]) {
    uit.set(r.dossier_id, { verzamelfactuurId: r.verzamelfacturen.id, bouw7InvoiceId: r.verzamelfacturen.bouw7_invoice_id })
  }
  return uit
}

type Selectie = {
  werkmaatschappijId: string
  bouw7ContactId: string
  dossierIds: string[]
  /** Btw voor regels zonder eigen tarief; leeg = standaard bij deze factuurpartij. */
  btwTariefBouw7Id: number | null
}

/** Controleert de selectie tegen de database — nooit vertrouwen op wat het scherm meestuurt. */
async function laadSelectie(sel: Selectie): Promise<{
  werkmaatschappij: Werkmaatschappij; partij: Factuurpartij; dossiers: DossierBron[]
}> {
  if (sel.dossierIds.length === 0) throw new Error('Kies eerst een of meer bonnen.')
  const werkmaatschappij = (await getWerkmaatschappijen()).find(w => w.id === sel.werkmaatschappijId)
  if (!werkmaatschappij) throw new Error('Onbekende werkmaatschappij.')
  const partij = (await getVerzamelKandidaten(sel.werkmaatschappijId)).find(p => p.bouw7ContactId === sel.bouw7ContactId)
  if (!partij) throw new Error('Deze factuurpartij heeft geen bonnen op Kosten compleet bij deze werkmaatschappij.')
  const perId = new Map(partij.dossiers.map(d => [d.id, d]))
  const vreemd = sel.dossierIds.filter(id => !perId.has(id))
  if (vreemd.length > 0) {
    throw new Error('Een of meer bonnen staan niet (meer) op Kosten compleet bij deze factuurpartij. Ververs het scherm.')
  }
  const { data } = await db().from('dossiers').select('id, bouw7_id, ' + AFREKENWIJZE_VELDEN).in('id', sel.dossierIds)
  const rijen = new Map(((data ?? []) as unknown as (AfrekenwijzeVelden & { id: string; bouw7_id: string })[]).map(d => [d.id, d]))
  const dossiers = sel.dossierIds.map(id => {
    const d = perId.get(id)!
    const rij = rijen.get(id)!
    return { id, bouw7Id: Number(rij.bouw7_id), dossiernummer: d.dossiernummer, titel: d.titel, referentie: d.referentie, opRegie: opRegie(rij) }
  })
  return { werkmaatschappij, partij, dossiers }
}

/** Standaard-btw: verlegd als de factuurpartij in Bouw7 op btw verlegd staat, anders Hoog 21%. */
async function standaardBtw(contactId: string, tarieven: Awaited<ReturnType<typeof laadBtwInfo>>): Promise<{ id: number; verlegd: boolean }> {
  let verlegd = false
  try {
    const c = await (await getBouw7Client()).get<{ isVatShifted?: boolean }>(`/contact/${contactId}`)
    verlegd = c?.isVatShifted === true
  } catch { /* onbekend: dan het gewone tarief, de gebruiker ziet het in het voorbeeld */ }
  const lijst = [...tarieven.entries()]
  const kies = verlegd
    ? lijst.find(([, t]) => t.verlegd && /21/.test(t.label) && t.pct === 0) ?? lijst.find(([, t]) => t.verlegd)
    : lijst.filter(([, t]) => !t.verlegd).sort((a, b) => b[1].pct - a[1].pct)[0]
  if (!kies) throw new Error('Er zijn geen btw-tarieven bekend. Ververs de stamgegevens uit Bouw7.')
  return { id: kies[0], verlegd }
}

async function bouwAlles(sel: Selectie) {
  const { werkmaatschappij, partij, dossiers } = await laadSelectie(sel)
  const tarieven = await laadBtwInfo()
  const standaard = await standaardBtw(partij.bouw7ContactId, tarieven)
  const btwId = sel.btwTariefBouw7Id ?? standaard.id
  if (!tarieven.has(btwId)) throw new Error('Onbekend btw-tarief.')
  const alleOpbouw = await perBlok(dossiers, 4, d => bouwDossierOpbouw(d, btwId, tarieven))
  // Een bon zonder openstaande regels gaat niet mee: hij hoort niet als leeg kopje op de factuur,
  // en hij mag ook niet mee naar Financieel gereed op grond van een factuur waar hij niet op staat.
  const opbouw = alleOpbouw.filter(o => !o.voorbeeld.leeg)
  const leeg = alleOpbouw.filter(o => o.voorbeeld.leeg).map(o => o.voorbeeld)

  const groepen = new Map<string, BtwGroep>()
  for (const o of opbouw) {
    if (o.voorbeeld.blokkade) continue
    for (const r of o.voorbeeld.regels) {
      const g = groepen.get(r.btwLabel) ?? { label: r.btwLabel, pct: r.btwPct, grondslag: 0, btw: 0 }
      g.grondslag = rond(g.grondslag + r.bedrag)
      groepen.set(r.btwLabel, g)
    }
  }
  for (const g of groepen.values()) g.btw = rond(g.grondslag * g.pct / 100)
  const btwGroepen = [...groepen.values()].sort((a, b) => b.pct - a.pct)
  const totaalExcl = rond(btwGroepen.reduce((s, g) => s + g.grondslag, 0))
  const totaalBtw = rond(btwGroepen.reduce((s, g) => s + g.btw, 0))

  const voorbeeld: VerzamelVoorbeeld & { btwTariefBouw7Id: number } = {
    factuurpartij: { bouw7ContactId: partij.bouw7ContactId, naam: partij.naam, btwVerlegd: standaard.verlegd },
    werkmaatschappij: werkmaatschappij.naam,
    dossiers: opbouw.map(o => o.voorbeeld),
    leeg,
    btwGroepen,
    totaalExcl,
    totaalBtw,
    totaalIncl: rond(totaalExcl + totaalBtw),
    btwTariefBouw7Id: btwId,
  }
  return { werkmaatschappij, partij, opbouw, voorbeeld, btwId }
}

/** Het voorbeeld van de factuur, uit precies dezelfde opbouw als wat er naar Bouw7 gaat. */
export async function getVerzamelVoorbeeld(
  sel: Selectie,
): Promise<{ ok: true; voorbeeld: VerzamelVoorbeeld & { btwTariefBouw7Id: number } } | { ok: false; error: string }> {
  await vereisRecht('financieel', 'lezen')
  try {
    return { ok: true, voorbeeld: (await bouwAlles(sel)).voorbeeld }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Het voorbeeld is niet op te bouwen.' }
  }
}

export type KlaarzetUitkomst =
  | { ok: true; invoiceId: number; totaal: number; aantal: number; waarschuwingen: string[] }
  | { ok: false; error: string; invoiceId?: number }

/** Zet de verzamelfactuur als concept klaar in Bouw7 en boekt de bonnen af. */
export async function maakVerzamelfactuur(sel: Selectie & { omschrijving: string }): Promise<KlaarzetUitkomst> {
  await vereisRecht('financieel', 'schrijven')
  const medewerker = await getCurrentMedewerker()

  let alles: Awaited<ReturnType<typeof bouwAlles>>
  try {
    alles = await bouwAlles(sel)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'De factuur is niet op te bouwen.' }
  }
  const { werkmaatschappij, partij, opbouw, btwId } = alles

  const geblokkeerd = opbouw.filter(o => o.voorbeeld.blokkade)
  if (opbouw.length === 0) return { ok: false, error: 'Op de gekozen bonnen staat niets meer open om te factureren.' }
  if (geblokkeerd.length > 0) {
    return {
      ok: false,
      error: `Haal deze bon${geblokkeerd.length === 1 ? '' : 'nen'} eerst uit de selectie: `
        + geblokkeerd.map(o => `${o.voorbeeld.kop} — ${o.voorbeeld.blokkade}`).join('; '),
    }
  }
  const concepten = await conceptPerDossier(sel.dossierIds)
  if (concepten.size > 0) {
    return { ok: false, error: 'Een of meer bonnen staan al op een verzamelfactuur die in Bouw7 klaarstaat. Ververs het scherm.' }
  }

  const hoofdstukken = []
  for (const o of opbouw) hoofdstukken.push(await naarHoofdstuk(o, btwId))

  // Sleutel over de inhoud: dezelfde bonnen met dezelfde regels vinden een eerdere poging terug.
  const basis = [partij.bouw7ContactId, ...hoofdstukken.map(h => h.projectId + ':' + h.regels
    .map(r => `${r.omschrijving}|${Math.round(r.aantal * r.stukprijs * 100)}|${(r.projectInvoiceTermIds ?? []).join('+')}`).join(','))]
    .join('#')
  const sleutel = 'vz-' + createHash('sha1').update(basis).digest('hex').slice(0, 16)

  const res = await maakConceptVerzamelfactuur({
    contactId: Number(partij.bouw7ContactId),
    branchId: werkmaatschappij.bouw7BranchId,
    hoofdstukken,
    omschrijving: sel.omschrijving.trim() ? tekstNaarBouw7RichText(sel.omschrijving.trim()) : null,
    idempotentieSleutel: sleutel,
  })
  if (!res.ok) return res

  const waarschuwingen: string[] = []
  if (res.zonderKoppelingen) {
    waarschuwingen.push('Bouw7 weigerde de koppeling met de geboekte uren en inkoopregels; de factuur staat er zonder. '
      + 'Die posten staan in Bouw7 dus nog als niet-gefactureerd.')
  }

  // Vastleggen vóór het afboeken: mislukt dat halverwege, dan weet EVA in elk geval welke bonnen
  // op deze factuur staan.
  const { data: vz, error: vzFout } = await db().from('verzamelfacturen').insert({
    werkmaatschappij_id: werkmaatschappij.id,
    bouw7_contact_id: partij.bouw7ContactId,
    factuurpartij_naam: partij.naam,
    omschrijving: sel.omschrijving.trim() || null,
    bouw7_invoice_id: String(res.invoiceId),
    totaal_excl_btw: res.totaalExclBtw,
    aangemaakt_door: medewerker?.id ?? null,
  }).select('id').single()
  if (vzFout || !vz) {
    waarschuwingen.push(`De factuur staat in Bouw7 (${res.invoiceId}), maar EVA kon hem niet vastleggen: ${vzFout?.message ?? 'onbekend'}.`)
  } else {
    await db().from('verzamelfactuur_dossiers').insert(opbouw.map((o: DossierOpbouw) => ({
      verzamelfactuur_id: String(vz.id), dossier_id: o.dossier.id, bedrag_excl_btw: o.voorbeeld.totaal,
    })))
  }

  for (const o of opbouw) {
    if (o.regieRegels.length > 0) {
      try {
        await boekRegieFactuurAf(o.dossier.id, o.voorstel, o.regieRegels, res.invoiceId)
      } catch (e) {
        waarschuwingen.push(`${o.voorbeeld.kop}: afboeken mislukt (${e instanceof Error ? e.message : 'onbekend'}).`)
      }
    }
    if (o.termijnen.length > 0) {
      const staat = await leesBouw7Termijnstaat(o.dossier.bouw7Id).catch(() => null)
      const los = o.termijnen.filter(t =>
        staat?.termijnen.find(x => x.id === t.id)?.invoiceLine?.invoiceId !== res.invoiceId)
      if (los.length > 0) {
        waarschuwingen.push(`${o.voorbeeld.kop}: termijn ${los.map(t => t.description ?? t.id).join(', ')} is in Bouw7 niet aan de factuur gekoppeld.`)
      }
    }
    await ververSnapshotsNaSchrijven(o.dossier.id, [], ['termijnen', 'athena_financial']).catch(() => {})
  }

  revalidatePath('/facturen')
  revalidatePath('/facturen/verzamelfactuur')
  return {
    ok: true,
    invoiceId: res.invoiceId,
    totaal: res.totaalExclBtw,
    aantal: opbouw.length,
    waarschuwingen,
  }
}

/** De laatste verzamelfacturen, na een controle van de stand in Bouw7. */
export async function getRecenteVerzamelfacturen(): Promise<VerzamelfactuurRij[]> {
  await vereisRecht('financieel', 'lezen')
  await controleerVerzamelfacturen().catch(() => {})
  const { data } = await db().from('verzamelfacturen')
    .select('id, factuurpartij_naam, status, bouw7_invoice_id, factuurnummer, totaal_excl_btw, aangemaakt_op, '
      + 'werkmaatschappij:bedrijfsgegevens(naam), maker:medewerkers(voornaam, achternaam), verzamelfactuur_dossiers(dossier_id)')
    .neq('status', 'verwijderd')
    .order('aangemaakt_op', { ascending: false })
    .limit(20)
  type Rij = {
    id: string; factuurpartij_naam: string; status: VerzamelfactuurRij['status']; bouw7_invoice_id: string | null
    factuurnummer: string | null; totaal_excl_btw: number | string | null; aangemaakt_op: string
    werkmaatschappij: { naam: string } | null; maker: { voornaam: string | null; achternaam: string | null } | null
    verzamelfactuur_dossiers: { dossier_id: string }[] | null
  }
  return ((data ?? []) as unknown as Rij[]).map(r => ({
    id: r.id,
    factuurpartijNaam: r.factuurpartij_naam,
    werkmaatschappij: r.werkmaatschappij?.naam ?? null,
    status: r.status,
    bouw7InvoiceId: r.bouw7_invoice_id,
    factuurnummer: r.factuurnummer,
    totaalExcl: r.totaal_excl_btw != null ? Number(r.totaal_excl_btw) : null,
    aantalDossiers: (r.verzamelfactuur_dossiers ?? []).length,
    aangemaaktOp: r.aangemaakt_op,
    aangemaaktDoor: r.maker ? [r.maker.voornaam, r.maker.achternaam].filter(Boolean).join(' ') : null,
  }))
}
