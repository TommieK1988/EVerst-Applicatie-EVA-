/**
 * Supabase Edge Function: daily-sync
 *
 * Wordt dagelijks om 06:00 uitgevoerd (zie supabase/config.toml).
 * Roept de beveiligde cron-endpoint van de wagenpark-app aan,
 * die op zijn beurt syncUluAction() uitvoert.
 *
 * Benodigde Supabase secrets (supabase secrets set):
 *   APP_URL       — publieke URL van de wagenpark-app, bijv. https://wagenpark.everts.nl
 *   CRON_SECRET   — zelfde waarde als CRON_SECRET in de app .env.local
 */
Deno.serve(async (_req) => {
  const appUrl = Deno.env.get('APP_URL')
  const cronSecret = Deno.env.get('CRON_SECRET')

  if (!appUrl || !cronSecret) {
    const msg = 'APP_URL en/of CRON_SECRET ontbreken als Supabase secret.'
    console.error('[daily-sync]', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = `${appUrl}/api/cron/ulu-sync`
  console.log('[daily-sync] Start sync via', url)

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
      console.log(
        `[daily-sync] Geslaagd — ${data.tripsNieuw ?? 0} nieuwe ritten,`,
        `${data.voertuigenGezien ?? 0} voertuigen, duur: ${data.duur_ms ?? '?'}ms`,
      )
    } else {
      console.error('[daily-sync] App meldde fout:', data)
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[daily-sync] Netwerkfout:', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
