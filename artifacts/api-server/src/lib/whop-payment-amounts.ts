/** Validate Whop's creator-facing subtotal and tax, never accept an arbitrary overpayment. */
export function paymentMatchesBasePrice(
  payment: {
    subtotal?: number | string | null;
    total?: number | string | null;
    tax_amount?: number | string | null;
  },
  basePrice: number,
): boolean {
  const cents = (value: unknown): number | null => {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value)) return null;
    const n = Number(value);
    const rounded = Math.round(n * 100);
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(rounded)
      && Math.abs(n * 100 - rounded) < 0.000001 ? rounded : null;
  };
  const base = cents(basePrice);
  const subtotal = cents(payment.subtotal);
  const total = cents(payment.total);
  const tax = payment.tax_amount === null ? 0 : cents(payment.tax_amount);
  return base !== null && subtotal === base && total !== null && tax !== null
    && total === subtotal + tax;
}
