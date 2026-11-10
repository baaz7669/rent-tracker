/**
 * Phone number in the form wa.me expects: digits only, international, no leading "00" or "+".
 * Returns '' when nothing usable is left.
 */
export function normalizeWhatsAppPhone(phone: string | undefined): string {
  return (phone || '').replace(/\D/g, '').replace(/^00/, '');
}

/** wa.me link that opens WhatsApp with the message typed in, or null without a usable phone number. */
export function whatsAppUrl(phone: string | undefined, message: string): string | null {
  const digits = normalizeWhatsAppPhone(phone);
  if (digits.length < 6) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
