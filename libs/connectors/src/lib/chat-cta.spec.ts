import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  launchedStatusMessage,
  LAUNCH_MARK,
  isLaunchIntent,
  isStopIntent,
  missingConnectorIds,
  requiredConnectorIds,
  STATUS_LAUNCHED_MARK,
  stripChatMarks,
  unresolvedConnectorIds,
  withReadyCta,
} from './chat-cta';

describe('chat-cta', () => {
  it('requires mail and telegram, not llm', () => {
    const required = requiredConnectorIds([
      { connectorId: 'mail' },
      { connectorId: 'llm' },
      { connectorId: 'telegram' },
      { connectorId: 'mail' },
    ]);

    assert.deepEqual(required, ['mail', 'telegram']);
  });

  it('finds missing connections', () => {
    const missing = missingConnectorIds(['mail', 'telegram'], [
      { connectorId: 'mail', status: 'connected' },
      { connectorId: 'telegram', status: 'disconnected' },
    ]);

    assert.deepEqual(missing, ['telegram']);
  });

  it('treats unbound workflow steps as unresolved even if another account exists', () => {
    const unresolved = unresolvedConnectorIds(
      [{ connectorId: 'telegram', connectionId: null }],
      [{ id: 'old', connectorId: 'telegram', status: 'connected' }],
    );

    assert.deepEqual(unresolved, ['telegram']);
  });

  it('resolves a workflow that bound a connected account', () => {
    const unresolved = unresolvedConnectorIds(
      [{ connectorId: 'telegram', connectionId: 'bot-2' }],
      [
        { id: 'bot-1', connectorId: 'telegram', status: 'connected' },
        { id: 'bot-2', connectorId: 'telegram', status: 'connected' },
      ],
    );

    assert.deepEqual(unresolved, []);
  });

  it('adds connect and launch marks', () => {
    const connect = withReadyCta('Цепочка готова', ['telegram'], false);
    const launch = withReadyCta('Цепочка готова', [], true);

    assert.equal(connect.includes('[[connect:telegram]]'), true);
    assert.equal(launch.includes('[[launch]]'), true);
    assert.equal(stripChatMarks(connect), 'Цепочка готова\n\nЧтобы запустить, в чате выберите существующее подключение или создайте новое.');
  });

  it('turns launch into a persistent status mark', () => {
    const launched = launchedStatusMessage();

    assert.equal(launched.includes(STATUS_LAUNCHED_MARK), true);
    assert.equal(stripChatMarks(launched), 'Запущено.');
    assert.equal(launched.includes(LAUNCH_MARK), false);
  });

  it('detects stop commands from chat', () => {
    assert.equal(isStopIntent('Останови бота'), true);
    assert.equal(isStopIntent('стоп'), true);
    assert.equal(isStopIntent('найди заявки в почте'), false);
  });

  it('detects launch commands from chat', () => {
    assert.equal(isLaunchIntent('запусти бота'), true);
    assert.equal(isLaunchIntent('начинай'), true);
    assert.equal(isLaunchIntent('начни'), true);
    assert.equal(isLaunchIntent('включи бота'), true);
    assert.equal(isLaunchIntent('поехали'), true);
    assert.equal(isLaunchIntent('найди заявки в почте'), false);
    assert.equal(isLaunchIntent('останови бота'), false);
  });
});
