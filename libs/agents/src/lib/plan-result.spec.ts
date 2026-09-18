import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collapseDuplicateSteps, sanitizePlan } from './plan-result';
import type { AgentContext, AgentPlanResult } from './types';

describe('collapseDuplicateSteps', () => {
  it('drops a copied half of the same chain', () => {
    const steps = collapseDuplicateSteps([
      { connectorId: 'web', action: 'search' },
      { connectorId: 'web', action: 'fetch' },
      { connectorId: 'telegram', action: 'send_message' },
      { connectorId: 'web', action: 'search' },
      { connectorId: 'web', action: 'fetch' },
      { connectorId: 'telegram', action: 'send_message' },
    ]);

    assert.deepEqual(
      steps.map((step) => `${step.connectorId}.${step.action}`),
      ['web.search', 'web.fetch', 'telegram.send_message'],
    );
  });

  it('keeps the first of repeated actions', () => {
    const steps = collapseDuplicateSteps([
      { connectorId: 'web', action: 'search', title: 'first' },
      { connectorId: 'web', action: 'fetch' },
      { connectorId: 'web', action: 'search', title: 'second' },
      { connectorId: 'telegram', action: 'send_message' },
      { connectorId: 'telegram', action: 'send_message' },
    ]);

    assert.deepEqual(
      steps.map((step) => `${step.connectorId}.${step.action}`),
      ['web.search', 'web.fetch', 'telegram.send_message'],
    );
    assert.equal(
      (steps[0] as { title?: string }).title,
      'first',
    );
  });
});

describe('sanitizePlan', () => {
  const context: AgentContext = {
    connectors: [
      {
        id: 'web',
        name: 'Web',
        actions: [
          { id: 'search', name: 'Найти' },
          { id: 'fetch', name: 'Открыть' },
          { id: 'rates', name: 'Курсы' },
        ],
      },
      {
        id: 'llm',
        name: 'LLM',
        actions: [{ id: 'generate', name: 'Написать' }],
      },
      {
        id: 'telegram',
        name: 'Telegram',
        actions: [{ id: 'send_message', name: 'Сообщение' }],
      },
    ],
    connections: [],
  };

  it('does not keep a doubled Bybit plan', () => {
    const plan: AgentPlanResult = {
      kind: 'workflow',
      providerId: 'qwen',
      message: 'Беру на себя',
      questions: [],
      connectors: ['web', 'telegram'],
      steps: [
        {
          title: 'Поиск предложений на Bybit P2P',
          connectorId: 'web',
          action: 'search',
          params: { query: 'bybit p2p' },
          iterate: false,
        },
        {
          title: 'Открыть страницу',
          connectorId: 'web',
          action: 'fetch',
          params: {},
          iterate: false,
        },
        {
          title: 'Отправка отчета в Telegram',
          connectorId: 'telegram',
          action: 'send_message',
          params: {},
          iterate: false,
        },
        {
          title: 'Поиск предложений на Bybit P2P',
          connectorId: 'web',
          action: 'search',
          params: { query: 'предложения bybit p2p' },
          iterate: false,
        },
        {
          title: 'Открыть страницу',
          connectorId: 'web',
          action: 'fetch',
          params: {},
          iterate: false,
        },
        {
          title: 'Отправка отчета в Telegram',
          connectorId: 'telegram',
          action: 'send_message',
          params: {},
          iterate: false,
        },
      ],
    };

    const sanitized = sanitizePlan(
      plan,
      context,
      'отслеживать bybit p2p и присылать отчет по топ 10 USDT/EUR',
    );

    assert.deepEqual(
      sanitized.steps.map((step) => `${step.connectorId}.${step.action}`),
      ['web.search', 'web.fetch', 'llm.generate', 'telegram.send_message'],
    );
    assert.equal(
      sanitized.steps.find((step) => step.action === 'fetch')?.params['url'],
      'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
    );
    assert.equal(
      sanitized.steps.find((step) => step.action === 'send_message')?.params[
        'text'
      ],
      '{{previous.text}}',
    );
  });

  it('rewrites fetch to the Bybit book when the prompt says байбит', () => {
    const plan: AgentPlanResult = {
      kind: 'workflow',
      providerId: 'qwen',
      message: 'Беру на себя',
      questions: [],
      connectors: ['web', 'telegram'],
      steps: [
        {
          title: 'Поиск',
          connectorId: 'web',
          action: 'search',
          params: { query: 'Bybit P2P USDT/EUR', site: 'bybit.com' },
          iterate: false,
        },
        {
          title: 'Открыть страницу',
          connectorId: 'web',
          action: 'fetch',
          params: { url: '{{previous.results.0.url}}' },
          iterate: false,
        },
        {
          title: 'Отчёт',
          connectorId: 'llm',
          action: 'generate',
          params: { text: '{{previous.text}}' },
          iterate: false,
        },
        {
          title: 'Telegram',
          connectorId: 'telegram',
          action: 'send_message',
          params: { text: '{{previous.text}}' },
          iterate: false,
        },
      ],
    };

    const sanitized = sanitizePlan(
      plan,
      context,
      'отслеживать все байбит страницы п2п по валютной паре USDT/EUR',
    );

    assert.equal(
      sanitized.steps.find((step) => step.action === 'search')?.params['query'],
      'bybit p2p buy USDT EUR otc',
    );
    assert.equal(
      sanitized.steps.find((step) => step.action === 'fetch')?.params['url'],
      'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
    );
  });

  it('replaces BestChange zip with a page fetch when asked to visit the site', () => {
    const plan: AgentPlanResult = {
      kind: 'workflow',
      providerId: 'qwen',
      message: 'Беру на себя',
      questions: [],
      connectors: ['web', 'llm'],
      steps: [
        {
          title: 'Получить курсы BestChange',
          connectorId: 'web',
          action: 'rates',
          params: {},
          iterate: false,
        },
        {
          title: 'Сводка',
          connectorId: 'llm',
          action: 'generate',
          params: { text: '{{previous}}' },
          iterate: false,
        },
      ],
    };

    const sanitized = sanitizePlan(
      plan,
      context,
      'зайди на bestchnage и отправь мне сводку о топ 10 предожение по валютной паре usdt/btc',
    );

    assert.deepEqual(
      sanitized.steps.map((step) => `${step.connectorId}.${step.action}`),
      ['web.fetch', 'llm.generate'],
    );
    assert.equal(
      sanitized.steps.find((step) => step.action === 'fetch')?.params['url'],
      'https://www.bestchange.ru/tether-trc20-to-bitcoin.html',
    );
  });

  it('always parses the page and adds an LLM step after a Tavily search', () => {
    const plan: AgentPlanResult = {
      kind: 'workflow',
      providerId: 'qwen',
      message: 'Беру на себя',
      questions: [],
      connectors: ['web'],
      steps: [
        {
          title: 'Найти рейс',
          connectorId: 'web',
          action: 'search',
          params: { query: 'ближайший рейс Дубай Минск' },
          iterate: false,
        },
      ],
    };

    const sanitized = sanitizePlan(
      plan,
      context,
      'найди ближайший рейс Дубай Минск',
    );

    assert.deepEqual(
      sanitized.steps.map((step) => `${step.connectorId}.${step.action}`),
      ['web.search', 'web.fetch', 'llm.generate'],
    );
    assert.equal(
      sanitized.steps.find((step) => step.action === 'fetch')?.params['url'],
      '{{previous.results.0.url}}',
    );
  });

  it('inserts the LLM parse step between a search and delivery', () => {
    const plan: AgentPlanResult = {
      kind: 'workflow',
      providerId: 'qwen',
      message: 'Беру на себя',
      questions: [],
      connectors: ['web', 'telegram'],
      steps: [
        {
          title: 'Поиск',
          connectorId: 'web',
          action: 'search',
          params: { query: 'новости про рынок' },
          iterate: false,
        },
        {
          title: 'Отправить',
          connectorId: 'telegram',
          action: 'send_message',
          params: { text: '{{previous.text}}' },
          iterate: false,
        },
      ],
    };

    const sanitized = sanitizePlan(
      plan,
      context,
      'найди новости и пришли мне в телеграм',
    );

    assert.deepEqual(
      sanitized.steps.map((step) => `${step.connectorId}.${step.action}`),
      ['web.search', 'web.fetch', 'llm.generate', 'telegram.send_message'],
    );
  });
});
