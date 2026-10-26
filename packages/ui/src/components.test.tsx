import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BottomNav, Button, IconButton, Switch, TextField } from './index';
import { enqueueToast } from './toast';

const A = ({ href, className, children, ...rest }: { href: string; className?: string; children?: React.ReactNode }) => (
  <a href={href} className={className} {...rest}>
    {children}
  </a>
);

describe('accessible wiring', () => {
  it('links a field label, error and hint to its input', () => {
    const html = renderToStaticMarkup(<TextField label="Fiyat" hint="Örn. 85,50" error="Geçerli bir fiyat girin." name="price" />);
    const id = /<input[^>]* id="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(`aria-describedby="${id}-error ${id}-hint"`);
    expect(html).toContain(`id="${id}-error"`);
  });

  it('switch exposes role and state; the whole row is the target', () => {
    const html = renderToStaticMarkup(<Switch checked label="Misafir Wi-Fi" description="Menüde gösterilir" onCheckedChange={() => {}} />);
    expect(html).toMatch(/^<button[^>]*role="switch"[^>]*aria-checked="true"/);
    expect(html).toContain('Misafir Wi-Fi');
  });

  it('icon buttons always have an accessible name', () => {
    expect(renderToStaticMarkup(<IconButton label="Kapat">x</IconButton>)).toContain('aria-label="Kapat"');
  });

  it('loading buttons announce busy state and block repeat submits', () => {
    const html = renderToStaticMarkup(<Button loading>Kaydet</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
  });

  it('bottom nav marks the current page and caps at five destinations', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ href: `/${i}`, label: `Sekme ${i}`, icon: null, active: i === 1 }));
    const html = renderToStaticMarkup(<BottomNav label="Ana menü" items={items} Link={A} />);
    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).toMatch(/href="\/1"[^>]*aria-current="page"/);
  });
});

describe('toast stack', () => {
  it('replaces an identical confirmation instead of stacking it', () => {
    const one = enqueueToast([], { message: 'Kaydedildi.' }, 1);
    const two = enqueueToast(one, { message: 'Kaydedildi.' }, 2);
    expect(two.map((t) => t.id)).toEqual([2]);
  });

  it('keeps different messages and never merges undo toasts', () => {
    const undo = { label: 'Geri al', onAction: () => {} };
    let all = enqueueToast([], { message: 'Ürün silindi.', action: undo }, 1);
    all = enqueueToast(all, { message: 'Ürün silindi.', action: undo }, 2);
    all = enqueueToast(all, { message: 'Kaydedildi.' }, 3);
    expect(all.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(enqueueToast(all, { message: 'Yeni' }, 4).map((t) => t.id)).toEqual([2, 3, 4]);
  });
});
