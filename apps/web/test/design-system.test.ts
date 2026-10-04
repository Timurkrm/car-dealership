import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { Button, IconButton } from '../src/components/ui/button';
import {
  Input,
  Select,
  Checkbox,
  Radio,
  Switch,
  SearchInput,
} from '../src/components/ui/field';
import { FilterChip } from '../src/components/ui/chip';
import { Card } from '../src/components/ui/card';
import { Alert, EmptyState, ErrorState } from '../src/components/ui/feedback';
import { LoadingState } from '../src/components/ui/loading';
import { Dialog } from '../src/components/ui/dialog';
import { ListingStatusBadge } from '../src/features/listings/listing-status-badge';

test('semantic text and control boundary tokens meet contrast thresholds', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/styles/tokens.css'),
    'utf8',
  );
  const tokens = new Map(
    [...source.matchAll(/--(color-[\w-]+):\s*(#[a-f\d]{6});/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  const luminance = (name: string) => {
    const value = tokens.get(`color-${name}`);
    assert.ok(value, name);
    const channels = [1, 3, 5]
      .map((start) => parseInt(value.slice(start, start + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return channels.reduce(
      (sum, channel, index) =>
        sum + channel * (index === 0 ? 0.2126 : index === 1 ? 0.7152 : 0.0722),
      0,
    );
  };
  const contrast = (foreground: string, background: string) => {
    const a = luminance(foreground),
      b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  for (const foreground of ['text', 'text-secondary', 'text-muted']) {
    for (const background of ['surface', 'bg', 'surface-muted'])
      assert.ok(
        contrast(foreground, background) >= 4.5,
        `${foreground}/${background}`,
      );
  }
  for (const tone of ['success', 'warning', 'danger', 'info'])
    assert.ok(contrast(tone, `${tone}-soft`) >= 4.5, tone);
  for (const action of [
    'primary',
    'primary-hover',
    'primary-active',
    'danger',
    'danger-hover',
  ])
    assert.ok(contrast('on-primary', action) >= 4.5, action);
  assert.ok(contrast('border-strong', 'surface') >= 3);
  assert.ok(contrast('focus', 'surface') >= 3);
});

test('loading button retains its label/layout content and prevents duplicate submission', () => {
  const idle = render(h(Button, { type: 'submit' }, 'Сохранить'));
  const busy = render(
    h(Button, { type: 'submit', loading: true }, 'Сохранить'),
  );
  assert.match(idle, /type="submit"/);
  assert.match(busy, /disabled=""/);
  assert.match(busy, /aria-busy="true"/);
  for (const html of [idle, busy])
    assert.match(html, /<span class="ui-button-label">Сохранить<\/span>/);
  assert.match(render(h(Button, {}, 'Cancel')), /type="button"/);
});

test('icon button has explicit accessible label and native semantics', () => {
  const html = render(h(IconButton, { label: 'Закрыть', children: '×' }));
  assert.match(html, /<button/);
  assert.match(html, /aria-label="Закрыть"/);
});

test('field connects visible label, hint, error and feature-owned description', () => {
  const html = render(
    h(Input, {
      id: 'name',
      label: 'Имя',
      hint: 'Публичное имя',
      error: 'Введите имя',
      'aria-describedby': 'policy',
    }),
  );
  assert.match(html, /for="name"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="policy name-hint name-error"/);
  assert.match(html, /id="name-error"/);
  assert.match(html, /id="name-hint"/);
});

test('fields generate unique IDs and escape untrusted labels', () => {
  const html = render(
    h(
      'div',
      {},
      h(Input, { label: '<script>bad</script>' }),
      h(Input, { label: 'Second' }),
    ),
  );
  const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map(
    (item) => item[1],
  );
  assert.equal(new Set(ids).size, 2);
  assert.doesNotMatch(html, /<script>/);
});

test('select and choices preserve native labels, state and form values', () => {
  assert.match(
    render(
      h(
        Select,
        { label: 'Валюта', name: 'currency', defaultValue: 'EUR' },
        h('option', { value: 'EUR' }, 'EUR'),
      ),
    ),
    /selected=""/,
  );
  for (const Component of [Checkbox, Radio, Switch]) {
    const html = render(
      h(Component, { label: 'Включено', name: 'choice', defaultChecked: true }),
    );
    assert.match(html, /checked=""/);
    assert.match(html, /<label/);
    assert.match(html, /name="choice"/);
  }
  assert.match(render(h(Switch, { label: 'Уведомления' })), /role="switch"/);
});

test('search field remains labelled with no icon announced', () => {
  const html = render(
    h(SearchInput, { label: 'Поиск', hint: 'Введите название' }),
  );
  assert.match(html, /type="search"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /<label for=/);
});

test('chips distinguish toggle from removal action', () => {
  assert.match(
    render(h(FilterChip, { selected: true, children: 'Дизель' })),
    /aria-pressed="true"/,
  );
  const removal = render(
    h(FilterChip, {
      removable: true,
      removeLabel: 'Убрать Дизель',
      children: 'Дизель',
    }),
  );
  assert.match(removal, /aria-label="Убрать Дизель"/);
  assert.doesNotMatch(removal, /aria-pressed/);
});

test('interactive cards use links; selected cards include non-color selection text', () => {
  assert.match(
    render(
      h(Card, {
        variant: 'interactive',
        href: '/cars',
        children: 'Автомобили',
      }),
    ),
    /<a[^>]+href="\/cars"/,
  );
  assert.match(
    render(h(Card, { variant: 'selected', children: 'Выбор' })),
    /Выбрано/,
  );
});

test('feature statuses have readable text without noisy live announcements', () => {
  const html = render(h(ListingStatusBadge, { status: 'PENDING_MODERATION' }));
  assert.match(html, /На модерации/);
  assert.doesNotMatch(html, /role="status"/);
});

test('feedback and loading expose correct announcements and native retry', () => {
  assert.match(
    render(h(Alert, { tone: 'error', children: 'Ошибка' })),
    /role="alert"/,
  );
  assert.match(render(h(LoadingState, { label: 'Загрузка' })), /role="status"/);
  assert.match(
    render(
      h(ErrorState, {
        description: 'Попробуйте снова',
        onRetry: () => undefined,
      }),
    ),
    /<button/,
  );
  assert.match(
    render(h(EmptyState, { title: 'Ничего не найдено' })),
    /<h2>Ничего не найдено<\/h2>/,
  );
});

test('dialog is initially closed and references its title and description', () => {
  const html = render(
    h(Dialog, {
      open: false,
      onClose: () => undefined,
      title: 'Подтверждение',
      description: 'Описание',
      children: 'Содержимое',
    }),
  );
  assert.match(html, /<dialog[^>]+aria-labelledby=/);
  assert.match(html, /aria-describedby=/);
  assert.doesNotMatch(html, / open=/);
});
