# Changelog

## 0.1.0 (2026-11-18)

First release.

- ZUGFeRD / Factur-X invoices (EN 16931 profile, PDF/A-3b with embedded CII), validated with KoSIT, Mustang and
  veraPDF in CI
- My business: seller data, tax number, VAT ID or W-IdNr., bank account, payment terms, logo, small businesses under
  § 19 UStG; required fields and format warnings (country code, VAT ID, IBAN, BIC, email, phone)
- Customers (consumers and businesses) and products, stored locally as JSON files
- Create invoice: a saved or a new customer entered on the invoice (optionally saved), saved products or free-text
  lines, gross or net prices, discounts, shipping, payment method, paid invoices; live totals, preview and checks
  before the PDF is created
- VAT per rate from the totals as EN 16931 requires; with gross prices the difference is shown as rounding (BT-114)
- Invoice numbers from a pattern (`RE-{YYYY}-{NNNN}`), optionally starting at 1 every year
- Visual layout editor with the real PDF as preview, presets (default, DIN 5008 form A/B, minimal) and layout checks
  for the content § 14 UStG requires
- German and English user interface and invoices
- No network access, sandboxed renderer
- Windows installer and portable exe
