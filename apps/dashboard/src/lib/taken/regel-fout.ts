/**
 * Een taakregel die de gebruiker tegenhoudt ("wordt automatisch afgerond zodra…", "geblokkeerd
 * door…"). Geen incident maar uitleg: `updateTaakStatus` geeft hem terug als `{ ok: false }`
 * in plaats van te gooien. Een gegooide fout uit een server action komt in productie zonder
 * tekst bij de gebruiker aan ("An error occurred in the Server Components render") en belandde
 * bovendien in het foutenlog.
 *
 * In een eigen bestand: een `'use server'`-module mag geen klasse exporteren.
 */
export class TaakRegelFout extends Error {
  constructor(melding: string) {
    super(melding)
    this.name = 'TaakRegelFout'
  }
}
