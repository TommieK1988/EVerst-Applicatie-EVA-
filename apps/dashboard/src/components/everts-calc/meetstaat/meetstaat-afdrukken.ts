import toast from 'react-hot-toast'
import type { Groep, Meetstaat } from '@/lib/everts-calc/types'
import { getMeetregels } from '@/lib/everts-calc/local-store'
import { bouwMeetstaatAfdruk } from '@/lib/everts-calc/meetstaat-afdruk'

/**
 * Opent de hele meetstaat als PDF in een nieuw tabblad; printen gebeurt daar, in
 * de PDF-weergave van de browser. Waarom een PDF: zie lib/everts-calc/meetstaat-pdf.ts.
 *
 * Moet rechtstreeks vanuit de klik worden aangeroepen: het tabblad gaat synchroon
 * open, vóór het laden van de PDF-code. Een `window.open` ná een `await` ziet
 * Safari als pop-up en blokkeert hem. Lukt openen niet, dan wordt het bestand
 * gedownload.
 */
export function openMeetstaatPdf({ meetstaat, groepen, projectNaam, projectNummer }: {
  meetstaat: Meetstaat
  groepen: Groep[]
  projectNaam?: string
  projectNummer?: string
}): void {
  const tabblad = window.open('', '_blank')
  // De regels nú lezen, zodat de PDF toont wat er op dit moment in beeld staat.
  const afdruk = bouwMeetstaatAfdruk(getMeetregels(meetstaat.id), groepen)

  void (async () => {
    try {
      const { bouwMeetstaatPdf, meetstaatPdfBestandsnaam } = await import('@/lib/everts-calc/meetstaat-pdf')
      const pdf = bouwMeetstaatPdf({ meetstaat, afdruk, projectNaam, projectNummer })
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
      if (tabblad && !tabblad.closed) {
        tabblad.location.href = url
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = meetstaatPdfBestandsnaam(meetstaat)
        a.click()
      }
      // Ruim op als het tabblad hem allang geladen heeft; niet meteen, want dan
      // kan de PDF-weergave hem nog niet gelezen hebben.
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000)
    } catch {
      tabblad?.close()
      toast.error('Afdruk van de meetstaat maken mislukt')
    }
  })()
}
