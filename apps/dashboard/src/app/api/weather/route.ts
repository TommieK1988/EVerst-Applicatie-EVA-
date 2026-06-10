import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'

export const revalidate = 1800

// WMO weather interpretation codes → emoji
function wmoEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫'
  if (code <= 57) return '🌧'
  if (code <= 67) return '🌧'
  if (code <= 77) return '🌨'
  if (code <= 82) return '🌦'
  return '⛈'
}

function wmoLabel(code: number): string {
  if (code === 0) return 'Helder'
  if (code <= 2) return 'Licht bewolkt'
  if (code === 3) return 'Bewolkt'
  if (code <= 48) return 'Mistig'
  if (code <= 57) return 'Lichte regen'
  if (code <= 67) return 'Regen'
  if (code <= 77) return 'Sneeuw'
  if (code <= 82) return 'Buiig'
  return 'Onweer'
}

const DUTCH_DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function dayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Vandaag';
  if (index === 1) return 'Morgen';
  return DUTCH_DAYS[new Date(isoDate + 'T00:00:00').getDay()];
}

async function getCompanyLocation(): Promise<{ lat: number; lon: number; stad: string }> {
  const FALLBACK = { lat: 52.22, lon: 6.89, stad: 'Enschede' }
  try {
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('bedrijfsgegevens')
      .select('adres_plaats, adres_postcode')
      .limit(1)
      .maybeSingle()

    const zoekterm = data?.adres_plaats || data?.adres_postcode
    if (!zoekterm) return FALLBACK

    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
    geoUrl.searchParams.set('name', zoekterm)
    geoUrl.searchParams.set('count', '1')
    geoUrl.searchParams.set('language', 'nl')
    geoUrl.searchParams.set('countryCode', 'NL')

    const geoRes = await fetch(geoUrl.toString(), { next: { revalidate: 86400 } })
    if (!geoRes.ok) return FALLBACK

    const geo = await geoRes.json()
    const result = geo.results?.[0]
    if (!result) return FALLBACK

    return { lat: result.latitude, lon: result.longitude, stad: result.name }
  } catch {
    return FALLBACK
  }
}

export async function GET() {
  try {
    const { lat, lon, stad } = await getCompanyLocation()

    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('current', 'temperature_2m,weathercode,windspeed_10m,apparent_temperature,winddirection_10m')
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weathercode')
    url.searchParams.set('forecast_days', '7')
    url.searchParams.set('timezone', 'Europe/Amsterdam')
    url.searchParams.set('wind_speed_unit', 'kmh')

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } })
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)

    const raw = await res.json()

    return NextResponse.json({
      stad,
      temp:          Math.round(raw.current.temperature_2m),
      feelsLike:     Math.round(raw.current.apparent_temperature),
      windspeed:     Math.round(raw.current.windspeed_10m),
      winddirection: raw.current.winddirection_10m as number,
      weathercode:   raw.current.weathercode as number,
      emoji:         wmoEmoji(raw.current.weathercode),
      label:         wmoLabel(raw.current.weathercode),
      tempMax:       Math.round(raw.daily.temperature_2m_max[0]),
      tempMin:       Math.round(raw.daily.temperature_2m_min[0]),
      daily: (raw.daily.time as string[]).map((isoDate: string, i: number) => ({
        day:         dayLabel(isoDate, i),
        tempMax:     Math.round((raw.daily.temperature_2m_max as number[])[i]),
        tempMin:     Math.round((raw.daily.temperature_2m_min as number[])[i]),
        weathercode: (raw.daily.weathercode as number[])[i],
        emoji:       wmoEmoji((raw.daily.weathercode as number[])[i]),
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Weersdata niet beschikbaar' }, { status: 502 })
  }
}
