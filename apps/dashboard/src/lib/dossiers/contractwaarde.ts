/**
 * Wat de opdracht waard is, als één berekening.
 *
 * Stond eerst op twee plekken: het Verkoop-tab telde het regiewerk op uit het nacalculatie-blok,
 * het Informatie-tab uit de meerwerkregels. Twee getallen voor dezelfde opdracht, op twee schermen
 * naast elkaar. Daarom hier, als pure functie: beide tabs halen hun eigen gegevens op en rekenen
 * ermee via deze ene bron.
 *
 * De opbouw is aanneemsom + aangenomen meerwerk + regie, waarbij regie bestaat uit het
 * nacalculatie-blok plus het meerwerk buiten de termijnstaat dat zijn eigen bedrag draagt.
 */

const rond = (n: number) => Math.round(n * 100) / 100

/** De meerwerktotalen die deze berekening nodig heeft (uit `getDossierMeerwerk`). */
export type MeerwerkTotalenInvoer = {
  goedgekeurdAangenomenExcl: number
  goedgekeurdRegieExcl: number
  goedgekeurdNacalculatieExcl: number
}

/** De nacalculatietotalen die deze berekening nodig heeft (uit `getRegieFactuurvoorstel`). */
export type NacalculatieInvoer = {
  totaal: number
  alGefactureerdBedrag: number
}

export type Contractwaarde = {
  aanneemsom: number
  /** Meerwerk tegen een vaste prijs; dit deel loopt via de termijnstaat. */
  aangenomen: number
  /**
   * Meerwerk buiten de termijnstaat dat zijn eigen bedrag draagt en in geen enkel blok staat —
   * een eenheidsprijs-stelpost zonder bewakingscode, of het deel van een regie-/stelpostmandaat
   * dat nog niet geboekt is.
   */
  eigenBedrag: number
  /** Uit het nacalculatie-blok, inclusief wat daarvan al gefactureerd is. */
  nacalculatie: number
  /** `eigenBedrag` + `nacalculatie`: alles wat buiten de termijnstaat afrekent. */
  regie: number
  /** `aangenomen` + `regie`. */
  meerwerk: number
  contractTotaal: number
}

/**
 * Wat de meerwerkregels over de nacalculatieposten melden wordt eraf getrokken en vervangen door
 * het nacalculatie-blok zelf. Dat blok kijkt naar dezelfde boekingen, maar houdt rekening met
 * vaste bedragen per factuurregel, uitgevinkte posten en losse regels, én het kent ook stelposten
 * die helemaal geen meerwerkregel zijn. Eén bedrag uit één bron, in plaats van twee tellingen van
 * hetzelfde werk.
 *
 * Al gefactureerde posten tellen mee: het gaat om de waarde van de opdracht, niet om wat er nog
 * openstaat. Anders zou het contracttotaal krimpen bij elke factuur.
 */
export function berekenContractwaarde({ aanneemsom, meerwerk, nacalculatie }: {
  aanneemsom: number
  meerwerk: MeerwerkTotalenInvoer | null
  nacalculatie: NacalculatieInvoer | null
}): Contractwaarde {
  const aangenomen = meerwerk?.goedgekeurdAangenomenExcl ?? 0
  const eigenBedrag = rond(
    (meerwerk?.goedgekeurdRegieExcl ?? 0) - (meerwerk?.goedgekeurdNacalculatieExcl ?? 0),
  )
  const uitBlok = rond((nacalculatie?.totaal ?? 0) + (nacalculatie?.alGefactureerdBedrag ?? 0))
  const regie = rond(eigenBedrag + uitBlok)
  const meerwerkTotaal = rond(aangenomen + regie)
  return {
    aanneemsom,
    aangenomen,
    eigenBedrag,
    nacalculatie: uitBlok,
    regie,
    meerwerk: meerwerkTotaal,
    contractTotaal: rond(aanneemsom + meerwerkTotaal),
  }
}

/** De vier regels onder "Contractwaarde" op de Verkoop-tab. Samen precies `aangenomen + regie`. */
export type MeerwerkSplitsing = {
  minderwerkAangenomen: number
  meerwerkAangenomen: number
  minderwerkRegie: number
  meerwerkRegie: number
}

/**
 * Splitst het goedgekeurde meerwerk in meer- en minderwerk, per afrekenwijze. Het totaal ligt al
 * vast in `berekenContractwaarde`; dit verdeelt het alleen, op het teken van elk bedrag.
 *
 * Aangenomen: per regel. Regie is net als daar tweeledig: de regieregels die zelf hun bedrag
 * dragen (niet in het nacalculatie-blok) per regel, en het nacalculatie-blok als één bedrag. Dat
 * blok is een optelling van geboekte kosten en valt niet zinnig per regel op te splitsen. Wat een
 * mandaat bóven het geboekte legt, staat niet in dat blok en telt hier per regel mee.
 */
export function splitsMeerwerk(
  regels: { effectiefExcl: number; werkelijkExcl?: number; opTermijn: boolean; opNacalculatie: boolean }[],
  waarde: Pick<Contractwaarde, 'nacalculatie'>,
): MeerwerkSplitsing {
  const s = { minderwerkAangenomen: 0, meerwerkAangenomen: 0, minderwerkRegie: 0, meerwerkRegie: 0 }
  for (const r of regels) {
    if (r.opTermijn) {
      if (r.effectiefExcl < 0) s.minderwerkAangenomen += r.effectiefExcl
      else s.meerwerkAangenomen += r.effectiefExcl
    } else if (!r.opNacalculatie) {
      if (r.effectiefExcl < 0) s.minderwerkRegie += r.effectiefExcl
      else s.meerwerkRegie += r.effectiefExcl
    } else {
      // Mandaat boven het geboekte: `berekenContractwaarde` telt dit via `eigenBedrag`.
      s.meerwerkRegie += Math.max(0, r.effectiefExcl - (r.werkelijkExcl ?? r.effectiefExcl))
    }
  }
  if (waarde.nacalculatie < 0) s.minderwerkRegie += waarde.nacalculatie
  else s.meerwerkRegie += waarde.nacalculatie
  return {
    minderwerkAangenomen: rond(s.minderwerkAangenomen),
    meerwerkAangenomen: rond(s.meerwerkAangenomen),
    minderwerkRegie: rond(s.minderwerkRegie),
    meerwerkRegie: rond(s.meerwerkRegie),
  }
}
