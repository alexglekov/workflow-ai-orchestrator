import { inflateRawSync, inflateSync } from 'node:zlib';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const findEocd = (buffer: Buffer): number => {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIG) {
      return index;
    }
  }

  throw new Error('ZIP: не найден EOCD');
};

const inflate = (data: Buffer, method: number): Buffer => {
  if (method === 0) {
    return data;
  }

  if (method !== 8) {
    throw new Error(`ZIP: сжатие ${method} не поддерживается`);
  }

  try {
    return inflateRawSync(data);
  } catch {
    return inflateSync(data);
  }
};

export const zipRead = (archive: Buffer, fileName: string): Buffer => {
  const eocd = findEocd(archive);
  const count = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);

  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error('ZIP: повреждён central directory');
    }

    const method = archive.readUInt16LE(offset + 10);
    const compressed = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8')
      .replace(/^.*\//, '');

    if (name === fileName) {
      if (archive.readUInt32LE(localOffset) !== LOCAL_SIG) {
        throw new Error(`ZIP: нет local header для ${fileName}`);
      }

      const localName = archive.readUInt16LE(localOffset + 26);
      const localExtra = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const payload = archive.subarray(start, start + compressed);

      return inflate(payload, method);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP: нет файла ${fileName}`);
};
