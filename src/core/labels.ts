import { CreditNoteTexts } from './credit-note';

/** Texts the mapper writes into the invoice (allowance/charge reasons, credit note items). */
export interface MappingLabels {
  discount: string;
  rounding: string;
  shipping: string;
  surcharge: string;
  /** Exemption reason (BT-120) for small businesses (§ 19 UStG) */
  smallBusiness: string;
  creditNote: CreditNoteTexts;
}

const LABELS: Record<string, MappingLabels> = {
  de: {
    discount: 'Rabatt',
    rounding: 'Rundungsdifferenz',
    shipping: 'Versand',
    surcharge: 'Zuschlag',
    smallBusiness: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    creditNote: {
      amountLine: (c) => `Gutschrift (${c.code === 'S' ? `${c.rate.replace('.', ',')} % USt.` : 'umsatzsteuerfrei'})`,
      deduction: 'Abzug',
      alreadyCredited: 'Bereits gutgeschrieben',
      discount: 'Rabatt',
      refund: 'Erstattung über die ursprüngliche Zahlungsart',
    },
  },
  en: {
    discount: 'Discount',
    rounding: 'Rounding difference',
    shipping: 'Shipping',
    surcharge: 'Surcharge',
    smallBusiness: 'No VAT is charged under the small business scheme (Section 19 UStG).',
    creditNote: {
      amountLine: (c) => `Credit (${c.code === 'S' ? `${c.rate} % VAT` : 'VAT exempt'})`,
      deduction: 'Deduction',
      alreadyCredited: 'Already credited',
      discount: 'Discount',
      refund: 'Refund via the original payment method',
    },
  },
};

export function mappingLabels(language: string): MappingLabels {
  return LABELS[language.split(/[-_]/)[0]] ?? LABELS.en;
}
