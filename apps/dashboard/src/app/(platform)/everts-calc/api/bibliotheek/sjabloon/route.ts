import { NextResponse } from 'next/server'

export async function GET() {
  const XLSX = await import('xlsx')

  // Eén tabblad met Type-kolom: A = Arbeid, M = Materiaal, OA = Onderaanneming
  // Arbeid-rij:       Type | Code | Omschrijving | Code 2 | Categorie | Eenheid | Norm (min/eenh) | Tarief (€/uur) | (mat. kolommen leeg)
  // Materiaal-rij:    Type | Code | (leeg)       | (leeg) | (leeg)    | (leeg)  | (leeg)          | (leeg)         | Mat. omschrijving | Mat. eenheid | Inzet per eenh | Prijs per eenh (€)
  // Onderaanneming:   Type | Code | Omschrijving | (leeg) | (leeg)    | (leeg)  | (leeg)          | (leeg)         | (leeg)            | (leeg)       | (leeg)         | Prijs per eenh (€)
  const data = [
    ['Type', 'Code', 'Omschrijving', 'Code 2', 'Categorie', 'Eenheid', 'Norm (min/eenh)', 'Tarief (€/uur)', 'Mat. omschrijving', 'Mat. eenheid', 'Inzet per eenh', 'Prijs per eenh (€)'],
    ['A',  'SCH-001', 'Schilderen 1 laag dekkend',  'SCH', 'Schilderwerk', 'm²', '18', '58', '', '', '', ''],
    ['M',  'SCH-001', '', '', '', '', '', '', 'Alkydverf dekkend', 'ltr', '0.12', '8.50'],
    ['A',  'SCH-002', 'Schilderen 2 lagen dekkend', 'SCH', 'Schilderwerk', 'm²', '30', '58', '', '', '', ''],
    ['M',  'SCH-002', '', '', '', '', '', '', 'Alkydverf dekkend', 'ltr', '0.24', '8.50'],
    ['M',  'SCH-002', '', '', '', '', '', '', 'Grondverf',         'ltr', '0.10', '6.75'],
    ['OA', 'SCH-003', 'Spuitwerk door derden',       '',    '',            '',    '',    '',   '', '', '', '12.50'],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  ws['!cols'] = [
    { wch: 6  }, // Type
    { wch: 12 }, // Code
    { wch: 36 }, // Omschrijving
    { wch: 10 }, // Code 2
    { wch: 16 }, // Categorie
    { wch: 10 }, // Eenheid
    { wch: 18 }, // Norm
    { wch: 16 }, // Tarief
    { wch: 28 }, // Mat. omschrijving
    { wch: 14 }, // Mat. eenheid
    { wch: 16 }, // Inzet per eenh
    { wch: 18 }, // Prijs per eenh
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Normen')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="import-sjabloon.xlsx"',
    },
  })
}
