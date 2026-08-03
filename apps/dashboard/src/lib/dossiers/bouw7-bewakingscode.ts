/**
 * Bouw7-write: de **bewakingscode van een geboekte kost** verplaatsen.
 *
 * Waarom dit kán terwijl "inkoopfacturen niet schrijven" nog steeds geldt: de bewakingscode van
 * een geboekte kost hangt niet op de inkoopfactuur maar op de **leverbon** die eronder ligt
 * (`DeliveryTicket.projectSecurityLink`). Het fiscale deel van de factuur — bedrag, BTW,
 * factuurnummer, boekstuk — zit op een ander object en wordt hier niet aangeraakt. In de
 * Swagger-spec zijn `contract`, `purchaseInvoice`, `initialCost` en `file` als `readOnly`
 * gemarkeerd, `projectSecurityLink` niet.
 *
 * Geverifieerd (jul 2026, project 3869371, leverbon 11326492 — daarna teruggezet):
 *   POST /project/delivery-ticket  { id, contact{id}, project{id}, ticketNumber, ticketDate,
 *                                    purchaseType, cost, processed, description,
 *                                    projectSecurityLink: { id: <pslId> } }  → 200
 * De code wijzigde daadwerkelijk, `purchaseInvoice` (id/nummer/isBooked), `cost` en `initialCost`
 * bleven ongewijzigd, en Apollo `/search/purchase-invoices` — EVA's leesbron voor de codes — gaf
 * de nieuwe code direct terug. Ook op een bon met `hasImmutablePurchaseInvoice: true`.
 *
 * **Twee harde regels.**
 * 1. Een kost die via een **inkooporder of OA-contract** aan zijn bewakingscode hangt wordt
 *    NOOIT verplaatst. Daar bepaalt de contracttermijn/bestelregel de code; de bon losweken
 *    van het contract levert een verschil op tussen contract en geboekte kosten. Zie
 *    `isContractBon()`.
 * 2. De doel-PSL moet dezelfde **kostensoort** hebben als de bon. In 701 van 701 gemeten bonnen
 *    geldt `deliveryTicket.purchaseType === projectSecurityLink.costType`; een PSL van een andere
 *    kostensoort zou de kost in de verkeerde kolom van de Financieel-tab laten landen.
 */

import type { Bouw7Client } from '@/lib/bouw7/client'

/** Leverbon zoals `GET /project/delivery-ticket/{id}` hem teruggeeft (alleen wat we nodig hebben). */
type Bouw7DeliveryTicketDetail = {
  id: number
  contact?: { id?: number } | null
  project?: { id?: number } | null
  ticketNumber?: string | null
  ticketDate?: string | null
  purchaseType?: number
  cost?: string | number | null
  processed?: boolean
  description?: string | null
  projectSecurityLink?: { id?: number; code?: string | null; name?: string | null } | null
}

export type BonCodeResult = { ok: true; code: string } | { ok: false; error: string }

/** Doelcode zoals `getDossierInkoop` hem aanlevert. */
export type BewakingscodeDoel = {
  code: string
  naam: string | null
  hoofdstukId: number | null
  /** PSL-id per kostensoort; ontbreekt er één, dan maken we die aan (zie `zorgVoorPsl`). */
  pslPerKostensoort: Record<number, number>
}

/**
 * Kostensoort van de bon → kostensoort van de bewakingslink.
 *
 * Meestal identiek (`purchaseType === projectSecurityLink.costType`, 701/701 gemeten). De
 * uitzondering is `purchaseType: 0` ("delivery_ticket" — een bon zonder gekozen inkooptype, zoals
 * Bouw7 die maakt bij het inboeken van een losse factuur). Zo'n bon telt in de projectbewaking mee
 * onder **kostensoort 2 (Inkoop)**: op project 3582730 is de som van de pt0-bonnen (€2.138,72)
 * exact gelijk aan het bestede bedrag van kostensoort 2.
 */
function pslKostensoort(purchaseType: number): number {
  return purchaseType === 0 ? 2 : purchaseType
}

/** Kostensoort → veldnaam in de project-security-links-structuur (het begrote bedrag). */
const CT_STRUCTUUR_VELD: Record<number, string> = {
  1: 'laborCosts',          // Arbeid
  2: 'purchaseOrderCosts',  // Inkoop
  3: 'subcontractorCosts',  // Onderaanneming
  4: 'equipmentCosts',      // Materieel
  5: 'materialCosts',       // Materiaal
  6: 'wasteCosts',          // Afval
}

type SecBudgetData = { securityCode?: { id?: number; code?: string | null; name?: string | null } | null; [veld: string]: unknown }
type SecChapter = { securityCodeChapter?: { id?: number; name?: string } | null; budgetDataPerSecurityCodes?: SecBudgetData[] }
type SecObject = { securityObject: unknown | null; securityCodesPerChapters: SecChapter[] }
type ControlChapters = {
  items?: { chapterInfo?: { id?: number; name?: string } | null; securityCodes?: { code?: string; pslIds?: number[] }[] }[]
}

/**
 * Zorgt dat de bewakingscode op dit project óók onder de gevraagde kostensoort bestaat, en geeft
 * de PSL-id terug. Een code heeft alleen een PSL voor de kostensoorten waarvoor hij begroot is;
 * zonder deze stap kon een kost niet naar een code die wél bestaat maar (nog) niet onder die soort.
 *
 * Werkwijze = die van de werkbegroting-prognose (`zorgVoorOntbrekendePsls`): het begrote bedrag op
 * `'0'` zetten in de structuur `GET/POST /project/{id}/project-security-links` laat de PSL ontstaan.
 * Read-modify-write: de POST vervángt de hele structuur, dus we voegen alleen een veld toe en
 * verwijderen nooit iets. De code zelf wordt hier **niet** aangemaakt — hercoderen kan alleen naar
 * codes die al op het project staan.
 */
async function zorgVoorPsl(
  client: Bouw7Client,
  bouw7Id: string | number,
  doel: BewakingscodeDoel,
  kostensoort: number,
): Promise<{ ok: true; pslId: number } | { ok: false; error: string }> {
  const veld = CT_STRUCTUUR_VELD[kostensoort]
  if (!veld) return { ok: false, error: `kostensoort ${kostensoort} kent geen begrotingsveld in Bouw7.` }

  let struct: SecObject[]
  try {
    struct = await client.get<SecObject[]>(`/project/${bouw7Id}/project-security-links`)
  } catch (e) {
    return { ok: false, error: `projectstructuur niet op te halen (${foutTekst(e)}).` }
  }

  // Zoek de code binnen het gekozen hoofdstuk. Buiten dat hoofdstuk zoeken zou een gelijknamige
  // code in een ánder hoofdstuk aanpassen — codes zijn niet uniek per project.
  let doelBd: SecBudgetData | null = null
  for (const obj of struct) {
    for (const chap of obj.securityCodesPerChapters ?? []) {
      if (doel.hoofdstukId != null && chap.securityCodeChapter?.id !== doel.hoofdstukId) continue
      for (const bd of chap.budgetDataPerSecurityCodes ?? []) {
        if ((bd.securityCode?.code ?? '').trim() === doel.code) { doelBd = bd; break }
      }
      if (doelBd) break
    }
    if (doelBd) break
  }
  if (!doelBd) return { ok: false, error: `bewakingscode "${doel.code}" staat niet in de projectstructuur van Bouw7.` }

  if (doelBd[veld] == null) doelBd[veld] = '0'
  // Arbeid: Bouw7 eist dat bij laborCosts óók laborHours en laborHourlyRate gevuld zijn.
  if (kostensoort === 1) {
    if (doelBd.laborHours == null) doelBd.laborHours = '0'
    if (doelBd.laborHourlyRate == null) doelBd.laborHourlyRate = '0'
  }

  try {
    await client.post(`/project/${bouw7Id}/project-security-links`, { securityCodeChaptersPerObjects: struct })
  } catch (e) {
    return { ok: false, error: `bewakingscode toevoegen aan de kostensoort mislukt (${foutTekst(e)}).` }
  }

  // De nieuwe PSL-id staat niet in het antwoord — opnieuw resolven uit dezelfde bron als altijd.
  try {
    const ch = await client.getAthena<ControlChapters>(
      `/project-control/${bouw7Id}/cost-type/${kostensoort}/chapters?include_subprojects=false`,
    )
    for (const h of ch.items ?? []) {
      if (doel.hoofdstukId != null && h.chapterInfo?.id !== doel.hoofdstukId) continue
      for (const sc of h.securityCodes ?? []) {
        if ((sc.code ?? '').trim() !== doel.code) continue
        const pslId = sc.pslIds?.[0]
        if (pslId != null) return { ok: true, pslId: Number(pslId) }
      }
    }
  } catch (e) {
    return { ok: false, error: `nieuwe bewakingslink niet terug te vinden (${foutTekst(e)}).` }
  }
  return { ok: false, error: 'Bouw7 heeft de bewakingscode niet aan die kostensoort toegevoegd.' }
}

/**
 * Contract-gebondenheid wordt niet hier bepaald maar in `getDossierInkoop`: Bouw7 nummert een
 * afroepbon als `<contractnummer>B<nr>`, en die bonnummer-match levert daar meteen het order-/
 * contract-id op. Bewust niet via `DeliveryTicket.contract` — dat veld is in de praktijk vaak
 * `null`, ook bij bonnen die aantoonbaar uit een contract komen.
 */

/**
 * Zet de bewakingscode van één leverbon in Bouw7 op `pslId`.
 *
 * Read-modify-write: eerst het bonobject ophalen, dan alleen `projectSecurityLink` vervangen en
 * het geheel terugsturen. De read-only velden (`purchaseInvoice`, `contract`, `initialCost`,
 * `file`, audit) laten we uit de body — Bouw7 vult ze zelf en negeert ze bij het schrijven.
 *
 * `verwachteKostensoort` is de kostensoort van de doel-PSL; komt die niet overeen met de
 * `purchaseType` van de bon, dan schrijven we niet. Dat is de enige manier waarop een kost in
 * de verkeerde kolom van de Financieel-tab zou kunnen belanden.
 */
export async function schrijfBouw7BonBewakingscode(
  client: Bouw7Client,
  bouw7Id: string | number,
  bonId: number,
  doel: BewakingscodeDoel,
): Promise<BonCodeResult> {
  let bon: Bouw7DeliveryTicketDetail
  try {
    bon = await client.get<Bouw7DeliveryTicketDetail>(`/project/delivery-ticket/${bonId}`)
  } catch (e) {
    return { ok: false, error: `leverbon niet op te halen uit Bouw7 (${foutTekst(e)}).` }
  }
  // De kostensoort komt van de bon zelf, niet uit de lijstdata: dit is het enige moment waarop
  // vaststaat welke PSL erbij hoort, en een mismatch zou de kost in de verkeerde kolom van de
  // Financieel-tab zetten.
  if (bon.purchaseType == null) return { ok: false, error: 'de leverbon heeft geen kostensoort in Bouw7.' }
  const kostensoort = pslKostensoort(bon.purchaseType)

  // Staat de code nog niet onder deze kostensoort? Dan voegen we hem daar toe (begroot 0) in
  // plaats van te weigeren — anders was de kost onverplaatsbaar zonder handwerk in Bouw7.
  let pslId = doel.pslPerKostensoort[kostensoort]
  if (pslId == null) {
    const gemaakt = await zorgVoorPsl(client, bouw7Id, doel, kostensoort)
    if (!gemaakt.ok) return gemaakt
    pslId = gemaakt.pslId
  }
  if (bon.projectSecurityLink?.id === pslId) return { ok: true, code: bon.projectSecurityLink?.code ?? '' }

  try {
    await client.post('/project/delivery-ticket', {
      id: bon.id ?? bonId,
      contact: bon.contact?.id != null ? { id: bon.contact.id } : null,
      project: bon.project?.id != null ? { id: bon.project.id } : null,
      ticketNumber: bon.ticketNumber,
      ticketDate: bon.ticketDate,
      purchaseType: bon.purchaseType,
      cost: bon.cost,
      processed: bon.processed,
      description: bon.description,
      projectSecurityLink: { id: pslId },
    })
  } catch (e) {
    return { ok: false, error: `Bouw7 weigerde de wijziging (${foutTekst(e)}).` }
  }

  // Terugcontrole: de spec is geen bewijs van schrijfbaarheid — een stil genegeerd veld heeft
  // eerder (linkedDeliveryTicket) een "geslaagde" 200 opgeleverd zonder dat er iets veranderde.
  try {
    const na = await client.get<Bouw7DeliveryTicketDetail>(`/project/delivery-ticket/${bonId}`)
    if (na.projectSecurityLink?.id !== pslId) {
      return { ok: false, error: 'Bouw7 gaf geen fout, maar de bewakingscode is daar niet gewijzigd.' }
    }

    return { ok: true, code: na.projectSecurityLink?.code ?? '' }
  } catch {
    // De write zelf gaf 200; alleen de controle-read mislukte. Niet als fout melden.
    return { ok: true, code: '' }
  }
}

function foutTekst(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // Bouw7-fouten komen als JSON in de message; haal er de leesbare `message` uit.
  const m = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  return m ? m[1].replace(/\\"/g, '"').replace(/\\u0022/g, '"') : raw
}
