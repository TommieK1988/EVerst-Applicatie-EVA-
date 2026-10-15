// Schrijft index.html: monteert elke frame-compositie op zijn startmoment (schetsfase).
import { writeFileSync, existsSync } from 'node:fs';
import { readFileSync as rf } from 'node:fs';
const frames = JSON.parse(rf('scripts/frames.json','utf8'));
const X = 0.5; // overlap/crossfade tussen scènes
let t = 0; const hosts = []; const fades = []; const voices = [];
for (const [f, d] of frames) {
  hosts.push(`      <div id="f${f}" data-composition-id="f${f}" data-composition-src="compositions/frames/${f}.html" data-start="${t}" data-duration="${d}" data-track-index="${hosts.length % 2 + 1}" data-width="1920" data-height="1080"></div>`);
  const vo = `assets/audio/vo-${f.slice(0, 2)}.wav`;
  if (existsSync(vo)) voices.push(`      <audio id="el-vo-${f.slice(0, 2)}" src="${vo}" data-start="${(t + 0.4).toFixed(2)}" data-duration="${d - 0.4}" data-track-index="11" data-volume="1" data-audio-group="voiceover"></audio>`);
  if (t > 0) fades.push(`      tl.fromTo('#f${f}', { opacity: 0 }, { opacity: 1, duration: ${X}, ease: 'power1.inOut' }, ${t});`);
  t += d - X;
}
t += X;
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
      <audio id="el-bgm" src="assets/audio/muziek.m4a" data-start="0" data-duration="${t}" data-track-index="10" data-volume="${voices.length ? 0.22 : 0.5}"></audio>
${voices.join('\n')}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${fades.join('\n')}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`);
console.log('total', t);
