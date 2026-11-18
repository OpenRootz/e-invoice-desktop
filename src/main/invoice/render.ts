import { checkLayout, layoutTemplate, pdfLabels, renderZugferdPdf, resolveLayout, toCii } from '../../core';
import type { EInvoiceModel } from '../../core/model';
import type { PdfImage, PdfLayout, PdfLayoutV2 } from '../../core/pdf';
import type { Issue } from '../../shared/api';
import type { SellerProfile, Settings } from '../../shared/schema';

/** The stored logo as the core expects it: SVG as markup, PNG/JPEG as data URL. */
export function logoImage(dataUrl: string | undefined): PdfImage | undefined {
  if (!dataUrl) return undefined;
  const svg = /^data:image\/svg\+xml;base64,(.*)$/.exec(dataUrl);
  return svg ? { svg: Buffer.from(svg[1], 'base64').toString('utf8') } : { dataUrl };
}

export function storedLayout(settings: Settings): PdfLayoutV2 {
  return resolveLayout(settings.layout as PdfLayoutV2 | PdfLayout | undefined);
}

/** Layout errors that would make the PDF incomplete (§ 14 UStG content, clipping); warnings are ignored here. */
export function layoutIssues(model: EInvoiceModel, settings: Settings): Issue[] {
  return checkLayout(storedLayout(settings), undefined, model)
    .filter((i) => i.level === 'error')
    .map((i) => ({ code: `LAYOUT_${i.code}`, message: i.message, path: i.blockKey ? `layout.${i.blockKey}` : 'layout' }));
}

/** Renders the ZUGFeRD PDF (PDF/A-3b with the CII XML embedded) with the stored layout and logo. */
export async function renderInvoicePdf(model: EInvoiceModel, profile: SellerProfile, settings: Settings): Promise<Buffer> {
  const labels = pdfLabels(model.language);
  const definition = await layoutTemplate({ model, labels, layout: storedLayout(settings), logo: logoImage(profile.logo) });
  return renderZugferdPdf({ model, xml: toCii(model, 'zugferd'), definition, title: `${labels.invoice} ${model.number}` });
}
