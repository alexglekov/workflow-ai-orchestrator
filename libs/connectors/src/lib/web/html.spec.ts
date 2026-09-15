import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeEntities,
  extractTables,
  metaDescription,
  readableText,
  stripHtml,
} from './html';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    assert.equal(
      decodeEntities('&laquo;Ромашка&raquo; &mdash; 1&nbsp;000&#8201;&#x20BD;'),
      '«Ромашка» — 1 000 ₽',
    );
  });

  it('keeps unknown entities as is', () => {
    assert.equal(decodeEntities('a &unknownthing; b'), 'a &unknownthing; b');
  });
});

describe('stripHtml', () => {
  it('drops scripts, styles and head', () => {
    const html = `
      <html><head><title>T</title><style>.a{color:red}</style></head>
      <body><script>var x = 1;</script><p>Курс USDT</p></body></html>`;

    const text = stripHtml(html);

    assert.equal(text.includes('color:red'), false);
    assert.equal(text.includes('var x'), false);
    assert.ok(text.includes('Курс USDT'));
  });
});

describe('readableText', () => {
  it('prefers article content over navigation and footer', () => {
    const filler = 'Существенный текст статьи про курс валют. '.repeat(12);
    const html = `
      <body>
        <nav>Главная Контакты Вход Регистрация</nav>
        <article><p>${filler}</p></article>
        <footer>Все права защищены 2026 Политика конфиденциальности</footer>
      </body>`;

    const text = readableText(html);

    assert.ok(text.includes('Существенный текст'));
    assert.equal(text.includes('Регистрация'), false);
    assert.equal(text.includes('Все права защищены'), false);
  });

  it('falls back to body when there is no article', () => {
    const html = '<body><div><p>Короткая страница</p></div></body>';

    assert.ok(readableText(html).includes('Короткая страница'));
  });
});

describe('metaDescription', () => {
  it('reads description and og:description', () => {
    assert.equal(
      metaDescription('<meta name="description" content="Описание &amp; тест">'),
      'Описание & тест',
    );
    assert.equal(
      metaDescription('<meta property="og:description" content="OG текст">'),
      'OG текст',
    );
  });
});

describe('extractTables', () => {
  it('reads rows and cells', () => {
    const html =
      '<table><tr><th>Валюта</th><th>Курс</th></tr><tr><td>USDT</td><td>95,5</td></tr></table>';

    assert.deepEqual(extractTables(html), [
      [
        ['Валюта', 'Курс'],
        ['USDT', '95,5'],
      ],
    ]);
  });
});
