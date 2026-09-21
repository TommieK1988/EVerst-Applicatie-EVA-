import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * mailintake/contactpersoon-bouw7.ts
 *
 * Zorgt dat de contactpersoon van een intake in Bouw7 bestaat vóór het project
 * wordt aangemaakt.
 *
 * WAAROM
 * Een contactpersoon die alleen in EVA staat leverde de melding op "staat nog niet
 * in Bouw7; het project krijgt geen contactpersoon" -- en daarmee een Bouw7-project
 * waar niemand aan hangt. Dat is precies de stille fout waar `bouw7-gereed.ts` voor
 * bestaat, alleen dan een die je niet hoeft te accepteren: we weten wie het is, we
 * weten onder welk contact hij hoort, en Bouw7 kan hem gewoon aanmaken.
 *
 * Contactpersonen komen bij een intake uit twee bronnen. Uit de Bouw7-sync -- dan
 * hebben ze al een spiegel -- of uit EVA zelf, bijvoorbeeld iemand die pas in een
 * mail opduikt. Die tweede groep bleef tot nu toe hangen.
 *
 * WAT HIER NIET GEBEURT
 * Een *relatie* aanmaken. Dat blijft mensenwerk: een door een model geraden
 * klantnaam zou een permanente Bouw7-relatie worden. Zonder Bouw7-id op de
 * opdrachtgever gebeurt hier dus niets en blijft de blokkade staan.
 */

export type ZorgResultaat =
  | { ok: true; bouw7Id: string; aangemaakt: boolean }
  | { ok: false; reden: string }

/**
 * Levert het Bouw7-contactpersoon-id voor deze persoon bij deze opdrachtgever, en
 * maakt hem daar aan als hij er nog niet staat.
 *
 * Gooit niet. Lukt het aanmaken niet, dan komt dat als reden terug en gaat het
 * project gewoon door zonder contactpersoon -- een project zonder contactpersoon is
 * bruikbaar, een verloren aanvraag niet.
 */
export async function zorgVoorBouw7Contactpersoon(
  contactpersoonId: string,
  relatieId: string,
): Promise<ZorgResultaat> {
  const supabase = createAdminClient()

  // Bestaat de spiegel voor déze opdrachtgever al? Dezelfde mens staat bij een
  // ander bedrijf onder een ander Bouw7-id, dus de vraag is altijd "bij wie".
  const { bouw7CpIdVoorOrganisatie, legSpiegelVast } =
    await import('@/lib/bouw7/contactpersoon-spiegel')

  const bestaand = await bouw7CpIdVoorOrganisatie(contactpersoonId, relatieId)
  if (bestaand) return { ok: true, bouw7Id: String(bestaand), aangemaakt: false }

  // Functie, en vaak ook e-mail en telefoon, hangen aan de koppelrij en niet aan de
  // persoon: dezelfde mens heeft bij twee opdrachtgevers twee werkadressen. Bouw7
  // krijgt daarom de gegevens zoals ze bij déze opdrachtgever gelden, met de
  // persoonsrij als terugval.
  const [{ data: cp }, { data: koppel }, { data: relatie }] = await Promise.all([
    supabase.from('contactpersonen')
      .select('voornaam, tussenvoegsel, achternaam, aanhef, email, telefoon, mobiel')
      .eq('id', contactpersoonId).maybeSingle(),
    supabase.from('contactpersoon_organisaties')
      .select('functie, email, telefoon, mobiel')
      .eq('contactpersoon_id', contactpersoonId)
      .eq('organisatie_id', relatieId).maybeSingle(),
    supabase.from('relaties').select('naam, bouw7_id').eq('id', relatieId).maybeSingle(),
  ])

  if (!cp) return { ok: false, reden: 'De contactpersoon bestaat niet meer in EVA.' }
  if (!relatie?.bouw7_id) {
    return { ok: false, reden: `${relatie?.naam ?? 'De opdrachtgever'} staat zelf nog niet in Bouw7.` }
  }

  const { maakBouw7Contactpersoon } = await import('@/lib/bouw7/create-contact')
  const nieuwId = await maakBouw7Contactpersoon(Number(relatie.bouw7_id), {
    voornaam: cp.voornaam ?? '',
    // Het tussenvoegsel hoort bij de achternaam: Bouw7 kent er geen apart veld voor,
    // en zonder dit wordt "Frits de Zwart" daar "Frits Zwart".
    achternaam: [cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' '),
    aanhef: cp.aanhef,
    email: koppel?.email ?? cp.email,
    telefoon: koppel?.telefoon ?? koppel?.mobiel ?? cp.telefoon ?? cp.mobiel,
    functie: koppel?.functie ?? null,
  })

  if (!nieuwId) return { ok: false, reden: 'Bouw7 nam de contactpersoon niet aan.' }

  await legSpiegelVast({
    contactpersoonId,
    bouw7Id: nieuwId,
    bouw7ContactId: relatie.bouw7_id,
    organisatieId: relatieId,
  })

  return { ok: true, bouw7Id: String(nieuwId), aangemaakt: true }
}
