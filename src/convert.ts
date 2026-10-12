import { CONVERTIBLE } from './model';

export async function convertBook(source: string, extension: string, executable: string): Promise<ArrayBuffer> {
  if (!CONVERTIBLE.includes(extension.toLowerCase())) throw new Error('Unsupported conversion format.');
  // Node modules are loaded only on desktop, preserving mobile EPUB support.
  const { execFile } = require('child_process') as typeof import('child_process');
  const fs = require('fs/promises') as typeof import('fs/promises');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  if (!path.isAbsolute(source)) throw new Error('Conversion source must be an absolute path.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebook-plus-'));
  const output = path.join(dir, 'converted.epub');
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(executable, [source, output], { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (error) reject(new Error(`Calibre conversion failed. Check the executable path and use a DRM-free book. ${stderr?.slice(-500) || error.message}`));
        else resolve();
      });
    });
    const data = await fs.readFile(output);
    if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('Calibre did not produce an EPUB archive.');
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } finally {
    const root = path.resolve(os.tmpdir());
    if (path.dirname(path.resolve(dir)) === root && path.basename(dir).startsWith('ebook-plus-')) await fs.rm(dir, { recursive: true, force: true });
  }
}
