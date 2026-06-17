export function cmPhaseName(step: number): string {
  if (step < 6) return "Ban Phase 1";
  if (step < 10) return "Pick Phase 1";
  if (step < 14) return "Ban Phase 2";
  if (step < 18) return "Pick Phase 2";
  if (step < 20) return "Ban Phase 3";
  return "Pick Phase 3";
}
