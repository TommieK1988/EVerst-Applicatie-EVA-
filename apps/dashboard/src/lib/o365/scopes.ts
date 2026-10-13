/**
 * o365/scopes.ts
 *
 * De gedelegeerde Graph-rechten die EVA bij het koppelen vraagt. Alleen wat de app
 * gebruikt én wat in de app-registratie met admin consent verleend is: vraag je meer,
 * dan krijgt de medewerker een toestemmingsscherm dat hij in deze tenant niet mag
 * goedkeuren, en blokkeert de hele koppeling (ook het mailen van offertes).
 *
 * - User.Read       naam en mailadres bij het koppelen (/me)
 * - Mail.Send       offertes en dossiermails versturen
 * - Tasks.ReadWrite Microsoft To Do → Mijn acties. Pas vragen als `O365_TODO_ACTIEF=1`:
 *                   die zet je ná de admin consent in Azure (azure-api-machtigingen-eva.md).
 *
 * Mail.Read (voor het .eml-archief) blijft bewust weg; niet goedgekeurd.
 */

/** Staat de To Do-koppeling aan? Zie de toelichting bovenaan. */
export function todoActief(): boolean {
  return process.env.O365_TODO_ACTIEF === '1'
}

export function o365Scopes(): string[] {
  return ['offline_access', 'User.Read', 'Mail.Send', ...(todoActief() ? ['Tasks.ReadWrite'] : [])]
}

export function heeftTodoScope(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).some(s => s.toLowerCase() === 'tasks.readwrite')
}
