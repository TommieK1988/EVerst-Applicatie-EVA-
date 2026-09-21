/**
 * De teksten van de twee dialogen rond het aanmaken.
 *
 * Los van het scherm omdat het opstellen van deze teksten een eigen ding is: wat
 * er in de bevestiging staat ís de voorvertoning, en die moet compleet zijn. Een
 * bevestiging die alleen "weet je het zeker?" vraagt, terwijl er tien velden en
 * vier bestanden achter zitten, is geen akkoord maar een obstakel.
 *
 * Geen React hier, alleen tekst — zo is het te lezen zonder het scherm erbij.
 */

export interface Voorstel {
  titel: string
  opdrachtgever: { naam: string | null } | null
  contactpersoon: { naam: string | null } | null
  werkmaatschappij: { naam: string | null } | null
  categorie: { naam: string | null }
  werkadres: string | null
  aanvraagdatum: string | null
  deadline: string | null
}

export interface ProefVoorScherm {
  voorstel: Voorstel
  bestanden: { bestandsnaam: string }[]
  uitgeslotenBestanden: { bestandsnaam: string; reden: string }[]
  openPunten: string[]
}

const regel = (label: string, waarde: string | null | undefined) =>
  `${label}: ${waarde && String(waarde).trim() ? waarde : '—'}`

/** Alles wat er weggeschreven gaat worden, op een rij. */
export function bouwVoorvertoning(proef: ProefVoorScherm): string {
  const v = proef.voorstel
  return [
    regel('Projectnaam', v.titel),
    regel('Opdrachtgever', v.opdrachtgever?.naam),
    regel('Contactpersoon', v.contactpersoon?.naam),
    regel('Werkmaatschappij', v.werkmaatschappij?.naam),
    regel('Categorie', v.categorie.naam),
    regel('Werkadres', v.werkadres),
    regel('Aanvraagdatum', v.aanvraagdatum),
    regel('Uiterste datum', v.deadline),
    'Fase: Aanvraag, substatus Nieuw',
    '',
    proef.bestanden.length
      ? `Naar de dossiermap (${proef.bestanden.length}):\n` +
        proef.bestanden.map(f => `- ${f.bestandsnaam}`).join('\n')
      : 'Er gaan geen bestanden mee.',
    ...(proef.uitgeslotenBestanden.length
      ? ['', 'Bewust overgeslagen:',
         ...proef.uitgeslotenBestanden.map(f => `- ${f.bestandsnaam} (${f.reden})`)]
      : []),
    ...(proef.openPunten.length
      ? ['', 'Let op:', ...proef.openPunten.map(r => `- ${r}`)]
      : []),
  ].join('\n')
}

/**
 * Wat er ná het aanmaken anders bleek te staan.
 *
 * De laatste zin is de belangrijkste: bij een verschil staan de bestanden bewust
 * nog niet in de dossiermap.
 */
export function bouwAfwijkingTekst(
  afwijkingen: { veld: string; verstuurd: string | null; teruggelezen: string | null }[],
  bestandenGeplaatst: boolean,
): string {
  return [
    'Na het aanmaken is het dossier teruggelezen. Deze velden staan anders dan verstuurd:',
    '',
    ...afwijkingen.map(a =>
      `- ${a.veld}: verstuurd "${a.verstuurd ?? '—'}", staat nu "${a.teruggelezen ?? '—'}"`),
    '',
    bestandenGeplaatst
      ? ''
      : 'De bestanden zijn daarom nog niet naar de dossiermap gezet. Controleer het dossier eerst.',
  ].filter(Boolean).join('\n')
}
