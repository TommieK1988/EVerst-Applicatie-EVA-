'use server'

// De kosten bij de weekstaat: parkeren, reiskosten en overig, met het bonnetje erbij.
//
// Los van ./weekstaat omdat het een eigen onderwerp is met een eigen bewijsstuk en een eigen
// bucket; de weekstaat gaat over uren. De autorisatie is dezelfde en komt uit ./week-guard:
// eigenWeek() controleert bij elke actie dat de week van de ingelogde medewerker zelf is.
//
// Deze bedragen gaan bewust NIET naar Bouw7: de hour-log daar kent geen geldbedragen, en het
// als projectkosten boeken zou de inkoopstroom raken.
//
// Elke kostenpost hoort bij een project (of bewust bij geen): de projectleider van dat dossier
// keurt hem goed. Dat beoordelen staat in ./onkosten-goedkeuring-acties; een beoordeelde post
// ligt vast en kan de medewerker niet meer weghalen.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { getAppVertaler } from '@/i18n/server'
import { eigenWeek } from './week-guard'
import { vereisWijzigbaar } from './wijzigen-na-indienen'
import { getUrenInstellingen, getIndirecteDossierIds } from './instellingen'
import { getDossierOpties } from './weekstaat'
import {
  berekenKmBedrag, bonVerplicht, onkostenBezwaar, isOnkostenSoort, isVervoermiddel,
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
  // Foutteksten in de taal van de app: deze actie draait alleen vanuit EVA Mobiel.
  const t = await getAppVertaler('uren')
  const datum = String(formData.get('datum') ?? '')
  // Alleen het venster van de week telt: een kostenpost heeft zijn eigen goedkeuring, dus een
  // al goedgekeurde uurregel op dezelfde dag houdt een nieuwe kostenpost niet tegen.
  const geweigerd = await vereisWijzigbaar(week)
  if (geweigerd) return { ok: false, error: t(`fout.${geweigerd}`) }

  const soortRuw = formData.get('soort')
  const vervoerRuw = formData.get('vervoermiddel')
  const omschrijving = String(formData.get('omschrijving') ?? '').trim()
  // 'geen' is een bewuste keuze voor geen project; leeg is nog niets gekozen.
  const project = String(formData.get('project') ?? '').trim()
  const bon = formData.get('bon')
  const bestand = bon instanceof File && bon.size > 0 ? bon : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { ok: false, error: t('fout.ongeldigeDatum') }
  if (!isOnkostenSoort(soortRuw)) return { ok: false, error: t('fout.kiesSoort') }
  const soort = soortRuw
  const vervoermiddel: Vervoermiddel | null = isVervoermiddel(vervoerRuw) ? vervoerRuw : null

  // De kolom is numeric(6,1); zonder deze afronding zou 24,56 km als 24,6 opgeslagen worden
  // terwijl het bedrag op 24,56 gerekend was — dan klopt de regel niet meer met zichzelf.
  const ruweKm = getal(formData.get('km'))
  const km = ruweKm == null ? null : Math.round(ruweKm * 10) / 10
  const ingevuldBedrag = getal(formData.get('bedrag'))

  const bezwaar = onkostenBezwaar({
    projectGekozen: project !== '', soort, vervoermiddel, km, bedrag: ingevuldBedrag, heeftBon: Boolean(bestand),
  })
  if (bezwaar) return { ok: false, error: t(`onkosten.bezwaar.${bezwaar}`) }

  const dossierId = project === 'geen' ? null : project
  if (dossierId && !(await magKostenOpProject(weekId, datum, dossierId))) {
    return { ok: false, error: t('fout.ongeldigKostenProject') }
  }

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
    if (uploadFout) return { ok: false, error: t('fout.fotoOpslaan', { fout: uploadFout.message }) }
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
    dossier_id: dossierId,
  })
  if (error) {
    // Rij mislukt maar foto al geüpload: opruimen, anders blijft er een wees in de bucket.
    if (bonPad) await supabase.storage.from(ONKOSTEN_BUCKET).remove([bonPad])
    return { ok: false, error: error.message }
  }

  revalidatePath('/m/uren')
  return { ok: true }
}

/**
 * Mag deze kostenpost op dit project? Alleen op een project dat de sheet ook aanbood: waar de
 * medewerker rond die dag staat ingepland (`getDossierOpties`), of waar hij die dag uren op
 * schreef. Het project wijst de goedkeurder aan; een vrij in te vullen id zou de kosten bij een
 * willekeurige projectleider kunnen leggen. Indirecte-urenprojecten zijn geen project -- daar
 * hoort "geen project" bij.
 */
async function magKostenOpProject(weekId: string, datum: string, dossierId: string): Promise<boolean> {
  const [opties, indirect, { data: regels }] = await Promise.all([
    getDossierOpties(datum),
    getIndirecteDossierIds(),
    // Eén dag van één week: een handvol regels.
    createAdminClient().from('uren_regels').select('dossier_id').eq('week_id', weekId).eq('datum', datum),
  ])
  if (indirect.has(dossierId)) return false
  return opties.some(o => o.id === dossierId && !o.indirect)
    || (regels ?? []).some(r => r.dossier_id === dossierId)
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
  const t = await getAppVertaler('uren')
  const supabase = createAdminClient()
  const { data: rij } = await supabase
    .from('uren_onkosten')
    .select('id, medewerker_id, week_id, datum, bon_pad, goedkeuring_status')
    .eq('id', onkostenId)
    .maybeSingle()
  if (!rij) return { ok: false, error: t('fout.regelNietGevonden') }
  if (rij.medewerker_id !== medewerker.id) return { ok: false, error: t('fout.nietJouwRegel') }
  // Beoordeeld is vast, ook een afgekeurde post: anders verdwijnt met de bon ook de reden.
  if (rij.goedkeuring_status !== 'open') return { ok: false, error: t('fout.kostenAlBeoordeeld') }

  // De weekstatus apart opvragen en niet als join: een join dwingt hier een any-cast af, en
  // een tweede eenvoudige query leest net zo goed.
  const { data: week } = await supabase
    .from('uren_weken').select('id, week_start, status, medewerker_id, goedkeuring_modus').eq('id', rij.week_id).maybeSingle()
  if (!week) return { ok: false, error: t('fout.weekAlIngediend') }
  const geweigerd = await vereisWijzigbaar(week)
  if (geweigerd) return { ok: false, error: t(`fout.${geweigerd}`) }

  // Alleen zolang hij open is: tussen het ophalen en nu kan de projectleider hem beoordeeld hebben.
  const { data: weg, error } = await supabase
    .from('uren_onkosten').delete().eq('id', onkostenId).eq('goedkeuring_status', 'open').select('id')
  if (error) return { ok: false, error: error.message }
  if (!weg?.length) return { ok: false, error: t('fout.kostenAlBeoordeeld') }
  // Pas ná de rij: blijft het bestand staan terwijl de rij weg is, dan is dat een wees die
  // niemand meer kan vinden. Andersom zou de kostenpost naar een verdwenen bon wijzen.
  if (rij.bon_pad) await supabase.storage.from(ONKOSTEN_BUCKET).remove([rij.bon_pad])
  revalidatePath('/m/uren')
  return { ok: true }
}
