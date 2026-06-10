#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook.
 * Triggered after Write/Edit tool calls. If the written file is a page.tsx
 * under src/app/, generates a Dutch PageHelp entry via the Anthropic API and
 * inserts it into src/lib/page-help.ts (if the route isn't already covered).
 *
 * Usage (configured in .claude/settings.json):
 *   node apps/dashboard/scripts/update-page-help.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = resolve(__dirname, '..');
const PAGE_HELP_PATH = resolve(DASHBOARD_ROOT, 'src/lib/page-help.ts');

// ── Parse hook input ──────────────────────────────────────────────────────────
let hookInput;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) process.exit(0);
  hookInput = JSON.parse(raw);
} catch {
  process.exit(0); // not a hook invocation, nothing to do
}

const filePath = hookInput?.tool_input?.file_path ?? '';

// Only act on page.tsx files inside the app directory
if (!filePath || !filePath.replace(/\\/g, '/').match(/src\/app\/.+\/page\.tsx$/)) {
  process.exit(0);
}

// ── Derive route from file path ───────────────────────────────────────────────
function filePathToRoute(fp) {
  const normalised = fp.replace(/\\/g, '/');
  const match = normalised.match(/src\/app(\/.*)?\/page\.tsx$/);
  if (!match) return null;
  let route = match[1] ?? '/';
  // Strip Next.js route groups like (platform), (dashboard), etc.
  route = route.replace(/\/\([^)]+\)/g, '');
  // Strip dynamic segments to get a representative pattern, but keep [id] etc.
  return route || '/';
}

const route = filePathToRoute(filePath);
if (!route) process.exit(0);

// ── Check if route is already covered ────────────────────────────────────────
const currentHelpSrc = readFileSync(PAGE_HELP_PATH, 'utf8');

// Build a regex pattern to test whether this exact literal route is already registered.
// We check for a string that looks like the route in a regex literal inside PAGE_HELP.
const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\[.*?\\\]/g, '[^/]+');
const alreadyExists = new RegExp(escapedRoute.replace(/\//g, '\\\\/'), 'g').test(currentHelpSrc);

if (alreadyExists) {
  process.exit(0); // already has help content for this route
}

// ── Read the new page content ─────────────────────────────────────────────────
let pageContent;
try {
  pageContent = readFileSync(filePath, 'utf8');
} catch {
  process.exit(0);
}

// ── Call Anthropic API ────────────────────────────────────────────────────────
const client = new Anthropic();

let generatedHelp;
try {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Je bent een technisch schrijver voor een Nederlands onderhoud- en renovatiebedrijf dat de EVA-applicatie gebruikt.

Analyseer de volgende Next.js pagina-code en schrijf een Nederlandse gebruikershandleiding voor deze pagina.

Route: ${route}

Pagina-code:
\`\`\`tsx
${pageContent.slice(0, 4000)}
\`\`\`

Geef je antwoord als een TypeScript object literal (GEEN import/export, GEEN variabelenaam — alleen het object zelf), in precies dit formaat:
{
  title: 'Paginanaam',
  description: 'Beschrijving van het doel van de pagina in 1-2 zinnen.',
  sections: [
    { title: 'SECTIENAAM', body: 'Uitleg over wat de gebruiker hier kan doen.' },
  ],
}

Regels:
- Schrijf altijd in het Nederlands
- title is kort (max 4 woorden)
- description legt het doel uit in gewone taal
- Maak 2-4 secties die de gebruiker daadwerkelijk helpen
- Sectietitels zijn HOOFDLETTERS (max 3 woorden)
- Sectionbody is praktisch en concreet (1-3 zinnen)
- Gebruik GEEN markdown, GEEN backticks, GEEN codeblokken in je antwoord
- Geef ALLEEN het object terug, niets anders`,
      },
    ],
  });

  const responseText = message.content[0]?.text ?? '';
  // Extract object literal between first { and last }
  const objMatch = responseText.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    process.exit(0);
  }
  generatedHelp = objMatch[0];
} catch (err) {
  // API failure is non-fatal — just skip silently
  process.exit(0);
}

// ── Build the route regex string ──────────────────────────────────────────────
// Convert /path/[id]/sub to a regex like /^\/path\/[^/]+\/sub$/
function routeToRegex(r) {
  const escaped = r
    .replace(/\//g, '\\/')
    .replace(/\[([^\]]+)\]/g, '[^/]+');
  return `/^${escaped}$/`;
}

const regexStr = routeToRegex(route);

// ── Insert into page-help.ts ──────────────────────────────────────────────────
// Find the closing bracket of PAGE_HELP and insert before it
const insertMarker = '\n];\n\nexport function getPageHelp';
const insertIndex = currentHelpSrc.indexOf(insertMarker);

if (insertIndex === -1) {
  process.exit(0);
}

const routeComment = `\n  // ── ${route} (auto-generated) ────────────────────────────────────────────`;
const newEntry = `${routeComment}\n  [${regexStr}, ${generatedHelp}],\n`;

const updatedSrc =
  currentHelpSrc.slice(0, insertIndex) +
  newEntry +
  currentHelpSrc.slice(insertIndex);

writeFileSync(PAGE_HELP_PATH, updatedSrc, 'utf8');

// Output a message that Claude Code will show
console.log(`[page-help] Handleiding toegevoegd voor route: ${route}`);
