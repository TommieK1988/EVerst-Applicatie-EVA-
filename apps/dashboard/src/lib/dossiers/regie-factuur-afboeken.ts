import 'server-only'

import { createAdminClient } from '@everts/database/server'
import type { BoekingView, FactuurRegelVoorstel, RegieVoorstel } from './servicedesk'

/**
 * Wat er gebeurt nádat een regiefactuur in Bouw7 klaarstaat: de boekingen afboeken die erop staan.
 *
 * Gedeeld door de factuur per bon (`maakRegieFactuurInBouw7`) en de verzamelfactuur. Beide bouwen
 * de regels uit hetzelfde voorstel (`getRegieFactuurvoorstel`), dus ze boeken ook op dezelfde
 * manier af — anders zou een bon op een verzamelfactuur bij de volgende factuur opnieuw meegaan.
 */

const rond = (n: number): number => Math.round(n * 100) / 100

/**
 * De nog te factureren boekingen achter één factuurregel. Voor de koppeling in Bouw7
 * (`linkedBookingItems`): daarmee staat het uur of de inkoopregel daar ook als gefactureerd.
 */
export function boekingenOpRegel(voorstel: RegieVoorstel, regel: FactuurRegelVoorstel): BoekingView[] {
  const code = voorstel.codes.find(c => c.bewakingscode === regel.bewakingscode)
  if (!code) return []
  return code.boekingen.filter(b =>
    !b.uitgesloten && !b.gefactureerd && b.groepSleutel === regel.groepSleutel)
}

/**
 * Boekt af wat op factuur `invoiceId` staat. Pas aanroepen ná de acceptatiecontrole van de factuur.
 */
export async function boekRegieFactuurAf(
  dossierId: string,
  voorstel: RegieVoorstel,
  regels: FactuurRegelVoorstel[],
  invoiceId: number,
): Promise<void> {
  // Pas nu afboeken, en alleen de boekingen die daadwerkelijk op deze factuur staan. Dat is nu
  // preciezer dan "alle boekingen van een gefactureerde code": een factuurregel die uitstond, of
  // een post die op nul uitkwam, ging niet mee en mag dus ook niet als gefactureerd gelden — anders
  // verdwijnt hij stilzwijgend van de volgende factuur.
  const opFactuur = new Set(regels.map(r => `${r.bewakingscode}|${r.groepSleutel}`))
  const mee = voorstel.codes.flatMap(c =>
    c.boekingen
      .filter(b => !b.uitgesloten && !b.gefactureerd && opFactuur.has(`${c.bewakingscode}|${b.groepSleutel}`))
      .map(b => ({ boeking: b, bewakingscode: c.bewakingscode })))

  // Wat er per boeking werkelijk op de factuur kwam. Zonder vast bedrag is dat gewoon de eigen
  // verkoopwaarde; mét vast bedrag op de regel is het dat regelbedrag, naar rato over de boekingen
  // eronder verdeeld (afrondingsrest op de laatste). Het vaste bedrag wordt hieronder gewist, dus
  // dit is de enige plek waar het nog vast te leggen is — anders toont "Al gefactureerd" de som van
  // de berekende bedragen en loopt hij uit de pas met de factuur zelf.
  const gefactureerdBedrag = new Map<string, number>()
  for (const r of regels) {
    const inGroep = mee.filter(m =>
      m.bewakingscode === r.bewakingscode && m.boeking.groepSleutel === r.groepSleutel)
    if (inGroep.length === 0) continue
    const basisSom = inGroep.reduce((s, m) => s + (m.boeking.verkoopBedrag || 0), 0)
    let verdeeld = 0
    inGroep.forEach((m, i) => {
      const deel = i === inGroep.length - 1
        ? rond(r.bedrag - verdeeld)
        : rond(basisSom !== 0
          ? r.bedrag * (m.boeking.verkoopBedrag || 0) / basisSom
          : r.bedrag / inGroep.length)
      verdeeld = rond(verdeeld + deel)
      gefactureerdBedrag.set(m.boeking.sleutel, deel)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Losse regels hebben geen boeking om af te boeken; ze onthouden zelf op welke factuur ze staan.
  // Zonder dit zouden opstart- of voorrijkosten bij elke volgende factuur opnieuw meegaan.
  //
  // Een afgeleide regel boekt af via zijn boekingen, maar een vastgezet bedrag op zo'n regel is net
  // zo'n val: de boekingen verdwijnen, de override blijft staan, en de eerstvolgende boeking die in
  // dezelfde groep valt laat het hele vaste bedrag opnieuw meegaan. Dat bedrag was een afspraak
  // over wát er gefactureerd is, niet over wat er daarna nog binnenkomt — dus wordt het gewist en
  // rekent nieuw werk weer met zijn eigen berekende bedrag. Een ingevuld aantal en een eigen prijs
  // gaan om dezelfde reden mee: "1 post à € 450" zou anders bij de volgende boeking terugkomen.
  for (const c of voorstel.codes) {
    for (const g of c.groepen) {
      if (g.gefactureerd) continue
      if (!opFactuur.has(`${c.bewakingscode}|${g.groepSleutel}`)) continue
      if (!g.los && g.bedragOverride == null && g.stukprijsOverride == null && !g.eigenAantal) continue
      await supabase
        .from('factuur_regelgroepen')
        .update({
          // `gefactureerd_op` hoort bij een losse regel: die is er klaar mee. Een afgeleide regel
          // blijft bestaan zolang er boekingen in vallen; die raakt alleen zijn vaste bedrag kwijt.
          ...(g.los
            ? { bouw7_invoice_id: String(invoiceId), gefactureerd_op: new Date().toISOString() }
            : { bedrag_excl_btw: null, stukprijs: null, aantal: null }),
          updated_at: new Date().toISOString(),
        })
        .eq('dossier_id', dossierId)
        .eq('bewakingscode', c.bewakingscode)
        .eq('groep_sleutel', g.groepSleutel)
    }
  }

  for (const { boeking, bewakingscode } of mee) {
    await supabase.from('regie_factuurregels').upsert({
      dossier_id: dossierId,
      bron_type: boeking.bronType,
      bron_bouw7_id: boeking.bronBouw7Id,
      omschrijving: boeking.omschrijving,
      aantal: boeking.aantal,
      eenheid: boeking.eenheid,
      inkoop_bedrag: boeking.inkoopBedrag,
      opslag_pct: boeking.opslagPct,
      verkoop_tarief: boeking.verkoopTarief,
      verkoop_bedrag: gefactureerdBedrag.get(boeking.sleutel) ?? boeking.verkoopBedrag,
      bewakingscode,
      groep_sleutel: boeking.handmatigToegewezen ? boeking.groepSleutel : null,
      status: 'gefactureerd',
      bouw7_invoice_id: String(invoiceId),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
  }
}
