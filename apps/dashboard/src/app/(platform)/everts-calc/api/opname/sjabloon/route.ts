import { NextResponse } from 'next/server'

/**
 * Sjabloon voor het aanleveren van een opnameprijslijst.
 *
 * Corporaties leveren hun mutatieprijslijst als spreadsheet aan, in elk denkbaar formaat. Dit
 * sjabloon is het formaat waarin wij hem terugvragen; de voorbeeldregels laten meteen de drie
 * praktijkgevallen zien die het model kent (vaste prijs, vaste prijs mét kostprijs, en recept).
 */
export async function GET() {
  const XLSX = await import('xlsx')

  const kolomNamen = [
    'Code', 'Hoofdgroep', 'Subgroep', 'Omschrijving', 'Eenheid',
    'Prijssoort', 'Verkoopprijs', 'Kostprijs', 'Uren p.e.', 'Receptcode',
    'Opslag %', 'BTW %', 'Kostengroep', 'Foto verplicht', 'Toelichting verplicht',
    'Standaard aantal', 'Stap', 'Actief',
  ]

  const data = [
    kolomNamen,
    // Vaste prijs, geen onderbouwing: kostprijs wordt afgeleid uit de standaardopslag van de lijst.
    ['MUT-101', 'Schilderwerk', 'Binnen', 'Binnendeur schilderen, 2 lagen', 'st', 'V', 78.50, '', '', '', '', 21, 'Schilderwerk', 'nee', 'nee', 1, 1, 'ja'],
    // Vaste prijs mét kostprijs en uren: marge én uren kloppen in de calculatie.
    ['MUT-102', 'Schilderwerk', 'Binnen', 'Wand sausen per m²', 'm²', 'V', 9.25, 6.10, 0.09, '', '', 21, 'Schilderwerk', 'nee', 'nee', 1, 0.5, 'ja'],
    // Recept: prijs volgt uit de normen van het gekoppelde recept plus opslag.
    ['MUT-201', 'Houtrot', '', 'Houtrotherstel epoxy klein', 'st', 'R', '', '', '', 'HR-C1-01', 30, 21, 'Timmerwerk', 'ja', 'nee', 1, 1, 'ja'],
    ['MUT-301', 'Sanitair', '', 'Toiletpot vervangen', 'st', 'V', 245.00, 168.00, 2.5, '', '', 21, 'Installatie', 'ja', 'ja', 1, 1, 'ja'],
    ['MUT-401', 'Sloop & afvoer', '', 'Afvoeren restafval per m³', 'm³', 'V', 62.00, '', '', '', '', 21, 'Overig', 'nee', 'nee', 1, 0.5, 'ja'],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  ws['!cols'] = [
    { wch: 12 }, // Code
    { wch: 16 }, // Hoofdgroep
    { wch: 14 }, // Subgroep
    { wch: 40 }, // Omschrijving
    { wch: 9 },  // Eenheid
    { wch: 11 }, // Prijssoort
    { wch: 13 }, // Verkoopprijs
    { wch: 11 }, // Kostprijs
    { wch: 10 }, // Uren p.e.
    { wch: 13 }, // Receptcode
    { wch: 10 }, // Opslag %
    { wch: 8 },  // BTW %
    { wch: 15 }, // Kostengroep
    { wch: 14 }, // Foto verplicht
    { wch: 20 }, // Toelichting verplicht
    { wch: 16 }, // Standaard aantal
    { wch: 8 },  // Stap
    { wch: 8 },  // Actief
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Onderdelen')

  // Tweede blad met de spelregels: die vragen komen anders per mail terug.
  const uitleg = [
    ['Kolom', 'Uitleg'],
    ['Code', 'Uniek binnen deze prijslijst. Bestaat de code al, dan wordt die regel bijgewerkt.'],
    ['Prijssoort', "V = vaste afgesproken prijs (Verkoopprijs verplicht). R = recept (Receptcode verplicht)."],
    ['Verkoopprijs', 'De met de opdrachtgever afgesproken prijs per eenheid, exclusief BTW.'],
    ['Kostprijs', 'Optioneel. Vul in als je de marge per onderdeel wilt zien kloppen in de calculatie.'],
    ['Uren p.e.', 'Optioneel. Zorgt dat de werkbegroting en de planning echte uren krijgen.'],
    ['Receptcode', 'De item_code van een recept uit de calculatiebibliotheek. Onbekende code = fout, geen stille overslag.'],
    ['Opslag %', 'Alleen bij Prijssoort R. Leeg = de standaardopslag van de prijslijst.'],
    ['Foto verplicht', 'ja/nee. Blokkeert het AFRONDEN van de opname, niet het toevoegen van de regel.'],
    ['Toelichting verplicht', 'ja/nee. Idem.'],
    ['Stap', 'Met hoeveel de plus- en minknop op de telefoon opschuiven. Bijv. 0,5 bij m².'],
  ]
  const wsUitleg = XLSX.utils.aoa_to_sheet(uitleg)
  wsUitleg['!cols'] = [{ wch: 22 }, { wch: 95 }]
  XLSX.utils.book_append_sheet(wb, wsUitleg, 'Uitleg')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="opname-prijslijst-sjabloon.xlsx"',
    },
  })
}
