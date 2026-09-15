import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flattenTelegramInput,
  normalizeTelegramMessage,
  parseBusinessConnection,
} from './normalize';

describe('telegram normalize', () => {
  it('reads business_message and business_connection_id', () => {
    const item = normalizeTelegramMessage({
      update_id: 9,
      business_message: {
        message_id: 4,
        business_connection_id: 'biz-1',
        date: 1,
        text: 'есть ли товар',
        chat: { id: 555 },
        from: { id: 777, username: 'client' },
      },
    });

    assert.equal(item?.chatId, '555');
    assert.equal(item?.text, 'есть ли товар');
    assert.equal(item?.businessConnectionId, 'biz-1');
    assert.equal(item?.username, 'client');
  });

  it('parses business_connection from webhook payload', () => {
    const parsed = parseBusinessConnection({
      business_connection: {
        id: 'biz-2',
        user: { id: 42, first_name: 'Анна', username: 'anna' },
        user_chat_id: 42,
        is_enabled: true,
        can_reply: true,
      },
    });

    assert.equal(parsed?.id, 'biz-2');
    assert.equal(parsed?.userChatId, '42');
    assert.equal(parsed?.username, 'anna');
    assert.equal(parsed?.canReply, true);
    assert.equal(parsed?.isEnabled, true);
  });

  it('parses rights.can_reply from getBusinessConnection', () => {
    const parsed = parseBusinessConnection({
      id: 'biz-3',
      user: { id: 8, first_name: 'Иван' },
      user_chat_id: 8,
      is_enabled: true,
      rights: { can_reply: true },
    });

    assert.equal(parsed?.canReply, true);
  });

  it('flattens business fields onto run input', () => {
    const flat = flattenTelegramInput({
      business_message: {
        message_id: 1,
        business_connection_id: 'biz-4',
        text: 'привет',
        chat: { id: 10 },
        from: { id: 10, first_name: 'Клиент' },
      },
    });

    assert.equal(flat['chatId'], '10');
    assert.equal(flat['businessConnectionId'], 'biz-4');
    assert.equal(flat['text'], 'привет');
  });
});
