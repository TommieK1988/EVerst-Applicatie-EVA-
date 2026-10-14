'use server'

import { vereisRecht } from '@/lib/auth/rechten'
import { losseTabel } from '@/lib/supabase/losse-tabel'
import { getDossierBewaking } from '@/lib/dossiers/actions'
import { AFREKENWIJZE_VELDEN } from '@/lib/dossiers/regie-opdracht'
import { opRegie, type AfrekenwijzeVelden } from '@/components/dossiers/types'
import { bouwDossierOpbouw, laadBtwInfo } from './opbouw'

export type BonBedragen = {
  /** Geboekte kosten zoals de kolom op het Financieel-tab: arbeid + inkoop mét inkoopfactuur. */
  geboekteKosten: number | null
  /** Wat er van deze bon op de verzamelfactuur komt, excl. btw — dezelfde opbouw als het voorbeeld. */
  opFactuur: number | null
  /** Facturen die in Bouw7 al op dit project staan (niet de verzamelfacturen: die kent Bouw7 niet per project). */
  bouw7Facturen: { nummer: string | null; bedrag: number }[]
}

type BonRij = AfrekenwijzeVelden & {
  id: string; bouw7_id: string | null; dossiernummer: string | null; titel: string | null; referentie: string | null
}

/**
 * De bedragen per bon voor het keuzelijstje. Eén aanroep per bon, zodat het scherm ze bon voor
 * bon kan vullen in plaats van te wachten op de traagste.
 *
 * Correcties (CO01) blijven buiten de geboekte kosten: dat zijn bijstellingen voor de
 * maandcijfers, geen kosten die op een factuur terugkomen.
 */
export async function getBonBedragen(dossierId: string): Promise<BonBedragen> {
  await vereisRecht('financieel', 'lezen')
  const db = losseTabel()
  const [{ data }, { data: snapshot }] = await Promise.all([
    db.from('dossiers')
      .select('id, bouw7_id, dossiernummer, titel, referentie, ' + AFREKENWIJZE_VELDEN)
      .eq('id', dossierId).maybeSingle(),
    db.from('bouw7_snapshots').select('payload').eq('dossier_id', dossierId).eq('soort', 'verkoopfacturen').maybeSingle(),
  ])
  const d = data as BonRij | null
  if (!d?.bouw7_id) return { geboekteKosten: null, opFactuur: null, bouw7Facturen: [] }

  const items = ((snapshot as { payload?: { items?: { invoiceNumber?: string | null; subTotal?: string | number | null }[] } } | null)
    ?.payload?.items ?? [])
  const bouw7Facturen = items.map(i => ({ nummer: i.invoiceNumber ?? null, bedrag: Number(i.subTotal ?? 0) }))

  const [bewaking, opbouw] = await Promise.all([
    getDossierBewaking(d.id, { verbergCorrecties: true }).catch(() => null),
    laadBtwInfo().then(tarieven => {
      // Het tarief doet hier niet ter zake: het bedrag is excl. btw.
      const eenTarief = tarieven.keys().next().value ?? 0
      return bouwDossierOpbouw({
        id: d.id, bouw7Id: Number(d.bouw7_id), dossiernummer: d.dossiernummer, titel: d.titel,
        referentie: d.referentie, opRegie: opRegie(d),
      }, eenTarief, tarieven)
    }).catch(() => null),
  ])

  return {
    geboekteKosten: bewaking?.beschikbaar ? Math.round(bewaking.totalen.geboekteKosten * 100) / 100 : null,
    opFactuur: opbouw ? opbouw.voorbeeld.totaal : null,
    bouw7Facturen,
  }
}
