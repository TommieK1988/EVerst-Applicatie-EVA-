/** Link naar een taak in Microsoft To Do op het web. Los bestand: ook client-side bruikbaar. */
export function todoWebUrl(todoTaakId: string): string {
  return `https://to-do.office.com/tasks/id/${encodeURIComponent(todoTaakId)}/details`
}
