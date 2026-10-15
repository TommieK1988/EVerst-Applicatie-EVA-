// Schrijft index.html: monteert elke frame-compositie op zijn startmoment (schetsfase).
import { writeFileSync } from 'node:fs';
const frames = [['01-hook',4],['02-intro',6],['03-postvak',9],['04-dossier',8],['05-calculatie',9],['06-offerte',9],['07-planning',7],['08-mobiel',11],['09-houtrot',9],['10-kwaliteit',8],['11-enquete',9],['12-portaal',7],['13-financieel',9],['14-servicedesk',9],['15-meer',8],['16-outro',6]];
let t = 0; const hosts = [];
for (const [f, d] of frames) {
  hosts.push(`      <div id="f${f}" data-composition-id="f${f}" data-composition-src="compositions/frames/${f}.html" data-start="${t}" data-duration="${d}" data-track-index="1" data-width="1920" data-height="1080"></div>`);
  t += d;
}
writeFileSync('index.html', `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #f8fafa; }
      #main { position: relative; width: 100%; height: 100%; background: #f8fafa; }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${t}" data-width="1920" data-height="1080">
${hosts.join('\n')}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`);
console.log('total', t);
