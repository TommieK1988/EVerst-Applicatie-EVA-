// Voice-over via Google Cloud Text-to-Speech (nl-NL). Leest de sleutel uit GOOGLE_TTS_API_KEY.
//   node scripts/stem.mjs --lijst                 → beschikbare nl-NL-stemmen
//   node scripts/stem.mjs --proef <stem> [...]    → proefzin per stem in assets/audio/proef-<stem>.mp3
//   node scripts/stem.mjs --stem <stem>           → alle regels uit SCRIPT.md → assets/audio/vo-NN.wav
//                                                    + scripts/frames.json bijgewerkt (scène ≥ stem + 1,2 s)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const KEY = process.env.GOOGLE_TTS_API_KEY;
if (!KEY) { console.error('GOOGLE_TTS_API_KEY ontbreekt in de omgeving.'); process.exit(1); }
const API = 'https://texttospeech.googleapis.com/v1';
const args = process.argv.slice(2);
mkdirSync('assets/audio', { recursive: true });

async function synth(text, voice, out, encoding = 'LINEAR16') {
  const r = await fetch(`${API}/text:synthesize?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: 'nl-NL', name: voice }, audioConfig: { audioEncoding: encoding, sampleRateHertz: 44100 } }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text()}`);
  writeFileSync(out, Buffer.from((await r.json()).audioContent, 'base64'));
}
const duur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

if (args[0] === '--lijst') {
  const r = await fetch(`${API}/voices?languageCode=nl-NL&key=${KEY}`);
  const j = await r.json();
  for (const v of j.voices || []) console.log(v.name.padEnd(32), v.ssmlGender);
} else if (args[0] === '--proef') {
  const zin = 'Elke klus begint met een mail. Met EVA doe je de rest in één systeem — op kantoor, én op de bouwplaats.';
  for (const v of args.slice(1)) { await synth(zin, v, `assets/audio/proef-${v}.mp3`, 'MP3'); console.log('proef', v); }
} else if (args[0] === '--stem') {
  const voice = args[1];
  const regels = [...readFileSync('SCRIPT.md', 'utf8').matchAll(/^## Line (\d+)[^\n]*\n[\s\S]*?\n {4}(.+)$/gm)].map((m) => [+m[1], m[2].trim()]);
  const frames = JSON.parse(readFileSync('scripts/frames.json', 'utf8'));
  for (const [n, tekst] of regels) {
    const f = `assets/audio/vo-${String(n).padStart(2, '0')}.wav`;
    await synth(tekst, voice, f);
    const d = duur(f);
    const nodig = Math.ceil((d + 1.2) * 2) / 2; // stem start 0,4 s na de scène + 0,8 s adem
    if (frames[n - 1][1] < nodig) frames[n - 1][1] = nodig;
    console.log(`regel ${n}: ${d.toFixed(2)} s → scène ${frames[n - 1][1]} s`);
  }
  writeFileSync('scripts/frames.json', JSON.stringify(frames));
  console.log('Klaar. Draai nu: node scripts/wrap.mjs && node scripts/index.mjs (index plaatst de vo-NN.wav automatisch).');
}
