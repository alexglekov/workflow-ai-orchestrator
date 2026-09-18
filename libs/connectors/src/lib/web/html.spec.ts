import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeEntities,
  extractTables,
  isThinPage,
  looksLikeSpaShell,
  metaDescription,
  needsRender,
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

describe('isThinPage', () => {
  it('treats an empty JS shell as thin', () => {
    assert.equal(isThinPage('Enable JavaScript to continue'), true);
    assert.equal(isThinPage(`${'Курс обменника '.repeat(25)} резерв 12 BTC`), false);
  });
});

describe('looksLikeSpaShell', () => {
  it('detects a React/Next shell with heavy scripts and little text', () => {
    const html = `<div id="root"></div><script>${'a'.repeat(9000)}</script>`;

    assert.equal(looksLikeSpaShell(html, 'Загрузка...'), true);
  });

  it('ignores plain server-rendered pages', () => {
    const html = '<main><p>Обычная статья без фреймворков</p></main>';
    const text = 'Обычная статья без фреймворков '.repeat(20);

    assert.equal(looksLikeSpaShell(html, text), false);
  });

  it('ignores an SPA that already rendered its content', () => {
    const html = '<div id="app"></div><script>x()</script>';
    const text = 'Готовый контент приложения. '.repeat(60);

    assert.equal(looksLikeSpaShell(html, text), false);
  });
});

describe('needsRender', () => {
  it('renders thin pages and unrendered SPA shells', () => {
    assert.equal(needsRender('<div id="root"></div>', 'Loading'), true);
    assert.equal(
      needsRender(`<div id="root"></div><script>${'z'.repeat(9000)}</script>`, 'Загрузка'),
      true,
    );
  });

  it('keeps rich static pages as is', () => {
    const text = 'Полноценный текст страницы. '.repeat(40);

    assert.equal(needsRender('<main><p>...</p></main>', text), false);
  });
});
