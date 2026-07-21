/** Formats a prompt section marker, e.g. `label("RAW MEMO")` → `=== RAW MEMO ===`. */
export function label(s: string): string {
  return `=== ${s} ===`;
}
