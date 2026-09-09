'use server'

/**
 * "Wat staat er extern open?" — alle openstaande uitvragen over alle dossiers, gegroepeerd per partij.
 *
 * Dit is de plek waar de PostgREST-afkapping toeslaat: een `select` over álle dossiers is niet
 * aantoonbaar onder de 1000 rijen (200 lopende dossiers × 5 uitvragen zit er al aan), en PostgREST
 * kapt dan stil af — geen error, gewoon minder rijen. Vandaar `haalAlleRijen` met een stabiele
 * sortering.
 */

import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { vereisSessie } from '@/lib/auth/rechten'
import { isDossierAfgesloten } from '@/components/dossiers/types'
import type { DossierSectie } from '@/components/dossiers/types'

export type OpenUitvraagRij = {
  id: string
  discipline: string
  dossierId: string
  dossiernummer: string
  dossierTitel: string
  sectie: DossierSectie
  aangevraagdOp: string | null
  reactieUiterlijk: string | null
  /** Dagen sinds de aanvraag. */
  dagenOpen: number
  teLaat: boolean
  rappels: number
  laatstGerappelleerdOp: string | null
  aanvragerId: string | null
}

export type PartijGroep = {
  /** relatie_id, of `naam:<partij_naam>` als de relatie is losgeraakt. */
  sleutel: string
  relatieId: string | null
  naam: string
  /** Voorgesteld mailadres: dat van de laatste verzending, anders het algemene relatieadres. */
  email: string
  heeftAdres: boolean
  actief: boolean
  rijen: OpenUitvraagRij[]
  /** Hoogste `dagenOpen` binnen de groep; bepaalt de sortering. */
  langstOpen: number
  teLaat: number
}

export type OpenstaandOverzicht = {
  partijen: PartijGroep[]
  totaalRijen: number
  partijenZonderAdres: number
}

function vandaagISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dagenTussen(vanISO: string, totISO: string): number {
  const [jv, mv, dv] = vanISO.split('-').map(Number)
  const [jt, mt, dt] = totISO.split('-').map(Number)
  return Math.round((Date.UTC(jt, mt - 1, dt) - Date.UTC(jv, mv - 1, dv)) / 86_400_000)
}

/** Sectie waar het dossier nu leeft; bepaalt de link naar het juiste tabblad. */
function sectieVan(hoofdstatus: string | null): DossierSectie {
  if (hoofdstatus === 'opdracht') return 'opdracht'
  if (hoofdstatus === 'offerte')  return 'offerte'
  return 'aanvraag'
}

/**
 * Alle openstaande uitvragen, gegroepeerd per partij.
 *
 * Alleen `status = 'open'` én met een `aangevraagd_op`: een regel die wel is aangemaakt maar nog
 * nergens ligt, valt niets over te rappelleren.
 */
export async function getOpenstaandeUitvragen(): Promise<OpenstaandOverzicht> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // De dossier- en relatiegegevens komen als embedded join mee. Dat scheelt een tweede `.in(...)`
  // met mogelijk honderden ids in de URL, en het filter op afgesloten dossiers kan daardoor in TS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rijen = await haalAlleRijen<any>((van, tot) =>
    db.from('dossier_uitvragen')
      .select(
        'id, dossier_id, discipline, aangevraagd_op, reactie_uiterlijk, rappels, laatst_gerappelleerd_op, ' +
        'laatst_gemaild_naar, relatie_id, partij_naam, created_by, ' +
        'relaties(id, naam, email, actief), ' +
        'dossiers!inner(id, dossiernummer, titel, hoofdstatus, aanvraag_substatus, offerte_substatus, ' +
        'opdracht_substatus, bouw7_projectstatus_naam)',
      )
      .eq('status', 'open')
      .not('aangevraagd_op', 'is', null)
      // Stabiele sortering is verplicht bij paginering: zonder vaste volgorde mag Postgres per pagina
      // een andere teruggeven, en dan sla je rijen over of haal je ze dubbel op.
      .order('id', { ascending: true })
      .range(van, tot),
  ).catch(() => [])

  const vandaag = vandaagISO()
  const groepen = new Map<string, PartijGroep>()
  let totaalRijen = 0

  for (const r of rijen) {
    // Afgesloten dossiers eruit: rappelleren over een verloren aanvraag is genant. Dit filter mág
    // hier in TS staan omdat `haalAlleRijen` de afkapping al heeft weggenomen — het is niet het
    // patroon uit CLAUDE.md waarbij je ná een afgekapte respons filtert.
    if (!r.dossiers || isDossierAfgesloten(r.dossiers)) continue

    const teLaat = !!r.reactie_uiterlijk && r.reactie_uiterlijk < vandaag
    const dagenOpen = dagenTussen(r.aangevraagd_op, vandaag)

    const rij: OpenUitvraagRij = {
      id: r.id,
      discipline: r.discipline,
      dossierId: r.dossier_id,
      dossiernummer: r.dossiers.dossiernummer ?? '',
      dossierTitel: r.dossiers.titel ?? '',
      sectie: sectieVan(r.dossiers.hoofdstatus),
      aangevraagdOp: r.aangevraagd_op,
      reactieUiterlijk: r.reactie_uiterlijk,
      dagenOpen,
      teLaat,
      rappels: r.rappels ?? 0,
      laatstGerappelleerdOp: r.laatst_gerappelleerd_op,
      aanvragerId: r.created_by ?? null,
    }

    // Groeperen op de relatie; is die losgeraakt, dan op naam, zodat de regels niet allemaal onder
    // één naamloze hoop belanden.
    const sleutel = r.relatie_id ?? `naam:${(r.partij_naam ?? '').toLowerCase()}`
    let groep = groepen.get(sleutel)
    if (!groep) {
      // Het adres van de laatste verzending wint van het algemene adres: grote leveranciers hebben
      // per regio een andere contactpersoon, en op info@ verdwijnt de rappel.
      const eerder: string[] = Array.isArray(r.laatst_gemaild_naar) ? r.laatst_gemaild_naar : []
      const email = eerder.length > 0 ? eerder.join('; ') : (r.relaties?.email ?? '')
      groep = {
        sleutel,
        relatieId: r.relatie_id ?? null,
        naam: r.partij_naam ?? r.relaties?.naam ?? 'Onbekende partij',
        email,
        heeftAdres: !!email,
        actief: r.relatie_id ? r.relaties?.actief !== false : false,
        rijen: [],
        langstOpen: 0,
        teLaat: 0,
      }
      groepen.set(sleutel, groep)
    }
    groep.rijen.push(rij)
    groep.langstOpen = Math.max(groep.langstOpen, dagenOpen)
    if (teLaat) groep.teLaat += 1
    totaalRijen += 1
  }

  const partijen = [...groepen.values()]
  for (const g of partijen) {
    g.rijen.sort((a, b) => b.dagenOpen - a.dagenOpen)
  }
  // Te late partijen bovenaan, daarbinnen wie het langst wacht.
  partijen.sort((a, b) => (b.teLaat > 0 ? 1 : 0) - (a.teLaat > 0 ? 1 : 0) || b.langstOpen - a.langstOpen)

  return {
    partijen,
    totaalRijen,
    partijenZonderAdres: partijen.filter(p => !p.heeftAdres).length,
  }
}

/** Standaardtekst voor het bulk-rappelvenster; leest hetzelfde sjabloon als de losse rappelmail. */
export async function getRappelTekst(): Promise<{ onderwerp: string; bericht: string }> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('document_sjablonen')
    .select('mail_onderwerp, mail_body_html')
    .eq('documentsoort', 'uitvraag_rappel')
    .eq('actief', true)
    .order('volgorde', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { naarPlatteTekst } = await import('@/lib/mail/sjabloontekst')
  return {
    onderwerp: (data?.mail_onderwerp ?? '').trim() || 'Herinnering: openstaande prijsopgave(n)',
    bericht: naarPlatteTekst(data?.mail_body_html ?? '') ||
      'Goedemiddag,\n\n' +
      'Eerder vroegen wij u om een prijsopgave voor onderstaand werk. Wij hebben die nog niet ontvangen.\n\n' +
      'Kunt u laten weten wanneer wij uw offerte kunnen verwachten, of dat u ervan afziet? Dan houden ' +
      'wij daar rekening mee in onze planning.\n\n' +
      'Met vriendelijke groet,',
  }
}
