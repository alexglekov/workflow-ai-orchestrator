import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksRelevant } from './relevance';
import type { SearchHit } from './rank';

const hit = (title: string, url: string): SearchHit => ({
  title,
  url,
  snippet: '',
});

describe('looksRelevant', () => {
  it('rejects a page of results about something else entirely', () => {
    const hits = [
      hit('Lionel Messi Stats, Goals, Records', 'https://fbref.com/messi'),
      hit('Lionel Messi - Wikipedia', 'https://en.wikipedia.org/wiki/Lionel_Messi'),
      hit('Messi Career Stats - ESPN', 'https://espn.com/messi'),
    ];

    assert.equal(looksRelevant(hits, 'сколько времени сейчас в Нью-Йорке'), false);
  });

  it('accepts results that match the query despite russian cases', () => {
    const hits = [
      hit('Точное время в Нью-Йорке сейчас', 'https://timeserver.ru/new-york'),
      hit('Точное время в Нью-Йорке, США', 'https://timehelper.ru/new-york'),
    ];

    assert.equal(looksRelevant(hits, 'сколько времени сейчас в Нью-Йорке'), true);
  });

  it('does not filter short queries where terms rarely appear verbatim', () => {
    assert.equal(
      looksRelevant([hit('Bitcoin price', 'https://coinmarketcap.com')], 'BTC'),
      true,
    );
  });

  it('does not accept junk just because the year matches a snippet date', () => {
    const hits = [
      hit('My Aadhaar - Unique Identification Authority of India', 'https://uidai.gov.in/en/my-aadhaar'),
      hit('Home - Unique Identification Authority of India', 'https://uidai.gov.in/en'),
      hit('Aadhaar - UMANG', 'https://web.umang.gov.in/aadhaar.html'),
    ].map((item) => ({ ...item, snippet: '22 апр. 2026 г. · Aadhaar services' }));

    assert.equal(looksRelevant(hits, 'кто выиграл лигу чемпионов 2026'), false);
  });
});
