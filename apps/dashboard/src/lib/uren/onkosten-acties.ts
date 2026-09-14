'use server'

// De kosten bij de weekstaat: parkeren, reiskosten en overig, met het bonnetje erbij.
//
// Los van ./weekstaat omdat het een eigen onderwerp is met een eigen bewijsstuk en een eigen
// bucket; de weekstaat gaat over uren. De autorisatie is dezelfde en komt uit ./week-guard:
// eigenWeek() controleert bij elke actie dat de week van de ingelogde medewerker zelf is.
//
// Deze bedragen gaan bewust NIET naar Bouw7: de hour-log daar kent geen geldbedragen, en het
// als projectkosten boeken zou de inkoopstroom raken.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { eigenWeek, bewerkbaar } from './week-guard'
import { getUrenInstellingen } from './instellingen'
import {
  berekenKmBedrag, bonVerplicht, controleerOnkosten, isOnkostenSoort, isVervoermiddel,
  rekentPerKm, type Vervoermiddel,
} from './onkosten'
import { ONKOSTEN_BUCKET, bonExtensie } from './bonnen'

/**
 * Een kostenpost van één dag vastleggen, met het bonnetje erbij.
 *
 * FormData en geen object, omdat de foto meekomt. Bewust één call en niet eerst een rij en dan
 * een upload: de bon is bij parkeren, OV en overig verplicht, en een halve kostenpost zonder
 * bewijsstuk is precies wat we niet willen.
 *
 * Wat hier gebeurt is de enige controle die telt. De sheet gebruikt dezelfde regels uit
 * `./onkosten` om de knop te blokkeren, maar dat is een hint — een verouderd scherm of een
 * rechtstreekse aanroep mag er niet langs.
 */
export async function voegOnkostenToe(
  weekId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { medewerker, week, supabase } = await eigenWeek(weekId)
  if (!bewerkbaar(week.status)) return { ok: false, error: 'Deze week is al ingediend.' }

  const datum = String(formData.get('datum') ?? '')
  const soortRuw = formData.get('soort')
  const vervoerRuw = formData.get('vervoermiddel')
  const omschrijving = String(formData.get('omschrijving') ?? '').trim()
  const bon = formData.get('bon')
  const bestand = bon instanceof File && bon.size > 0 ? bon : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { ok: false, error: 'Ongeldige datum.' }
  if (!isOnkostenSoort(soortRuw)) return { ok: false, error: 'Kies een soort kosten.' }
  const soort = soortRuw
  const vervoermiddel: Vervoermiddel | null = isVervoermiddel(vervoerRuw) ? vervoerRuw : null

  // De kolom is numeric(6,1); zonder deze afronding zou 24,56 km als 24,6 opgeslagen worden
  // terwijl het bedrag op 24,56 gerekend was — dan klopt de regel niet meer met zichzelf.
  const ruweKm = getal(formData.get('km'))
  const km = ruweKm == null ? null : Math.round(ruweKm * 10) / 10
  const ingevuldBedrag = getal(formData.get('bedrag'))

  const bezwaar = controleerOnkosten({
    soort, vervoermiddel, km, bedrag: ingevuldBedrag, heeftBon: Boolean(bestand),
  })
  if (bezwaar) return { ok: false, error: bezwaar }

  // Het bedrag komt bij auto en bromfiets uit de instellingen, nooit uit de invoer: anders zou
  // een aangepast scherm de afgesproken kilometervergoeding stilzwijgend kunnen omzeilen.
  const inst = await getUrenInstellingen()
  const bedrag = rekentPerKm(vervoermiddel)
    ? berekenKmBedrag(km ?? 0, vervoermiddel, {
        auto: inst.km_vergoeding_auto, bromfiets: inst.km_vergoeding_bromfiets,
      })
    : (ingevuldBedrag ?? 0)

  // Bij auto en bromfiets bewaren we geen bon, ook niet als het scherm er per ongeluk één
  // meestuurt: daar is de kilometerstand het bewijs.
  let bonPad: string | null = null
  if (bestand && bonVerplicht(soort, vervoermiddel)) {
    const pad = `${medewerker.id}/${weekId}/${Date.now()}.${bonExtensie(bestand.name)}`
    const buffer = Buffer.from(await bestand.arrayBuffer())
    const { error: uploadFout } = await supabase.storage
      .from(ONKOSTEN_BUCKET)
      .upload(pad, buffer, { contentType: bestand.type || 'image/jpeg', upsert: false })
    if (uploadFout) return { ok: false, error: `Foto opslaan mislukt: ${uploadFout.message}` }
    bonPad = pad
  }

  const { error } = await supabase.from('uren_onkosten').insert({
    week_id: weekId,
    medewerker_id: medewerker.id,
    datum,
    soort,
    vervoermiddel,
    bedrag,
    km: rekentPerKm(vervoermiddel) ? km : null,
    omschrijving: omschrijving || null,
    bon_pad: bonPad,
    dossier_id: null,
  })
  if (error) {
    // Rij mislukt maar foto al geüpload: opruimen, anders blijft er een wees in de bucket.
    if (bonPad) await supabase.storage.from(ONKOSTEN_BUCKET).remove([bonPad])
    return { ok: false, error: error.message }
  }

  revalidatePath('/m/uren')
  return { ok: true }
}

/** Komma of punt, leeg veld wordt null. Telefoontoetsenborden leveren beide. */
function getal(waarde: FormDataEntryValue | null): number | null {
  const tekst = String(waarde ?? '').trim().replace(',', '.')
  if (!tekst) return null
  const n = Number(tekst)
  return Number.isFinite(n) ? n : null
}

export async function verwijderOnkosten(
  onkostenId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = createAdminClient()
  const { data: rij } = await supabase
    .from('uren_onkosten')
    .select('id, medewerker_id, week_id, bon_pad')
    .eq('id', onkostenId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Regel niet gevonden.' }
  if (rij.medewerker_id !== medewerker.id) return { ok: false, error: 'Dit is niet jouw regel.' }

  // De weekstatus apart opvragen en niet als join: een join dwingt hier een any-cast af, en
  // een tweede eenvoudige query leest net zo goed.
  const { data: week } = await supabase
    .from('uren_weken').select('status').eq('id', rij.week_id).maybeSingle()
  if (!week || !bewerkbaar(week.status)) {
    return { ok: false, error: 'Deze week is al ingediend.' }
  }

  const { error } = await supabase.from('uren_onkosten').delete().eq('id', onkostenId)
  if (error) return { ok: false, error: error.message }
  // Pas ná de rij: blijft het bestand staan terwijl de rij weg is, dan is dat een wees die
  // niemand meer kan vinden. Andersom zou de kostenpost naar een verdwenen bon wijzen.
  if (rij.bon_pad) await supabase.storage.from(ONKOSTEN_BUCKET).remove([rij.bon_pad])
  revalidatePath('/m/uren')
  return { ok: true }
}
