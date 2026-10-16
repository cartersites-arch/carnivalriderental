/** Parse plain USD decimals exactly; blank means unknown, malformed values throw. */
export function dollarsToCents(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter a non-negative dollar amount with at most two decimal places.");
  const [dollars, fraction = ""] = text.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Amount is too large.");
  return cents;
}
