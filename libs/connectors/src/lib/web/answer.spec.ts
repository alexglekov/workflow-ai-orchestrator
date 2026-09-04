import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeSearchText, extractiveAnswer } from './answer';

describe('composeSearchText', () => {
  it('puts the direct answer first, not a scraped Wikipedia dump', () => {
    const text = composeSearchText(
      'время в нью-йорке',
      [
        {
          title: 'Eastern Time Zone',
          url: 'https://en.wikipedia.org/wiki/Eastern_Time_Zone',
          snippet: 'Time zone',
          text: 'From Wikipedia, the free encyclopedia\n'.repeat(20),
        },
      ],
      { answer: 'Сейчас в Нью-Йорке 11:16, часовой пояс EDT (UTC−4).' },
    );

    assert.match(text, /^Сейчас в Нью-Йорке/);
    assert.doesNotMatch(text.slice(0, 80), /From Wikipedia/);
  });

  it('falls back to snippet facts when no model answer is available', () => {
    const answer = extractiveAnswer([
      {
        title: 'Население Токио 2026',
        url: 'https://chislennost.com/tokyo',
        snippet:
          'На 2026 год численность населения города Токио, Япония - составляет 8 967 741 человек.',
      },
      {
        title: 'Население Токио 2026: актуальные цифры',
        url: 'https://eurofest.org.ua/tokio',
        snippet:
          'По состоянию на 2026 год префектура Токио насчитывает примерно 14,27 миллиона жителей.',
      },
    ]);

    assert.match(answer, /8 967 741/);
    assert.match(answer, /14,27 миллиона/);
  });
});
