import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LayoutEditor, type SavedLayout } from '@/layout-editor/editor';

/** "Layout": the visual editor with the live preview of the real PDF. */
export function LayoutPage() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<SavedLayout>();
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const current = await window.api.layout.get();
    setSaved({ document: current.document as SavedLayout['document'], images: current.images });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!saved) return <p className="text-muted-foreground">{t('app.loading')}</p>;
  return (
    <div className="space-y-4">
      <p className="max-w-4xl text-muted-foreground">{t('layout.intro')}</p>
      {/* re-mounted after saving, so the saved layout becomes the new baseline */}
      <LayoutEditor
        key={version}
        saved={saved}
        justSaved={version > 0}
        onSaved={() => {
          void load().then(() => setVersion((v) => v + 1));
        }}
      />
    </div>
  );
}
