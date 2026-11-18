import { ArrowDown, ArrowUp, Link, Lock, LockOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import {
  Block,
  blockCoverage,
  DETAIL_FIELDS,
  detailFields,
  DetailField,
  dependsOn,
  fromMm,
  lastCarrierOf,
  LayoutDocument,
  LayoutIssue,
  MandatoryField,
  mm,
  updateBlock,
} from './model';

function useLabels() {
  const { t } = useTranslation();
  return {
    t,
    block: (b: Block) => t(`layout.blocks.${b.type}`),
    mandatory: (fields: MandatoryField[]) => fields.map((f) => t(`layout.mandatory.${f}`)).join(', '),
  };
}

function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** A number input in mm for a value stored in 0.1 mm. */
function MmInput({ id, value, onChange, min }: { id: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <Input
      id={id}
      type="number"
      step={0.1}
      min={min}
      value={mm(value)}
      className="h-8"
      onChange={(e) => {
        if (e.target.value === '') return;
        const v = fromMm(Number(e.target.value));
        if (Number.isFinite(v)) onChange(min !== undefined ? Math.max(fromMm(min), v) : v);
      }}
    />
  );
}

/** Left panel: all blocks with visibility, lock, mandatory-content badges and the anchor chain. */
export function BlockList({
  layout,
  selected,
  locked,
  issues,
  onSelect,
  onChange,
  onToggleLock,
  onAdd,
}: {
  layout: LayoutDocument;
  selected?: string;
  locked: Set<string>;
  issues: LayoutIssue[];
  onSelect: (key: string) => void;
  onChange: (layout: LayoutDocument) => void;
  onToggleLock: (key: string) => void;
  onAdd: (type: 'customText' | 'image' | 'pageNumber') => void;
}) {
  const { t, block: name, mandatory } = useLabels();
  return (
    <div className="space-y-2">
      <ul className="space-y-0.5" aria-label={t('layout.blockList')}>
        {layout.blocks.map((b) => {
          const carrierOf = lastCarrierOf(layout, b);
          const fields = blockCoverage(b);
          const issue = issues.find((i) => i.blockKey === b.key);
          return (
            <li
              key={b.key}
              className={cn('flex items-center gap-2 rounded px-2 py-1 text-sm', b.key === selected ? 'bg-primary/10' : 'hover:bg-muted')}
            >
              <input
                type="checkbox"
                aria-label={t('layout.showBlock', { name: name(b) })}
                checked={b.visible}
                disabled={b.visible && carrierOf.length > 0}
                title={b.visible && carrierOf.length ? t('layout.lastCarrier', { fields: mandatory(carrierOf) }) : t('layout.visible')}
                onChange={(e) => onChange(updateBlock(layout, b.key, { visible: e.target.checked }))}
              />
              <button type="button" className="flex-1 truncate text-left" onClick={() => onSelect(b.key)}>
                {name(b)}
                {b.anchor && (
                  <span title={t('layout.follows', { key: b.anchor.to })} aria-label={t('layout.follows', { key: b.anchor.to })}>
                    <Link className="ml-1 inline size-3 text-muted-foreground" />
                  </span>
                )}
                {issue && <span className={issue.level === 'error' ? 'text-destructive' : 'text-warning'}> ●</span>}
              </button>
              {fields.length > 0 && (
                <span
                  className="rounded bg-muted px-1 text-[10px] text-muted-foreground uppercase"
                  title={t('layout.mandatoryBadge', { fields: mandatory(fields) })}
                >
                  §14
                </span>
              )}
              <button
                type="button"
                className={locked.has(b.key) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}
                title={locked.has(b.key) ? t('layout.unlock') : t('layout.lockTitle')}
                aria-label={t('layout.lock', { name: name(b) })}
                aria-pressed={locked.has(b.key)}
                onClick={() => onToggleLock(b.key)}
              >
                {locked.has(b.key) ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => onAdd('customText')}>
          {t('layout.addText')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd('image')}>
          {t('layout.addImage')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd('pageNumber')}>
          {t('layout.addPageNumber')}
        </Button>
      </div>
    </div>
  );
}

/** Right panel: the properties of the selected block, or of the page and theme when nothing is selected. */
export function Properties({
  layout,
  block,
  logo,
  onChange,
  onRemove,
  onPickImage,
}: {
  layout: LayoutDocument;
  block?: Block;
  /** The logo from the seller profile, as a data URL */
  logo?: string;
  onChange: (layout: LayoutDocument) => void;
  onRemove: (key: string) => void;
  /** Opens the file dialog for an image block */
  onPickImage: (blockKey: string) => void;
}) {
  const { t, block: name } = useLabels();
  if (!block) return <PageProperties layout={layout} onChange={onChange} />;
  const id = (field: string) => `layout-block-${block.key}-${field}`;
  const set = (change: Partial<Block>) => onChange(updateBlock(layout, block.key, change));
  const setFrame = (k: 'x' | 'y' | 'w' | 'h', v: number) => set({ frame: { ...block.frame, [k]: v } });
  const setStyle = (change: Block['style']) => {
    const style = Object.fromEntries(Object.entries({ ...block.style, ...change }).filter(([, v]) => v !== undefined && v !== ''));
    set({ style: Object.keys(style).length ? style : undefined });
  };
  const setProp = (k: string, v: unknown) => {
    const props = Object.fromEntries(Object.entries({ ...block.props, [k]: v }).filter(([, x]) => x !== undefined && x !== ''));
    set({ props: Object.keys(props).length ? props : undefined });
  };
  const anchorTargets = layout.blocks.filter(
    (b) =>
      b.key !== block.key &&
      !dependsOn(layout, b.key, block.key) &&
      !layout.blocks.some((o) => o.anchor?.to === b.key && o.key !== block.key),
  );
  const text = typeof block.props?.text === 'string' ? block.props.text : '';
  const removable = block.type === 'customText' || block.type === 'image' || block.type === 'pageNumber';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{name(block)}</h3>
        <span className="font-mono text-xs text-muted-foreground">{block.key}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Row label={t('layout.x')} htmlFor={id('x')}>
          <MmInput id={id('x')} value={block.frame.x} onChange={(v) => setFrame('x', v)} />
        </Row>
        <Row label={t('layout.y')} htmlFor={id('y')}>
          <MmInput id={id('y')} value={block.frame.y} onChange={(v) => set({ frame: { ...block.frame, y: v }, anchor: undefined })} />
        </Row>
        <Row label={t('layout.width')} htmlFor={id('w')}>
          <MmInput id={id('w')} value={block.frame.w} min={0.1} onChange={(v) => setFrame('w', v)} />
        </Row>
        <Row label={block.overflow === 'grow' ? t('layout.minHeight') : t('layout.height')} htmlFor={id('h')}>
          <MmInput id={id('h')} value={block.frame.h} min={block.overflow === 'fixed' ? 0.1 : 0} onChange={(v) => setFrame('h', v)} />
        </Row>
      </div>
      <Row label={t('layout.size')} htmlFor={id('overflow')}>
        <Select
          id={id('overflow')}
          className="h-8"
          value={block.overflow}
          onChange={(e) =>
            set({
              overflow: e.target.value as Block['overflow'],
              frame: { ...block.frame, h: Math.max(block.frame.h, e.target.value === 'fixed' ? 100 : 0) },
            })
          }
        >
          <option value="grow">{t('layout.grow')}</option>
          <option value="fixed">{t('layout.fixed')}</option>
        </Select>
      </Row>
      <Row label={t('layout.placedBelow')} htmlFor={id('anchor')}>
        <div className="flex gap-2">
          <Select
            id={id('anchor')}
            className="h-8"
            value={block.anchor?.to ?? ''}
            onChange={(e) => set({ anchor: e.target.value ? { to: e.target.value, gap: block.anchor?.gap ?? 30 } : undefined })}
          >
            <option value="">{t('layout.ownPosition')}</option>
            {anchorTargets.map((b) => (
              <option key={b.key} value={b.key}>
                {name(b)} ({b.key})
              </option>
            ))}
          </Select>
          {block.anchor && (
            <div className="w-24" title={t('layout.gap')}>
              <MmInput id={id('gap')} value={block.anchor.gap} min={0} onChange={(v) => set({ anchor: { ...block.anchor!, gap: v } })} />
            </div>
          )}
        </div>
      </Row>
      {block.overflow === 'fixed' && !block.anchor && (
        <Row label={t('layout.pages')} htmlFor={id('pages')}>
          <Select id={id('pages')} className="h-8" value={block.pages} onChange={(e) => set({ pages: e.target.value as Block['pages'] })}>
            <option value="first">{t('layout.pagesFirst')}</option>
            <option value="all">{t('layout.pagesAll')}</option>
            <option value="following">{t('layout.pagesFollowing')}</option>
            <option value="last">{t('layout.pagesLast')}</option>
          </Select>
        </Row>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Row label={t('layout.fontSize')} htmlFor={id('fontSize')}>
          <Input
            id={id('fontSize')}
            type="number"
            step={0.5}
            min={1}
            className="h-8"
            value={block.style?.fontSize ?? ''}
            placeholder={String(layout.theme.fontSize)}
            onChange={(e) => setStyle({ fontSize: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 2) / 2 })}
          />
        </Row>
        <Row label={t('layout.color')} htmlFor={id('color')}>
          <Input
            id={id('color')}
            className="h-8"
            placeholder="#333333"
            value={block.style?.color ?? ''}
            onChange={(e) => setStyle({ color: e.target.value || undefined })}
          />
        </Row>
        <Row label={t('layout.align')} htmlFor={id('align')}>
          <Select
            id={id('align')}
            className="h-8"
            value={block.style?.align ?? ''}
            onChange={(e) => setStyle({ align: (e.target.value || undefined) as NonNullable<Block['style']>['align'] })}
          >
            <option value="">{t('layout.alignDefault')}</option>
            <option value="left">{t('layout.alignLeft')}</option>
            <option value="center">{t('layout.alignCenter')}</option>
            <option value="right">{t('layout.alignRight')}</option>
          </Select>
        </Row>
        <label className="flex items-center gap-2 self-end pb-1 text-xs">
          <input type="checkbox" checked={!!block.style?.bold} onChange={(e) => setStyle({ bold: e.target.checked || undefined })} />
          {t('layout.bold')}
        </label>
      </div>

      {(block.type === 'introText' || block.type === 'closingText' || block.type === 'customText' || block.type === 'footer') && (
        <Row label={block.type === 'footer' ? t('layout.footerText') : t('layout.text')} htmlFor={id('text')}>
          <Textarea id={id('text')} maxLength={2000} value={text} onChange={(e) => setProp('text', e.target.value || undefined)} />
          {block.type === 'customText' && <p className="text-xs text-muted-foreground">{t('layout.placeholders')}</p>}
        </Row>
      )}
      {block.type === 'footer' && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!block.props?.pageNumber}
            onChange={(e) => setProp('pageNumber', e.target.checked || undefined)}
          />
          {t('layout.footerPageNumber')}
        </label>
      )}
      {block.type === 'logo' && (
        <div className="space-y-2">
          {logo ? <img src={logo} alt="" className="h-12 w-auto object-contain" /> : <p className="text-xs">{t('layout.noLogo')}</p>}
          <p className="text-xs text-muted-foreground">{t('layout.logoFromProfile')}</p>
        </div>
      )}
      {block.type === 'image' && (
        <Row label={t('layout.image')}>
          <Button size="sm" variant="outline" onClick={() => onPickImage(block.key)}>
            {block.props?.assetId ? t('layout.changeImage') : t('layout.chooseImage')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('layout.imageHint')}</p>
        </Row>
      )}
      {block.type === 'details' && <DetailFields layout={layout} block={block} onChange={(fields) => setProp('fields', fields)} />}
      {block.type === 'lines' && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={(block.props?.columns as { position?: boolean } | undefined)?.position !== false}
            onChange={(e) => setProp('columns', e.target.checked ? undefined : { position: false })}
          />
          {t('layout.positionColumn')}
        </label>
      )}
      {removable && (
        <Button size="sm" variant="destructive" onClick={() => onRemove(block.key)}>
          {t('layout.removeBlock')}
        </Button>
      )}
    </div>
  );
}

/** Detail rows that print mandatory content (§14 UStG). */
const MANDATORY_ROWS: Partial<Record<DetailField, MandatoryField>> = {
  number: 'number',
  issueDate: 'issueDate',
  deliveryDate: 'deliveryDate',
  sellerTaxId: 'sellerTaxId',
};

function DetailFields({ layout, block, onChange }: { layout: LayoutDocument; block: Block; onChange: (fields: DetailField[]) => void }) {
  const { t } = useTranslation();
  const fields = detailFields(block);
  // Rows this block is the last visible carrier of cannot be removed (the layout could not be saved)
  const lastCarrier = block.visible ? lastCarrierOf(layout, block) : [];
  const required = (f: DetailField) => !!MANDATORY_ROWS[f] && lastCarrier.includes(MANDATORY_ROWS[f]!);
  const move = (i: number, d: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{t('layout.rows')}</Label>
      {fields.map((f, i) => (
        <div key={f} className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked
            disabled={required(f)}
            title={required(f) ? t('layout.rowRequired') : undefined}
            onChange={() => onChange(fields.filter((x) => x !== f))}
          />
          <span className="flex-1">
            {t(`layout.details.${f}`)}
            {required(f) && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground uppercase">§14</span>}
          </span>
          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('layout.up')}>
            <ArrowUp className="size-3" />
          </button>
          <button type="button" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={t('layout.down')}>
            <ArrowDown className="size-3" />
          </button>
        </div>
      ))}
      {DETAIL_FIELDS.filter((f) => !fields.includes(f)).map((f) => (
        <label key={f} className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={false} onChange={() => onChange([...fields, f])} />
          {t(`layout.details.${f}`)}
        </label>
      ))}
    </div>
  );
}

function PageProperties({ layout, onChange }: { layout: LayoutDocument; onChange: (layout: LayoutDocument) => void }) {
  const { t } = useTranslation();
  const theme = (change: Partial<LayoutDocument['theme']>) => onChange({ ...layout, theme: { ...layout.theme, ...change } });
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-medium">{t('layout.pageAndTheme')}</h3>
      <Row label={t('layout.accentColor')} htmlFor="layout-theme-accent">
        <div className="flex gap-2">
          <input
            type="color"
            aria-label={t('layout.pickAccent')}
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-input"
            value={/^#[0-9a-f]{6}$/i.test(layout.theme.accentColor) ? layout.theme.accentColor : '#333333'}
            onChange={(e) => theme({ accentColor: e.target.value })}
          />
          <Input
            id="layout-theme-accent"
            className="h-8"
            value={layout.theme.accentColor}
            onChange={(e) => theme({ accentColor: e.target.value })}
          />
        </div>
      </Row>
      <Row label={t('layout.baseFontSize')} htmlFor="layout-theme-size">
        <Input
          id="layout-theme-size"
          type="number"
          step={0.5}
          min={6}
          max={36}
          className="h-8"
          value={layout.theme.fontSize}
          onChange={(e) => e.target.value && theme({ fontSize: Math.round(Number(e.target.value) * 2) / 2 })}
        />
      </Row>
      <Row label={t('layout.contTop')} htmlFor="layout-cont-top">
        <MmInput
          id="layout-cont-top"
          value={layout.continuation.top}
          min={0}
          onChange={(v) => onChange({ ...layout, continuation: { ...layout.continuation, top: v } })}
        />
      </Row>
      <Row label={t('layout.contBottom')} htmlFor="layout-cont-bottom">
        <MmInput
          id="layout-cont-bottom"
          value={layout.continuation.bottom}
          min={0}
          onChange={(v) => onChange({ ...layout, continuation: { ...layout.continuation, bottom: v } })}
        />
      </Row>
      <Row label={t('layout.window')} htmlFor="layout-window">
        <Select
          id="layout-window"
          className="h-8"
          value={layout.windowEnvelope ?? ''}
          onChange={(e) => onChange({ ...layout, windowEnvelope: (e.target.value || undefined) as LayoutDocument['windowEnvelope'] })}
        >
          <option value="">{t('layout.windowOff')}</option>
          <option value="A">{t('layout.windowA')}</option>
          <option value="B">{t('layout.windowB')}</option>
        </Select>
      </Row>
      <p className="text-xs text-muted-foreground">{t('layout.pageHint')}</p>
    </div>
  );
}
