/**
 * PostgREST-filter voor `werkbegroting_bestellingen`: laat ingetrokken bestellingen weg.
 *
 * Intrekken zet een bestelling terug op concept en laat de rij staan (de regels zijn daarna
 * weer bestelbaar), met `ingetrokken_op` gevuld. Een plek die "wie is er besteld of opgedragen?"
 * laat zien, moet zo'n rij dus overslaan — anders blijft een ingetrokken onderaannemer als
 * opgedragen partij staan. Wordt de bestelling opnieuw aangemaakt, dan krijgt hij weer een
 * `bouw7_contract_id` en telt hij weer mee.
 *
 * Gebruik: `.or(NIET_INGETROKKEN)`.
 */
export const NIET_INGETROKKEN = 'ingetrokken_op.is.null,bouw7_contract_id.not.is.null'
