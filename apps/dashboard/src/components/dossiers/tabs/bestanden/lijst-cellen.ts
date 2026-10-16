/**
 * Gedeelde maatvoering van de bestandenlijst: de kop, de bestandsregels en de
 * mapregels moeten op de pixel gelijk lopen, anders verspringen de kolommen.
 */

// Compacte cel- en kopklassen — de kolommen staan bewust dicht op elkaar.
// De naamcel krijgt CEL_BASIS zonder `whitespace-nowrap`: een `whitespace-normal` erachter
// plakken werkt níét — in de gegenereerde CSS staat nowrap later en wint. Daardoor
// braken lange bestandsnamen nooit af en liep de tabel buiten de kaart.
export const CEL_BASIS = 'px-1.5 py-[3px] align-middle'
export const CEL = `${CEL_BASIS} whitespace-nowrap`
export const BREED = 'hidden 2xl:table-cell'
export const KOP = 'px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-400 whitespace-nowrap'

/**
 * Inspringing per mapniveau, en de ruimte van het uitklappijltje (12px pijl + 4px
 * tussenruimte). Bestanden krijgen die ruimte ook, zodat hun naam precies onder de
 * naam van de map erboven begint.
 */
export const INSPRING_PX = 20
export const PIJL_PX = 16

/** Het aantal kolommen naast de vinkjes; de mapregels vullen er evenveel. */
export const AANTAL_KOLOMMEN = 6
