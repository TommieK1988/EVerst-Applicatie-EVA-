import { NextResponse } from 'next/server'

export async function GET() {
  const XLSX = await import('xlsx')

  const kolomNamen = ['Leverancier', 'Artikelnummer', 'Omschrijving', 'Materiaalgroep', 'Eenheid', 'Kostprijs', 'Status']

  const data = [
    kolomNamen,
    ['Sikkens',    'ALK-100-5L',  'Alkydverf dekkend wit 5L',       'Verf & lak',           'ltr',  8.50,  'actief'],
    ['Sikkens',    'GRD-50-1L',   'Grondverf universeel 1L',         'Grondverf & primer',   'ltr',  6.75,  'actief'],
    ['Levis',      'PLM-200-1KG', 'Plamuur fijn 1kg',                'Plamuur & kit',        'kg',   4.20,  'actief'],
    ['Techniplast','KIT-300-310', 'Acrylaatkit wit 310ml',           'Plamuur & kit',        'st',   3.50,  'actief'],
    ['Gamma',      'ROL-40',      'Verfroller 40cm polyester',       'Gereedschap',          'st',  12.00,  'actief'],
    ['Tesa',       'TAPE-50',     'Afplaktape 50m',                  'Bescherming & verpakking', 'st', 4.80, 'actief'],
    ['',           '',            'Eigen materiaal zonder leverancier','Overig',             'm²',   0.00,  'inactief'],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  ws['!cols'] = [
    { wch: 18 }, // Leverancier
    { wch: 16 }, // Artikelnummer
    { wch: 36 }, // Omschrijving
    { wch: 22 }, // Materiaalgroep
    { wch: 10 }, // Eenheid
    { wch: 12 }, // Kostprijs
    { wch: 10 }, // Status
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Materialen')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="materialen-sjabloon.xlsx"',
    },
  })
}
