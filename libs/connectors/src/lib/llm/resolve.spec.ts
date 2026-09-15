import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resolveLlm } from './resolve';

const KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_BASE_URL',
  'QWEN_API_KEY',
  'QWEN_MODEL',
  'QWEN_BASE_URL',
  'AGENT_PROVIDER',
];

const clear = () => {
  for (const key of KEYS) {
    delete process.env[key];
  }
};

describe('resolveLlm', () => {
  afterEach(clear);

  it('prefers gemini when both keys are set', () => {
    process.env['GEMINI_API_KEY'] = 'g-key';
    process.env['QWEN_API_KEY'] = 'q-key';

    const llm = resolveLlm();

    assert.equal(llm.provider, 'gemini');
    assert.equal(llm.apiKey, 'g-key');
  });

  it('honours the provider requested by a connection', () => {
    process.env['GEMINI_API_KEY'] = 'g-key';
    process.env['QWEN_API_KEY'] = 'q-key';

    const llm = resolveLlm({ provider: 'qwen' });

    assert.equal(llm.provider, 'qwen');
    assert.equal(llm.apiKey, 'q-key');
    assert.match(llm.baseUrl, /compatible-mode\/v1$/);
    assert.equal(llm.model, 'qwen-plus');
  });

  it('falls back to the provider that actually has a key', () => {
    process.env['AGENT_PROVIDER'] = 'gemini';
    process.env['QWEN_API_KEY'] = 'q-key';

    const llm = resolveLlm();

    assert.equal(llm.provider, 'qwen');
    assert.equal(llm.apiKey, 'q-key');
  });

  it('ignores providers that no longer exist', () => {
    process.env['GEMINI_API_KEY'] = 'g-key';

    const llm = resolveLlm({ provider: 'openai' });

    assert.equal(llm.provider, 'gemini');
  });

  it('lets a connection override model and base url', () => {
    const llm = resolveLlm({
      provider: 'qwen',
      apiKey: 'own',
      model: 'qwen3-max',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    assert.equal(llm.model, 'qwen3-max');
    assert.equal(
      llm.baseUrl,
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
  });
});
