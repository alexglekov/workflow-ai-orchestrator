import { spawn } from 'node:child_process';

/**
 * Telegram принимает голосовые только в OGG/Opus, а Qwen TTS отдаёт WAV.
 * Конвертируем через ffmpeg; если его нет, зовущий код шлёт файл как audio.
 */
export const wavToOpus = async (wav: Buffer): Promise<Buffer | null> => {
  const binary = process.env['FFMPEG_PATH'] || 'ffmpeg';

  return new Promise((resolve) => {
    const child = spawn(binary, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-c:a',
      'libopus',
      '-b:a',
      '32k',
      '-ac',
      '1',
      '-f',
      'ogg',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let failed = false;

    const done = (value: Buffer | null) => {
      if (!failed) {
        failed = true;
        resolve(value);
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.on('error', () => {
      done(null);
    });
    child.on('close', (code) => {
      const output = Buffer.concat(chunks);

      done(code === 0 && output.length > 0 ? output : null);
    });
    child.stdin.on('error', () => {
      done(null);
    });
    child.stdin.end(wav);
  });
};
