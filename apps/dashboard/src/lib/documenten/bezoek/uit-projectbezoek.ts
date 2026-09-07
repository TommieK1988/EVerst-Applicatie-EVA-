/**
 * uit-projectbezoek.ts — een projectbezoek als bezoekrapport.
 *
 * Dit is de bron waar de andere vier naartoe werken: één bezoek waarin de projectleider
 * aanvinkte wat hij deed, en dat dus meerdere hoofdstukken tegelijk vult. Een bezoek met
 * Kwaliteit én Veiligheid levert één document met beide erin; de hoofdstukken die hij niet
 * aanvinkte klappen vanzelf dicht.
 *
 * De kwaliteitskant wordt niet opnieuw berekend: als het bezoek een inspectie heeft, komt dat
 * blok uit `bouwKwaliteitBlok` — dezelfde cijfers als in het losse kwaliteitsrapport.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { opleverPuntStatusLabels } from '@everts/database/platform-types'
import { datumNL, afkappen } from '../format'
import { knipInPaginas } from '../rapport-paginas'
import {
  FOTO_GRENZEN, mapMetLimiet, haalRapportFoto, pasFotoBudgetToe, veiligeFotoUrl,
} from '../rapport-fotos'
import type { BezoekOpties } from '../bezoek-opties'
import { MAX_BEVINDINGEN } from '../bezoek-opties'
import { kwaliteitNaarBezoek } from './uit-kwaliteit'
import {
  LEEG_BEZOEK_BLOK, LEGE_BEVINDING, BEZOEK_SOORT_LABELS, bezoekDisclaimer,
  type BezoekBlok, type BezoekBevinding, type Rij,
} from './contract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const AFGEHANDELD = new Set(['opgelost', 'geaccepteerd'])
const NIET_ACTIEF = new Set(['nieuw', 'afgewezen'])

const STANDAARD_INLEIDING =
  'Tijdens dit projectbezoek zijn de op dat moment zichtbare en bereikbare onderdelen van het '
  + 'werk beoordeeld. Wat daarbij is vastgelegd, staat hieronder.'

export async function bouwBezoekUitProjectbezoek(
  bezoekId: string,
  keuze: BezoekOpties,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kwaliteitBlok: any,
  opties: { preview?: boolean } = {},
): Promise<BezoekBlok> {
  const supabase = db()
  const { data: bezoek } = await supabase
    .from('projectbezoeken').select('*').eq('id', bezoekId).maybeSingle()
  if (!bezoek) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }

  const [{ data: punten }, { data: fotos }, { data: medewerker }] = await Promise.all([
    // Begrensd op één bezoek; geen paginering nodig.
    supabase.from('oplever_punten')
      .select('id, volgnummer, omschrijving, ruimte, soort, status, deadline, created_at')
      .eq('bezoek_id', bezoekId).order('volgnummer'),
    supabase.from('projectbezoek_fotos')
      .select('id, soort, url, toelichting').eq('bezoek_id', bezoekId).order('volgorde'),
    bezoek.uitgevoerd_door
      ? supabase.from('medewerkers').select('voornaam, tussenvoegsel, achternaam')
          .eq('id', bezoek.uitgevoerd_door).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const puntRijen = ((punten ?? []) as Record<string, unknown>[])
    .filter(p => !NIET_ACTIEF.has(String(p.status)))
  if (!opties.preview && puntRijen.length > MAX_BEVINDINGEN) {
    throw new Error(
      `Dit bezoek bevat ${puntRijen.length} punten; het maximum is ${MAX_BEVINDINGEN}.`,
    )
  }
  const gekozen = opties.preview ? puntRijen.slice(0, keuze.per_pagina * 2) : puntRijen

  // ── Foto's bij de punten ───────────────────────────────────────────────
  const puntIds = gekozen.map(p => String(p.id))
  const { data: puntFotos } = puntIds.length && keuze.toon_fotos
    ? await supabase.from('oplever_fotos').select('punt_id, url, soort').in('punt_id', puntIds)
    : { data: [] }

  const voorPerPunt = new Map<string, string>()
  const naPerPunt = new Map<string, string>()
  for (const f of ((puntFotos ?? []) as { punt_id: string; url: string; soort: string }[])) {
    const doel = f.soort === 'na' ? naPerPunt : voorPerPunt
    if (!doel.has(f.punt_id)) doel.set(f.punt_id, f.url)
  }

  const bezoekFotos = ((fotos ?? []) as Record<string, unknown>[])
  const teHalen = keuze.toon_fotos
    ? [
        ...gekozen.map(p => veiligeFotoUrl(voorPerPunt.get(String(p.id)))),
        ...gekozen.map(p => (keuze.toon_voor_na ? veiligeFotoUrl(naPerPunt.get(String(p.id))) : '')),
        ...bezoekFotos.map(f => veiligeFotoUrl(String(f.url))),
      ]
    : []
  const opgehaald = await mapMetLimiet(teHalen, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
  // 'laat_vallen': liever een rapport zonder de laatste foto's dan geen rapport.
  const dataUrls = pasFotoBudgetToe(opgehaald, 'laat_vallen')
  const voorFoto = (i: number) => dataUrls[i] ?? ''
  const naFoto = (i: number) => dataUrls[gekozen.length + i] ?? ''
  const bezoekFoto = (i: number) => dataUrls[gekozen.length * 2 + i] ?? ''

  // ── Bevindingen ────────────────────────────────────────────────────────
  const bevindingen: BezoekBevinding[] = gekozen.map((p, i) => {
    const isVeiligheid = p.soort === 'veiligheid'
    const status = String(p.status ?? 'open')
    return {
      ...LEGE_BEVINDING,
      nummer: `${isVeiligheid ? 'VP' : 'AP'}-${String(p.volgnummer).padStart(2, '0')}`,
      volgnummer: Number(p.volgnummer),
      titel: String(p.ruimte ?? ''),
      omschrijving: String(p.omschrijving ?? ''),
      omschrijving_kort: afkappen(String(p.omschrijving ?? ''), 220),
      locatie: String(p.ruimte ?? ''),
      groep: isVeiligheid ? 'Veiligheid' : 'Algemeen',
      status,
      status_label: opleverPuntStatusLabels[status as keyof typeof opleverPuntStatusLabels] ?? status,
      is_open: !AFGEHANDELD.has(status),
      is_opgelost: AFGEHANDELD.has(status),
      datum: p.created_at ? datumNL(String(p.created_at)) : '',
      hersteldatum: p.deadline ? datumNL(String(p.deadline)) : '',
      foto: voorFoto(i),
      heeft_foto: !!voorFoto(i),
      foto_na: naFoto(i),
      heeft_foto_na: !!naFoto(i),
    }
  })

  // ── Kwaliteit erbij ────────────────────────────────────────────────────
  // Het kwaliteitsblok is al berekend door de contextbouwer; hier wordt het alleen
  // ingevoegd wanneer dit bezoek daadwerkelijk een inspectie heeft.
  const heeftKwaliteit = !!bezoek.kwaliteit_inspectie_id && kwaliteitBlok?.aanwezig
  const kwal = heeftKwaliteit ? kwaliteitNaarBezoek(kwaliteitBlok, keuze) : null

  const alleBevindingen = [...(kwal?.alle_bevindingen ?? []), ...bevindingen]
    .map((b, i) => ({ ...b, volgnummer: i + 1 }))

  // ── Voortgang ──────────────────────────────────────────────────────────
  // Als eigen "waarneming"-rijen, zodat het sjabloon er geen apart hoofdstuk voor nodig heeft:
  // tekst plus beeld is precies wat de waarnemingenloop toont.
  const voortgang: Rij[] = bezoek.doet_voortgang
    ? bezoekFotos
        .map((f, i) => ({
          omschrijving: String(f.toelichting ?? '') || 'Voortgang',
          locatie: '', groep: 'Voortgang',
          foto: bezoekFoto(i), foto_klein: bezoekFoto(i), heeft_foto: !!bezoekFoto(i),
        }))
        .filter(r => r.heeft_foto || r.omschrijving !== 'Voortgang')
    : []

  const waarnemingen = keuze.toon_waarnemingen
    ? [...(kwal?.waarnemingen ?? []), ...voortgang]
    : []

  const open = alleBevindingen.filter(b => b.is_open).length
  const kengetallen: Rij[] = [
    ...(kwal?.kengetallen ?? []),
    { label: 'Vastgelegde punten', waarde: bevindingen.length, is_negatief: bevindingen.length > 0 },
    { label: 'Nog open', waarde: open, is_negatief: true },
  ].filter(k => Number(k.waarde) > 0)

  const naam = medewerker
    ? [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    : ''

  // Het soort-etiket volgt uit wat er tijdens dit bezoek is gedaan: alleen kwaliteit gelopen
  // levert een "Kwaliteitsronde" op, alleen veiligheid een "Veiligheidsronde", en alles daar
  // tussenin heet gewoon een projectbezoek.
  const soortLabel = bepaalSoortLabel(bezoek)

  return {
    ...LEEG_BEZOEK_BLOK,
    aanwezig: true,
    soort: bezoek.doet_veiligheid && !bezoek.doet_kwaliteit ? 'veiligheid' : 'kwaliteit',
    soort_label: soortLabel,
    titel: `${soortLabel} PB-${String(bezoek.volgnummer).padStart(2, '0')}`,
    kenmerk: `PB-${String(bezoek.volgnummer).padStart(2, '0')}`,
    datum: datumNL(bezoek.datum),
    tijd: bezoek.tijd ? String(bezoek.tijd).slice(0, 5) : '',
    uitvoerder: naam,
    locatie: bezoek.locatie ?? '',
    werkzaamheden: bezoek.werkzaamheden ?? '',
    omstandigheden: bezoek.weer ?? '',
    inleiding: keuze.inleiding || STANDAARD_INLEIDING,
    samenvatting_regel: samenvattingsregel(bezoek, alleBevindingen.length, open),
    kengetallen,
    heeft_kengetallen: kengetallen.length > 0,
    alle_bevindingen: alleBevindingen,
    paginas: knipInPaginas(alleBevindingen, { perPagina: keuze.per_pagina, itemVeld: 'bevindingen' }),
    heeft_bevindingen: alleBevindingen.length > 0,
    aantal_bevindingen: alleBevindingen.length,
    aantal_open: open,
    metingen: kwal?.metingen ?? [],
    heeft_metingen: (kwal?.metingen?.length ?? 0) > 0,
    punten: kwal?.punten ?? [],
    heeft_punten: (kwal?.punten?.length ?? 0) > 0,
    waarnemingen,
    heeft_waarnemingen: waarnemingen.length > 0,
    opvolging: kwal?.opvolging ?? [],
    heeft_opvolging: kwal?.heeft_opvolging ?? false,
    opvolging_regel: kwal?.opvolging_regel ?? '',
    opmerkingen: [bezoek.voortgang_tekst, bezoek.algemene_opmerkingen].filter(Boolean).join('\n\n'),
    disclaimer: bezoekDisclaimer(bezoek.doet_veiligheid && !bezoek.doet_kwaliteit ? 'veiligheid' : 'kwaliteit'),
    per_pagina: keuze.per_pagina,
  }
}

function bepaalSoortLabel(bezoek: Record<string, unknown>): string {
  const aan = [
    bezoek.doet_kwaliteit && 'kwaliteit',
    bezoek.doet_veiligheid && 'veiligheid',
    bezoek.doet_algemeen && 'algemeen',
    bezoek.doet_voortgang && 'voortgang',
  ].filter(Boolean) as string[]

  if (aan.length === 1 && aan[0] === 'kwaliteit') return BEZOEK_SOORT_LABELS.kwaliteit
  if (aan.length === 1 && aan[0] === 'veiligheid') return BEZOEK_SOORT_LABELS.veiligheid
  return 'Projectbezoek'
}

function samenvattingsregel(
  bezoek: Record<string, unknown>,
  totaal: number,
  open: number,
): string {
  const onderdelen = [
    bezoek.doet_kwaliteit && 'kwaliteit',
    bezoek.doet_veiligheid && 'veiligheid',
    bezoek.doet_algemeen && 'algemene indruk',
    bezoek.doet_voortgang && 'voortgang',
  ].filter(Boolean) as string[]

  const kop = onderdelen.length
    ? `Tijdens dit bezoek is gekeken naar ${lijst(onderdelen)}.`
    : 'Tijdens dit bezoek is het werk beoordeeld.'

  if (totaal === 0) return `${kop} Er zijn geen punten vastgelegd.`
  const punten = totaal === 1 ? 'Er is 1 punt vastgelegd.' : `Er zijn ${totaal} punten vastgelegd.`
  if (open === 0) return `${kop} ${punten} Alle punten zijn afgehandeld.`
  return `${kop} ${punten} Daarvan ${open === 1 ? 'staat er 1 nog open' : `staan er ${open} nog open`}.`
}

/** "a, b en c" — leest prettiger dan een opsomming met komma's in een klantdocument. */
function lijst(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} en ${items[items.length - 1]}`
}
