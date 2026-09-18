import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildUnlockRequest,
  unlockerConfig,
  unlockVariants,
  type UnlockerConfig,
} from './unlocker';

describe('unlockerConfig', () => {
  it('is disabled without provider or key', () => {
    assert.equal(unlockerConfig({}), null);
    assert.equal(unlockerConfig({ WEB_UNLOCKER_PROVIDER: 'zenrows' }), null);
    assert.equal(unlockerConfig({ WEB_UNLOCKER_KEY: 'k' }), null);
  });

  it('reads provider, country and render flag', () => {
    const config = unlockerConfig({
      WEB_UNLOCKER_PROVIDER: 'ZenRows',
      WEB_UNLOCKER_KEY: 'secret',
      WEB_UNLOCKER_COUNTRY: 'US',
      WEB_UNLOCKER_RENDER: 'false',
    });

    assert.deepEqual(config, {
      provider: 'zenrows',
      apiKey: 'secret',
      country: 'us',
      render: false,
      premium: false,
      template: undefined,
    });
  });

  it('enables premium only when asked', () => {
    const config = unlockerConfig({
      WEB_UNLOCKER_PROVIDER: 'zenrows',
      WEB_UNLOCKER_KEY: 'secret',
      WEB_UNLOCKER_PREMIUM: 'true',
    });

    assert.equal(config?.premium, true);
  });

  it('maps brightdata/scrapfly to custom and needs a template', () => {
    assert.equal(
      unlockerConfig({
        WEB_UNLOCKER_PROVIDER: 'brightdata',
        WEB_UNLOCKER_KEY: 'secret',
      }),
      null,
    );

    const config = unlockerConfig({
      WEB_UNLOCKER_PROVIDER: 'brightdata',
      WEB_UNLOCKER_KEY: 'secret',
      WEB_UNLOCKER_URL: 'https://api.brd.com/?token={key}&country={country}&url={url}',
    });

    assert.equal(config?.provider, 'custom');
  });

  it('ignores unknown providers', () => {
    assert.equal(
      unlockerConfig({
        WEB_UNLOCKER_PROVIDER: 'nonsense',
        WEB_UNLOCKER_KEY: 'secret',
      }),
      null,
    );
  });
});

const base = (over: Partial<UnlockerConfig> = {}): UnlockerConfig => ({
  provider: 'zenrows',
  apiKey: 'KEY',
  render: true,
  premium: false,
  ...over,
});

describe('buildUnlockRequest', () => {
  it('builds a ZenRows request without premium unless enabled', () => {
    const { endpoint } = buildUnlockRequest(
      'https://www.bybit.com/fiat/trade/otc?token=USDT',
      base(),
      'de',
    );
    const parsed = new URL(endpoint);

    assert.equal(parsed.origin + parsed.pathname, 'https://api.zenrows.com/v1/');
    assert.equal(parsed.searchParams.get('apikey'), 'KEY');
    assert.equal(
      parsed.searchParams.get('url'),
      'https://www.bybit.com/fiat/trade/otc?token=USDT',
    );
    assert.equal(parsed.searchParams.get('js_render'), 'true');
    assert.equal(parsed.searchParams.get('premium_proxy'), null);
    assert.equal(parsed.searchParams.get('proxy_country'), null);
  });

  it('adds premium proxy and country only on paid mode', () => {
    const { endpoint } = buildUnlockRequest(
      'https://example.com/',
      base({ premium: true }),
      'de',
    );
    const parsed = new URL(endpoint);

    assert.equal(parsed.searchParams.get('premium_proxy'), 'true');
    assert.equal(parsed.searchParams.get('proxy_country'), 'de');
  });

  it('uses config country when call omits it, and honors render=false', () => {
    const { endpoint } = buildUnlockRequest(
      'https://example.com/',
      base({ provider: 'scrapingbee', country: 'us', render: false }),
    );
    const parsed = new URL(endpoint);

    assert.equal(parsed.origin + parsed.pathname, 'https://app.scrapingbee.com/api/v1/');
    assert.equal(parsed.searchParams.get('render_js'), 'false');
    assert.equal(parsed.searchParams.get('country_code'), 'us');
  });

  it('builds a ScraperAPI request', () => {
    const { endpoint } = buildUnlockRequest(
      'https://example.com/page',
      base({ provider: 'scraperapi' }),
      'gb',
    );
    const parsed = new URL(endpoint);

    assert.equal(parsed.origin + parsed.pathname, 'https://api.scraperapi.com/');
    assert.equal(parsed.searchParams.get('api_key'), 'KEY');
    assert.equal(parsed.searchParams.get('render'), 'true');
    assert.equal(parsed.searchParams.get('country_code'), 'gb');
  });

  it('fills a custom template with url, key and country', () => {
    const { endpoint } = buildUnlockRequest(
      'https://example.com/a b',
      base({
        provider: 'custom',
        template: 'https://api.x.com/?token={key}&geo={country}&target={url}',
      }),
      'fr',
    );

    assert.equal(
      endpoint,
      'https://api.x.com/?token=KEY&geo=fr&target=https%3A%2F%2Fexample.com%2Fa%2520b',
    );
  });
});

describe('unlockVariants', () => {
  it('falls back from country/premium to a plain request', () => {
    const variants = unlockVariants(base({ premium: true, country: 'ru' }));

    assert.deepEqual(
      variants.map((item) => `${item.render}:${item.premium}:${item.country || ''}`),
      ['true:true:ru', 'true:false:', 'false:false:'],
    );
  });
});
