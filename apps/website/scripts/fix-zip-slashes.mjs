// One-shot: rewrite a zip's local + central directory entry names to use
// forward-slash separators per the ZIP spec. Windows PowerShell 5.1's
// Compress-Archive emits backslash entries, which break some POSIX unzip
// tools. Run this against the resulting zip to fix it in place.

import { readFileSync, writeFileSync } from 'fs';

const path = process.argv[2] || 'C:/Users/james/Downloads/operon-website.zip';
const buf = readFileSync(path);
let touched = 0;

// 1. Local file headers (sig 0x04034b50). Name follows 30-byte header.
{
  const sig = 0x04034b50;
  let p = 0;
  while (p < buf.length - 4) {
    if (buf.readUInt32LE(p) !== sig) break;
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const compressed = buf.readUInt32LE(p + 18);
    const nameStart = p + 30;
    for (let i = nameStart; i < nameStart + nameLen; i++) {
      if (buf[i] === 0x5c) { buf[i] = 0x2f; touched++; }
    }
    p = nameStart + nameLen + extraLen + compressed;
  }
}

// 2. Central directory (sig 0x02014b50).
{
  const sig = 0x02014b50;
  // Find first CD by scanning back from EOCD.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('EOCD not found');
  let p = buf.readUInt32LE(eocd + 16);
  while (p < buf.length - 4 && buf.readUInt32LE(p) === sig) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const nameStart = p + 46;
    for (let i = nameStart; i < nameStart + nameLen; i++) {
      if (buf[i] === 0x5c) { buf[i] = 0x2f; touched++; }
    }
    p = nameStart + nameLen + extraLen + commentLen;
  }
}

writeFileSync(path, buf);
console.log(`replaced ${touched} backslash bytes in ${path}`);
