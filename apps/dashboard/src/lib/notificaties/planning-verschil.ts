/**
 * Twee momentopnamen van een planning vergelijken.
 *
 * Bewust los van `dagsignalen.ts` en zonder `server-only`: dit is de enige echt
 * lastige logica in de dagsignalen en de enige die zonder database te testen is.
 * Zie `planning-verschil.test.ts`.
 *
 * Waarom er überhaupt vergeleken wordt in plaats van naar nieuwe rijen te kijken:
 * de Bouw7-planningsync **herbouwt** alle rijen met bron='bouw7' — weggooien en
 * opnieuw neerzetten. Na een sync is elke rij dus "nieuw", ook als er niets is
 * veranderd. Afgaan op `created_at` of op de id zou daarom elke nacht melden dat
 * je hele planning is gewijzigd.
 */

/** Eén ingepland blok, teruggebracht tot wat een medewerker erover wil horen. */
export type PlanRegel = { dag: string; wat: string }

export function korteDag(dag: string): string {
  return new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

/**
 * Korte, stabiele vingerafdruk van een tekst. Geen `node:crypto`: dit hoeft niet
 * botsingsvrij te zijn tegen een tegenstander, alleen tegen toeval — het is een
 * "is dit nog hetzelfde als vorige keer"-vergelijking, geen beveiliging.
 */
export function afdruk(tekst: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13)
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)).slice(0, 16)
}

/**
 * De sleutel waarop de dagsignalen beslissen of er iets te melden valt.
 *
 * De horizon (`van`) hoort erin: die schuift elke dag op, en zonder hem zou een
 * dag die uit beeld valt niet als verandering tellen terwijl de inhoud van de
 * melding wél anders zou zijn.
 */
export function planningSleutel(van: string, regels: PlanRegel[]): string {
  return `${van}|${afdruk(regels.map(r => `${r.dag}~${r.wat}`).join('|'))}`
}

/** Stabiele volgorde; zonder vaste sortering verschilt de afdruk van twee gelijke planningen. */
export function sorteerPlanning(regels: PlanRegel[]): PlanRegel[] {
  return [...regels].sort((a, b) =>
    a.dag !== b.dag ? a.dag.localeCompare(b.dag) : a.wat.localeCompare(b.wat, 'nl'))
}

/**
 * Welke dagen zijn er bij gekomen, af gegaan of veranderd?
 *
 * Per dag, niet per blok: "woensdag is anders" is wat iemand wil weten, en een
 * blok dat van dinsdag naar woensdag schuift is op beide dagen nieuws.
 */
export function planningVerschil(vorig: PlanRegel[], nieuw: PlanRegel[]): string[] {
  const perDag = (regels: PlanRegel[]) => {
    const kaart = new Map<string, Set<string>>()
    for (const r of regels) {
      const set = kaart.get(r.dag) ?? new Set<string>()
      set.add(r.wat)
      kaart.set(r.dag, set)
    }
    return kaart
  }

  const vorigPerDag = perDag(vorig)
  const nieuwPerDag = perDag(nieuw)
  const dagen = [...new Set([...vorigPerDag.keys(), ...nieuwPerDag.keys()])].sort()
  const regels: string[] = []

  for (const dag of dagen) {
    const oud = vorigPerDag.get(dag) ?? new Set<string>()
    const nu = nieuwPerDag.get(dag) ?? new Set<string>()
    const bij = [...nu].filter(w => !oud.has(w))
    const af = [...oud].filter(w => !nu.has(w))
    if (bij.length === 0 && af.length === 0) continue

    if (nu.size === 0) regels.push(`${korteDag(dag)}: niets meer ingepland`)
    else if (oud.size === 0) regels.push(`${korteDag(dag)}: ${[...nu].join(', ')}`)
    else if (bij.length > 0) regels.push(`${korteDag(dag)}: ${bij.join(', ')}`)
    else regels.push(`${korteDag(dag)}: ${af.join(', ')} vervallen`)
  }
  return regels
}
