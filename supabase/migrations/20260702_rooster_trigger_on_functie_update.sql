-- functie en afdeling zijn nu volledig EVA-beheerd (de sync schrijft ze niet meer).
-- Een nieuwe Bouw7-medewerker komt dus binnen zonder functie; die wordt in EVA
-- toegekend. Laat de rooster-seed daarom ook op een functie-wijziging reageren
-- (niet alleen op INSERT), zodat het werkrooster automatisch gekoppeld wordt zodra
-- de functie in EVA wordt ingevuld. De functie zelf (medewerker_seed_rooster) is
-- al idempotent: hij doet niets als er al een rooster is of de functie geen
-- standaard_rooster heeft.
DROP TRIGGER IF EXISTS trg_medewerker_seed_rooster ON medewerkers;
CREATE TRIGGER trg_medewerker_seed_rooster
  AFTER INSERT OR UPDATE OF functie ON medewerkers
  FOR EACH ROW EXECUTE FUNCTION medewerker_seed_rooster();
