/**
 * Pure, client-veilige rechten-helpers (géén 'server-only').
 * Gedeeld door de Sidebar (client) en de server-helpers in ./rechten.ts.
 *
 * Rechten bestaan per kanaal (desktop/mobiel). De helpers hieronder slikken zowel
 * een `KanaalSet` (de nieuwe vorm) als een platte `RechtenSet` (de oude), zodat de
 * bestaande aanroepen woordelijk blijven werken. Het model zelf staat in
 * packages/database/src/rechten-catalogus.ts.
 */
import type {
  ModuleRechten, RechtenModule, RechtenSet, FunctieKey, KanaalRechten, Kanaal,
} from '@everts/database/platform-types'
import {
  niveauHaalt, FUNCTIE_INDEX, alsPlatteSet, leegKanaal,
} from '@everts/database/rechten'

/** Eén kanaal na samenvoegen van afdeling en persoon, plus de beheerdersvlag. */
export type KanaalSet = KanaalRechten & { beheerder: boolean }

/** Beide kanalen naast elkaar, plus welk kanaal dit verzoek is. */
export type RechtenBundel = {
  verzoekKanaal: Kanaal
  desktop: KanaalSet
  mobiel: KanaalSet
  beheerder: boolean
}

/**
 * Welk kanaal een guard moet gebruiken.
 *  - 'desktop' / 'mobiel' → dat kanaal, ongeacht het verzoek
 *  - 'verzoek'            → het kanaal waar het verzoek vandaan komt
 *  - 'beide'              → de ruimste van de twee
 */
export type KanaalKeuze = Kanaal | 'verzoek' | 'beide'

/**
 * Onderdelen waarvoor de toegang nu daadwerkelijk wordt afgedwongen
 * (sidebar verbergen + route-guard). Uitrollen = key toevoegen.
 */
export const AFGEDWONGEN_MODULES: RechtenModule[] = [
  'management', 'mijn_taken', 'wagenpark', 'materieelbeheer', 'taken', 'formulieren', 'toolbox',
  'objectenbeheer',
  // Klantportaal is nieuw en meteen afgedwongen: er is geen bestaande gebruiker
  // die er toegang toe had, dus niemand raakt iets kwijt. Wie bepaalt wat een
  // opdrachtgever te zien krijgt, is een bewuste keuze — geen standaardrecht.
  'klantportaal',
  // Inkoopfacturen is nieuw en meteen afgedwongen, om dezelfde reden als het klantportaal:
  // niemand raakt iets kwijt dat hij vandaag al had. De afdelingsrechten zijn geseed
  // (20260908i), dus Directie, Projectbureau en Ondersteunend houden hun menu-item; wie het
  // recht niet heeft ziet het menu niet in plaats van erop te klikken en een fout te krijgen.
  'inkoopfacturen',
  // Het medewerkershandboek is nieuw en meteen afgedwongen: niemand raakt iets
  // kwijt. LET OP dat dit alleen over het BEHEER gaat — de mobiele leesschermen
  // controleren dit recht bewust niet, want dan zou geen enkele monteur het
  // handboek nog kunnen openen. Zie lib/handboek/auth.ts.
  'medewerkershandboek',
  // Mailintake is nieuw: niemand had er toegang toe, dus niemand raakt iets kwijt.
  'mailintake',
]

/** Is dit de nieuwe kanaalvorm of de oude platte set? */
function isKanaalSet(r: RechtenSet | KanaalSet): r is KanaalSet {
  return 'modules' in r
}

/** Een 'instellingen = beheren'-gebruiker is beheerder en ziet/opent alles. */
export function isBeheerder(r: RechtenSet | KanaalSet | RechtenBundel): boolean {
  if ('beheerder' in r) return r.beheerder
  if (isKanaalSet(r)) return r.modules.instellingen === 'beheren'
  return r.instellingen === 'beheren'
}

/** Heeft de gebruiker minimaal `min`-niveau op `module`? */
export function heeftModuleToegang(
  rechten: RechtenSet | KanaalSet,
  module: RechtenModule,
  min: ModuleRechten = 'lezen',
): boolean {
  if (isBeheerder(rechten)) return true
  const niveau = isKanaalSet(rechten) ? rechten.modules[module] : rechten[module]
  return niveauHaalt(niveau, min)
}

/**
 * Heeft de gebruiker deze functie?
 *
 * Een expliciete `false` wint van álles — van `inbegrepenVanaf` én van de
 * beheerdersvlag. Anders zou je een functie niet bij één persoon kunnen
 * weghalen, en zou `instellingen.rechten_beheren` betekenisloos zijn: het
 * bestaat juist om iemand instellingenbeheer te geven zónder dat hij zichzelf
 * rechten kan toekennen.
 *
 * Gevolg: een beheerder die deze functie bij zichzelf op `false` zet, kan dat
 * niet meer terugdraaien. Het beheerscherm hoort dat te blokkeren.
 */
export function heeftFunctie(rechten: KanaalSet, functie: FunctieKey): boolean {
  const expliciet = rechten.functies[functie]
  if (typeof expliciet === 'boolean') return expliciet
  if (rechten.beheerder) return true
  const def = FUNCTIE_INDEX[functie]
  if (!def?.inbegrepenVanaf) return false
  return niveauHaalt(rechten.modules[def.module], def.inbegrepenVanaf)
}

/**
 * Mag dit onderdeel getoond worden? Onderdelen zonder module of die (nog) niet
 * worden afgedwongen, zijn altijd zichtbaar — alleen `AFGEDWONGEN_MODULES`
 * wordt op rechten gecontroleerd.
 */
export function magOnderdeelZien(
  rechten: RechtenSet | KanaalSet,
  module: RechtenModule | undefined,
  min: ModuleRechten = 'lezen',
): boolean {
  if (!module) return true
  if (!AFGEDWONGEN_MODULES.includes(module)) return true
  return heeftModuleToegang(rechten, module, min)
}

/** De ruimste van twee kanalen: hoogste niveau per module, `or` per functie. */
function ruimste(a: KanaalSet, b: KanaalSet): KanaalSet {
  const modules = { ...a.modules }
  for (const [k, v] of Object.entries(b.modules)) {
    const sleutel = k as RechtenModule
    const huidig = modules[sleutel]
    // Een niveau wint van `null` en van afwezig; tussen twee niveaus wint de hoogste.
    if (!huidig || (v && niveauHaalt(v, huidig))) modules[sleutel] = v
  }
  const functies = { ...a.functies }
  for (const [k, v] of Object.entries(b.functies)) {
    if (v) functies[k as FunctieKey] = true
    else if (functies[k as FunctieKey] === undefined) functies[k as FunctieKey] = false
  }
  return { modules, functies, beheerder: a.beheerder || b.beheerder }
}

/** Pak het gevraagde kanaal uit de bundel. */
export function kiesKanaal(bundel: RechtenBundel, keuze: KanaalKeuze = 'verzoek'): KanaalSet {
  if (keuze === 'beide') return ruimste(bundel.desktop, bundel.mobiel)
  const kanaal = keuze === 'verzoek' ? bundel.verzoekKanaal : keuze
  return bundel[kanaal]
}

/** Platte v1-vorm, voor de aanroepers die nog een `RechtenSet` verwachten. */
export function alsRechtenSet(k: KanaalSet): RechtenSet {
  return alsPlatteSet(k)
}

/** Een kanaalset zonder enig recht. */
export function leegKanaalSet(): KanaalSet {
  return { ...leegKanaal(), beheerder: false }
}
