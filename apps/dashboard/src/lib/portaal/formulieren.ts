import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { vereisPortaalOnderdeelWeergave } from './auth'

/**
 * formulieren.ts — ingevulde formulieren en uitgevoerde controles.
 *
 * Twee bronnen, allebei streng gefilterd:
 *
 *  1. form_inzendingen — alleen van sjablonen waarvan iemand expliciet heeft
 *     gezegd dat ze klantwaardig zijn (form_templates.portaal_zichtbaar), en
 *     alleen als ze ingediend of goedgekeurd zijn. Een concept is halve invoer
 *     en een afgekeurde inzending is iets waar wij het intern nog over hebben.
 *     De opt-in zit op het sjabloon en niet op de inzending: je besluit één keer
 *     dat een opleverchecklist gedeeld mag worden, niet honderd keer opnieuw.
 *
 *  2. kwaliteit_inspecties — alleen definitieve inspecties, en alleen de
 *     samenvatting: datum, wat er is bekeken, hoeveel steekproeven en hoeveel
 *     daarvan afweken. Niet: de inspecteur (dat is een collega die niet ter
 *     verantwoording geroepen hoeft te worden door de klant), de interne
 *     opmerkingen, of de afwijkingen met hun herstelkosten.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type PortaalFormulier = {
  id: string
  titel: string
  datum: string | null
  /** Directe link naar de PDF, of null als er geen PDF-uitvoer is ingericht. */
  pdfUrl: string | null
}

export type PortaalControle = {
  id: string
  nummer: string | null
  datum: string | null
  omschrijving: string | null
  bekeken: number | null
  afwijkend: number | null
}

export async function getPortaalFormulieren(dossierId: string): Promise<{
  formulieren: PortaalFormulier[]
  controles: PortaalControle[]
}> {
  await vereisPortaalOnderdeelWeergave(dossierId, 'formulieren')

  // Eerst de vrijgegeven sjablonen; zonder die lijst hoeven we de inzendingen
  // niet eens op te halen.
  const { data: sjablonen } = await db()
    .from('form_templates')
    .select('id, naam')
    .eq('portaal_zichtbaar', true)

  const titelPerSjabloon = new Map<string, string>(
    ((sjablonen ?? []) as { id: string; naam: string }[]).map(t => [t.id, t.naam]),
  )

  let formulieren: PortaalFormulier[] = []
  if (titelPerSjabloon.size > 0) {
    const { data } = await db()
      .from('form_inzendingen')
      .select('id, template_id, status, ingediend_op, aangemaakt_op')
      .eq('dossier_id', dossierId)
      .in('template_id', [...titelPerSjabloon.keys()])
      .in('status', ['ingediend', 'goedgekeurd'])
      .order('ingediend_op', { ascending: false })

    formulieren = ((data ?? []) as Record<string, unknown>[]).map(r => ({
      id: String(r.id),
      titel: titelPerSjabloon.get(String(r.template_id)) ?? 'Formulier',
      datum: (r.ingediend_op as string | null) ?? (r.aangemaakt_op as string | null) ?? null,
      pdfUrl: `/api/portaal/formulier-pdf?dossier=${dossierId}&inzending=${String(r.id)}`,
    }))
  }

  const { data: inspecties } = await db()
    .from('kwaliteit_inspecties')
    .select('id, inspectienummer, datum, werkzaamheden_omschrijving, steekproef_bekeken, steekproef_afwijkend, status')
    .eq('dossier_id', dossierId)
    .eq('status', 'definitief')
    .order('datum', { ascending: false })

  const controles: PortaalControle[] = ((inspecties ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    nummer: (r.inspectienummer as string | null) ?? null,
    datum: (r.datum as string | null) ?? null,
    omschrijving: (r.werkzaamheden_omschrijving as string | null) ?? null,
    bekeken: (r.steekproef_bekeken as number | null) ?? null,
    afwijkend: (r.steekproef_afwijkend as number | null) ?? null,
  }))

  return { formulieren, controles }
}
