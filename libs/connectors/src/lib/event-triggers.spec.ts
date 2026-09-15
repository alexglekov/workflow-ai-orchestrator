import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventTriggerTypesFromSteps, isEventTriggerType } from './event-triggers';

describe('event triggers', () => {
  it('maps incoming telegram and new mail steps to events', () => {
    assert.deepEqual(
      eventTriggerTypesFromSteps([
        { connectorId: 'telegram', action: 'get_updates' },
        { connectorId: 'llm', action: 'generate' },
        { connectorId: 'mail', action: 'fetch_new' },
      ]),
      ['telegram', 'mail'],
    );
  });

  it('ignores send actions', () => {
    assert.deepEqual(
      eventTriggerTypesFromSteps([
        { connectorId: 'telegram', action: 'send_message' },
        { connectorId: 'mail', action: 'send' },
      ]),
      [],
    );
  });

  it('knows event trigger types', () => {
    assert.equal(isEventTriggerType('telegram'), true);
    assert.equal(isEventTriggerType('schedule'), false);
  });
});
