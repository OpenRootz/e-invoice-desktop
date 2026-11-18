import type { EInvoiceApi } from '../shared/api';

declare global {
  interface Window {
    api: EInvoiceApi;
  }
}
