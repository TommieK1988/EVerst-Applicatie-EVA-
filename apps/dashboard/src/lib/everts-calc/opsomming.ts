/**
 * Opsommingen in vrije tekst (tekstregels): wie een regel met "- " of "* " begint,
 * krijgt in de offerte een opsommingsteken. Bewust geen volledige Markdown: het
 * Word-sjabloon vult platte tekst met regeleinden, en vet of cursief laat zich daar
 * niet zonder eigen Word-opmaak in kwijt. Een "•" wel.
 */

const OPSOMMING = /^(\s*)[-*]\s+/

/** "- muren\n- plafonds" → "• muren\n• plafonds". Overige regels blijven ongemoeid. */
export function metOpsommingstekens(tekst: string): string {
  if (!tekst) return tekst
  return tekst
    .split('\n')
    .map(regel => regel.replace(OPSOMMING, (_m, inspring: string) => `${inspring}• `))
    .join('\n')
}
