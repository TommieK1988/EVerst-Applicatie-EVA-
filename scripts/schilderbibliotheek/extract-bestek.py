"""
Haalt de werkomschrijvingen per behandeling uit het OnderhoudNL Basisverf- en
glasbestek 2020 en schrijft ze naar `werkomschrijvingen.json`.

Waarom een apart script en een JSON-tussenbestand: de monorepo heeft geen
tekst-extractor voor PDF's, en daar een dependency voor toevoegen is zwaar voor
een eenmalige import. Het JSON-bestand is bovendien reviewbaar — je kunt vóór de
migratie zien welke tekst bij welke behandeling terechtkomt.

    python scripts/schilderbibliotheek/extract-bestek.py <pad-naar-bestek.pdf>

Structuur van het bestek: hoofdstuk 9 (p. 35-50) is buitenschilderwerk,
hoofdstuk 10 (p. 51-60) binnenschilderwerk. De nummering is disjunct — 01-12 is
buiten, 50-60 binnen — dus geen enkele code komt twee keer voor (geverifieerd:
126 codes, 0 dubbel). De toepassing buiten/binnen leiden we af uit het
paginanummer, want dat is wat het document zelf zegt.

De titel nemen we NIET uit de PDF: die breekt over regels af. De titel komt uit
het c4y-bestand; hier halen we alleen de werkstappen op.

Drie eigenaardigheden van de tekstlaag, alle drie afgevangen:

1. INSPRONG BEPAALT DE STRUCTUUR. Een nieuwe werkstap is ingesprongen; loopt een
   stap over meerdere regels, dan staat het vervolg op kolom 0. Dat geldt ook
   voor de titel, die vaak over twee regels loopt. Deze ene regel scheidt dus
   zowel de titel van de stappen als de stappen onderling:

       OHD 03  Plaatselijk verwijderen, 1 x bijwerken grondverf,     <- titel
       1 x geheel dekverf                                            <- titelvervolg (kolom 0)
          Plaatselijk verflagen verwijderen door schrapen,           <- stap (ingesprongen)
       verweerd hout verwijderen                                     <- vervolg (kolom 0)

2. SECTIEKOPPEN lekken tussen de stappen door ("1. OHD HOUT DEKKEND",
   "9 SCHILDERSYSTEMEN ONDERHOUD"). Ze zijn te herkennen aan hoofdletters:
   werkstappen zijn zinnen, koppen niet.

3. LIGATUURGAT. De fi/fl-ligatuur komt eruit als 'profi  elen' — twee spaties
   midden in een woord. Accenten (één, afföhnen, poriën) komen wél correct door.
"""

import json
import re
import sys
from pathlib import Path

try:
    import pypdf
except ImportError:
    sys.exit("pypdf ontbreekt. Installeer met: pip install pypdf")

# Codes uit hoofdstuk 9 en 10: O + ondergrond + systeem + volgnummer.
CODE = re.compile(r'^(\s*)(OH[DTVR]|OK[DTV]|OM[ASV]|OS[ADHVR])\s?(\d{2})\b\s*(.*)$')

PAGINAKOP = re.compile(r'BASISVERF- EN GLASBESTEKOnderhoudNL\s*\d*\s*')

EERSTE_PAGINA_HOOFDSTUK_9 = 35
LAATSTE_PAGINA_BUITEN = 50


def is_sectiekop(regel: str) -> bool:
    """
    Sectiekoppen staan in hoofdletters ("1. OHD HOUT DEKKEND",
    "BUITENSCHILDERWERK"); werkstappen zijn gewone zinnen.
    """
    letters = [c for c in regel if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


def herstel_ligatuur(tekst: str) -> str:
    """'droogbeglazingsprofi  elen' -> 'droogbeglazingsprofielen'."""
    return re.sub(r'(?<=\w)  +(?=\w)', '', tekst)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Gebruik: python extract-bestek.py <pad-naar-bestek.pdf>")

    lezer = pypdf.PdfReader(str(Path(sys.argv[1])))

    blokken: dict[str, dict] = {}
    huidig: str | None = None
    # Waar de laatst geopende regel bij hoort: 'titel' of 'stap'. Een vervolgregel
    # (kolom 0) wordt aan dát onderdeel geplakt.
    context: str | None = None

    for paginanr, pagina in enumerate(lezer.pages, start=1):
        if paginanr < EERSTE_PAGINA_HOOFDSTUK_9:
            continue

        tekst = PAGINAKOP.sub('\n', pagina.extract_text() or '')

        for ruwe_regel in tekst.split('\n'):
            if not ruwe_regel.strip():
                continue

            treffer = CODE.match(ruwe_regel)
            if treffer:
                code = f"{treffer.group(2)} {treffer.group(3)}"
                huidig = code
                context = 'titel'
                blokken[code] = {
                    'pagina': paginanr,
                    'toepassing': 'buiten' if paginanr <= LAATSTE_PAGINA_BUITEN else 'binnen',
                    'titel': [treffer.group(4).strip()],
                    'stappen': [],
                }
                continue

            if huidig is None:
                continue

            if is_sectiekop(ruwe_regel):
                # Een kop sluit het lopende blok af: wat erna komt hoort bij een
                # nieuwe sectie, niet meer bij deze behandeling.
                huidig, context = None, None
                continue

            ingesprongen = ruwe_regel[0].isspace()
            inhoud = ruwe_regel.strip()

            if ingesprongen:
                blokken[huidig]['stappen'].append(inhoud)
                context = 'stap'
            elif context == 'titel':
                blokken[huidig]['titel'].append(inhoud)
            elif blokken[huidig]['stappen']:
                # Breekt de regel af midden in een woord ("de stopverf/" +
                # "kit is verwijderd"), dan mag er geen spatie tussen.
                vorige = blokken[huidig]['stappen'][-1]
                scheiding = '' if vorige.endswith(('/', '-')) else ' '
                blokken[huidig]['stappen'][-1] = vorige + scheiding + inhoud

    uitvoer = {}
    for code, blok in blokken.items():
        stappen = [herstel_ligatuur(s).strip() for s in blok['stappen']]
        stappen = [s for s in stappen if s]
        uitvoer[code] = {
            'toepassing': blok['toepassing'],
            'pagina': blok['pagina'],
            'bestek_titel': herstel_ligatuur(' '.join(blok['titel'])).strip(),
            'werkomschrijving': '\n'.join(f"- {s}" for s in stappen),
            'aantal_stappen': len(stappen),
        }

    doel = Path(__file__).parent / 'werkomschrijvingen.json'
    doel.write_text(
        json.dumps(uitvoer, ensure_ascii=False, indent=2, sort_keys=True),
        encoding='utf-8',
    )

    buiten = sum(1 for v in uitvoer.values() if v['toepassing'] == 'buiten')
    leeg = sorted(k for k, v in uitvoer.items() if v['aantal_stappen'] == 0)
    print(f"{len(uitvoer)} behandelingen ({buiten} buiten, {len(uitvoer) - buiten} binnen) -> {doel.name}")
    if leeg:
        print(f"LET OP - zonder werkstappen: {', '.join(leeg)}")


if __name__ == '__main__':
    main()
