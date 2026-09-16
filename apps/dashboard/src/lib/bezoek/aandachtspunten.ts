import 'server-only'

/**
 * Het aandachtspunt achter een bezoekpunt.
 *
 * Een punt in een projectbezoek is standaard alleen een waarneming: het staat in het bezoek en
 * in het rapport, en verder nergens. Zet de projectleider het vinkje "aandachtspunt" aan, dan
 * komt er een afgeleide rij bij in `oplever_punten` — hét meldingenregister van het dossier,
 * met de statusmachine, de toewijzing, de reactiethread en de zichtbaarheid in het
 * klantportaal die daar al aan hangen.
 *
 * Staat apart van `bezoeken.ts` omdat dit de enige plek is waar het bezoek over de grens van
 * zijn eigen tabellen heen schrijft. Alles wat met die grens te maken heeft — spiegelen,
 * terugdraaien, en bepalen of iemand anders het punt al heeft opgepakt — staat hier bij elkaar.
 *
 * Géén `'use server'`: dit zijn interne helpers, geen server-actions. De aanroeper doet de
 * autorisatie.
 */

/**
 * Maakt van een bezoekpunt een aandachtspunt op het dossier.
 *
 * Spiegelt `materialiseerAandachtspunten()` uit `lib/dossiers/oplevering.ts`: dezelfde tabel,
 * dezelfde statusmachine, dezelfde opvolging. Verschil is de status — `'open'` en niet
 * `'nieuw'`, want een projectleider die dit ter plekke vastlegt heeft het al beoordeeld;
 * `'nieuw'` is de triagestatus voor meldingen van buiten.
 *
 * `ruimte` krijgt de disciplinenaam. De doorloop kent geen ruimteveld meer, en zonder iets
 * in die kolom staat er een naamloos punt in de opleverlijst.
 *
 * De foto's gaan mee als rij in `oplever_fotos` — de URL, niet de bytes. Het bestand blijft
 * in de publieke bucket `bezoek-fotos` staan en `oplever_fotos.url` is een vrije tekstkolom.
 * Kopiëren zou de opslag verdubbelen en twee objecten opleveren die synchroon moeten blijven;
 * helemaal niet spiegelen zou het aandachtspunt op het dossier en in het klantportaal
 * beeldloos maken terwijl de projectleider er net een foto bij nam.
 */
export async function materialiseerAandachtspunt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  puntId: string,
  dossierId: string,
  medewerkerId: string,
): Promise<void> {
  const { data: punt } = await supabase
    .from('projectbezoek_punten')
    .select('id, bezoek_id, discipline_code, tekst, oplever_punt_id')
    .eq('id', puntId).maybeSingle()
  if (!punt || punt.oplever_punt_id) return

  const namen = await disciplineNamen(supabase, [punt.discipline_code])

  // Losse punten (zonder oplevermoment) hebben een eigen nummerreeks per dossier.
  const { data: maxRow } = await supabase
    .from('oplever_punten')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .is('moment_id', null)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: ins, error } = await supabase
    .from('oplever_punten')
    .insert({
      moment_id: null,
      dossier_id: dossierId,
      bezoek_id: punt.bezoek_id,
      volgnummer: (maxRow?.volgnummer ?? 0) + 1,
      omschrijving: punt.tekst,
      ruimte: namen[0] ?? punt.discipline_code,
      status: 'open',
      soort: 'oplever',
      bron: 'bezoek',
      melder_naam: null,
      created_by: medewerkerId,
    })
    .select('id')
    .single()
  if (error || !ins) return

  await supabase.from('projectbezoek_punten')
    .update({ oplever_punt_id: ins.id }).eq('id', puntId)

  // Begrensd op één punt.
  const { data: fotos } = await supabase
    .from('projectbezoek_fotos').select('url').eq('punt_id', puntId)
  const rijen = ((fotos ?? []) as { url: string }[]).map(f => ({
    punt_id: ins.id, url: f.url, soort: 'voor', created_by: medewerkerId,
  }))
  if (rijen.length) await supabase.from('oplever_fotos').insert(rijen)
}

/**
 * Haalt het afgeleide aandachtspunt weer weg.
 *
 * Alleen aanroepen nadat `bepaalOpgepakt` heeft bevestigd dat er niets mee gebeurd is; de
 * aanroepers doen die controle en weigeren anders. De `oplever_fotos`-rijen cascaden mee.
 */
export async function verwijderAfgeleidPunt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  puntId: string,
  opleverPuntId: string,
): Promise<void> {
  await supabase.from('projectbezoek_punten')
    .update({ oplever_punt_id: null }).eq('id', puntId)
  await supabase.from('oplever_punten').delete().eq('id', opleverPuntId)
}

/**
 * Welke van deze dossierpunten zijn al opgepakt en mogen dus niet meer worden ingetrokken?
 *
 * "Opgepakt" = alles behalve een onaangeroerd open punt: een andere status, een toewijzing,
 * een deadline, een meerwerkkoppeling of een reactie in de thread.
 */
export async function bepaalOpgepakt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  // Begrensd op de punten van één bezoek.
  const [{ data: punten }, { data: reacties }] = await Promise.all([
    supabase.from('oplever_punten')
      .select('id, status, toegewezen_medewerker_id, toegewezen_relatie_id, meerwerk_regel_id, deadline')
      .in('id', ids),
    supabase.from('oplever_punt_reacties').select('punt_id').in('punt_id', ids),
  ])

  const metReactie = new Set(
    ((reacties ?? []) as { punt_id: string }[]).map(r => r.punt_id),
  )

  const uit = new Set<string>()
  for (const p of ((punten ?? []) as Record<string, unknown>[])) {
    const id = String(p.id)
    if (
      p.status !== 'open'
      || !!p.toegewezen_medewerker_id
      || !!p.toegewezen_relatie_id
      || !!p.meerwerk_regel_id
      || !!p.deadline
      || metReactie.has(id)
    ) uit.add(id)
  }
  return uit
}

/** Namen bij disciplinecodes; begrensd op de meegegeven codes. */
export async function disciplineNamen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  codes: string[],
): Promise<string[]> {
  if (codes.length === 0) return []
  const { data } = await supabase
    .from('kwaliteit_disciplines').select('code, naam').in('code', codes)
  const perCode = new Map(
    ((data ?? []) as { code: string; naam: string }[]).map(d => [d.code, d.naam]),
  )
  return codes.map(c => perCode.get(c) ?? c)
}

