/**
 * Veilige formule-evaluator voor schilderwerk meetstaat
 *
 * Variabelen: B (breedte), H (hoogte), L (lengte)
 * Operators:  + - * / ( )
 *
 * Voorbeeld: '2*B + 2*H'  →  2×breedte + 2×hoogte  (omtrek kozijn)
 */

/** Vervang variabelen en evalueer de expressie veilig */
export function evalueerFormule(formule: string, B = 0, H = 0, L = 0): number {
  if (!formule?.trim()) return 0
  try {
    // Vervang variabelen (case-insensitive, hele woorden)
    const expr = formule
      .replace(/\bB\b/gi, String(B))
      .replace(/\bH\b/gi, String(H))
      .replace(/\bL\b/gi, String(L))

    // Sta alleen toe: cijfers, decimalen, operators, haakjes, spaties
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return 0

    // Evalueer via nieuwe Function (sandbox: geen globale variabelen bereikbaar)
    const resultaat = new Function(`"use strict"; return (${expr})`)() as number
    return isFinite(resultaat) ? +resultaat.toFixed(6) : 0
  } catch {
    return 0
  }
}

/** Valideer of de formule syntactisch correct is */
export function valideerFormule(formule: string): { geldig: boolean; fout?: string } {
  if (!formule?.trim()) return { geldig: false, fout: 'Formule is leeg' }

  // Controleer op ongeldige tekens (voor substitutie)
  const metVars = formule.replace(/\b[BHL]\b/gi, '1')
  if (!/^[\d+\-*/().\s]+$/.test(metVars)) {
    return { geldig: false, fout: 'Ongeldige tekens. Gebruik: B, H, L, +, -, *, /, ( )' }
  }

  // Probeer evaluatie met testwaarden
  try {
    const resultaat = evalueerFormule(formule, 1, 1, 1)
    if (!isFinite(resultaat)) return { geldig: false, fout: 'Formule geeft geen geldig getal' }
    return { geldig: true }
  } catch {
    return { geldig: false, fout: 'Fout in formule' }
  }
}

/** Geeft een leesbare preview van de formule */
export function formuleTekst(formule: string): string {
  return formule
    .replace(/\bB\b/gi, 'Breedte')
    .replace(/\bH\b/gi, 'Hoogte')
    .replace(/\bL\b/gi, 'Lengte')
    .replace(/\*/g, '×')
}
