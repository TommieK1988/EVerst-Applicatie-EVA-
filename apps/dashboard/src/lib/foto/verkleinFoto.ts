/**
 * Verkleint een foto in de browser vóórdat hij naar een server-action gaat. Gebruikt door zowel
 * de mobiele oplever-flow als de dossiertabs op de desktop.
 *
 * Waarom dit moet: server-actions in Next 15 hebben een body-limiet (standaard 1 MB, hier
 * verhoogd naar 8 MB in next.config.js). Een moderne telefooncamera levert 3–5 MB per foto, dus
 * zonder deze stap loopt de upload tegen de limiet aan — en dat komt terug als een kale,
 * onverklaarbare fout midden op een dak. Bijkomend voordeel: 300 kB gaat over 4G nu eenmaal een
 * stuk sneller dan 4 MB, en dat scheelt op locatie echt.
 *
 * Bewust fail-soft: lukt het verkleinen niet (onbekend formaat, HEIC zonder decoder, canvas
 * geblokkeerd), dan gaat het originele bestand alsnog de deur uit. Een iets te grote foto is
 * altijd beter dan géén foto — de 8 MB-limiet vangt dat af.
 */

/** Langste zijde na verkleinen. 1600px is ruim genoeg voor een A4-rapport op 150 dpi. */
const MAX_ZIJDE = 1600
/** JPEG-kwaliteit. 0.8 is het punt waarop artefacten op schadefoto's nog niet opvallen. */
const KWALITEIT = 0.8

/** Foto's kleiner dan dit laten we ongemoeid — verkleinen levert dan niets op. */
const OVERSLAAN_ONDER_BYTES = 400 * 1024

export async function verkleinFoto(file: File): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  if (file.size <= OVERSLAAN_ONDER_BYTES) return file

  try {
    // `imageOrientation: 'from-image'` past de EXIF-rotatie toe. Zonder dat staan foto's van een
    // telefoon die je liggend hield op hun kant — het canvas negeert EXIF namelijk.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

    const schaal = Math.min(1, MAX_ZIJDE / Math.max(bitmap.width, bitmap.height))
    const breedte = Math.round(bitmap.width * schaal)
    const hoogte = Math.round(bitmap.height * schaal)

    const canvas = document.createElement('canvas')
    canvas.width = breedte
    canvas.height = hoogte
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }

    // Witte ondergrond: een PNG met transparantie wordt anders zwart in JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, breedte, hoogte)
    ctx.drawImage(bitmap, 0, 0, breedte, hoogte)
    bitmap.close()

    const blob = await new Promise<Blob | null>(res =>
      canvas.toBlob(res, 'image/jpeg', KWALITEIT),
    )
    if (!blob) return file
    // Een verkleinde versie die groter uitvalt dan het origineel is nutteloos (komt voor bij
    // al sterk gecomprimeerde bronbestanden).
    if (blob.size >= file.size) return file

    const naam = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${naam}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
