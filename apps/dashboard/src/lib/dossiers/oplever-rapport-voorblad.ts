import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { opleverMomentStatusLabels, opleverMomentTypeLabels } from '@everts/database'
import { wikkel } from '@/lib/pdf/tekst'
import { MARGE, KOLOM, TOP_Y, type Canvas } from './oplever-rapport-pdf-blok'
import type { OpleverRapport } from './oplevering'

/**
 * Voorblad van het opleverrapport: de opdrachtinformatie, de gegevens van deze oplevering, een
 * korte samenvatting en — als die er is — een sfeerfoto van het opgeleverde werk.
 */

export type VoorbladGegevens = {
  contactpersoon: string | null
  referentie: string | null
  opdrachtdatum: string | null
  periode: string | null
  projectleider: string | null
  uitvoerder: string | null
  /** Bepaalt welk briefpapier eronder komt. */
  werkmaatschappijId: string | null
}

const datumNL = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : null

type Naam = { voornaam: string | null; tussenvoegsel?: string | null; achternaam: string | null }
const volledig = (n: Naam | null | undefined) =>
  n ? [n.voornaam, n.tussenvoegsel, n.achternaam].filter(Boolean).join(' ') || null : null

/** De opdrachtgegevens die niet al in `OpleverRapport` zitten. Best-effort: ontbreekt iets, dan leeg. */
export async function haalVoorbladGegevens(dossierId: string): Promise<VoorbladGegevens> {
  const supabase = createAdminClient()
  const { data: d } = await supabase
    .from('dossiers')
    .select('contactpersoon_id, opdracht_referentie, referentie, opdrachtdatum, verwacht_startdatum, verwacht_einddatum, project_manager_id, uitvoerder_id, werkmaatschappij_id')
    .eq('id', dossierId)
    .maybeSingle()
  if (!d) {
    return { contactpersoon: null, referentie: null, opdrachtdatum: null, periode: null, projectleider: null, uitvoerder: null, werkmaatschappijId: null }
  }

  const mwIds = [d.project_manager_id, d.uitvoerder_id].filter((x): x is string => Boolean(x))
  const [{ data: cp }, { data: mws }] = await Promise.all([
    d.contactpersoon_id
      ? supabase.from('contactpersonen').select('voornaam, achternaam').eq('id', d.contactpersoon_id).maybeSingle()
      : Promise.resolve({ data: null }),
    mwIds.length
      ? supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', mwIds)
      : Promise.resolve({ data: [] as { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }[] }),
  ])
  const mw = (id: string | null) => volledig((mws ?? []).find(m => m.id === id))
  const start = datumNL(d.verwacht_startdatum)
  const eind = datumNL(d.verwacht_einddatum)

  return {
    contactpersoon: volledig(cp),
    referentie: d.opdracht_referentie ?? d.referentie ?? null,
    opdrachtdatum: datumNL(d.opdrachtdatum),
    periode: start && eind ? `${start} t/m ${eind}` : start ?? eind,
    projectleider: mw(d.project_manager_id),
    uitvoerder: mw(d.uitvoerder_id),
    werkmaatschappijId: d.werkmaatschappij_id,
  }
}

export async function tekenVoorblad(
  c: Canvas,
  rapport: OpleverRapport,
  extra: VoorbladGegevens,
  telling: { punten: number; geaccepteerd: number; goed: number; aandachtspunten: number },
) {
  const { kleur, normaal, vet } = c
  const { dossier, moment } = rapport
  c.y = TOP_Y - 10

  c.tekst('Opleverrapport', { grootte: 26, font: vet })
  c.y -= 24
  for (const r of wikkel(dossier.titel ?? moment.titel, normaal, 14, KOLOM)) { c.tekst(r, { grootte: 14 }); c.y -= 18 }
  c.y -= 4
  c.pagina.drawRectangle({ x: MARGE, y: c.y, width: KOLOM, height: 2, color: kleur.groen })
  c.y -= 26

  const tabel = (titel: string, rijen: [string, string | null][]) => {
    c.tekst(titel.toUpperCase(), { grootte: 8.5, font: vet, kleur: kleur.grijs })
    c.y -= 15
    for (const [label, waarde] of rijen) {
      if (!waarde) continue
      c.tekst(label, { grootte: 9.5, kleur: kleur.grijs })
      for (const r of wikkel(waarde, normaal, 10, KOLOM - 140)) { c.tekst(r, { x: MARGE + 140, grootte: 10 }); c.y -= 13 }
      c.y -= 3
    }
    c.y -= 12
  }

  tabel('Opdracht', [
    ['Opdrachtgever', dossier.klant],
    ['Contactpersoon', extra.contactpersoon],
    ['Project', dossier.titel],
    ['Projectnummer', dossier.nummer],
    ['Uw referentie', extra.referentie],
    ['Werkadres', dossier.werkadres],
    ['Opdrachtdatum', extra.opdrachtdatum],
    ['Uitvoering', extra.periode],
    ['Projectleider', extra.projectleider],
    ['Uitvoerder', extra.uitvoerder],
  ])

  tabel('Oplevering', [
    ['Omschrijving', moment.titel],
    ['Soort', opleverMomentTypeLabels[moment.type] ?? moment.type],
    ['Datum', datumNL(moment.opgeleverd_op ?? moment.created_at)],
    ['Status', opleverMomentStatusLabels[moment.status] ?? moment.status],
  ])

  const open = telling.punten - telling.geaccepteerd
  tabel('Samenvatting', [
    ['Opleverpunten', telling.punten
      ? `${telling.punten} (${telling.geaccepteerd} geaccepteerd${open ? `, ${open} openstaand` : ''})`
      : 'geen'],
    ['Goed uitgevoerd', telling.goed ? String(telling.goed) : null],
    ['Aandachtspunten', telling.aandachtspunten ? String(telling.aandachtspunten) : null],
  ])

  // Sfeerfoto: de eerste foto van een goed uitgevoerd punt, anders de eerste foto überhaupt.
  const alle = rapport.punten
  const bron = alle.find(p => p.is_goed && p.fotos.length)?.fotos[0] ?? alle.find(p => p.fotos.length)?.fotos[0]
  const ruimte = c.rest - 6
  if (bron && ruimte > 120) {
    const img = await c.foto(bron.url)
    if (img) c.fotoInVak(img, MARGE, c.y, KOLOM, Math.min(ruimte, 300), false)
  }
}
