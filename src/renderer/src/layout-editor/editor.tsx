import { Check, Loader2, Maximize2, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { PdfPreviewDialog } from '@/components/pdf-preview';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { errorMessage, useMasterData } from '@/lib/data';
import { useLeaveGuard } from '@/lib/leave-guard';
import type { LayoutPresetName, LayoutPreviewResult, PreviewSample } from '../../../shared/api';

import { Block, blockCoverage, LayoutDocument, LayoutIssue, MANDATORY, newBlockKey, PAGE, removeBlock, updateBlock } from './model';
import { LayoutOverlay } from './overlay';
import { BlockList, Properties } from './panels';
import { PdfCanvas } from './pdf-canvas';

const HISTORY = 100;
const ZOOMS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6];
const PRESETS: LayoutPresetName[] = ['default', 'din5008A', 'din5008B', 'minimal'];
const SAMPLES: PreviewSample[] = ['b2b-net', 'b2c-gross', 'many-lines', 'worst-case'];
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

interface History {
  past: LayoutDocument[];
  present: LayoutDocument;
  future: LayoutDocument[];
}

export interface SavedLayout {
  document: LayoutDocument;
  images: Record<string, string>;
}

/** `value`, updated only after it has not changed for `delay` ms. */
function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * The live preview: rendered by main 400 ms after the last change. While a new PDF is rendered, the previous one stays
 * visible; answers for outdated drafts are discarded.
 */
function useLayoutPreview(document: LayoutDocument, images: Record<string, string>, sample: PreviewSample, language: 'de' | 'en') {
  const input = useMemo(() => ({ document, images, sample, language }), [document, images, sample, language]);
  const debounced = useDebounced(input);
  const [preview, setPreview] = useState<LayoutPreviewResult>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    window.api.layout
      .preview(debounced)
      .then((result) => {
        if (!current) return;
        setPreview(result);
        setError(undefined);
      })
      .catch((e: unknown) => current && setError(errorMessage(e)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [debounced]);
  return { preview, error, isFetching: loading || input !== debounced };
}

/** The zoom that fits the page into the width of `ref`. */
function useFitZoom(ref: React.RefObject<HTMLDivElement | null>): number {
  const [fit, setFit] = useState(0.25);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setFit(Math.max(0.15, Math.min(0.6, (entry.contentRect.width - 32) / PAGE.w))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return fit;
}

/**
 * The visual layout editor: the real PDF (rendered by main, drawn with pdf.js) with an editing layer on top, the block
 * list on the left and the properties of the selection on the right. Every change re-renders the PDF (debounced); the
 * measured blocks and the layout issues come back with it. Saving is disabled while the layout checks report errors.
 */
export function LayoutEditor({ saved, justSaved, onSaved }: { saved: SavedLayout; justSaved?: boolean; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const { seller } = useMasterData();
  const [history, setHistory] = useState<History>({ past: [], present: saved.document, future: [] });
  const [images, setImages] = useState(saved.images);
  const [selected, setSelected] = useState<string | undefined>();
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [page, setPage] = useState(1);
  const [sample, setSample] = useState<PreviewSample>('b2b-net');
  const [language, setLanguage] = useState<'de' | 'en'>(seller?.invoiceLanguage ?? (i18n.language === 'en' ? 'en' : 'de'));
  const [pendingPreset, setPendingPreset] = useState<LayoutPresetName>();
  const [status, setStatus] = useState<{ kind: 'saved' } | { kind: 'error'; message: string } | undefined>(
    justSaved ? { kind: 'saved' } : undefined,
  );
  const [saveIssues, setSaveIssues] = useState<LayoutIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [large, setLarge] = useState(false);
  const imageFor = useRef<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const fitZoom = useFitZoom(viewport);
  const scale = zoom === 'fit' ? fitZoom : zoom;
  const layout = history.present;

  const change = useCallback((next: LayoutDocument) => {
    setStatus(undefined);
    setSaveIssues([]);
    setHistory((h) => (next === h.present ? h : { past: [...h.past, h.present].slice(-HISTORY), present: next, future: [] }));
  }, []);
  const undo = () =>
    setHistory((h) =>
      h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h,
    );
  const redo = () =>
    setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  const { preview, error, isFetching } = useLayoutPreview(layout, images, sample, language);
  const pageCount = preview?.pageCount || 1;
  const issues = useMemo(() => {
    const all = [...saveIssues, ...((preview?.layoutIssues ?? []) as LayoutIssue[])];
    const unique = all.filter(
      (x, i) => all.findIndex((y) => y.code === x.code && y.message === x.message && y.blockKey === x.blockKey) === i,
    );
    // The core's messages are English: show them in the UI language, by code
    const describe = (issue: LayoutIssue): string => {
      const b = issue.blockKey ? layout.blocks.find((x) => x.key === issue.blockKey) : undefined;
      const name = b ? `${t(`layout.blocks.${b.type}`)} (${b.key})` : '';
      if (issue.code === 'MANDATORY_CONTENT_MISSING') {
        const missing = MANDATORY.filter((f) => !layout.blocks.some((x) => x.visible && blockCoverage(x).includes(f)));
        if (!missing.length) return issue.message;
        return t('layout.issues.MANDATORY_CONTENT_MISSING', { fields: missing.map((f) => t(`layout.mandatory.${f}`)).join(', ') });
      }
      const key = (!b && (issue.code === 'SMALL_FONT' || issue.code === 'LOW_CONTRAST') ? `${issue.code}_THEME` : issue.code) as 'OVERLAP';
      return t(`layout.issues.${key}`, { block: name, defaultValue: issue.message });
    };
    return unique.map((i) => ({ ...i, message: describe(i) }));
  }, [preview, saveIssues, layout, t]);
  const errors = issues.filter((i) => i.level === 'error');
  const dirty = JSON.stringify(layout) !== JSON.stringify(saved.document) || JSON.stringify(images) !== JSON.stringify(saved.images);
  const block = layout.blocks.find((b) => b.key === selected);
  useLeaveGuard(dirty, t('layout.unsaved'));

  const save = async () => {
    setSaving(true);
    try {
      const result = await window.api.layout.save({ document: layout, images });
      if (result.status === 'invalid') {
        setSaveIssues(result.issues);
        return;
      }
      setStatus({ kind: 'saved' });
      onSaved();
    } catch (e) {
      setStatus({ kind: 'error', message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = async (name: LayoutPresetName) => {
    try {
      const next = (await window.api.layout.preset(name)) as LayoutDocument;
      // keep the theme and the texts of the current layout
      const texts = new Map(layout.blocks.filter((b) => typeof b.props?.text === 'string').map((b) => [b.type, b.props!.text]));
      change({
        ...next,
        theme: layout.theme,
        blocks: next.blocks.map((b) => (texts.has(b.type) ? { ...b, props: { ...b.props, text: texts.get(b.type) } } : b)),
      });
      setSelected(undefined);
    } catch (e) {
      setStatus({ kind: 'error', message: errorMessage(e) });
    } finally {
      setPendingPreset(undefined);
    }
  };

  const pickImage = (blockKey: string) => {
    imageFor.current = blockKey;
    fileInput.current?.click();
  };
  const onImageChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = imageFor.current;
    e.target.value = '';
    if (!file || !key) return;
    if (!IMAGE_TYPES.includes(file.type)) return setStatus({ kind: 'error', message: t('company.logoType') });
    if (file.size > MAX_IMAGE_BYTES) return setStatus({ kind: 'error', message: t('company.logoTooLarge') });
    const reader = new FileReader();
    reader.onload = () => {
      // the image is stored under the block key
      setImages((current) => ({ ...current, [key]: String(reader.result) }));
      change(updateBlock(layout, key, (b) => ({ ...b, props: { ...b.props, assetId: key } })));
    };
    reader.readAsDataURL(file);
  };

  const add = (type: 'customText' | 'image' | 'pageNumber') => {
    const key = newBlockKey(layout, type);
    const added: Block = {
      key,
      type,
      visible: true,
      pages: type === 'pageNumber' ? 'all' : 'first',
      overflow: 'fixed',
      frame:
        type === 'pageNumber'
          ? { x: 1500, y: 2500, w: 400, h: 60 }
          : { x: 198, y: 300, w: type === 'image' ? 400 : 800, h: type === 'image' ? 200 : 100 },
      ...(type === 'customText' ? { props: { text: t('layout.newText') } } : {}),
      ...(type === 'pageNumber' ? { style: { align: 'right' as const, fontSize: 7 } } : {}),
    };
    change({ ...layout, blocks: [...layout.blocks, added] });
    setSelected(key);
    if (type === 'image') pickImage(key);
  };

  const remove = (key: string) => {
    setSelected(undefined);
    setImages(({ [key]: _removed, ...rest }) => rest);
    change(removeBlock(layout, key));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      return redo();
    }
    if (!block) return;
    if (e.key === 'Escape') return setSelected(undefined);
    if ((e.key === 'Delete' || e.key === 'Backspace') && ['customText', 'image', 'pageNumber'].includes(block.type)) {
      e.preventDefault();
      return remove(block.key);
    }
    const step = e.shiftKey ? 50 : 5;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (d && !locked.has(block.key)) {
      e.preventDefault();
      change(
        updateBlock(layout, block.key, (b) => ({
          ...b,
          frame: { ...b.frame, x: b.frame.x + d[0], y: b.frame.y + d[1] },
          anchor: d[1] ? undefined : b.anchor,
        })),
      );
    }
  };

  const boxes = useMemo(() => preview?.blocks ?? [], [preview]);
  const shownPage = Math.min(page, pageCount);

  return (
    <div className="space-y-3 outline-none" tabIndex={0} onKeyDown={onKeyDown}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!history.past.length} onClick={undo} title={t('layout.undoTitle')}>
          <Undo2 /> {t('layout.undo')}
        </Button>
        <Button size="sm" variant="outline" disabled={!history.future.length} onClick={redo} title={t('layout.redoTitle')}>
          <Redo2 /> {t('layout.redo')}
        </Button>
        <Select
          aria-label={t('layout.zoom')}
          className="h-8 w-32"
          value={String(zoom)}
          onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
        >
          <option value="fit">{t('layout.zoomFit')}</option>
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {Math.round((z / 0.3) * 100)} %
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('layout.presets')}
          className="h-8 w-60"
          value=""
          onChange={(e) => e.target.value && setPendingPreset(e.target.value as LayoutPresetName)}
        >
          <option value="">{t('layout.presets')}</option>
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`layout.presetNames.${p}`)}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-3">
          {errors.length > 0 && <span className="text-xs text-destructive">{t('layout.errorsBeforeSave', { count: errors.length })}</span>}
          {status?.kind === 'saved' && !dirty && (
            <span className="flex items-center gap-1 text-sm text-success">
              <Check className="size-4" /> {t('layout.saved')}
            </span>
          )}
          <Button
            size="sm"
            disabled={!dirty || errors.length > 0 || saving || isFetching}
            title={errors.length ? t('layout.fixFirst') : undefined}
            onClick={save}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
      {pendingPreset && (
        <Alert kind="warning" title={t('layout.replaceWith', { name: t(`layout.presetNames.${pendingPreset}`) })}>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void applyPreset(pendingPreset)}>
              {t('layout.replace')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingPreset(undefined)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Alert>
      )}
      {status?.kind === 'error' && <Alert kind="error" title={t('layout.saveFailed', { message: status.message })} />}

      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <div className="order-2 lg:order-1">
          <BlockList
            layout={layout}
            selected={selected}
            locked={locked}
            issues={issues}
            onSelect={setSelected}
            onChange={change}
            onToggleLock={(key) =>
              setLocked((l) => {
                const next = new Set(l);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            onAdd={add}
          />
        </div>

        <div className="order-1 min-w-0 space-y-2 lg:order-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Select
              aria-label={t('layout.sample')}
              className="h-8 w-64"
              value={sample}
              onChange={(e) => setSample(e.target.value as PreviewSample)}
            >
              {SAMPLES.map((s) => (
                <option key={s} value={s}>
                  {t(`layout.samples.${s}`)}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('layout.language')}
              className="h-8 w-28"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}
            >
              <option value="de">{t('languages.de')}</option>
              <option value="en">{t('languages.en')}</option>
            </Select>
            {pageCount > 1 && (
              <Select
                aria-label={t('layout.page')}
                className="h-8 w-36"
                value={shownPage}
                onChange={(e) => setPage(Number(e.target.value))}
              >
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {t('layout.pageOf', { page: i + 1, count: pageCount })}
                  </option>
                ))}
              </Select>
            )}
            {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t('layout.rendering')} />}
            <Button
              size="icon"
              variant="outline"
              className="ml-auto"
              disabled={!preview?.pdf}
              onClick={() => setLarge(true)}
              title={t('layout.openLarge')}
              aria-label={t('layout.openLarge')}
            >
              <Maximize2 />
            </Button>
          </div>
          <div ref={viewport} className="overflow-auto rounded-lg border border-border bg-muted/60 p-4">
            <div className="relative mx-auto bg-white shadow" style={{ width: PAGE.w * scale, height: PAGE.h * scale }}>
              <PdfCanvas
                pdf={preview?.pdf}
                page={shownPage}
                scale={scale}
                onError={(e) => setStatus({ kind: 'error', message: errorMessage(e) })}
              />
              <LayoutOverlay
                layout={layout}
                boxes={boxes}
                page={shownPage}
                pageCount={pageCount}
                scale={scale}
                selected={selected}
                locked={locked}
                issues={issues}
                onSelect={setSelected}
                onChange={change}
              />
            </div>
          </div>
          {issues.length > 0 && (
            <ul className="space-y-1 text-sm" aria-label={t('layout.issuesLabel')}>
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${i}`} className={issue.level === 'error' ? 'text-destructive' : 'text-warning'}>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    disabled={!issue.blockKey}
                    onClick={() => issue.blockKey && setSelected(issue.blockKey)}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {preview?.issues.map((i) => (
            <p key={i.code} className="text-sm text-muted-foreground">
              {t(`layout.previewIssues.${i.code}` as 'layout.previewIssues.SAMPLE_SELLER', { defaultValue: i.message })}
            </p>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="order-3">
          <Properties layout={layout} block={block} logo={seller?.logo} onChange={change} onRemove={remove} onPickImage={pickImage} />
          {block && (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setSelected(undefined)}>
              {t('layout.backToPage')}
            </Button>
          )}
        </div>
      </div>

      <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={onImageChosen} />
      {large && preview?.pdf && <PdfPreviewDialog pdf={preview.pdf} title={t('nav.layout')} onClose={() => setLarge(false)} />}
    </div>
  );
}
