import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as ExcelJS from 'exceljs';
import {
  alignToHeaders,
  appendObjectRow,
  applySheetOperations,
  findMatchingRows,
  matchHeader,
  rowPayload,
  sheetToObjects,
  updateMatchingRows,
} from './excel.sheet';

describe('excel.sheet', () => {
  it('maps aliases onto real sheet headers', () => {
    const headers = ['Имя', 'Телефон', 'Компания'];

    assert.equal(matchHeader(headers, 'name'), 'Имя');
    assert.equal(matchHeader(headers, 'from'), 'Имя');
    assert.equal(matchHeader(headers, 'phone'), 'Телефон');
    assert.equal(matchHeader(headers, 'subject'), 'Компания');
  });

  it('takes row object over previous file metadata', () => {
    const payload = rowPayload({
      fileName: 'leads.xlsx',
      fileId: 'disk:/leads.xlsx',
      headers: ['Имя'],
      rows: [],
      from: 'Иван',
      phone: '7900',
      row: { Имя: 'Пётр' },
    });

    assert.equal(payload['from'], 'Иван');
    assert.equal(payload['phone'], '7900');
    assert.equal(payload['Имя'], 'Пётр');
    assert.equal(payload['fileName'], undefined);
  });

  it('appends and finds by the sheet headers, not Name/Phone', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Заявки');
    sheet.addRow(['Клиент', 'Телефон', 'Сумма']);
    sheet.addRow(['Анна', '111', 10]);

    appendObjectRow(sheet, { name: 'Иван', phone: '222', amount: 50 });

    const { rows, headers } = sheetToObjects(sheet, 50);

    assert.deepEqual(headers, ['Клиент', 'Телефон', 'Сумма']);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.['Клиент'], 'Иван');
    assert.equal(rows[1]?.['Телефон'], '222');

    const found = findMatchingRows(rows, 'клиент', 'contains', 'ив');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.['Телефон'], '222');

    const updated = updateMatchingRows(
      sheet,
      'Телефон',
      'eq',
      '222',
      { Сумма: 90 },
    );

    assert.equal(updated.updated, 1);
    assert.equal(sheetToObjects(sheet, 50).rows[1]?.['Сумма'], 90);
  });

  it('puts values into existing headers and ignores junk keys', () => {
    const headers = ['Клиент', 'Телефон', 'Курс'];

    assert.deepEqual(
      alignToHeaders(headers, {
        name: 'Иван',
        phone: '7900',
        rate: 95.1,
        url: 'https://example.com',
        query: 'usdt',
      }),
      { Клиент: 'Иван', Телефон: '7900', Курс: 95.1 },
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Заявки');
    sheet.addRow(['Клиент', 'Курс']);
    applySheetOperations(sheet, [
      {
        type: 'append',
        row: { name: 'Иван', rate: 95.1, url: 'https://x.test', title: 'dump' },
      },
    ]);

    const { headers: next, rows } = sheetToObjects(sheet, 50);

    assert.deepEqual(next, ['Клиент', 'Курс']);
    assert.equal(rows[0]?.['Клиент'], 'Иван');
    assert.equal(rows[0]?.['Курс'], 95.1);
  });

  it('applies delete, sort, column and replace operations', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Заявки');
    sheet.addRow(['Клиент', 'Сумма']);
    sheet.addRow(['Анна', 10]);
    sheet.addRow(['Иван', 50]);
    sheet.addRow(['Анна', 10]);

    const deleted = applySheetOperations(sheet, [
      { type: 'delete', field: 'Клиент', op: 'eq', value: 'Анна' },
    ]);

    assert.equal(deleted.wrote, true);
    assert.equal(sheetToObjects(sheet, 50).rows.length, 1);

    applySheetOperations(sheet, [{ type: 'add_column', column: 'Статус' }]);
    applySheetOperations(sheet, [
      { type: 'sort', field: 'Сумма', dir: 'desc' },
      {
        type: 'replace',
        headers: ['Клиент', 'Сумма', 'Итого'],
        rows: [{ Клиент: 'Иван', Сумма: 50, Итого: 50 }],
      },
    ]);

    const { headers, rows } = sheetToObjects(sheet, 50);

    assert.deepEqual(headers, ['Клиент', 'Сумма', 'Итого']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.['Итого'], 50);
  });
});
