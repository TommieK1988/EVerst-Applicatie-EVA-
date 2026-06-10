import { NextResponse } from 'next/server'

export async function GET() {
  const XLSX = await import('xlsx')

  // Kolomnamen identiek aan wat importeerSchilderwerkExcel verwacht
  // Norm type: A = Arbeid, M = Materiaal, OA = Onderaanneming
  const data = [
    ['Onderdeel', 'Type', 'Behandeling', 'Eenheid', 'Formule', 'Norm type', 'Omschrijving', 'Min per eenh', 'Tarief', 'Materiaal naam', 'Inzet', 'Eenheid mat', 'Prijs'],
    ['Kozijn', 'Binnendraaiend', 'Grondlaag + 2 lagen dekkend', 'm¹', '2*B+2*H', 'A', 'Schilder arbeid kozijn', 18, 58, '', '', '', ''],
    ['Kozijn', 'Binnendraaiend', 'Grondlaag + 2 lagen dekkend', 'm¹', '2*B+2*H', 'M', '', '', '', 'Alkydverf dekkend', 0.12, 'ltr', 8.50],
    ['Kozijn', 'Binnendraaiend', 'Grondlaag + 2 lagen dekkend', 'm¹', '2*B+2*H', 'M', '', '', '', 'Grondverf', 0.08, 'ltr', 6.75],
    ['Kozijn', 'Vast raam', '1 laag lak', 'm²', '', 'A', 'Lak kozijn vast raam', 25, 58, '', '', '', ''],
    ['Kozijn', 'Vast raam', '1 laag lak', 'm²', '', 'M', '', '', '', 'Zijdeglans lak', 0.10, 'ltr', 9.50],
    ['Deur', 'Binnendeur', '2 lagen dekkend', 'st', '', 'A', 'Schilder binnendeur', 60, 58, '', '', '', ''],
    ['Deur', 'Binnendeur', '2 lagen dekkend', 'st', '', 'M', '', '', '', 'Alkydverf dekkend', 0.30, 'ltr', 8.50],
    ['Deur', 'Buitendeur', 'Spuitwerk door derden', 'st', '', 'OA', 'Spuitwerk buitendeur', '', '', '', '', '', 85.00],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  ws['!cols'] = [
    { wch: 14 }, // Onderdeel
    { wch: 18 }, // Type
    { wch: 32 }, // Behandeling
    { wch: 10 }, // Eenheid
    { wch: 12 }, // Formule
    { wch: 12 }, // Norm type
    { wch: 30 }, // Omschrijving
    { wch: 14 }, // Min per eenh
    { wch: 10 }, // Tarief
    { wch: 24 }, // Materiaal naam
    { wch: 8  }, // Inzet
    { wch: 12 }, // Eenheid mat
    { wch: 10 }, // Prijs
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Normen')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="schilder-import-sjabloon.xlsx"',
    },
  })
}
