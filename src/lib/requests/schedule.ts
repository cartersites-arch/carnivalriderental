// Shared by the browser and server; dates are calendar days, independent of time zones.
const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function validateSchedule(raw: { dateStart?: unknown; dateEnd?: unknown; state?: unknown }, today: string) {
  // Never truncate a date or state into an apparently valid value.
  const text = (v: unknown) => typeof v === "string" ? v.trim() || null : null;
  const dateStart = text(raw.dateStart);
  const dateEnd = text(raw.dateEnd);
  const state = text(raw.state)?.toUpperCase() ?? null;
  const errors: Partial<Record<"dateStart" | "dateEnd" | "state", string>> = {};

  if (!isCalendarDate(dateStart)) errors.dateStart = "Enter a valid event date.";
  else if (dateStart < today) errors.dateStart = "The event date is in the past.";

  if ((raw.dateEnd != null && typeof raw.dateEnd !== "string") || (dateEnd && !isCalendarDate(dateEnd)))
    errors.dateEnd = "Enter a valid end date, or leave it blank.";
  else if (dateEnd && isCalendarDate(dateStart) && dateEnd < dateStart)
    errors.dateEnd = "The end date must be on or after the start date.";

  if (!state || !STATE_CODES.has(state)) errors.state = "Enter a valid two-letter US state code or DC.";
  return { dateStart, dateEnd, state, errors };
}
