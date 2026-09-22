import { redirect } from 'next/navigation'

/**
 * Een servicedeskbon opent op de tab Bon, niet op Informatie.
 *
 * Informatie is sinds september 2026 een *deel* van Bon (zie servicedesk-tabs.ts). Een
 * omleiding naar `/informatie` zou via `redirectOudeTab` alsnog op Bon uitkomen, maar dan
 * met twee sprongen bij elke keer dat iemand een bon opent.
 */
export default async function ServicedeskRootPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  redirect(`/servicedesk/${params.id}/bon`)
}
