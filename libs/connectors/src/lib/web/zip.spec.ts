import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { describe, it } from 'node:test';
import { zipRead } from './zip';

const storedZip = (fileName: string, content: Buffer): Buffer => {
  const name = Buffer.from(fileName);
  const crc = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const eocd = Buffer.alloc(22);
  const localSize = local.length + name.length + content.length;
  const cdOffset = localSize;
  const cdSize = central.length + name.length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([local, name, content, central, name, eocd]);
};

describe('zipRead', () => {
  it('reads a stored (method 0) entry', () => {
    const payload = Buffer.from('BTC;1000000\nLTC;8000\n', 'utf8');
    const archive = storedZip('bm_rates.dat', payload);

    assert.equal(zipRead(archive, 'bm_rates.dat').toString('utf8'), payload.toString('utf8'));
  });
});
