'use server'

/**
 * Verkooptermijnen klaarzetten voor facturatie.
 *
 * Je vinkt op de Verkoop-tab de termijnen aan die gefactureerd mogen worden; EVA maakt daar één
 * conceptfactuur van in Bouw7. De administratie ziet die als concept staan — dat is precies het
 * signaal dat hij verzonden mag worden — controleert hem en verstuurt. Bouw7 kent het
 * factuurnummer pas bij verzenden toe, dus de fiscale nummering blijft daar.
 *
 * **Er is bewust geen EVA-tabel voor "klaargezet".** De waarheid staat in Bouw7 zelf: zodra een
 * termijn op een factuur staat, draagt hij een `invoiceLine`. Een eigen kopie zou daarvan kunnen
 * gaan afwijken zodra de administratie in Bouw7 iets aanpast, en dan zou EVA een termijn kunnen
 * voorstellen die daar al gefactureerd is. De idempotentie loopt via een marker in de interne
 * notitie van de factuur (zie `lib/bouw7/verkoopfactuur.ts`).
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { createHash } from 'node:crypto'
import { getDossierVerkoop, bouw7VoorDossier } from './actions'
import { getDossierMeerwerk } from './meerwerk'
import { assertDossierBewerkbaar } from './guards'
import { vereisRecht } from '@/lib/auth/rechten'
import { maakConceptVerkoopfactuur } from '@/lib/bouw7/verkoopfactuur'
import { schrijfBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'
import type { Bouw7ListResponse, Bouw7ProjectInvoiceTerm } from '@/lib/bouw7/client'

export type KlaarzetResultaat =
  | { ok: true; invoiceId: number; aantal: number; totaalExclBtw: number }
  | { ok: false; error: string; invoiceId?: number }

/**
 * Deterministische sleutel voor deze selectie. Twee keer dezelfde termijnen klaarzetten levert
 * dezelfde sleutel op, zodat de tweede poging de al bestaande factuur terugvindt in plaats van een
 * duplicaat te maken — óók als de eerste poging in een time-out verdween.
 */
function selectieSleutel(dossierId: string, termIds: number[]): string {
  const basis = `${dossierId}|${[...termIds].sort((a, b) => a - b).join(',')}`
  return createHash('sha1').update(basis).digest('hex').slice(0, 16)
}

/**
 * Zet de geselecteerde termijnen als één conceptfactuur klaar in Bouw7.
 *
 * De selectie wordt vlak vóór de write nog één keer tegen de live Bouw7-stand gehouden. Tussen het
 * renderen van het scherm en de klik kan de administratie een termijn al gefactureerd hebben; dan
 * mag EVA hem niet nóg eens meenemen. Dezelfde les als bij de inkoopcontracten, waar EVA regels
 * bleef voorstellen die in Bouw7 al onder een contract hingen.
 */
export async function zetTermijnenKlaar(
  dossierId: string,
  bouw7TermIds: number[],
): Promise<KlaarzetResultaat> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  if (bouw7TermIds.length === 0) return { ok: false, error: 'Selecteer eerst een of meer termijnen.' }

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }
  const { client, bouw7Id } = ctx

  // Live stand ophalen. Filteren op statement.id, want statement.project.id is niet HQL-mapped.
  let live: Bouw7ProjectInvoiceTerm[]
  try {
    const stmts = await client.get<Bouw7ListResponse<{ id: number }>>(
      '/list/project-invoice-term-statements', { q: `project.id = ${bouw7Id} LIMIT 200` },
    )
    live = []
    for (const s of stmts.items ?? []) {
      const res = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
        '/list/project-invoice-terms', { q: `statement.id = ${s.id} LIMIT 500` },
      )
      live.push(...(res.items ?? []))
    }
  } catch (e) {
    return {
      ok: false,
      error: `De termijnen zijn nu niet op te halen uit Bouw7: ${e instanceof Error ? e.message : 'onbekende fout'}. `
        + 'Er is niets klaargezet.',
    }
  }

  const perId = new Map(live.map(t => [t.id, t]))
  const gekozen: Bouw7ProjectInvoiceTerm[] = []
  const alGefactureerd: string[] = []
  for (const id of bouw7TermIds) {
    const t = perId.get(id)
    if (!t) return { ok: false, error: `Termijn ${id} bestaat niet meer in Bouw7. Ververs het scherm.` }
    if (t.invoiceLine != null) { alGefactureerd.push(t.description ?? String(id)); continue }
    gekozen.push(t)
  }
  if (alGefactureerd.length > 0) {
    return {
      ok: false,
      error: `Deze termijn${alGefactureerd.length > 1 ? 'en staan' : ' staat'} in Bouw7 al op een factuur: `
        + `${alGefactureerd.join(', ')}. Ververs het scherm en probeer opnieuw.`,
    }
  }
  if (gekozen.length === 0) return { ok: false, error: 'Er is niets over om klaar te zetten.' }

  const zonderTarief = gekozen.filter(t => t.vatTariff?.id == null || !Number.isFinite(Number(t.vatTariff.id)))
  if (zonderTarief.length > 0) {
    return {
      ok: false,
      error: `Termijn "${zonderTarief[0].description ?? zonderTarief[0].id}" heeft geen btw-tarief in Bouw7. `
        + 'Vul dat daar eerst in.',
    }
  }

  // Eén regel per termijn — precies zoals Bouw7 het zelf doet. Zo blijft per termijn traceerbaar
  // welk bedrag erop staat, en is achteraf per termijn te controleren of de koppeling is gelegd.
  const regels = gekozen.map(t => ({
    omschrijving: (t.description ?? '').trim() || `Termijn ${t.id}`,
    aantal: 1,
    stukprijs: Number(t.subtotal ?? 0),
    vatTariffId: Number(t.vatTariff!.id),
    projectInvoiceTermIds: [t.id],
  }))

  const res = await maakConceptVerkoopfactuur({
    projectId: Number(bouw7Id),
    regels,
    idempotentieSleutel: selectieSleutel(dossierId, gekozen.map(t => t.id)),
  })
  if (!res.ok) return res

  // Acceptatietest aan de termijnkant: staan de termijnen nu écht aan deze factuur? Zonder deze
  // controle zou er een factuur in Bouw7 kunnen staan die nergens aan hangt, en dat merkt niemand.
  const nietGekoppeld: string[] = []
  try {
    for (const t of gekozen) {
      const na = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
        '/list/project-invoice-terms', { q: `statement.id = ${t.statement?.id} LIMIT 500` },
      )
      const ververst = (na.items ?? []).find(x => x.id === t.id)
      if (ververst?.invoiceLine?.invoiceId !== res.invoiceId) {
        nietGekoppeld.push(ververst?.description ?? String(t.id))
      }
    }
  } catch {
    // Niet kunnen controleren is geen bewijs van falen; de factuur bestaat en dat melden we.
  }

  revalidatePath(`/opdrachten/${dossierId}/verkoop`)
  revalidatePath(`/servicedesk/${dossierId}/financieel`)

  if (nietGekoppeld.length > 0) {
    return {
      ok: false,
      invoiceId: res.invoiceId,
      error: `De conceptfactuur staat klaar in Bouw7 (${res.invoiceId}), maar deze termijn(en) zijn er niet `
        + `aan gekoppeld: ${nietGekoppeld.join(', ')}. Controleer de factuur in Bouw7.`,
    }
  }

  return { ok: true, invoiceId: res.invoiceId, aantal: gekozen.length, totaalExclBtw: res.totaalExclBtw }
}

/* ------------------------------------------------------------------------------------------ *
 * Termijnschema aanmaken
 *
 * De calculatie is leidend: staat er een betalingsconditie op de offerte, dan is dát het schema
 * dat met de klant is afgesproken en wordt het voorgesteld. Kent de calculatie er geen — kleine
 * opdrachten, storingswerk, dossiers zonder EVA-offerte — dan kies je er zelf een uit de
 * stamgegevens of stel je hem ter plekke samen. Zonder die tweede route zou de knop precies daar
 * ontbreken waar hij het meeste werk scheelt.
 * ------------------------------------------------------------------------------------------ */

/** Eén regel van een termijnschema: wat er verschuldigd is, en welk deel van de grondslag. */
export type TermijnschemaRegel = { omschrijving: string; percentage: number }

/** Waar de bedragen op gerekend worden. Meerwerk telt alleen mee als de gebruiker dat kiest. */
export type TermijnGrondslag = 'aanneemsom' | 'contracttotaal'

export type TermijnschemaBron = {
  /** Het schema van de betalingsconditie op de offerte; null als de calculatie er geen kent. */
  uitCalculatie: { conditieId: string; naam: string; termijnen: TermijnschemaRegel[] } | null
  /** Alle betalingscondities uit de stamgegevens, om handmatig uit te kiezen. */
  condities: { id: string; naam: string; termijnen: TermijnschemaRegel[] }[]
  aanneemsom: number
  /** Goedgekeurd meerwerk (EVA-regels waar die er zijn, anders het Bouw7-aggregaat). */
  meerwerk: number
  /** Aantal termijnen dat nu in Bouw7 staat. Boven 0 valt er niets meer aan te maken. */
  bestaandeTermijnen: number
}

/** Leest de termijnen van een betalingsconditie-rij uit; ongeldige regels vallen af. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leesTermijnen(ruw: any): TermijnschemaRegel[] {
  if (!Array.isArray(ruw)) return []
  return ruw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => ({
      omschrijving: String(t?.omschrijving ?? '').trim(),
      percentage: Number(t?.percentage ?? 0),
    }))
    .filter((t: TermijnschemaRegel) => Number.isFinite(t.percentage))
}

/**
 * De betalingsconditie die aan de hoofdofferte van dit dossier hangt.
 *
 * De offerte kent haar termijnen via `quotes.betalingsconditie_id` → `betalingscondities.termijnen`
 * (`[{ omschrijving, percentage }]`). Meerwerkoffertes blijven buiten beeld: die dragen hun eigen
 * regel en zeggen niets over het schema van de aanneemsom.
 */
async function offerteBetalingsconditie(
  dossierId: string,
): Promise<{ conditieId: string; naam: string; termijnen: TermijnschemaRegel[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: dossier } = await supabase
    .from('dossiers').select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  if (!dossier?.everts_calc_project_id) return null

  const { data: quote } = await supabase
    .from('quotes')
    .select('betalingsconditie_id')
    .eq('project_id', dossier.everts_calc_project_id)
    .is('meerwerk_regel_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!quote?.betalingsconditie_id) return null

  const { data: conditie } = await supabase
    .from('betalingscondities').select('naam, termijnen').eq('id', quote.betalingsconditie_id).maybeSingle()
  const termijnen = leesTermijnen(conditie?.termijnen)
  if (termijnen.length === 0) return null

  return {
    conditieId: quote.betalingsconditie_id as string,
    naam: (conditie?.naam as string) ?? 'Betalingsconditie',
    termijnen,
  }
}

/**
 * De bedragen waarover een termijnschema gerekend kan worden.
 *
 * Meerwerk komt uit de EVA-meerwerkregels zodra die er zijn, en anders uit het Bouw7-aggregaat —
 * dezelfde regel die de Verkoop-tab zelf hanteert. Zou het venster een ander meerwerkbedrag
 * gebruiken dan het scherm eromheen toont, dan factureer je straks over een grondslag die niemand
 * heeft zien staan. De vergelijking kijkt naar het AANTAL goedgekeurde regels en niet naar het
 * bedrag: bij per saldo minderwerk is de som negatief.
 */
async function termijnGrondslagen(dossierId: string): Promise<{
  aanneemsom: number
  meerwerk: number
  bestaandeTermijnen: number
}> {
  const [verkoop, meerwerk] = await Promise.all([
    getDossierVerkoop(dossierId),
    getDossierMeerwerk(dossierId).catch(() => null),
  ])
  const goedgekeurd = (meerwerk?.regels ?? []).filter(r => r.status === 'akkoord' || r.status === 'voltooid')
  const meerwerkBedrag = goedgekeurd.length > 0
    ? (meerwerk?.totalen.goedgekeurdExcl ?? 0)
    : verkoop.totalen.meerwerk
  return {
    aanneemsom: verkoop.totalen.aanneemsom,
    meerwerk: meerwerkBedrag,
    bestaandeTermijnen: verkoop.termijnen.length,
  }
}

/**
 * Alles wat het termijnschema-venster nodig heeft om een voorstel te doen: het schema uit de
 * calculatie (indien aanwezig), de schema's om handmatig uit te kiezen, en de bedragen waarop
 * gerekend wordt.
 */
export async function getTermijnschemaBron(dossierId: string): Promise<TermijnschemaBron> {
  await vereisRecht('financieel', 'lezen')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [uitCalculatie, conditieRes, grondslagen] = await Promise.all([
    offerteBetalingsconditie(dossierId).catch(() => null),
    // Stamgegevens: tientallen rijen, geen duizenden. Eén lezing volstaat.
    supabase.from('betalingscondities').select('id, naam, termijnen').order('volgorde').order('naam'),
    termijnGrondslagen(dossierId),
  ])

  const rijen = (conditieRes?.data ?? []) as { id: string; naam: string; termijnen: unknown }[]
  const condities = rijen
    .map(r => ({ id: r.id, naam: r.naam, termijnen: leesTermijnen(r.termijnen) }))
    .filter(c => c.termijnen.length > 0)

  return { uitCalculatie, condities, ...grondslagen }
}

/**
 * Vergelijkt het termijnschema in Bouw7 met de betalingsconditie uit de EVA-offerte, zodat een
 * afwijking zichtbaar wordt in plaats van stil te blijven.
 *
 * Er is geen garantie dat wat in Bouw7 staat overeenkomt met wat de klant heeft geaccepteerd.
 * Juist die stille afwijking is duur: dan factureer je een ander schema dan is afgesproken.
 */
export type TermijnAfwijking = {
  /** Percentages uit de offerte-betalingsconditie, in volgorde. */
  offerte: { omschrijving: string; percentage: number }[]
  /** Percentages zoals ze nu in Bouw7 staan. */
  bouw7: { omschrijving: string; percentage: number | null }[]
  /** Naam van de betalingsconditie op de offerte. */
  conditieNaam: string | null
  /** Gezet zodra offerte en Bouw7 niet op elkaar aansluiten. */
  afwijking: string | null
}

export async function getTermijnAfwijking(dossierId: string): Promise<TermijnAfwijking | null> {
  const conditie = await offerteBetalingsconditie(dossierId)
  if (!conditie) return null
  const offerte = conditie.termijnen

  const verkoop = await getDossierVerkoop(dossierId)
  if (!verkoop.termijnenBeschikbaar) return null
  const bouw7 = verkoop.termijnen.map(t => ({ omschrijving: t.omschrijving ?? '', percentage: t.percentage }))

  let afwijking: string | null = null
  if (bouw7.length === 0) {
    afwijking = `De offerte gaat uit van ${offerte.length} termijnen (${conditie.naam}), `
      + 'maar in Bouw7 staat nog geen termijnstaat.'
  } else if (bouw7.length !== offerte.length) {
    afwijking = `De offerte gaat uit van ${offerte.length} termijnen, in Bouw7 staan er ${bouw7.length}.`
  } else {
    const verschillend = offerte.findIndex((o, i) =>
      bouw7[i].percentage != null && Math.abs(bouw7[i].percentage! - o.percentage) > 0.01)
    if (verschillend >= 0) {
      afwijking = `Termijn ${verschillend + 1} is in de offerte ${offerte[verschillend].percentage}% `
        + `en in Bouw7 ${bouw7[verschillend].percentage}%.`
    }
  }

  return { offerte, bouw7, conditieNaam: conditie.naam, afwijking }
}

export type TermijnschemaInvoer = {
  termijnen: TermijnschemaRegel[]
  /** Bouw7-id van het btw-tarief (`btw_tarieven.bouw7_id`) dat op elke termijn komt. */
  btwTariefBouw7Id: number
  grondslag: TermijnGrondslag
}

/**
 * Maakt het termijnschema aan in Bouw7.
 *
 * De percentages worden op de gekozen grondslag omgerekend. Het laatste termijn krijgt het
 * afrondingsverschil, zodat de som exact op de grondslag uitkomt — anders blijft er een cent over
 * die niemand kan factureren.
 *
 * Er wordt alleen aangemaakt, nooit overschreven: staat er in Bouw7 al een termijnstaat, dan is
 * die daar bewust gezet en is bijwerken werk voor de administratie. EVA een bestaande staat laten
 * herschrijven op basis van een schema dat de gebruiker net in een venster heeft samengesteld is
 * hoe je stilletjes een afgesproken termijnindeling kwijtraakt.
 */
export async function maakTermijnschema(
  dossierId: string,
  invoer: TermijnschemaInvoer,
): Promise<
  | { ok: true; aangemaakt: number; grondslag: number }
  | { ok: false; error: string }
> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }

  // --- Het schema zelf. Wat de client stuurt wordt hier opnieuw gewogen; een knop die uit staat
  //     in het venster is geen controle.
  const termijnen = invoer.termijnen
    .map(t => ({
      omschrijving: String(t?.omschrijving ?? '').trim().slice(0, 200),
      percentage: Number(t?.percentage),
    }))
    .filter(t => Number.isFinite(t.percentage))
  if (termijnen.length === 0) return { ok: false, error: 'Er zijn geen termijnen opgegeven.' }
  if (termijnen.length > 50) {
    return { ok: false, error: 'Een termijnschema van meer dan 50 termijnen wordt niet verwerkt.' }
  }
  if (termijnen.some(t => t.percentage <= 0)) {
    return { ok: false, error: 'Elke termijn moet een percentage boven 0 hebben.' }
  }
  const somPct = termijnen.reduce((s, t) => s + t.percentage, 0)
  if (Math.abs(somPct - 100) > 0.01) {
    return {
      ok: false,
      error: `De termijnen tellen op tot ${Math.round(somPct * 100) / 100}% in plaats van 100%. `
        + 'Corrigeer het schema voordat je het naar Bouw7 schrijft.',
    }
  }
  if (!Number.isFinite(invoer.btwTariefBouw7Id)) {
    return { ok: false, error: 'Kies eerst een btw-tarief voor de termijnen.' }
  }

  // --- De grondslag. Meerwerk telt alleen mee als daar bewust voor gekozen is.
  const bedragen = await termijnGrondslagen(dossierId)
  if (bedragen.bestaandeTermijnen > 0) {
    return {
      ok: false,
      error: `Dit project heeft in Bouw7 al ${bedragen.bestaandeTermijnen} termijn(en). `
        + 'Pas die daar aan; EVA overschrijft een bestaande termijnstaat niet.',
    }
  }
  const grondslag = invoer.grondslag === 'contracttotaal'
    ? bedragen.aanneemsom + bedragen.meerwerk
    : bedragen.aanneemsom
  if (!(grondslag > 0)) {
    return {
      ok: false,
      error: 'Dit dossier heeft nog geen aanneemsom; zonder bedrag zijn er geen termijnen te berekenen.',
    }
  }

  const centen = Math.round(grondslag * 100)
  let verdeeld = 0
  const teSchrijven = termijnen.map((t, i) => {
    const laatste = i === termijnen.length - 1
    const eigenCenten = laatste ? centen - verdeeld : Math.round(centen * t.percentage / 100)
    verdeeld += eigenCenten
    return {
      bouw7TermId: null,
      omschrijving: t.omschrijving || `Termijn ${i + 1}`,
      percentage: t.percentage,
      bedragExclBtw: eigenCenten / 100,
      vatTariffId: invoer.btwTariefBouw7Id,
    }
  })

  // De debiteur: uit het skelet dat Bouw7 voor een nieuwe factuur teruggeeft — dat draagt het
  // project-contact.
  let contactId: number | null = null
  try {
    const skelet = await ctx.client.get<{ contact?: { id?: number } }>(`/project/${ctx.bouw7Id}/invoice/new`)
    contactId = skelet?.contact?.id ?? null
  } catch { /* hieronder afgevangen */ }
  if (contactId == null) {
    return { ok: false, error: 'Dit Bouw7-project heeft geen debiteur; koppel daar eerst een relatie.' }
  }

  const res = await schrijfBouw7Termijnstaat({
    projectId: Number(ctx.bouw7Id),
    contactId,
    aanneemsom: grondslag,
    termijnen: teSchrijven,
  })
  if (!res.ok) return res

  revalidatePath(`/opdrachten/${dossierId}/verkoop`)
  revalidatePath(`/servicedesk/${dossierId}/financieel`)
  return { ok: true, aangemaakt: res.aangemaakt, grondslag }
}
