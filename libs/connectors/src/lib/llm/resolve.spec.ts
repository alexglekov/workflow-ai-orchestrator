import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resolveLlm } from './resolve';

const KEYS = ['QWEN_API_KEY', 'QWEN_MODEL', 'QWEN_BASE_URL'];

const clear = () => {
  for (const key of KEYS) {
    delete process.env[key];
  }
};

describe('resolveLlm', () => {
  afterEach(clear);

  it('uses Qwen from the environment', () => {
    process.env['QWEN_API_KEY'] = 'q-key';

    const llm = resolveLlm();

    assert.equal(llm.provider, 'qwen');
    assert.equal(llm.apiKey, 'q-key');
    assert.match(llm.baseUrl, /compatible-mode\/v1$/);
    assert.equal(llm.model, 'qwen-plus');
  });

  it('lets a connection override key, model and base url', () => {
    process.env['QWEN_API_KEY'] = 'env-key';

    const llm = resolveLlm({
      apiKey: 'own',
      model: 'qwen3-max',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    assert.equal(llm.provider, 'qwen');
    assert.equal(llm.apiKey, 'own');
    assert.equal(llm.model, 'qwen3-max');
    assert.equal(
      llm.baseUrl,
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
  });
});
