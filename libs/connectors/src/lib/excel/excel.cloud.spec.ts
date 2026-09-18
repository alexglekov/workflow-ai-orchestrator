import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSpreadsheet,
  isYandexDocumentUrl,
  parseDocumentUrl,
} from './excel.cloud';

describe('excel.cloud urls', () => {
  it('treats Yandex Disk and Yandex Tables links as yandex', () => {
    const disk = parseDocumentUrl('https://disk.yandex.ru/i/AbCdEf123');
    assert.equal(disk.provider, 'yandex');
    assert.equal(disk.webUrl, 'https://disk.yandex.ru/i/AbCdEf123');

    const folder = parseDocumentUrl('https://yadi.sk/d/publicFolder');
    assert.equal(folder.provider, 'yandex');

    const docs = parseDocumentUrl(
      'https://docs.yandex.ru/docs/view?url=ya-disk-public://secret',
    );
    assert.equal(docs.provider, 'yandex');
    assert.equal(docs.id, 'ya-disk-public://secret');
  });

  it('recognizes spreadsheet names without an xlsx suffix', () => {
    assert.equal(isSpreadsheet('Продажи', 'spreadsheet'), true);
    assert.equal(isSpreadsheet('leads.xlsx', ''), true);
    assert.equal(isSpreadsheet('photo.jpg', 'image'), false);
  });

  it('detects yandex document urls', () => {
    assert.equal(isYandexDocumentUrl('https://disk.yandex.com/d/xyz'), true);
    assert.equal(isYandexDocumentUrl('https://docs.yandex.ru/docs/view?id=1'), true);
    assert.equal(isYandexDocumentUrl('https://example.com/file.xlsx'), false);
  });
});
