import type { Messages } from './de';

export const en: Messages = {
  app: { name: 'E-Invoice Desktop', loading: 'Loading …', storeWarning: 'A file was damaged and has been moved aside' },
  nav: {
    invoice: 'Create invoice',
    customers: 'Customers',
    products: 'Products',
    company: 'My business',
    layout: 'Layout',
    settings: 'Settings',
  },
  common: {
    save: 'Save',
    saved: 'Saved',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    new: 'New',
    search: 'Search …',
    optional: 'optional',
    yes: 'Yes',
    no: 'No',
    confirmDelete: 'Really delete “{{name}}”?',
    errorSaving: 'Saving failed: {{message}}',
    notYet: 'Not available yet.',
  },
};
