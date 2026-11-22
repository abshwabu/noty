/**
 * Pure TypeScript ZIP Archive Encoder and Decoder
 * Implements the PKZIP specification (ZIP 2.0 Store format) with UTF-8 filename support.
 * Works seamlessly offline in browser, Tauri webview, Android, and test environments.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

export interface ZipEntryOutput {
  path: string;
  data: Uint8Array;
  isDir: boolean;
}

/**
 * Creates a valid ZIP binary archive from a list of files
 */
export function createZipArchive(files: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const isDir = rawPath.endsWith('/');
    const pathBytes = encoder.encode(rawPath);
    const dataBytes =
      typeof file.content === 'string'
        ? encoder.encode(file.content)
        : file.content instanceof Uint8Array
        ? file.content
        : new Uint8Array(0);

    const crc = isDir ? 0 : crc32(dataBytes);
    const size = dataBytes.length;

    // DOS Date & Time (using static standard timestamp for reproducibility)
    const time = 0x4800; // 09:00:00
    const date = 0x5cd6; // 2026-06-22

    // 1. Local File Header (30 bytes + filename + data)
    const localHeader = new Uint8Array(30 + pathBytes.length + size);
    const lView = new DataView(localHeader.buffer);

    lView.setUint32(0, 0x04034b50, true); // Local file header signature
    lView.setUint16(4, 20, true); // Version needed to extract (2.0)
    lView.setUint16(6, 0x0800, true); // General purpose bit flag (Bit 11: UTF-8)
    lView.setUint16(8, 0, true); // Compression method (0 = Store)
    lView.setUint16(10, time, true);
    lView.setUint16(12, date, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, size, true); // Compressed size
    lView.setUint32(22, size, true); // Uncompressed size
    lView.setUint16(26, pathBytes.length, true);
    lView.setUint16(28, 0, true); // Extra field length

    localHeader.set(pathBytes, 30);
    localHeader.set(dataBytes, 30 + pathBytes.length);
    localHeaders.push(localHeader);

    // 2. Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + pathBytes.length);
    const cView = new DataView(centralHeader.buffer);

    cView.setUint32(0, 0x02014b50, true); // Central directory file header signature
    cView.setUint16(4, 20, true); // Version made by
    cView.setUint16(6, 20, true); // Version needed to extract
    cView.setUint16(8, 0x0800, true); // Flags (UTF-8)
    cView.setUint16(10, 0, true); // Method (Store)
    cView.setUint16(12, time, true);
    cView.setUint16(14, date, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, size, true);
    cView.setUint32(24, size, true);
    cView.setUint16(28, pathBytes.length, true);
    cView.setUint16(30, 0, true); // Extra field length
    cView.setUint16(32, 0, true); // File comment length
    cView.setUint16(34, 0, true); // Disk number start
    cView.setUint16(36, 0, true); // Internal attributes
    cView.setUint32(38, isDir ? 0x10 : 0x20, true); // External attributes (directory or archive)
    cView.setUint32(42, currentOffset, true); // Offset of local header

    centralHeader.set(pathBytes, 46);
    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length;
  }

  const centralDirectoryOffset = currentOffset;
  const centralDirectorySize = centralHeaders.reduce((acc, h) => acc + h.length, 0);

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true); // EOCD signature
  eView.setUint16(4, 0, true); // Disk number
  eView.setUint16(6, 0, true); // Disk where central directory starts
  eView.setUint16(8, files.length, true); // Entries on this disk
  eView.setUint16(10, files.length, true); // Total entries
  eView.setUint32(12, centralDirectorySize, true);
  eView.setUint32(16, centralDirectoryOffset, true);
  eView.setUint16(20, 0, true); // Comment length

  // Combine into single Uint8Array
  const totalLength = currentOffset + centralDirectorySize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}

/**
 * Parses a ZIP binary archive into entries
 */
export function parseZipArchive(zipData: Uint8Array): ZipEntryOutput[] {
  const entries: ZipEntryOutput[] = [];
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  const decoder = new TextDecoder('utf-8');
  let offset = 0;

  while (offset + 30 <= zipData.length) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x04034b50) {
      // Local File Header
      const compression = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const nameBytes = zipData.subarray(offset + 30, offset + 30 + nameLen);
      const path = decoder.decode(nameBytes);
      const dataStart = offset + 30 + nameLen + extraLen;
      const data = zipData.subarray(dataStart, dataStart + compressedSize);
      const isDir = path.endsWith('/');

      // Only uncompressed (Store) is supported directly in pure synchronous parser
      if (compression === 0 || compression === 8) {
        entries.push({
          path,
          data: new Uint8Array(data),
          isDir,
        });
      }

      offset = dataStart + compressedSize;
    } else {
      // Reached Central Directory or EOCD
      break;
    }
  }

  return entries;
}
