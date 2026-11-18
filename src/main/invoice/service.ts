import path from 'node:path';

import type { Issue } from '../../shared/api';
import { prepareInvoice, type InvoiceRequest } from '../../shared/invoice';
import type { SellerProfile } from '../../shared/schema';
import type { MasterDataStore } from '../store';
import { writeAtomicBuffer } from '../store/json-file';
import { layoutIssues, renderInvoicePdf } from './render';

export type WriteResult = { status: 'saved'; filePath: string } | { status: 'invalid'; issues: Issue[] };

const NO_PROFILE: Issue = { code: 'SELLER_PROFILE_MISSING', message: 'The seller profile has not been filled in yet', path: 'seller' };

/** Builds, checks, renders and writes invoices (an invoice with issues is never written). */
export class InvoiceService {
  constructor(private readonly store: MasterDataStore) {}

  async check(request: InvoiceRequest): Promise<{ issues: Issue[]; profile?: SellerProfile }> {
    const profile = await this.store.seller.read();
    if (!profile) return { issues: [NO_PROFILE] };
    const settings = await this.store.settings.read();
    const { model, issues } = prepareInvoice(request, profile);
    return { issues: [...issues, ...layoutIssues(model, settings)], profile };
  }

  /** The PDF as it would be written, also while there are issues (for the preview). */
  async preview(request: InvoiceRequest): Promise<{ pdf?: Uint8Array; issues: Issue[] }> {
    const profile = await this.store.seller.read();
    if (!profile) return { issues: [NO_PROFILE] };
    const settings = await this.store.settings.read();
    const { model, issues } = prepareInvoice(request, profile);
    const pdf = await renderInvoicePdf(model, profile, settings);
    return { pdf: new Uint8Array(pdf), issues: [...issues, ...layoutIssues(model, settings)] };
  }

  async write(request: InvoiceRequest, filePath: string): Promise<WriteResult> {
    const profile = await this.store.seller.read();
    if (!profile) return { status: 'invalid', issues: [NO_PROFILE] };
    const settings = await this.store.settings.read();
    const { model, issues } = prepareInvoice(request, profile);
    const all = [...issues, ...layoutIssues(model, settings)];
    if (all.length) return { status: 'invalid', issues: all };

    const pdf = await renderInvoicePdf(model, profile, settings);
    await writeAtomicBuffer(filePath, pdf);
    await this.store.numberUsed(request.issueDate, request.number);
    await this.store.settings.update((s) => ({ ...s, lastOutputDir: path.dirname(filePath) }));
    return { status: 'saved', filePath };
  }
}

/** File name for an invoice number: characters Windows does not allow in file names are replaced. */
export function invoiceFileName(number: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are not allowed in Windows file names
  return `${number.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || 'invoice'}.pdf`;
}
