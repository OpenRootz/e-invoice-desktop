import { applySmallBusiness } from '../../core/small-business';
import { calculate } from '../../core/calculate';
import { mappingLabels } from '../../core/labels';
import type { EInvoiceModel, Seller } from '../../core/model';
import {
  checkLayout,
  defaultFonts,
  layoutDocument,
  layoutPreset,
  parseLayout,
  pdfLabels,
  renderZugferdPdf,
  type BlockBox,
  type LayoutIssue,
  type LayoutPreset,
  type PdfImage,
  type PdfLayoutV2,
} from '../../core/pdf';
import { sampleModel, type SampleKind } from '../../core/sample';
import { toCii } from '../../core/xml';
import type { Issue } from '../../shared/api';
import type { SellerProfile } from '../../shared/schema';
import { logoImage, storedLayout } from '../invoice/render';
import type { MasterDataStore } from '../store';

export type PreviewSample = Extract<SampleKind, 'b2b-net' | 'b2c-gross' | 'many-lines' | 'worst-case'>;

export interface LayoutDraft {
  /** The layout document as the editor has it (validated here) */
  document: unknown;
  /** Images of image blocks by id, as data URLs */
  images: Record<string, string>;
}

export interface LayoutPreviewRequest extends LayoutDraft {
  sample: PreviewSample;
  language: 'de' | 'en';
}

export interface LayoutPreviewResult {
  pdf?: Uint8Array;
  pageCount: number;
  /** Where every block ended up (0.1 mm) */
  blocks: BlockBox[];
  /** Problems of the layout; errors block saving */
  layoutIssues: LayoutIssue[];
  /** Other problems, e.g. the seller profile is missing */
  issues: Issue[];
}

/** Languages invoices can be written in; the layout must work for both (labels differ in length). */
const LANGUAGES = ['de', 'en'] as const;

/** Stands in for the seller until "My business" is filled in. */
const PLACEHOLDER_SELLER: Seller = {
  name: 'Ihr Unternehmen',
  address: { line1: 'Musterstraße 1', postalCode: '12345', city: 'Musterstadt', countryCode: 'DE' },
  vatId: 'DE123456789',
  contact: { name: 'Max Muster', phone: '+49 30 123456', email: 'info@example.com' },
  electronicAddress: { scheme: 'EM', value: 'rechnung@example.com' },
};

const today = () => new Date().toISOString().slice(0, 10);

function images(map: Record<string, string>): Record<string, PdfImage> {
  return Object.fromEntries(Object.entries(map).map(([id, url]) => [id, logoImage(url)!]));
}

/** Live preview, presets and saving of the PDF layout. Nothing here touches invoice numbers. */
export class LayoutService {
  constructor(private readonly store: MasterDataStore) {}

  async current(): Promise<{ document: PdfLayoutV2; images: Record<string, string> }> {
    const settings = await this.store.settings.read();
    return { document: storedLayout(settings), images: settings.layoutImages ?? {} };
  }

  preset(name: LayoutPreset): PdfLayoutV2 {
    return layoutPreset(name);
  }

  async preview(request: LayoutPreviewRequest): Promise<LayoutPreviewResult> {
    const parsed = parseLayout(request.document);
    const empty = { pageCount: 0, blocks: [] };
    if (!parsed.layout) return { ...empty, layoutIssues: parsed.issues, issues: [] };
    const layout = parsed.layout;
    const profile = await this.store.seller.read();
    const issues: Issue[] = profile
      ? []
      : [{ code: 'SAMPLE_SELLER', message: 'The preview uses placeholder seller data until “My business” is filled in', path: 'seller' }];

    const model = this.sample(request.sample, request.language, profile);
    const input = { model, labels: pdfLabels(model.language), logo: logoImage(profile?.logo), images: images(request.images) };
    const result = await layoutDocument(layout, input, defaultFonts());
    const pdf = await renderZugferdPdf({ model, xml: toCii(model, 'zugferd'), definition: result.definition, title: model.number });
    const saveIssues = await this.check(layout, request.images, profile);
    const current = checkLayout(layout, result.measurement, model).filter((i) => i.level === 'warning');
    return {
      pdf: new Uint8Array(pdf),
      pageCount: result.measurement.pageCount,
      blocks: result.measurement.boxes,
      layoutIssues: dedupe([...saveIssues.filter((i) => i.level === 'error' || i.code === 'FONT_REDUCED'), ...current, ...result.issues]),
      issues,
    };
  }

  /** Validates and stores the layout; layout errors (worst-case sample, both languages) block saving. */
  async save(draft: LayoutDraft): Promise<{ status: 'saved' } | { status: 'invalid'; issues: LayoutIssue[] }> {
    const parsed = parseLayout(draft.document);
    if (!parsed.layout) return { status: 'invalid', issues: parsed.issues };
    const missing = parsed.layout.blocks.filter((b) => b.type === 'image' && b.visible && !draft.images[String(b.props?.assetId ?? '')]);
    if (missing.length) {
      return {
        status: 'invalid',
        issues: missing.map((b) => ({ level: 'error', code: 'IMAGE_MISSING', message: 'The image block has no image', blockKey: b.key })),
      };
    }
    const errors = (await this.check(parsed.layout, draft.images, await this.store.seller.read())).filter((i) => i.level === 'error');
    if (errors.length) return { status: 'invalid', issues: errors };
    // Only the images the layout uses are kept
    const used = new Set(parsed.layout.blocks.map((b) => String(b.props?.assetId ?? '')));
    const kept = Object.fromEntries(Object.entries(draft.images).filter(([id]) => used.has(id)));
    await this.store.settings.update((s) => ({ ...s, layout: parsed.layout as unknown as Record<string, unknown>, layoutImages: kept }));
    return { status: 'saved' };
  }

  /**
   * The layout checks with the longest sample invoice in every invoice language, measured like at render time: a
   * fixed block whose content does not fit gets a smaller font (down to 6 pt, FONT_REDUCED); what still does not fit
   * is an error.
   */
  private async check(layout: PdfLayoutV2, imageMap: Record<string, string>, profile: SellerProfile | null): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];
    for (const language of LANGUAGES) {
      const model = this.sample('worst-case', language, profile);
      const input = { model, labels: pdfLabels(language), logo: logoImage(profile?.logo), images: images(imageMap) };
      const result = await layoutDocument(layout, input, defaultFonts(), { fit: true });
      const reduced = result.issues
        .filter((i) => i.code === 'FONT_REDUCED')
        .map((i) => ({ ...i, message: `${i.message} (longest sample invoice, ${language})` }));
      issues.push(...checkLayout(layout, result.measurement, model), ...reduced);
    }
    // One issue per block and code
    return issues.filter(
      (x, i) => issues.findIndex((y) => y.code === x.code && (x.blockKey ? y.blockKey === x.blockKey : y.message === x.message)) === i,
    );
  }

  /** A sample invoice with the user's own seller data, as a small business without VAT if that applies. */
  private sample(kind: SampleKind, language: 'de' | 'en', profile: SellerProfile | null): EInvoiceModel {
    const seller = profile?.seller ?? PLACEHOLDER_SELLER;
    let model = sampleModel(kind, {
      seller,
      bank: profile?.bank,
      paymentTerms: profile?.paymentTerms,
      paymentTermDays: profile?.paymentTermDays,
      number: pdfLabels(language).draft,
      language,
      issueDate: today(),
    });
    if (seller.smallBusiness) {
      model = applySmallBusiness(model, mappingLabels(language).smallBusiness);
      model.totals = calculate(model);
    }
    return model;
  }
}

function dedupe(issues: LayoutIssue[]): LayoutIssue[] {
  return issues.filter((x, i) => issues.findIndex((y) => y.code === x.code && y.message === x.message && y.blockKey === x.blockKey) === i);
}
