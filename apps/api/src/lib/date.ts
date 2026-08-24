// Due dates are day-granular and UTC-anchored everywhere in this app — the DTO
// validates against the UTC day, the filter windows are built from it, and
// "overdue" means "before today's UTC day". One helper so those three never
// drift apart.

// Midnight UTC on the day `offsetDays` from today.
export function utcDayStart(offsetDays = 0): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays)
  );
}
