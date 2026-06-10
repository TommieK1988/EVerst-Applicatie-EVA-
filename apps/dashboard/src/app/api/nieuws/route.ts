import { NextResponse } from 'next/server'

export const revalidate = 1800

interface NewsItem {
  source: string
  title: string
  link: string
  pubDate: string
  tag: string
}

const FEEDS: { url: string; source: string; tag: string }[] = [
  { url: 'https://www.nu.nl/rss/economie',    source: 'NU.nl',       tag: 'Economie' },
  { url: 'https://www.installatie.nl/feed/',  source: 'Installatie', tag: 'Sector'   },
  { url: 'https://www.nu.nl/rss/wonen',       source: 'NU.nl Wonen', tag: 'Wonen'    },
]

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

function parseRSS(xml: string, source: string, tag: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemRx = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1]
    const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? ''
    const rawLink  = /<link[^>]*>([\s\S]*?)<\/link>/.exec(block)?.[1]
                  ?? /<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/.exec(block)?.[1]
                  ?? '#'
    const rawDate  = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/.exec(block)?.[1] ?? ''
    const title = stripCdata(rawTitle).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '')
    if (!title) continue
    items.push({ source, title, link: stripCdata(rawLink).trim(), pubDate: rawDate.trim(), tag })
  }
  return items.slice(0, 6)
}

async function fetchFeed(feed: typeof FEEDS[0]): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    next: { revalidate: 1800 },
    headers: { 'User-Agent': 'EVA-Platform/1.0 (RSS reader; contact tom@everts.chat)' },
  })
  if (!res.ok) return []
  const xml = await res.text()
  return parseRSS(xml, feed.source, feed.tag)
}

export async function GET() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed))

  const seen = new Set<string>()
  const items: NewsItem[] = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0
      return tb - ta
    })
    .filter(item => {
      const key = item.link || item.title
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)

  return NextResponse.json({ items })
}
