'use server'

/**
 * De opname: starten, regels toevoegen, foto's maken, afronden.
 *
 * Belangrijkste ontwerpkeuze: **de opname zelf is het concept.** Elke regel wordt weggeschreven
 * zodra de opnemer hem toevoegt. Er is dus geen aparte conceptopslag zoals bij de Formulieren-module
 * (localStorage + formulier_concepten). Een mutatiewoning doorlopen duurt een uur; alles pas bij
 * "afronden" versturen is daar de verkeerde afweging — en het maakt het nasturen na een wegvallende
 * verbinding onmogelijk.
 *
 * Autorisatie via `vereisSessie()` plus een expliciete guard per opname: `opname` is bewust geen
 * nieuwe rechten-key, want die zou iedereen buitensluiten die hem nog niet toegewezen kreeg (zie de
 * JSDoc van `vereisSessie`). Wie een opname mag openen staat in `magOpnameOpenen()`.
 *
 * De regel-id komt van de CLIENT. Dat is geen slordigheid maar de kern van twee dingen: het
 * nasturen vanuit de offline-wachtrij is daardoor een `upsert on conflict (id)` in plaats van een
 * insert die kan dubbelen, en de import naar de calculatie hergebruikt hetzelfde id als
 * `Calculatieregel.id` zodat twee keer importeren niets verdubbelt.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  Opname,
  OpnameFoto,
  OpnameFotoSoort,
  OpnameMetRegels,
  OpnameRegel,
  OpnameSoort,
} from '@everts/database/opname-types'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar, heeftProjectrol } from '@/lib/dossiers/guards'
import { bevriesNormen, getActievePrijslijst } from './bibliotheek'
import { bepaalRegelPrijs } from './prijs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const BUCKET = 'opname-fotos'
const MAX_FOTO_BYTES = 8 * 1024 * 1024
const TOEGESTANE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

function revalidate(dossierId: string, opnameId?: string) {
  revalidatePath(`/opdrachten/${dossierId}/opname`)
  revalidatePath(`/aanvragen/${dossierId}/opname`)
  if (opnameId) revalidatePath(`/m/opname/${opnameId}`)
  revalidatePath(`/m/dossiers/${dossierId}/opname`)
}

/* ─────────────────────────────── Toegang ─────────────────────────────────── */

/**
 * Mag deze medewerker deze opname openen?
 *
 * Zonder deze controle opent een geraden uuid een vreemde opname — inclusief de prijsafspraken van
 * een andere corporatie. De RLS beschermt hier niet: /m draait op de admin-client omdat
 * `is_platform_gebruiker()` een app-gebruiker overal buiten houdt.
 */
export async function magOpnameOpenen(
  opnameId: string,
): Promise<{ ok: true; opname: Opname } | { ok: false }> {
  const medewerker = await vereisSessie()
  const { data } = await db().from('opnames').select('*').eq('id', opnameId).maybeSingle()
  if (!data) return { ok: false }

  const opname = data as Opname
  const eigen = opname.opnemer_id === medewerker.id
  const betrokken = eigen || (await heeftProjectrol(opname.dossier_id, medewerker.id))
  const platform = medewerker.gebruiker_type === 'platform_gebruiker'
  return betrokken || platform ? { ok: true, opname } : { ok: false }
}

/* ─────────────────────────────── Starten ─────────────────────────────────── */

/**
 * Start een opname op een dossier.
 *
 * De prijslijst volgt uit de opdrachtgever van het dossier (`dossiers.klant_id`), maar is niet
 * verplicht. Is er geen actieve lijst, dan bestaat de opname uit LOSSE PUNTEN — omschrijving,
 * locatie, hoeveelheid, foto — die op kantoor in de calculatie worden afgeprijsd. Een opname
 * weigeren omdat er geen lijst is, is precies het verkeerde moment: de opnemer staat dan al voor
 * de deur.
 */
export async function startOpname(
  dossierId: string,
  opties: { prijslijstId?: string; taskId?: string; soort?: OpnameSoort } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  await assertDossierBewerkbaar(dossierId)
  const supabase = db()

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('id, klant_id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier) return { ok: false, error: 'Dossier niet gevonden' }

  // Een prijslijst is een gemak, geen voorwaarde. Is er geen actieve lijst voor deze
  // opdrachtgever, dan start de opname gewoon en bestaat hij uit losse punten die op kantoor
  // worden afgeprijsd. Eerder blokkeerde dit de hele opname, en dat is precies het moment waarop
  // de opnemer al voor de deur staat.
  let prijslijstId = opties.prijslijstId ?? null
  if (!prijslijstId && dossier.klant_id) {
    const lijst = await getActievePrijslijst(dossier.klant_id)
    prijslijstId = lijst?.id ?? null
  }

  const adres = [
    [dossier.werkadres_straat, dossier.werkadres_huisnummer].filter(Boolean).join(' '),
    [dossier.werkadres_postcode, dossier.werkadres_stad].filter(Boolean).join('  '),
  ]
    .filter(Boolean)
    .join(', ')

  const { data, error } = await supabase
    .from('opnames')
    .insert({
      dossier_id: dossierId,
      prijslijst_id: prijslijstId,
      relatie_id: dossier.klant_id,
      task_id: opties.taskId ?? null,
      opnemer_id: medewerker.id,
      adres_vrij: adres || null,
      soort: opties.soort ?? 'mutatie',
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: `Opname starten mislukt: ${error.message}` }

  revalidate(dossierId, data.id)
  return { ok: true, id: data.id }
}

/**
 * Start (of hervat) de opname die bij deze actie hoort.
 *
 * Idempotent: staat er al een concept-opname op deze taak, dan krijg je die terug. Zo levert een
 * dubbele tik op "Opname starten" — of een herstart na verloren verbinding — nooit twee halve
 * opnames op. Zelfde patroon als `startInspectieVoorTaak`.
 */
export async function startOpnameVoorTaak(
  taskId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()

  const { data: bestaand } = await supabase
    .from('opnames')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'concept')
    .maybeSingle()
  if (bestaand) return { ok: true, id: bestaand.id }

  // Het dossier hangt óf direct aan de taak, óf aan de actielijst waar de taak in zit — sjabloontaken
  // hebben zelf geen dossier_id, alleen hun lijst.
  const { data: taak } = await supabase
    .from('tasks')
    .select('id, dossier_id, opname_ronde, task_lists(dossier_id)')
    .eq('id', taskId)
    .maybeSingle()
  if (!taak) return { ok: false, error: 'Actie niet gevonden' }
  if (!taak.opname_ronde) return { ok: false, error: 'Deze actie is geen opname' }

  const dossierId: string | null = taak.dossier_id ?? taak.task_lists?.dossier_id ?? null
  if (!dossierId) return { ok: false, error: 'Deze actie hangt niet aan een dossier' }

  return startOpname(dossierId, { taskId })
}

/* ─────────────────────────────── Lezen ───────────────────────────────────── */

export async function getOpnamesVoorDossier(dossierId: string): Promise<Opname[]> {
  await vereisSessie()
  const { data, error } = await db()
    .from('opnames')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Opnames ophalen mislukt: ${error.message}`)
  return (data ?? []) as Opname[]
}

/**
 * Eén opname met al zijn regels en foto's.
 *
 * Begrensd door `opname_id`, dus geen paginering nodig: een opname met meer dan 1000 regels bestaat
 * in de praktijk niet en zou een ander probleem zijn.
 */
export async function getOpnameMetRegels(opnameId: string): Promise<OpnameMetRegels | null> {
  const toegang = await magOpnameOpenen(opnameId)
  if (!toegang.ok) return null
  const supabase = db()

  const [{ data: regels, error: regelFout }, { data: fotos, error: fotoFout }] = await Promise.all([
    supabase.from('opname_regels').select('*').eq('opname_id', opnameId).order('volgorde'),
    supabase.from('opname_fotos').select('*').eq('opname_id', opnameId).order('volgorde'),
  ])
  if (regelFout) throw new Error(`Opnameregels ophalen mislukt: ${regelFout.message}`)
  if (fotoFout) throw new Error(`Opnamefoto's ophalen mislukt: ${fotoFout.message}`)

  return {
    ...toegang.opname,
    regels: (regels ?? []) as OpnameRegel[],
    fotos: (fotos ?? []) as OpnameFoto[],
  }
}

/* ─────────────────────────── Regels bewerken ─────────────────────────────── */

/** Wat de client meestuurt; alle prijsvelden worden hier op de server bepaald, niet daar. */
export type RegelInvoer = {
  /** Client-gegenereerd, ook bij een nieuwe regel. Zie de kop van dit bestand. */
  id: string
  opname_id: string
  onderdeel_id: string | null
  /** Los punt (geen bibliotheek-onderdeel) vult dit zelf in; dan is het het enige verplichte veld. */
  omschrijving?: string
  eenheid?: string
  /** De locatie; vrije tekst, mag leeg blijven. */
  ruimte: string | null
  ruimte_id: string | null
  /** Leeg of 0 telt als 1 — de opnemer hoeft niet te rekenen. */
  aantal?: number | null
  toelichting_opnemer: string | null
  volgorde?: number
}

/**
 * Voegt een regel toe of werkt hem bij, inclusief het bevriezen van de prijsafspraak.
 *
 * Upsert op de client-id: tweemaal versturen van dezelfde mutatie — wat na een wegvallende
 * verbinding regelmatig gebeurt — levert één regel op.
 */
export async function slaRegelOp(
  invoer: RegelInvoer,
): Promise<{ ok: true; regel: OpnameRegel } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const toegang = await magOpnameOpenen(invoer.opname_id)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }
  if (toegang.opname.status !== 'concept') {
    return { ok: false, error: 'Deze opname is afgerond en niet meer te wijzigen' }
  }
  await assertDossierBewerkbaar(toegang.opname.dossier_id)

  // Alleen de omschrijving is verplicht bij een los punt. Een hoeveelheid die de opnemer niet
  // invult telt als 1 — hij staat voor een deur en hoeft niet te rekenen. Negatief weigeren we
  // wel: dat is bij een opname altijd een typefout.
  if (invoer.aantal != null && invoer.aantal < 0) {
    return { ok: false, error: 'Een aantal kan niet negatief zijn' }
  }
  const aantal = invoer.aantal && invoer.aantal > 0 ? invoer.aantal : 1

  const rij: Record<string, unknown> = {
    id: invoer.id,
    opname_id: invoer.opname_id,
    onderdeel_id: invoer.onderdeel_id,
    ruimte: invoer.ruimte?.trim() || null,
    ruimte_id: invoer.ruimte_id,
    aantal,
    toelichting_opnemer: invoer.toelichting_opnemer,
    volgorde: invoer.volgorde ?? 0,
    client_bijgewerkt_op: new Date().toISOString(),
    created_by: medewerker.id,
  }

  if (invoer.onderdeel_id) {
    const { data: onderdeel } = await supabase
      .from('opname_onderdelen')
      .select('*')
      .eq('id', invoer.onderdeel_id)
      .maybeSingle()
    if (!onderdeel) return { ok: false, error: 'Onderdeel niet gevonden' }

    // De opname hoeft geen prijslijst te hebben; een onderdeel hangt er altijd wél aan, dus
    // pakken we die van het onderdeel als de opname zelf er geen draagt.
    const prijslijstId = toegang.opname.prijslijst_id ?? onderdeel.prijslijst_id
    const { data: prijslijst } = prijslijstId
      ? await supabase
          .from('opname_prijslijsten')
          .select('standaard_opslag_pct, uurtarief_kostprijs, btw_tarief_id')
          .eq('id', prijslijstId)
          .maybeSingle()
      : { data: null }

    const normen = onderdeel.paint_item_id ? await bevriesNormen(onderdeel.paint_item_id) : []
    const prijs = bepaalRegelPrijs(onderdeel, normen, {
      standaard_opslag_pct: Number(prijslijst?.standaard_opslag_pct) || 0,
      uurtarief_kostprijs: prijslijst?.uurtarief_kostprijs ?? null,
    })

    Object.assign(rij, {
      onderdeel_code: onderdeel.code,
      omschrijving: invoer.omschrijving?.trim() || onderdeel.omschrijving,
      eenheid: onderdeel.eenheid,
      kostengroep: onderdeel.kostengroep,
      btw_tarief_id: onderdeel.btw_tarief_id ?? prijslijst?.btw_tarief_id ?? null,
      btw_pct: onderdeel.btw_pct,
      ...prijs,
    })
  } else {
    // LOS PUNT: de opnemer beschrijft iets waar geen onderdeel voor bestaat — of er is helemaal
    // geen prijslijst. Alleen de omschrijving is verplicht; locatie, hoeveelheid en foto mogen
    // ontbreken. Het afprijzen gebeurt op kantoor in de calculatie.
    if (!invoer.omschrijving?.trim()) {
      return { ok: false, error: 'Vul een omschrijving in' }
    }
    Object.assign(rij, {
      omschrijving: invoer.omschrijving.trim(),
      eenheid: invoer.eenheid?.trim() || 'st',
      prijs_soort: 'vast',
      // NULL en niet 0: 0 leest als "gratis", NULL als "nog te prijzen". De generated totalen
      // rekenen met coalesce, dus de som blijft kloppen.
      verkoop_pe: null,
      kostprijs_pe: null,
      uren_pe: null,
      opslag_pct: null,
      onderdeel_code: null,
      kostengroep: null,
      normen: [],
    })
  }

  const { data, error } = await supabase
    .from('opname_regels')
    .upsert(rij, { onConflict: 'id' })
    .select()
    .single()
  if (error) return { ok: false, error: `Regel opslaan mislukt: ${error.message}` }

  revalidate(toegang.opname.dossier_id, invoer.opname_id)
  return { ok: true, regel: data as OpnameRegel }
}

export async function verwijderRegel(
  regelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()

  const { data: regel } = await supabase
    .from('opname_regels')
    .select('opname_id')
    .eq('id', regelId)
    .maybeSingle()
  // Al weg (bijvoorbeeld doordat de wachtrij deze mutatie eerder al afleverde): dat is een succes,
  // geen fout. Anders blijft een mislukte mutatie eeuwig in de wachtrij hangen.
  if (!regel) return { ok: true }

  const toegang = await magOpnameOpenen(regel.opname_id)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }
  if (toegang.opname.status !== 'concept') {
    return { ok: false, error: 'Deze opname is afgerond en niet meer te wijzigen' }
  }

  const { error } = await supabase.from('opname_regels').delete().eq('id', regelId)
  if (error) return { ok: false, error: `Regel verwijderen mislukt: ${error.message}` }

  revalidate(toegang.opname.dossier_id, regel.opname_id)
  return { ok: true }
}

/* ─────────────────────────────── Foto's ──────────────────────────────────── */

/**
 * Uploadt één foto en koppelt hem aan de opname, en optioneel aan een regel.
 *
 * De client verkleint met `verkleinFoto()` vóór het versturen; de grens hier is een vangnet tegen
 * een pad dat dat overslaat.
 *
 * `fotoId` komt van de CLIENT en bepaalt zowel de rij als het opslagpad. Dat maakt de hele operatie
 * herhaalbaar: een upload waarvan het antwoord onderweg verdween — precies wat er gebeurt bij
 * wegvallend bereik — levert bij de tweede poging dezelfde rij en hetzelfde bestand op, geen
 * dubbele foto. Een uuid maakt het pad meteen onraadbaar; een tijdstempel zou dat niet doen én
 * botsen bij twee foto's in dezelfde milliseconde.
 */
export async function uploadOpnameFoto(
  opnameId: string,
  regelId: string | null,
  formData: FormData,
  soort: OpnameFotoSoort = 'detail',
  fotoId?: string,
): Promise<{ ok: true; foto: OpnameFoto } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const toegang = await magOpnameOpenen(opnameId)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }

  const file = formData.get('foto')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Geen bestand ontvangen' }
  if (file.size > MAX_FOTO_BYTES) return { ok: false, error: 'Foto is te groot (max 8 MB)' }
  if (file.type && !TOEGESTANE_TYPES.includes(file.type)) {
    return { ok: false, error: 'Alleen afbeeldingen zijn toegestaan' }
  }

  const id = fotoId ?? crypto.randomUUID()
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const pad = `${opnameId}/${regelId ?? 'algemeen'}/${id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadFout } = await supabase.storage
    .from(BUCKET)
    // upsert: een herhaalde poging schrijft hetzelfde bestand op hetzelfde pad in plaats van te
    // struikelen over "bestaat al".
    .upload(pad, buffer, { contentType: file.type || 'image/jpeg', upsert: true })
  if (uploadFout) return { ok: false, error: uploadFout.message }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(pad)

  // Eerste foto op een regel is meteen de hoofdfoto: dat is degene die straks meegaat naar de
  // calculatie en de offerte. De opnemer kan hem later omzetten. Deze foto telt niet mee, anders
  // zou een herhaalde poging zichzelf de hoofdfoto-status ontnemen.
  let hoofdfoto = false
  if (regelId) {
    const { count } = await supabase
      .from('opname_fotos')
      .select('id', { count: 'exact', head: true })
      .eq('regel_id', regelId)
      .neq('id', id)
    hoofdfoto = (count ?? 0) === 0
  }

  const { data, error } = await supabase
    .from('opname_fotos')
    .upsert(
      {
        id,
        opname_id: opnameId,
        regel_id: regelId,
        pad,
        url: urlData.publicUrl,
        soort,
        is_hoofdfoto: hoofdfoto,
        created_by: medewerker.id,
      },
      { onConflict: 'id' },
    )
    .select()
    .single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, foto: data as OpnameFoto }
}

export async function verwijderOpnameFoto(
  fotoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()

  const { data: foto } = await supabase
    .from('opname_fotos')
    .select('id, pad, opname_id, regel_id, is_hoofdfoto')
    .eq('id', fotoId)
    .maybeSingle()
  if (!foto) return { ok: true }

  const toegang = await magOpnameOpenen(foto.opname_id)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }

  const { error } = await supabase.from('opname_fotos').delete().eq('id', fotoId)
  if (error) return { ok: false, error: error.message }
  // Het storage-object opruimen mag falen zonder de gebruiker te storen: de rij is weg, de foto is
  // uit beeld. Een wees in de bucket is hinderlijk, geen fout.
  try {
    await supabase.storage.from(BUCKET).remove([foto.pad])
  } catch {
    /* bewust genegeerd */
  }

  // Was dit de hoofdfoto, dan promoveert de eerstvolgende. Anders verliest de regel stil zijn foto
  // in de offerte.
  if (foto.is_hoofdfoto && foto.regel_id) {
    const { data: volgende } = await supabase
      .from('opname_fotos')
      .select('id')
      .eq('regel_id', foto.regel_id)
      .order('volgorde')
      .limit(1)
      .maybeSingle()
    if (volgende) {
      await supabase.from('opname_fotos').update({ is_hoofdfoto: true }).eq('id', volgende.id)
    }
  }
  return { ok: true }
}

export async function zetHoofdfoto(
  fotoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: foto } = await supabase
    .from('opname_fotos')
    .select('id, opname_id, regel_id')
    .eq('id', fotoId)
    .maybeSingle()
  if (!foto?.regel_id) return { ok: false, error: 'Alleen een regelfoto kan hoofdfoto zijn' }

  const toegang = await magOpnameOpenen(foto.opname_id)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }

  await supabase.from('opname_fotos').update({ is_hoofdfoto: false }).eq('regel_id', foto.regel_id)
  const { error } = await supabase.from('opname_fotos').update({ is_hoofdfoto: true }).eq('id', fotoId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ─────────────────────────────── Afronden ────────────────────────────────── */

export type AfrondControle = {
  gereed: boolean
  ontbreekt: { regelId: string; omschrijving: string; reden: string }[]
}

/**
 * Controleert de verplichtingen uit de bibliotheek (`foto_verplicht`, `toelichting_verplicht`).
 *
 * Die blokkeren bewust het AFRONDEN en niet het toevoegen: een opnemer die in een donkere meterkast
 * staat moet de regel kwijt kunnen en de foto twee minuten later maken.
 */
export async function controleerAfronden(opnameId: string): Promise<AfrondControle> {
  await vereisSessie()
  const supabase = db()

  const { data: regels } = await supabase
    .from('opname_regels')
    .select('id, omschrijving, onderdeel_id, toelichting_opnemer')
    .eq('opname_id', opnameId)
    .order('volgorde')

  const alleRegels = (regels ?? []) as {
    id: string
    omschrijving: string
    onderdeel_id: string | null
    toelichting_opnemer: string | null
  }[]
  if (alleRegels.length === 0) {
    return { gereed: false, ontbreekt: [{ regelId: '', omschrijving: '—', reden: 'De opname is nog leeg' }] }
  }

  const onderdeelIds = Array.from(
    new Set(alleRegels.map(r => r.onderdeel_id).filter((v): v is string => !!v)),
  )
  const [{ data: onderdelen }, { data: fotos }] = await Promise.all([
    onderdeelIds.length
      ? supabase
          .from('opname_onderdelen')
          .select('id, foto_verplicht, toelichting_verplicht')
          .in('id', onderdeelIds)
      : Promise.resolve({ data: [] }),
    supabase.from('opname_fotos').select('regel_id').eq('opname_id', opnameId).not('regel_id', 'is', null),
  ])

  const eisen = new Map(
    ((onderdelen ?? []) as { id: string; foto_verplicht: boolean; toelichting_verplicht: boolean }[])
      .map(o => [o.id, o]),
  )
  const metFoto = new Set(((fotos ?? []) as { regel_id: string }[]).map(f => f.regel_id))

  const ontbreekt: AfrondControle['ontbreekt'] = []
  for (const regel of alleRegels) {
    const eis = regel.onderdeel_id ? eisen.get(regel.onderdeel_id) : undefined
    if (eis?.foto_verplicht && !metFoto.has(regel.id)) {
      ontbreekt.push({ regelId: regel.id, omschrijving: regel.omschrijving, reden: 'Foto verplicht' })
    }
    if (eis?.toelichting_verplicht && !regel.toelichting_opnemer?.trim()) {
      ontbreekt.push({ regelId: regel.id, omschrijving: regel.omschrijving, reden: 'Toelichting verplicht' })
    }
  }
  return { gereed: ontbreekt.length === 0, ontbreekt }
}

export async function rondOpnameAf(
  opnameId: string,
): Promise<{ ok: true } | { ok: false; error: string; ontbreekt?: AfrondControle['ontbreekt'] }> {
  const medewerker = await vereisSessie()
  const toegang = await magOpnameOpenen(opnameId)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }
  if (toegang.opname.status !== 'concept') return { ok: true }

  const controle = await controleerAfronden(opnameId)
  if (!controle.gereed) {
    return { ok: false, error: 'De opname is nog niet compleet', ontbreekt: controle.ontbreekt }
  }

  const supabase = db()
  const { error } = await supabase
    .from('opnames')
    .update({ status: 'gereed', gereed_op: new Date().toISOString(), gereed_door: medewerker.id })
    .eq('id', opnameId)
  if (error) return { ok: false, error: `Afronden mislukt: ${error.message}` }

  // Kwam de opname uit een actie, dan gaat die actie mee op gereed. Zelfde koppeling als bij een
  // kwaliteitsronde; de import-actie voor de losse aanroep zit in taken/actions.
  if (toegang.opname.task_id) {
    const { updateTaakStatus } = await import('@/app/(platform)/taken/actions/taken')
    await updateTaakStatus(toegang.opname.task_id, 'gereed').catch(() => {})
  }

  revalidate(toegang.opname.dossier_id, opnameId)
  return { ok: true }
}

/** Terug naar concept, bijvoorbeeld omdat de opnemer iets vergat. */
export async function heropenOpname(
  opnameId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const toegang = await magOpnameOpenen(opnameId)
  if (!toegang.ok) return { ok: false, error: 'Geen toegang tot deze opname' }
  await assertDossierBewerkbaar(toegang.opname.dossier_id)

  const { error } = await db()
    .from('opnames')
    .update({ status: 'concept', gereed_op: null, gereed_door: null })
    .eq('id', opnameId)
  if (error) return { ok: false, error: `Heropenen mislukt: ${error.message}` }

  revalidate(toegang.opname.dossier_id, opnameId)
  return { ok: true }
}
