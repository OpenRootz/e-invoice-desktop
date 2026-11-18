import { checkSellerFormats, normalizeCode } from '../core/seller-format';
import type { SellerProfile } from './schema';

/** Problems of the seller profile per field path; errors block invoices, warnings do not. */
export interface ProfileIssues {
  errors: Record<string, ProfileErrorCode>;
  warnings: Record<string, ProfileWarningCode>;
}

export type ProfileErrorCode = 'required' | 'taxIdRequired' | 'identifierRequired' | 'ibanRequired';
export type ProfileWarningCode = 'countryInvalid' | 'vatIdInvalid' | 'ibanInvalid' | 'bicInvalid' | 'emailInvalid' | 'wIdNrFormat';

/** Wirtschafts-Identifikationsnummer: `DE` + 9 digits + `-` + 5 digits */
const W_IDNR_RE = /^DE\d{9}-\d{5}$/;

const blank = (v: string | undefined) => !v || !v.trim();

/**
 * The checks of the core (`checkSeller`, `checkSellerFormats`) per form field, so the profile page can show them at the
 * fields. Mirrors EN 16931 / § 14 Abs. 4 UStG: name, address, contact, invoice email; VAT ID or tax number;
 * BR-CO-26 (VAT ID, register number or seller identifier); an IBAN for bank transfers.
 */
export function checkSellerProfile(profile: SellerProfile): ProfileIssues {
  const { seller, bank } = profile;
  const errors: ProfileIssues['errors'] = {};
  const warnings: ProfileIssues['warnings'] = {};

  const required: [string, string | undefined][] = [
    ['seller.name', seller.name],
    ['seller.address.line1', seller.address.line1],
    ['seller.address.postalCode', seller.address.postalCode],
    ['seller.address.city', seller.address.city],
    ['seller.address.countryCode', seller.address.countryCode],
    ['seller.contact.name', seller.contact.name],
    ['seller.contact.phone', seller.contact.phone],
    ['seller.contact.email', seller.contact.email],
    ['seller.electronicAddress.value', seller.electronicAddress?.value],
  ];
  for (const [path, value] of required) if (blank(value)) errors[path] = 'required';

  if (blank(seller.vatId) && blank(seller.taxNumber)) errors['seller.taxNumber'] = 'taxIdRequired';
  if (blank(seller.vatId) && blank(seller.legalRegistration?.id) && blank(seller.identifier?.id)) {
    errors['seller.identifier.id'] = 'identifierRequired';
  }
  if (blank(bank?.iban)) errors['bank.iban'] = 'ibanRequired';

  const formatPaths: Record<string, [string, ProfileWarningCode]> = {
    SELLER_COUNTRY_INVALID: ['seller.address.countryCode', 'countryInvalid'],
    SELLER_VAT_ID_INVALID: ['seller.vatId', 'vatIdInvalid'],
    SELLER_IBAN_INVALID: ['bank.iban', 'ibanInvalid'],
    SELLER_BIC_INVALID: ['bank.bic', 'bicInvalid'],
    SELLER_EMAIL_INVALID: ['seller.contact.email', 'emailInvalid'],
  };
  for (const w of checkSellerFormats(seller, bank)) {
    const [path, code] = formatPaths[w.code];
    if (!errors[path]) warnings[path] = code;
  }
  const wIdNr = seller.identifier?.id;
  if (!blank(wIdNr) && !W_IDNR_RE.test(normalizeCode(wIdNr!))) warnings['seller.identifier.id'] = 'wIdNrFormat';

  return { errors, warnings };
}

/** An empty profile for the first start. */
export function emptySellerProfile(): SellerProfile {
  return {
    seller: {
      name: '',
      address: { line1: '', postalCode: '', city: '', countryCode: 'DE' },
      contact: {},
      electronicAddress: { scheme: 'EM', value: '' },
    },
    pricesIncludeTax: true,
    paymentTermDays: 14,
    invoiceLanguage: 'de',
  };
}
