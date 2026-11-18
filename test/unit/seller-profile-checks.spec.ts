import { describe, expect, it } from 'vitest';

import type { SellerProfile } from '../../src/shared/schema';
import { checkSellerProfile, emptySellerProfile } from '../../src/shared/seller-profile-checks';

const complete = (): SellerProfile => ({
  ...emptySellerProfile(),
  seller: {
    name: 'Töpferei Beispiel',
    address: { line1: 'Am Markt 3', postalCode: '04109', city: 'Leipzig', countryCode: 'DE' },
    taxNumber: '231/456/78901',
    identifier: { id: 'DE123456789-00001' },
    contact: { name: 'Jana Beispiel', phone: '+49 341 987654', email: 'jana@example.com' },
    electronicAddress: { scheme: 'EM', value: 'jana@example.com' },
    smallBusiness: true,
  },
  bank: { iban: 'DE02120300000000202051' },
});

describe('checkSellerProfile', () => {
  it('accepts a complete small business profile', () => {
    expect(checkSellerProfile(complete())).toEqual({ errors: {}, warnings: {} });
  });

  it('marks all required fields of an empty profile', () => {
    const { errors } = checkSellerProfile(emptySellerProfile());
    expect(Object.keys(errors).sort()).toEqual(
      [
        'bank.iban',
        'seller.address.city',
        'seller.address.line1',
        'seller.address.postalCode',
        'seller.contact.email',
        'seller.contact.name',
        'seller.contact.phone',
        'seller.electronicAddress.value',
        'seller.identifier.id',
        'seller.name',
        'seller.taxNumber',
      ].sort(),
    );
  });

  it('needs a VAT ID, register number or W-IdNr. besides the tax number (BR-CO-26)', () => {
    const p = complete();
    p.seller.identifier = undefined;
    expect(checkSellerProfile(p).errors).toEqual({ 'seller.identifier.id': 'identifierRequired' });
    p.seller.vatId = 'DE123456789';
    expect(checkSellerProfile(p).errors).toEqual({});
  });

  it('warns about malformed values without blocking', () => {
    const p = complete();
    p.seller.identifier = { id: 'DE12345' };
    p.bank = { iban: 'DE00120300000000202051' };
    expect(checkSellerProfile(p)).toEqual({ errors: {}, warnings: { 'seller.identifier.id': 'wIdNrFormat', 'bank.iban': 'ibanInvalid' } });
  });

  it('warns about a phone number with fewer than three digits (BR-DE-27)', () => {
    const p = complete();
    p.seller.contact.phone = '01';
    expect(checkSellerProfile(p).warnings).toEqual({ 'seller.contact.phone': 'phoneDigits' });
    p.seller.contact.phone = '+49 341 987654';
    expect(checkSellerProfile(p).warnings).toEqual({});
  });
});
