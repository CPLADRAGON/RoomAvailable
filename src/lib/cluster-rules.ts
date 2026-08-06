// Venue -> faculty cluster mapping, ported from scripts/parse_nusmods.py.
// Ordered most-specific first so the first prefix match wins.
const CLUSTER_RULES: [string, string][] = [
  ["COM", "Computing"],
  ["E1A", "Engineering"],
  ["E1", "Engineering"],
  ["E2", "Engineering"],
  ["E3", "Engineering"],
  ["E4", "Engineering"],
  ["EA", "Engineering"],
  ["EW", "Engineering"],
  ["ERC", "Engineering"],
  ["AS1", "FASS"],
  ["AS2", "FASS"],
  ["AS3", "FASS"],
  ["AS4", "FASS"],
  ["AS5", "FASS"],
  ["AS6", "FASS"],
  ["AS7", "FASS"],
  ["AS8", "FASS"],
  ["UT", "UTown"],
  ["BIZ", "Business"],
  ["SDE", "Design & Environment"],
  ["MD1", "Medicine"],
  ["MD6", "Medicine"],
  ["LAW", "Law"],
  ["MCH", "Music"],
  ["LT", "Lecture Theatre"],
];

const SKIP_VENUE_PREFIXES = ["E-LEARN_", "ONLINE", "TBA", "_"];

export function inferCluster(venue: string): string {
  const v = venue.trim().toUpperCase();
  for (const [prefix, cluster] of CLUSTER_RULES) {
    if (v.startsWith(prefix)) return cluster;
  }
  // Science buildings (S1–S17, S1A, S2, S4, S5, S8, S11–S14, S16, S17 …) all
  // share an "S + digit" pattern. Checked after the explicit prefixes so
  // Design & Environment (SDE…) and other non-digit "S" codes are unaffected.
  if (/^S\d/.test(v)) return "Science";
  return "Other";
}

export function shouldSkipVenue(venue: string): boolean {
  const v = venue.trim().toUpperCase();
  if (!v) return true;
  return SKIP_VENUE_PREFIXES.some((p) => v.startsWith(p));
}
