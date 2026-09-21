/**
 * Toets op de zeef die mailopmaak van projectstukken scheidt.
 *
 * Draaien: npx tsx scratch/toets-bijlagen-filter.ts
 *
 * De twee fouten zijn niet even erg en de toets is daar bewust op gericht. Een
 * logo in de dossiermap is hinderlijk; een weggegooid bestek is een gemist stuk
 * waar niemand meer naar zoekt. Bij twijfel gaat een bestand dus mee.
 */

import { beoordeelBijlage, splitsBijlagen } from '../apps/dashboard/src/lib/mailintake/bijlagen-filter'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` -- ${detail}`}`)
}

const b = (
  bestandsnaam: string,
  contentType: string | null,
  grootteBytes: number | null = 500_000,
  isInline = false,
) => ({ bestandsnaam, contentType, grootteBytes, isInline })

console.log('\n-- Projectstukken gaan altijd mee -----------------------------')
for (const [naam, type] of [
  ['Bestek gevelrenovatie.pdf', 'application/pdf'],
  ['Werkschema 2026.pdf', 'application/pdf'],
  ['Technisch advies Sikkens.pdf', 'application/pdf'],
  ['Plattegrond begane grond.pdf', 'application/pdf'],
  ['Opdrachtbon 8266-142988-1.pdf', 'application/pdf'],
  ['Meetstaat.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['Tekening 01.dwg', 'application/acad'],
] as [string, string][]) {
  toets(naam, beoordeelBijlage(b(naam, type)).mee)
}

console.log('\n-- Foto van het werk gaat mee ---------------------------------')
toets('gevelfoto van 800 kB', beoordeelBijlage(b('IMG_4821.jpg', 'image/jpeg', 800_000)).mee)
toets('schade-foto met nette naam', beoordeelBijlage(b('schade kozijn.png', 'image/png', 300_000)).mee)

console.log('\n-- Mailopmaak gaat er niet in ---------------------------------')
const weg = (naam: string, type: string, grootte = 8_000, inline = false) => {
  const o = beoordeelBijlage(b(naam, type, grootte, inline))
  toets(naam, !o.mee, 'werd meegenomen')
  return o
}
weg('logo.png', 'image/png')
weg('handtekening.jpg', 'image/jpeg')
weg('linkedin-icon.png', 'image/png')
weg('beeldmerk-everts.png', 'image/png')
weg('image001.png', 'image/png')
weg('att0001.jpg', 'image/jpeg')
weg('winmail.dat', 'application/octet-stream')
weg('foto.jpg', 'image/jpeg', 4_000)          // te klein voor een echte foto
weg('banner.png', 'image/png', 900_000)        // naam wint van grootte

console.log('\n-- Inline beeld hoort bij de tekst ----------------------------')
toets('inline afbeelding', !beoordeelBijlage(b('sfeer.jpg', 'image/jpeg', 900_000, true)).mee)

console.log('\n-- Bij twijfel gaat het mee -----------------------------------')
// Een PDF met "logo" in de naam is zeldzaam, maar wegfilteren zou betekenen dat je
// op een woord in een bestandsnaam een document weggooit dat niemand meer terugziet.
toets('PDF met "logo" in de naam gaat toch mee',
  beoordeelBijlage(b('Logoboek huisstijl gevelletters.pdf', 'application/pdf')).mee)
toets('onbekend bestandstype gaat mee',
  beoordeelBijlage(b('bijlage.zip', 'application/zip')).mee)
toets('grote afbeelding zonder verdachte naam gaat mee',
  beoordeelBijlage(b('DSC_0099.JPG', 'image/jpeg', 2_400_000)).mee)
toets('afbeelding zonder bekende grootte gaat mee',
  beoordeelBijlage(b('situatie.png', 'image/png', null)).mee)

console.log('\n-- Splitsen levert een reden per uitsluiting ------------------')
const uit = splitsBijlagen([
  b('Bestek.pdf', 'application/pdf'),
  b('logo.png', 'image/png', 6_000),
  b('IMG_2211.jpg', 'image/jpeg', 1_100_000),
])
toets('twee gaan mee', uit.mee.length === 2, String(uit.mee.length))
toets('één wordt uitgesloten', uit.uitgesloten.length === 1)
toets('met een leesbare reden',
  (uit.uitgesloten[0]?.reden ?? '').length > 5, uit.uitgesloten[0]?.reden ?? '')

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
