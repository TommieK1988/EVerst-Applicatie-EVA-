'use server'

/**
 * Beheeracties voor het medewerkershandboek.
 *
 * LET OP — in een `'use server'`-module moet ELKE export een async functie zijn.
 * Types en constanten horen in `lib/handboek/`; een synchrone export komt door
 * `tsc` heen en breekt pas bij de Vercel-build.
 *
 * Alles hier draait met de service-role (die bypast RLS), dus elke functie
 * begint met `vereisHandboekMutatie()`. Zonder die gate is elke action een kale
 * RPC die iedere ingelogde gebruiker kan aanroepen.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisHandboekMutatie } from '@/lib/handboek/auth'
import { blokIsLeeg, zoektekstVoor } from '@/lib/handboek/blokken'
import { HANDBOEK_BUCKET } from '@/lib/handboek/bijlagen'
import type { BlokType, SectieSoort } from '@/lib/handboek/types'

const BEHEER_PAD = '/instellingen/handboek'

function db() {
  return createAdminClient()
}

function ververs(sectieId?: string) {
  revalidatePath(BEHEER_PAD)
  if (sectieId) revalidatePath(`${BEHEER_PAD}/${sectieId}`)
}

/** Slug uit een titel: kleine letters, koppeltekens, geen accenten. */
function maakSlug(titel: string): string {
  return titel
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/**
 * Een vrije slug. Situaties krijgen een prefix omdat `slug` uniek is over de
 * hele tabel en er zowel een hoofdstuk als een situatie "Verlof" bestaat.
 */
async function vrijeSlug(basis: string, soort: SectieSoort): Promise<string> {
  const prefix = soort === 'situatie' ? 'situatie-' : ''
  const kaal = maakSlug(basis) || 'naamloos'
  for (let n = 0; n < 50; n++) {
    const kandidaat = `${prefix}${kaal}${n ? `-${n + 1}` : ''}`
    const { data } = await db()
      .from('personeelshandboek_secties').select('id').eq('slug', kandidaat).maybeSingle()
    if (!data) return kandidaat
  }
  return `${prefix}${kaal}-${Date.now()}`
}

/** Nieuw hoofdstuk of nieuwe situatiekaart; begint als concept, onderaan. */
export async function maakSectie(soort: SectieSoort, titel: string): Promise<string> {
  const medewerker = await vereisHandboekMutatie()
  const schoon = titel.trim() || (soort === 'situatie' ? 'Nieuwe situatie' : 'Nieuw hoofdstuk')

  const { data: laatste } = await db()
    .from('personeelshandboek_secties')
    .select('volgorde').eq('soort', soort).order('volgorde', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await db()
    .from('personeelshandboek_secties')
    .insert({
      slug: await vrijeSlug(schoon, soort),
      titel: schoon,
      soort,
      status: 'concept',
      volgorde: (laatste?.volgorde ?? 0) + 1,
      aangemaakt_door: medewerker.auth_user_id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Aanmaken mislukt: ${error.message}`)
  ververs()
  return data.id
}

/** Titel, samenvatting, status en zichtbaarheid van één sectie. */
export async function bewaarSectie(
  id: string,
  velden: {
    titel: string
    samenvatting: string | null
    icoon: string | null
    status: 'concept' | 'gepubliceerd'
    zichtbaar_voor: string[]
    verborgen_voor: string[]
  },
): Promise<void> {
  await vereisHandboekMutatie()
  const { error } = await db()
    .from('personeelshandboek_secties')
    .update({
      titel: velden.titel.trim(),
      samenvatting: velden.samenvatting?.trim() || null,
      icoon: velden.icoon?.trim() || null,
      status: velden.status,
      zichtbaar_voor: velden.zichtbaar_voor,
      verborgen_voor: velden.verborgen_voor,
    })
    .eq('id', id)
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
  ververs(id)
}

/**
 * Archiveren, niet verwijderen.
 *
 * Een hoofdstuk weggooien zou de blokken meenemen (cascade) en daarmee de
 * enige kopie van tekst die uit het Word-document is overgezet. Archiveren
 * haalt hem uit beeld en houdt hem terugvindbaar.
 */
export async function archiveerSectie(id: string): Promise<void> {
  await vereisHandboekMutatie('beheren')
  const { error } = await db()
    .from('personeelshandboek_secties').update({ status: 'gearchiveerd' }).eq('id', id)
  if (error) throw new Error(`Archiveren mislukt: ${error.message}`)
  ververs()
}

/** Eén plek omhoog of omlaag binnen het eigen soort. */
export async function verplaatsSectie(id: string, richting: 'omhoog' | 'omlaag'): Promise<void> {
  await vereisHandboekMutatie()

  const { data: huidig } = await db()
    .from('personeelshandboek_secties').select('id, soort, volgorde').eq('id', id).maybeSingle()
  if (!huidig) return

  // De buurman is de dichtstbijzijnde in de gevraagde richting. Zo blijft het
  // werken als de volgorde gaten heeft (en die ontstaan bij archiveren).
  const { data: buur } = await db()
    .from('personeelshandboek_secties')
    .select('id, volgorde')
    .eq('soort', huidig.soort)
    .neq('status', 'gearchiveerd')
    [richting === 'omhoog' ? 'lt' : 'gt']('volgorde', huidig.volgorde)
    .order('volgorde', { ascending: richting !== 'omhoog' })
    .limit(1)
    .maybeSingle()
  if (!buur) return

  await db().from('personeelshandboek_secties').update({ volgorde: buur.volgorde }).eq('id', huidig.id)
  await db().from('personeelshandboek_secties').update({ volgorde: huidig.volgorde }).eq('id', buur.id)
  ververs()
}

/**
 * De blokken van één sectie in één keer wegschrijven.
 *
 * Bewust de hele lijst en niet blok voor blok: de editor laat je invoegen,
 * herordenen en verwijderen voor je bewaart, en dan is "dit is de nieuwe
 * inhoud" de enige formulering die niet halverwege kan stranden.
 *
 * Bestaande blok-id's blijven behouden — daar hangen de deeplinks uit de
 * zoekresultaten aan. Alleen blokken die uit de lijst zijn gehaald, verdwijnen.
 */
export async function bewaarBlokken(
  sectieId: string,
  blokken: {
    id: string
    type: BlokType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inhoud: any
    status: 'concept' | 'gepubliceerd'
    zichtbaar_voor: string[]
    verborgen_voor: string[]
  }[],
): Promise<void> {
  await vereisHandboekMutatie()

  // Lege blokken zijn een half afgemaakte gedachte, geen inhoud; die slaan we
  // over in plaats van een lege alinea op de telefoon te tonen.
  const bewaard = blokken.filter((b) => !blokIsLeeg(b.type, b.inhoud))

  const rijen = bewaard.map((b, i) => ({
    id: b.id,
    sectie_id: sectieId,
    volgorde: i + 1,
    type: b.type,
    inhoud: b.inhoud,
    zoektekst: zoektekstVoor(b.type, b.inhoud),
    status: b.status,
    zichtbaar_voor: b.zichtbaar_voor,
    verborgen_voor: b.verborgen_voor,
  }))

  if (rijen.length) {
    const { error } = await db().from('personeelshandboek_blokken').upsert(rijen, { onConflict: 'id' })
    if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
  }

  // Pas wissen ná het schrijven: breekt de upsert af, dan staat de oude inhoud
  // er nog. Andersom zou een fout halverwege het hoofdstuk leeg achterlaten.
  const behouden = rijen.map((r) => r.id)
  let weg = db().from('personeelshandboek_blokken').delete().eq('sectie_id', sectieId)
  if (behouden.length) weg = weg.not('id', 'in', `(${behouden.join(',')})`)
  const { error: wisFout } = await weg
  if (wisFout) throw new Error(`Opruimen mislukt: ${wisFout.message}`)

  ververs(sectieId)
}

/** Titel, omschrijving, status en zichtbaarheid van een bijlage. */
export async function bewaarBijlage(
  id: string,
  velden: {
    titel: string
    omschrijving: string | null
    status: 'concept' | 'gepubliceerd' | 'gearchiveerd'
    zichtbaar_voor: string[]
    verborgen_voor: string[]
  },
): Promise<void> {
  await vereisHandboekMutatie()
  const { error } = await db()
    .from('personeelshandboek_bijlagen')
    .update({
      titel: velden.titel.trim(),
      omschrijving: velden.omschrijving?.trim() || null,
      status: velden.status,
      zichtbaar_voor: velden.zichtbaar_voor,
      verborgen_voor: velden.verborgen_voor,
    })
    .eq('id', id)
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
  ververs()
}

/**
 * Een nieuwe bijlage uploaden. De rij wordt eerst aangemaakt, zodat het bestand
 * onder zijn eigen uuid in de bucket komt te staan en twee bijlagen met dezelfde
 * bestandsnaam elkaar niet overschrijven.
 */
export async function uploadBijlage(formData: FormData): Promise<void> {
  const medewerker = await vereisHandboekMutatie()

  const bestand = formData.get('bestand')
  const titel = String(formData.get('titel') ?? '').trim()
  if (!(bestand instanceof File) || bestand.size === 0) throw new Error('Geen bestand gekozen')
  if (bestand.type !== 'application/pdf') throw new Error('Alleen pdf-bestanden')
  if (bestand.size > 20 * 1024 * 1024) throw new Error('Het bestand is groter dan 20 MB')

  const { data: laatste } = await db()
    .from('personeelshandboek_bijlagen')
    .select('volgorde').order('volgorde', { ascending: false }).limit(1).maybeSingle()

  const veiligeNaam = bestand.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const { data: rij, error } = await db()
    .from('personeelshandboek_bijlagen')
    .insert({
      titel: titel || bestand.name.replace(/\.pdf$/i, ''),
      bestandsnaam: bestand.name,
      // Tijdelijk; hieronder vervangen door het pad met de echte uuid erin.
      storage_path: 'pending',
      mimetype: 'application/pdf',
      grootte: bestand.size,
      volgorde: (laatste?.volgorde ?? 0) + 1,
      status: 'concept',
      geupload_door: medewerker.auth_user_id,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Aanmaken mislukt: ${error.message}`)

  const pad = `${rij.id}/${veiligeNaam}`
  const { error: uploadFout } = await db()
    .storage.from(HANDBOEK_BUCKET)
    .upload(pad, new Uint8Array(await bestand.arrayBuffer()), {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadFout) {
    // Geen weesrij achterlaten die naar een bestand wijst dat er niet is.
    await db().from('personeelshandboek_bijlagen').delete().eq('id', rij.id)
    throw new Error(`Uploaden mislukt: ${uploadFout.message}`)
  }

  await db().from('personeelshandboek_bijlagen').update({ storage_path: pad }).eq('id', rij.id)
  ververs()
}

/** Bijlage én bestand weg. Alleen voor beheerders. */
export async function verwijderBijlage(id: string): Promise<void> {
  await vereisHandboekMutatie('beheren')

  const { data: rij } = await db()
    .from('personeelshandboek_bijlagen').select('storage_path').eq('id', id).maybeSingle()

  if (rij?.storage_path && rij.storage_path !== 'pending') {
    await db().storage.from(HANDBOEK_BUCKET).remove([rij.storage_path])
  }
  const { error } = await db().from('personeelshandboek_bijlagen').delete().eq('id', id)
  if (error) throw new Error(`Verwijderen mislukt: ${error.message}`)
  ververs()
}
