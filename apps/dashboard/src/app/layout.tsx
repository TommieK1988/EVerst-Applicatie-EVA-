import type { Metadata, Viewport } from 'next'
import { Montserrat, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from '@/components/eva/ServiceWorkerRegister'
import { DialoogProvider } from '@/components/ui/dialogen'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | EVA',
    default: 'EVA — Everts Platform',
  },
  description: 'EVA — het centrale platform van Everts Onderhoud & Renovatie',
  applicationName: 'EVA',
  appleWebApp: {
    capable: true,
    // 'black-translucent' i.p.v. 'default': daarmee loopt de webview door tot
    // achter de statusbalk, zodat de groene AppHeader tot de bovenrand van het
    // scherm doorloopt zoals in een native app. Met 'default' hield iOS een
    // ondoorzichtige witte balk boven de pagina, en begon het groen daaronder.
    //
    // Dit kan alleen omdat elk scherm dat in de geïnstalleerde app kan verschijnen
    // `env(safe-area-inset-top)` in zijn bovenpadding verwerkt: AppHeader (alles
    // onder /m), MobielLogin en wachtwoord-instellen. Zet je een nieuw
    // volledig-scherm zonder AppHeader neer, doe dat dan ook — anders schuift de
    // eerste regel tekst onder de klok.
    statusBarStyle: 'black-translucent',
    title: 'EVA',
  },
  // Alle iconen zijn gerenderd uit /logo-beeldmerk.svg (het echte Everts-
  // beeldmerk: groene tegel met witte E en punt). Voor het tabblad en het
  // iOS-startscherm gebruiken we een doorlopende variant zónder afgeronde
  // hoeken: op 16-32px gaat de afronding verloren, en iOS rondt zelf al af —
  // dubbele afronding geeft anders een lelijke rand.
  //
  // De ?v= is een cache-buster: browsers bewaren favicons hardnekkig, dus zonder
  // die parameter blijven bestaande gebruikers het oude icoon zien. Ophogen
  // zodra de iconen opnieuw wijzigen.
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-16.png?v=2', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png?v=2', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#009439',
  width: 'device-width',
  initialScale: 1,
  // toestaan dat gebruikers inzoomen (toegankelijkheid); geen maximumScale-lock
  viewportFit: 'cover',
}

/**
 * Zet het thema op <html> vóór de eerste paint. Zonder dit rendert de pagina
 * eerst licht en klapt hij pas donker zodra React gehydrateerd is — een witte
 * flits bij elke navigatie. Leest dezelfde localStorage-sleutel als
 * PlatformShell; blijft bewust klein en zonder dependencies.
 */
const THEME_BOOTSTRAP = `(function(){try{
  var t=JSON.parse(localStorage.getItem('eva-tweaks')||'{}').theme;
  if(t&&t!=='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})()`

/**
 * Vangnet voor een JS-chunk die niet laadt (ChunkLoadError), bijvoorbeeld in een tabblad
 * dat openstond terwijl er een nieuwe versie live ging. Zo'n fout bereikt niet altijd
 * een error-boundary — en als de chunk van de boundary zelf ook niet laadt, toont Next
 * de kale "Application error: a client-side exception has occurred". Dit script staat
 * inline in <head>, hangt dus van geen enkele chunk af, en herlaadt de pagina één keer.
 * Zelfde regels en sessionStorage-sleutel als lib/fouten/chunk-herladen.ts.
 *
 * Het meldt daarnaast élke onafgevangen browserfout aan /api/fouten/melden (bron
 * 'browser/onafgevangen'). Zulke fouten bereiken geen error-boundary, en als Next daarna
 * zelf hard herlaadt was de fout nergens meer terug te vinden — ook niet in de console.
 * Hoogstens 5 meldingen per pagina, zodat een fout in een lus het log niet volschrijft.
 */
const CHUNK_HERLAAD_BOOTSTRAP = `(function(){
  var S='eva-chunk-herladen',V=30000,n=0;
  function isChunk(e){if(!e)return false;if(e.name==='ChunkLoadError')return true;
    var m=String(e.message||'');
    return /Loading (CSS )?chunk [\\w-]+ failed/i.test(m)||/Failed to fetch dynamically imported module/i.test(m)||/Importing a module script failed/i.test(m);}
  function meld(melding,type,stack){if(n++>=5)return;try{fetch('/api/fouten/melden',{method:'POST',keepalive:true,
    headers:{'Content-Type':'application/json'},body:JSON.stringify({bron:'browser/onafgevangen',
    melding:String(melding||'Onbekende fout').slice(0,2000),fout_type:type||null,
    stack:stack?String(stack).slice(0,8000):null,url:location.pathname})}).catch(function(){});}catch(x){}}
  function herlaad(){try{var v=+(sessionStorage.getItem(S)||0);if(Date.now()-v<V)return;
    sessionStorage.setItem(S,String(Date.now()));}catch(x){return}location.reload();}
  window.addEventListener('error',function(ev){
    var t=ev.target;
    if(t&&t!==window&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){
      var u=t.src||t.href||'';
      if(/\\/_next\\/static\\//.test(u)){meld('Bestand niet geladen: '+u,'ResourceLoadError',null);herlaad();}
      return;
    }
    var e=ev.error;
    meld(e&&e.message||ev.message,e&&e.name,e&&e.stack);
    if(isChunk(e))herlaad();
  },true);
  window.addEventListener('unhandledrejection',function(ev){
    var r=ev.reason;
    meld(r&&r.message||String(r),r&&r.name,r&&r.stack);
    if(isChunk(r))herlaad();
  });
})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: CHUNK_HERLAAD_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${montserrat.variable} ${jetbrainsMono.variable} font-sans`}>
        {/* EVA-eigen bevestig-/meld-/tekstdialogen i.p.v. de browser-popups
            (window.confirm/alert/prompt). Hier in de root zodat /(platform), /m
            en de publieke routes er alle drie bij kunnen. */}
        <DialoogProvider>{children}</DialoogProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
