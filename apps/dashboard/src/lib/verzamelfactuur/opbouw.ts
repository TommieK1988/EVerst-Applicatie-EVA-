import 'server-only'

import { createAdminClient } from '@everts/database/server'
import { getRegieFactuurvoorstel, type FactuurRegelVoorstel, type RegieVoorstel } from '@/lib/dossiers/servicedesk'
import { boekingenOpRegel } from '@/lib/dossiers/regie-factuur-afboeken'
import { leesBouw7Termijnstaat } from '@/lib/bouw7/termijnstaat'
import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7ProjectInvoiceTerm } from '@/lib/bouw7/client'
import type { VerzamelHoofdstuk, VerzamelRegel } from '@/lib/bouw7/verzamelfactuur'
import type { VoorbeeldDossier, VoorbeeldRegel } from './types'

/**
 * De factuurregels van één bon, voor op een verzamelfactuur.
 *
 * Twee bronnen, precies zoals de Verkoop-tab van de bon ze toont:
 *  - **nacalculatie** — het regievoorstel (`getRegieFactuurvoorstel`): dezelfde groepering, prijzen,
 *    losse regels en btw per regel als bij een factuur per bon;
 *  - **termijnen** — wat er in Bouw7 nog open staat op de termijnstaat (aangenomen bonnen).
 *
 * Er wordt hier niets aangepast. Wie een regel anders wil, past de bon aan; dat is de afspraak.
 */

export type BtwInfo = { label: string; pct: number }

export type DossierBron = {
  id: string
  bouw7Id: number
  dossiernummer: string | null
  titel: string | null
  referentie: string | null
  /** Regiebon: rekent af op nacalculatie, termijnen gaan dan niet mee (zie `opRegie`). */
  opRegie: boolean
}

export type DossierOpbouw = {
  dossier: DossierBron
  voorstel: RegieVoorstel
  regieRegels: FactuurRegelVoorstel[]
  termijnen: Bouw7ProjectInvoiceTerm[]
  voorbeeld: VoorbeeldDossier
}

const rond = (n: number): number => Math.round(n * 100) / 100

/** Kop van het hoofdstuk zoals de administratie hem in Bouw7 schrijft. */
export function hoofdstukKop(d: Pick<DossierBron, 'dossiernummer' | 'titel'>): string {
  return [d.dossiernummer, (d.titel ?? '').trim()].filter(Boolean).join(' ') || 'Bon'
}

export async function bouwDossierOpbouw(
  dossier: DossierBron,
  standaardBtwId: number,
  tarieven: Map<number, BtwInfo>,
): Promise<DossierOpbouw> {
  const [voorstel, staat] = await Promise.all([
    getRegieFactuurvoorstel(dossier.id),
    leesBouw7Termijnstaat(dossier.bouw7Id),
  ])
  const openTermijnen = staat.termijnen.filter(t => t.invoiceLine == null && Number(t.subtotal ?? 0) !== 0)
  // Op een regiebon factureert de Verkoop-tab de nacalculatie, niet de termijnen. Een termijn die
  // daar nog openstaat is meestal een restant van een offerte; meenemen zou dubbel factureren.
  const termijnen = dossier.opRegie ? [] : openTermijnen

  const waarschuwingen = voorstel.buitenBeschouwing.map(b => `${b.omschrijving}: ${b.reden}`)
  if (dossier.opRegie && openTermijnen.length > 0) {
    const som = rond(openTermijnen.reduce((s, t) => s + Number(t.subtotal ?? 0), 0))
    waarschuwingen.push(`In Bouw7 staan nog ${openTermijnen.length} open termijn${openTermijnen.length === 1 ? '' : 'en'} `
      + `(€ ${som.toFixed(2).replace('.', ',')}). Dit is een regiebon, dus die gaan niet mee.`)
  }
  const regels: VoorbeeldRegel[] = []
  let blokkade: string | null = null

  for (const r of voorstel.regels) {
    const t = tarieven.get(r.btwTariefBouw7Id ?? standaardBtwId)
    regels.push({
      omschrijving: r.omschrijving, aantal: r.aantal, eenheid: r.eenheid, stukprijs: r.stukprijs,
      bedrag: r.bedrag, btwLabel: t?.label ?? '?', btwPct: t?.pct ?? 0, soort: 'regie',
    })
  }
  for (const t of termijnen) {
    const id = t.vatTariff?.id != null ? Number(t.vatTariff.id) : null
    if (id == null || !Number.isFinite(id)) {
      blokkade = `Termijn "${t.description ?? t.id}" heeft geen btw-tarief in Bouw7. Vul dat daar eerst in.`
    }
    const info = id != null ? tarieven.get(id) : undefined
    const bedrag = Number(t.subtotal ?? 0)
    regels.push({
      omschrijving: (t.description ?? '').trim() || `Termijn ${t.id}`, aantal: 1, eenheid: null,
      stukprijs: bedrag, bedrag, btwLabel: info?.label ?? t.vatTariff?.label ?? '?',
      btwPct: info?.pct ?? Number(t.vatTariffPercentage ?? 0), soort: 'termijn',
    })
  }

  return {
    dossier,
    voorstel,
    regieRegels: voorstel.regels,
    termijnen,
    voorbeeld: {
      id: dossier.id,
      kop: hoofdstukKop(dossier),
      referentie: dossier.referentie,
      regels,
      totaal: rond(regels.reduce((s, r) => s + r.bedrag, 0)),
      waarschuwingen,
      blokkade,
      leeg: regels.length === 0,
    },
  }
}

/**
 * Inkoopfactuurregels van deze inkoopfactuur die bij dit project horen. EVA boekt kosten per
 * inkoopfactuur; Bouw7 koppelt per regel. Een regel hoort bij het project via zijn leverbon, of —
 * zonder leverbon — via de inkoopfactuur zelf.
 */
async function inkoopRegelIds(inkoopfactuurId: string, projectId: number): Promise<number[]> {
  try {
    const client = await getBouw7Client()
    const doc = await client.get<{
      project?: { id?: number } | null
      lines?: { id?: number; deliveryTicket?: { project?: { id?: number } | null } | null }[]
    }>(`/purchase-invoicing/purchase-invoice/${inkoopfactuurId}`)
    return (doc.lines ?? [])
      .filter(l => l.id != null && (l.deliveryTicket?.project?.id ?? doc.project?.id) === projectId)
      .map(l => l.id as number)
  } catch {
    return [] // geen koppeling is geen ramp: de factuur klopt, alleen staat de kostenpost in Bouw7 nog open
  }
}

/** Zet de opbouw van een bon om in een hoofdstuk voor Bouw7, mét koppelingen naar de boekingen. */
export async function naarHoofdstuk(op: DossierOpbouw, standaardBtwId: number): Promise<VerzamelHoofdstuk> {
  const projectId = op.dossier.bouw7Id
  const regels: VerzamelRegel[] = []

  for (const r of op.regieRegels) {
    const koppelingen: { id: number; type: string }[] = []
    for (const b of boekingenOpRegel(op.voorstel, r)) {
      if (b.bronType === 'uur') {
        const id = Number(b.bronBouw7Id)
        if (Number.isFinite(id)) koppelingen.push({ id, type: 'employeeHours' })
      } else {
        for (const id of await inkoopRegelIds(b.bronBouw7Id, projectId)) {
          koppelingen.push({ id, type: 'purchaseInvoiceLines' })
        }
      }
    }
    regels.push({
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      eenheid: r.eenheid,
      stukprijs: r.stukprijs,
      vatTariffId: r.btwTariefBouw7Id ?? standaardBtwId,
      projectId,
      koppelingen: [...new Map(koppelingen.map(k => [`${k.type}:${k.id}`, k])).values()],
    })
  }
  for (const t of op.termijnen) {
    regels.push({
      omschrijving: (t.description ?? '').trim() || `Termijn ${t.id}`,
      aantal: 1,
      stukprijs: Number(t.subtotal ?? 0),
      vatTariffId: Number(t.vatTariff!.id),
      projectId,
      projectInvoiceTermIds: [t.id],
    })
  }
  // De referentie van de opdrachtgever één keer, op de eerste regel — zo doet de administratie het.
  if (regels[0] && op.dossier.referentie) regels[0].referentie = op.dossier.referentie.slice(0, 255)

  return { projectId, naam: op.voorbeeld.kop, regels }
}

/** De btw-tarieven zoals Bouw7 ze rekent (verlegd = 0%), op Bouw7-id. */
export async function laadBtwInfo(): Promise<Map<number, BtwInfo & { verlegd: boolean }>> {
  const { data } = await createAdminClient().from('btw_tarieven').select('bouw7_id, label, percentage, verlegd').eq('actief', true)
  return new Map(((data ?? []) as unknown as { bouw7_id: number | null; label: string; percentage: string; verlegd: boolean }[])
    .filter(t => t.bouw7_id != null)
    .map(t => [Number(t.bouw7_id), { label: t.label, pct: Number(t.percentage), verlegd: t.verlegd }]))
}
