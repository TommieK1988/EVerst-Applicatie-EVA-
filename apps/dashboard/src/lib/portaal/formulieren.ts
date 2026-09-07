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
  /** Link naar het vrijgegeven bezoekrapport, of null als er nog geen is vrijgegeven. */
  rapportUrl: string | null
}

/** Een vrijgegeven bezoekrapport: opleveringen, veiligheidsrondes en inspecties. */
export type PortaalBezoekRapport = {
  id: string
  titel: string
  datum: string | null
  url: string
}

export async function getPortaalFormulieren(dossierId: string): Promise<{
  formulieren: PortaalFormulier[]
  controles: PortaalControle[]
  bezoekrapporten: PortaalBezoekRapport[]
}> {
  const weergave = await vereisPortaalOnderdeelWeergave(dossierId, 'formulieren')

  // Een bezoekrapport is een SharePoint-document, en de downloadproxy hercontroleert daarvoor
  // het onderdeel `bestanden`. Staat dat uit, dan zou elke rapportlink op een 403 uitkomen —
  // dus dan tonen we hem niet. Twee poorten, allebei nodig.
  const magBestanden = (weergave.instellingen as unknown as Record<string, boolean>).toon_bestanden === true

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

  // ── Vrijgegeven bezoekrapporten ────────────────────────────────────────
  // Twee stappen: welke rapporten zijn er opgesteld, en welke daarvan zijn ook echt
  // vrijgegeven. Vrijgave is de bevroren rij in portaal_bestanden; die is leidend.
  const rapportPerInspectie = new Map<string, string>()
  const losseRapporten: PortaalBezoekRapport[] = []

  if (magBestanden) {
    const [{ data: documenten }, { data: vrijgegeven }] = await Promise.all([
      db().from('dossier_documenten')
        .select('id, documentsoort, bestandsnaam, invoer, sharepoint_item_id, gegenereerd_op')
        .eq('dossier_id', dossierId)
        .eq('documentsoort', 'bezoekrapport')
        .not('sharepoint_item_id', 'is', null)
        .order('gegenereerd_op', { ascending: false })
        .limit(200),
      db().from('portaal_bestanden')
        .select('sleutel')
        .eq('dossier_id', dossierId)
        .eq('zichtbaar', true),
    ])

    const vrij = new Set(
      ((vrijgegeven ?? []) as { sleutel: string }[]).map(r => r.sleutel),
    )

    for (const d of ((documenten ?? []) as Record<string, unknown>[])) {
      const sleutel = `sharepoint:${String(d.sharepoint_item_id)}`
      if (!vrij.has(sleutel)) continue
      const url = `/api/dossier-bestand?portaal=1&dossier=${dossierId}&sleutel=${encodeURIComponent(sleutel)}`

      // De bron staat in de bevroren optie-JSON van het document; daarmee hangt een rapport
      // aan de juiste controle zonder dat er een kolom bij hoeft.
      const invoer = (d.invoer ?? {}) as Record<string, unknown>
      const bezoek = leesBezoekKeuze(invoer.bezoek)
      if (bezoek?.soort === 'kwaliteit' && bezoek.id && !rapportPerInspectie.has(bezoek.id)) {
        rapportPerInspectie.set(bezoek.id, url)
      } else {
        losseRapporten.push({
          id: String(d.id),
          titel: String(d.bestandsnaam ?? 'Bezoekrapport').replace(/\.pdf$/i, ''),
          datum: (d.gegenereerd_op as string | null) ?? null,
          url,
        })
      }
    }
  }

  const controles: PortaalControle[] = ((inspecties ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    nummer: (r.inspectienummer as string | null) ?? null,
    datum: (r.datum as string | null) ?? null,
    omschrijving: (r.werkzaamheden_omschrijving as string | null) ?? null,
    bekeken: (r.steekproef_bekeken as number | null) ?? null,
    afwijkend: (r.steekproef_afwijkend as number | null) ?? null,
    rapportUrl: rapportPerInspectie.get(String(r.id)) ?? null,
  }))

  return { formulieren, controles, bezoekrapporten: losseRapporten }
}

/** Leest {bron_soort, bron_id} uit de opgeslagen optie-JSON; tolerant, want dit is data. */
function leesBezoekKeuze(ruw: unknown): { soort: string; id: string } | null {
  let obj: Record<string, unknown> | null = null
  if (ruw && typeof ruw === 'object') obj = ruw as Record<string, unknown>
  else if (typeof ruw === 'string' && ruw.trim().startsWith('{')) {
    try { obj = JSON.parse(ruw) as Record<string, unknown> } catch { return null }
  }
  if (!obj?.bron_soort || !obj?.bron_id) return null
  return { soort: String(obj.bron_soort), id: String(obj.bron_id) }
}
