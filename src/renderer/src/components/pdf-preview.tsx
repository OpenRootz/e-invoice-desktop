import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type PdfJs = typeof import('pdfjs-dist');

let pdfjs: Promise<PdfJs> | undefined;

/** Loads pdf.js only when a preview is opened (it is a large module). */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjs;
}

/** All pages of a PDF, drawn with pdf.js into canvases (the PDF never leaves the app). */
function PdfPages({ pdf, width }: { pdf: Uint8Array; width: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const host = container.current;
    if (!host) return;
    (async () => {
      const lib = await loadPdfJs();
      // pdf.js transfers the buffer to its worker: pass a copy
      const task = lib.getDocument({ data: pdf.slice() });
      const doc = await task.promise;
      try {
        host.replaceChildren();
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: width / base.width });
          const ratio = window.devicePixelRatio || 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = 'mx-auto mb-4 bg-white shadow-md';
          await page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
          if (!cancelled) host.appendChild(canvas);
        }
      } finally {
        void task.destroy();
      }
    })().catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [pdf, width]);

  return (
    <>
      {error && <p className="text-destructive">{error}</p>}
      <div ref={container} />
    </>
  );
}

export function PdfPreviewDialog({ pdf, title, onClose }: { pdf: Uint8Array; title: string; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-6 z-50 flex flex-col overflow-hidden rounded-lg bg-muted shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 hover:bg-muted" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <PdfPages pdf={pdf} width={720} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
