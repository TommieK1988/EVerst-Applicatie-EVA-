'use client'

/**
 * Voorbeeldpagina van de kostengoedkeuring op het Uren-overzicht, met verzonnen gegevens.
 *
 * Het echte scherm zit achter een login en hangt van ingediende kosten af. Of een kolom afkapt
 * of de knoppen naast elkaar passen, vangt geen type-check. Deze pagina rendert dezelfde
 * componenten (`KostenTeKeurenKaart`, `IngediendeKosten`) zonder sessie; bereikbaar omdat
 * `middleware.ts` alles onder `/auth/` overslaat.
 *
 * Goed- of afkeuren doet hier niets zinnigs: daarvoor is een sessie nodig. Dit is om naar te
 * kíjken. De mobiele variant staat op `/auth/app-taal-preview?kosten=1`.
 */

import { DialoogProvider } from '@/components/ui/dialogen'
import { IngediendeKosten, KostenTeKeurenKaart } from '@/app/(platform)/uren/KostenOverzicht'
import { VOORBEELD_KOSTEN, VOORBEELD_TE_KEUREN } from './voorbeeld'

export default function KostenPreview() {
  return (
    <DialoogProvider>
      <div className="eva eva-page-full" data-theme="light" style={{ paddingTop: 18, paddingBottom: 28, background: 'var(--bg)', minHeight: '100dvh' }}>
        <h1 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--fg)' }}>
          Uren — kosten (voorbeeld)
        </h1>
        <KostenTeKeurenKaart regels={VOORBEELD_TE_KEUREN} />
        <IngediendeKosten
          onkosten={{ regels: VOORBEELD_KOSTEN, totaal: VOORBEELD_KOSTEN.reduce((s, k) => s + k.bedrag, 0) }}
          layouts={[]}
          user_id={null}
          periodeTekst="1-10-2026 t/m 31-10-2026"
        />
      </div>
    </DialoogProvider>
  )
}
