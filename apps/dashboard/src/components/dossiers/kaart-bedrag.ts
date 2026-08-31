import { kiesAanneemsom } from '@/lib/dossiers/aanneemsom'
import type { DossierRij, DossierSectie } from './types'

/**
 * Eén plek waar het bedrag op een dossierkaart/lijstregel wordt bepaald, zodat het bord, de
 * lijstweergave en het Informatie-tab hetzelfde getal tonen.
 *
 * Opbouw (excl. btw), gelijk aan het Financiële-totalen-blok op het Informatie-tab:
 *
 *     aanneemsom + goedgekeurd meer-/minderwerk + stelposten buiten de aanneemsom + gekozen opties
 *
 * Welke bron de aanneemsom levert bepaalt `kiesAanneemsom` (lib/dossiers/aanneemsom.ts): in de
 * offertefase de EVA-calculatie, in de opdrachtfase het Bouw7-contractbedrag. Stelposten ín de
 * aanneemsom (carve-outs) tellen niet apart mee — die zitten al in de aanneemsom.
 *
 * De losse velden worden server-side gevuld door `laadKaartBedragen` (lib/dossiers/kaart-bedragen.ts).
 */

const rond = (n: number): number => Math.round(n * 100) / 100

export type KaartBedrag = {
  /** Aanneemsom excl. btw, uit de bron die ook de kostprijs levert. */
  aanneemsom: number | null
  /** Waar de aanneemsom vandaan komt — bepaalt welke kostprijs erbij hoort. */
  bron: 'eva' | 'bouw7' | 'bouw7-verstuurd' | null
  /** Kostprijs excl. btw uit diezelfde bron; null als die er niet is. */
  kostprijs: number | null
  /**
   * EVA-offertebedrag dat niet als aanneemsom gekozen is en er materieel van afwijkt — meestal een
   * deel-offerte, of een achtergebleven concept bij een Bouw7-opdracht. Null als er niets afwijkt.
   */
  afwijkendeEvaOfferte: number | null
  meerwerk: number
  stelpostenApart: number
  gekozenOpties: number
  /** Het bedrag dat op de kaart hoort: aanneemsom + de drie posten hierboven. */
  totaalExclBtw: number | null
  /** True zodra er iets bij de aanneemsom op komt — de kaart mag dat dan uitsplitsen. */
  heeftOpbouw: boolean
}

export function berekenKaartBedrag(dossier: DossierRij, sectie?: DossierSectie): KaartBedrag {
  const meerwerk        = dossier.meerwerk_goedgekeurd_excl_btw ?? 0
  const stelpostenApart = dossier.stelposten_apart_excl_btw ?? 0
  const gekozenOpties   = dossier.gekozen_opties_excl_btw ?? 0

  // Meerdere Bouw7-offertes op status "Verstuurd": de som daarvan is bewust leidend op de
  // Offertes-kaart, anders zou het bedrag van de laatst opgestelde offerte de rest verbergen.
  const verstuurdSom = dossier.offerte_verstuurd_som_excl_btw ?? null
  const meerdereVerstuurd = sectie === 'offerte'
    && (dossier.offerte_verstuurd_aantal ?? 0) > 1
    && verstuurdSom != null

  let aanneemsom: number | null
  let bron: KaartBedrag['bron']
  let kostprijs: number | null
  let afwijkendeEvaOfferte: number | null = null

  if (meerdereVerstuurd) {
    aanneemsom = verstuurdSom
    bron       = 'bouw7-verstuurd'
    // De som loopt over meerdere offertes; de kostprijs van één ervan zegt niets over die som.
    kostprijs  = null
  } else {
    const keuze = kiesAanneemsom({
      hoofdstatus:       dossier.hoofdstatus,
      bouw7ExclBtw:      dossier.bedrag_excl_btw != null ? Number(dossier.bedrag_excl_btw) : null,
      evaOfferteExclBtw: dossier.eva_offerte_excl_btw ?? null,
    })
    aanneemsom = keuze.aanneemsom
    bron       = keuze.bron
    // De kostprijs hoort altijd bij de offerte/het project dat ook de verkoopprijs leverde; ze
    // mengen zou een betekenisloze marge opleveren.
    kostprijs  = keuze.bron === 'eva'
      ? (dossier.eva_kostprijs_excl_btw ?? null)
      : keuze.bron === 'bouw7' && dossier.kostprijs_excl_btw != null
        ? Number(dossier.kostprijs_excl_btw)
        : null
    afwijkendeEvaOfferte = keuze.afwijkendeEvaOfferte
  }

  const extra = rond(meerwerk + stelpostenApart + gekozenOpties)
  const totaalExclBtw = aanneemsom == null
    ? (extra !== 0 ? extra : null)
    : rond(aanneemsom + extra)

  return {
    aanneemsom, bron, kostprijs, afwijkendeEvaOfferte,
    meerwerk, stelpostenApart, gekozenOpties,
    totaalExclBtw,
    heeftOpbouw: extra !== 0,
  }
}
