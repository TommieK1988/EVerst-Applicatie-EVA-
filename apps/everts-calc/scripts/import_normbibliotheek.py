"""
import_normbibliotheek.py
Parseert Normbibliotheek schilderwerk v2 XML (Calc4You CUF-formaat)
en genereert seed_normbibliotheek.sql voor Supabase.
"""

import xml.etree.ElementTree as ET
import uuid
import re
import os

XML_PATH = r"C:\Users\t.kamminga\AppData\Local\Temp\Normbibliotheek schilderwerk v2.xml"
OUT_PATH = os.path.join(os.path.dirname(__file__), "seed_normbibliotheek.sql")

NS = "x-schema:CufSchema.xml"
FAMILY_ID = "00000000-0000-0000-0000-000000000001"
FAMILY_CODE = "EVT"
FAMILY_NAME = "Everts Normbibliotheek"
NS_SEED = uuid.NAMESPACE_DNS


def make_id(key: str) -> str:
    return str(uuid.uuid5(NS_SEED, key))


def sq(s) -> str:
    """Escape single quotes for SQL."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def parse_float(s: str) -> float:
    if not s:
        return 0.0
    return float(s.replace(",", "."))


def get_code4(bundeling) -> str | None:
    """Haal mw4y_code4 sorteercode op uit eerste child BEGROTINGSREGEL."""
    tag_br = f"{{{NS}}}BEGROTINGSREGEL"
    tag_sc = f"{{{NS}}}SORTEERCODE"
    for br in bundeling.iter(tag_br):
        for sc in br:
            if sc.tag == tag_sc and sc.get("SORTERING") == "mw4y_code4":
                return sc.get("WAARDE")
    return None


def main():
    print(f"Lees XML: {XML_PATH}")
    tree = ET.parse(XML_PATH)
    root = tree.getroot()

    tag_bund = f"{{{NS}}}BUNDELING"
    tag_regel = f"{{{NS}}}BEGROTINGSREGEL"

    treatments: dict[str, dict] = {}   # treatment_code -> dict
    items: list[dict] = []
    labor_norms: list[dict] = []
    material_norms: list[dict] = []

    begroting = root.find(f"{{{NS}}}BEGROTING")
    if begroting is None:
        print("FOUT: geen BEGROTING element gevonden")
        return

    # Niveau 1: categorie (onderdeel)
    for cat in begroting:
        if cat.tag != tag_bund:
            continue
        onderdeel = cat.get("OMSCHRIJVING", "").strip()

        # Niveau 2: verfbestek-systeem (treatment)
        for sys_el in cat:
            if sys_el.tag != tag_bund:
                continue

            sys_omschr = sys_el.get("OMSCHRIJVING", "").strip()
            # Haal treatment code op via mw4y_code4
            t_code = get_code4(sys_el) or sys_el.get("CODE", "")
            t_code = t_code.strip()

            if t_code not in treatments:
                t_id = make_id(f"treatment:{t_code}")
                treatments[t_code] = {
                    "id": t_id,
                    "code": t_code,
                    "name": sys_omschr,
                }
            t_id = treatments[t_code]["id"]

            # Niveau 3: oppervlaktetype (item)
            for item_el in sys_el:
                if item_el.tag != tag_bund:
                    continue

                item_code = item_el.get("CODE", "").strip()
                item_name = item_el.get("OMSCHRIJVING", "").strip()
                item_id = make_id(f"item:{item_code}")

                items.append({
                    "id": item_id,
                    "item_code": item_code,
                    "full_name": item_name,
                    "onderdeel": onderdeel,
                    "treatment_id": t_id,
                    "treatment_code": t_code,
                })

                # Begrotingsregels: arbeid (.A) en materiaal (.M*)
                for regel in item_el:
                    if regel.tag != tag_regel:
                        continue

                    r_code = regel.get("CODE", "")
                    r_omschr = regel.get("OMSCHRIJVING", "").strip()
                    r_eenheid = regel.get("HOEVEELHEID_EENHEID", "st").strip() or "st"

                    if r_omschr == "Arbeid" or r_code.endswith(".A"):
                        uur_norm = parse_float(regel.get("UUR_NORM", "0"))
                        uur_tarief = parse_float(regel.get("UUR_TARIEF", "0"))
                        cost = round(uur_norm * uur_tarief, 4)
                        labor_norms.append({
                            "id": make_id(f"labor:{r_code}"),
                            "item_id": item_id,
                            "treatment_id": t_id,
                            "source_code": r_code,
                            "unit": r_eenheid,
                            "hours_per_unit": uur_norm,
                            "hour_rate": uur_tarief,
                            "cost_per_unit": cost,
                        })
                    elif re.search(r"\.M\d+$", r_code):
                        hoeveelheid = parse_float(regel.get("HOEVEELHEID", "0"))
                        mat_prijs = parse_float(regel.get("MATERIAALPRIJS", "0"))
                        cost = round(hoeveelheid * mat_prijs, 4)
                        material_norms.append({
                            "id": make_id(f"mat:{r_code}"),
                            "item_id": item_id,
                            "treatment_id": t_id,
                            "source_code": r_code,
                            "material_name": r_omschr,
                            "unit": r_eenheid,
                            "quantity_per_unit": hoeveelheid,
                            "unit_price": mat_prijs,
                            "cost_per_unit": cost,
                        })

    print(f"  Treatments : {len(treatments)}")
    print(f"  Items      : {len(items)}")
    print(f"  Arbeidsnormen  : {len(labor_norms)}")
    print(f"  Materiaalnormen: {len(material_norms)}")

    lines = []
    lines.append("-- =============================================================")
    lines.append("-- Seed: Normbibliotheek schilderwerk v2 → Supabase")
    lines.append("-- Gegenereerd door import_normbibliotheek.py")
    lines.append("-- =============================================================")
    lines.append("")
    lines.append("-- Verwijder bestaande data (volgorde i.v.m. FK constraints)")
    lines.append("DELETE FROM paint_material_norms;")
    lines.append("DELETE FROM paint_labor_norms;")
    lines.append("DELETE FROM paint_items;")
    lines.append("DELETE FROM paint_treatments;")
    lines.append("DELETE FROM paint_system_families;")
    lines.append("")

    # Familie
    lines.append("-- Familie")
    lines.append(
        f"INSERT INTO paint_system_families (id, family_code, name, active) VALUES "
        f"({sq(FAMILY_ID)}, {sq(FAMILY_CODE)}, {sq(FAMILY_NAME)}, true);"
    )
    lines.append("")

    # Treatments
    lines.append(f"-- Verfbestek-systemen ({len(treatments)})")
    lines.append("INSERT INTO paint_treatments (id, family_id, treatment_index_code, treatment_code, name, active) VALUES")
    t_rows = []
    for t in sorted(treatments.values(), key=lambda x: x["code"]):
        t_rows.append(
            f"  ({sq(t['id'])}, {sq(FAMILY_ID)}, {sq(t['code'])}, {sq(t['code'])}, {sq(t['name'])}, true)"
        )
    lines.append(",\n".join(t_rows) + ";")
    lines.append("")

    # Items — in batches van 200
    lines.append(f"-- Oppervlaktetypes / items ({len(items)})")
    batch_size = 200
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        lines.append("INSERT INTO paint_items (id, family_id, treatment_id, item_code, onderdeel, type, full_name, active) VALUES")
        rows = []
        for it in batch:
            rows.append(
                f"  ({sq(it['id'])}, {sq(FAMILY_ID)}, {sq(it['treatment_id'])}, "
                f"{sq(it['item_code'])}, {sq(it['onderdeel'])}, 'onderhoud', {sq(it['full_name'])}, true)"
            )
        lines.append(",\n".join(rows) + ";")
    lines.append("")

    # Labor norms — batches van 200
    lines.append(f"-- Arbeidsnormen ({len(labor_norms)})")
    for i in range(0, len(labor_norms), batch_size):
        batch = labor_norms[i:i + batch_size]
        lines.append("INSERT INTO paint_labor_norms (id, item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate, cost_per_unit, active) VALUES")
        rows = []
        for ln in batch:
            rows.append(
                f"  ({sq(ln['id'])}, {sq(ln['item_id'])}, {sq(ln['treatment_id'])}, "
                f"{sq(ln['source_code'])}, {sq(ln['unit'])}, {ln['hours_per_unit']}, {ln['hour_rate']}, {ln['cost_per_unit']}, true)"
            )
        lines.append(",\n".join(rows) + ";")
    lines.append("")

    # Material norms — batches van 200
    lines.append(f"-- Materiaalnormen ({len(material_norms)})")
    for i in range(0, len(material_norms), batch_size):
        batch = material_norms[i:i + batch_size]
        lines.append("INSERT INTO paint_material_norms (id, item_id, treatment_id, source_code, material_name, unit, quantity_per_unit, unit_price, cost_per_unit, active) VALUES")
        rows = []
        for mn in batch:
            rows.append(
                f"  ({sq(mn['id'])}, {sq(mn['item_id'])}, {sq(mn['treatment_id'])}, "
                f"{sq(mn['source_code'])}, {sq(mn['material_name'])}, {sq(mn['unit'])}, "
                f"{mn['quantity_per_unit']}, {mn['unit_price']}, {mn['cost_per_unit']}, true)"
            )
        lines.append(",\n".join(rows) + ";")

    sql = "\n".join(lines)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(sql)

    print(f"\nSQL geschreven naar: {OUT_PATH}")
    print(f"Bestandsgrootte: {os.path.getsize(OUT_PATH) // 1024} KB")


if __name__ == "__main__":
    main()
