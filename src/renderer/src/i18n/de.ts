/** German UI texts (default language). The English file must have the same keys. */
export const de = {
  app: { name: 'E-Invoice Desktop', loading: 'Lädt …', storeWarning: 'Eine Datei war beschädigt und wurde beiseitegelegt' },
  nav: {
    invoice: 'Rechnung erstellen',
    customers: 'Kunden',
    products: 'Produkte',
    company: 'Mein Unternehmen',
    layout: 'Layout',
    settings: 'Einstellungen',
  },
  common: {
    save: 'Speichern',
    saved: 'Gespeichert',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    add: 'Hinzufügen',
    new: 'Neu',
    search: 'Suchen …',
    optional: 'optional',
    yes: 'Ja',
    no: 'Nein',
    confirmDelete: '„{{name}}“ wirklich löschen?',
    errorSaving: 'Speichern fehlgeschlagen: {{message}}',
    notYet: 'Noch nicht verfügbar.',
  },
};

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Messages = Shape<typeof de>;
