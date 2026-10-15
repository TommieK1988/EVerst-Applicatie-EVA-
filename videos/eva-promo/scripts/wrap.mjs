// Bouwt compositions/frames/NN-*.html uit src/NN-*.html + src/shared.css.
// Een bronbestand bevat: <style>(frame-css met #ID)</style>, markup, en optioneel <script>(gebruikt `tl`)</script>.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const shared = readFileSync('src/shared.css', 'utf8');
for (const f of readdirSync('src').filter((n) => /^\d\d-.*\.html$/.test(n))) {
  const id = 'f' + f.replace('.html', '');
  let src = readFileSync('src/' + f, 'utf8');
  const style = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const script = (src.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1];
  const markup = src.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/, '').trim();
  const css = (shared + '\n' + style).replaceAll('#ID', '#' + id);
  const out = `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
${css}
      </style>
      <div id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080">
${markup}
      </div>
      <script>
        (function () {
          const R = '#${id}';
          const q = (s) => R + ' ' + s;
          const tl = gsap.timeline({ paused: true });
${script}
          window.__timelines["${id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
  writeFileSync('compositions/frames/' + f, out);
  console.log('wrote', f, id);
}
