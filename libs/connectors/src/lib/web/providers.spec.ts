import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeBingUrl, parseBingHtml, parseDdgLite } from './providers';

describe('decodeBingUrl', () => {
  it('decodes Bing ck redirect with base64 target', () => {
    const target = 'https://coinmarketcap.com/currencies/bitcoin/';
    const encoded = Buffer.from(target).toString('base64').replace(/=+$/, '');
    const href = `https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${encoded}&amp;ntb=1`;

    assert.equal(decodeBingUrl(href), target);
  });

  it('keeps plain https links', () => {
    assert.equal(
      decodeBingUrl('https://example.com/page'),
      'https://example.com/page',
    );
  });
});

describe('parseBingHtml', () => {
  it('reads organic results and snippets', () => {
    const target = 'https://www.tradingview.com/symbols/BTCUSD/';
    const encoded = Buffer.from(target).toString('base64').replace(/=+$/, '');
    const html = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://www.bing.com/ck/a?!&&amp;u=a1${encoded}&amp;ntb=1">BTC USD — <strong>TradingView</strong></a></h2>
          <div class="b_caption"><p class="b_lineclamp2">Watch live Bitcoin chart</p></div>
        </li>
        <li class="b_algo">
          <h2><a href="https://example.com/direct">Direct result without redirect</a></h2>
          <p class="b_lineclamp3">Snippet text</p>
        </li>
      </ol>`;

    const results = parseBingHtml(html);

    assert.equal(results.length, 2);
    assert.equal(results[0].url, target);
    assert.equal(results[0].title, 'BTC USD — TradingView');
    assert.equal(results[0].snippet, 'Watch live Bitcoin chart');
    assert.equal(results[1].url, 'https://example.com/direct');
    assert.equal(results[1].provider, 'bing');
  });
});

describe('parseDdgLite', () => {
  it('reads results even though attributes use single quotes', () => {
    const html = `
      <table border="0">
        <tr>
          <td valign="top">1.&nbsp;</td>
          <td>
            <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fchislennost.com%2Fru%2Fjp%2Ftokyo.html&amp;rut=abc" class='result-link'>Население Токио 2026</a>
          </td>
        </tr>
        <tr>
          <td class='result-snippet'>На 2026 год численность населения города Токио</td>
        </tr>
      </table>`;

    const results = parseDdgLite(html);

    assert.equal(results.length, 1);
    assert.equal(results[0].url, 'https://chislennost.com/ru/jp/tokyo.html');
    assert.equal(results[0].title, 'Население Токио 2026');
    assert.match(results[0].snippet, /численность населения/);
    assert.equal(results[0].provider, 'duckduckgo-lite');
  });
});
