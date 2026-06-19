/**
 * Supabase Edge Function: bouw7-sync-middag
 *
 * Middag-run van de volledige Bouw7-sync — 12:45 NL (zie supabase/config.toml).
 * Roept de beveiligde cron-endpoint van EVA (apps/dashboard) aan, die
 * runFullSync() + syncManagementProjecten() uitvoert.
 *
 * Benodigde Supabase secrets (supabase secrets set):
 *   EVA_URL       — publieke URL van EVA/dashboard, bijv. https://eva.everts.nl
 *   CRON_SECRET   — zelfde waarde als CRON_SECRET in de dashboard-omgeving
 */
Deno.serve(async (_req) => {
  const appUrl = Deno.env.get('EVA_URL')
  const cronSecret = Deno.env.get('CRON_SECRET')

  if (!appUrl || !cronSecret) {
    const msg = 'EVA_URL en/of CRON_SECRET ontbreken als Supabase secret.'
    console.error('[bouw7-sync-middag]', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Middagrun = incrementeel (alleen gewijzigde records → snel).
  const url = `${appUrl}/api/cron/bouw7-sync?mode=incremental`
  console.log('[bouw7-sync-middag] Start incrementele sync via', url)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    })

    const data = await res.json()

    if (res.ok) {
      console.log(`[bouw7-sync-middag] Geslaagd — duur: ${data.duur_ms ?? '?'}ms`)
    } else {
      console.error('[bouw7-sync-middag] App meldde fout:', data)
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bouw7-sync-middag] Netwerkfout:', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
