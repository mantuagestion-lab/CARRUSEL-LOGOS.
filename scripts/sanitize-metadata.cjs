'use strict';

// Limpieza local previa a la subida. No remuestrea ni vuelve a codificar imágenes.
const fs = require('node:fs');
const path = require('node:path');
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const METADATA = new Set(['eXIf', 'iTXt', 'tEXt', 'zTXt']);

function parsePng(bytes) {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Firma PNG inválida');
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new Error('PNG incompleto');
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12) throw new Error('Bloque PNG incompleto');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('Tipo de bloque PNG inválido');
    const end = offset + size + 12;
    chunks.push({ type, bytes: bytes.subarray(offset, end) });
    offset = end;
    if (type === 'IEND') break;
  }
  if (chunks[0]?.type !== 'IHDR' || chunks.at(-1)?.type !== 'IEND'
      || !chunks.some(chunk => chunk.type === 'IDAT') || offset !== bytes.length) {
    throw new Error('Estructura PNG inválida');
  }
  return chunks;
}

function stripPngMetadata(bytes) {
  const chunks = parsePng(bytes);
  const removed = chunks.filter(chunk => METADATA.has(chunk.type)).map(chunk => chunk.type);
  if (!removed.length) return { bytes, removed };
  const kept = chunks.filter(chunk => !METADATA.has(chunk.type));
  const cleaned = Buffer.concat([SIGNATURE, ...kept.map(chunk => chunk.bytes)]);
  // Los datos de píxeles, transparencia, dimensiones y color se conservan byte a byte.
  const result = parsePng(cleaned);
  if (result.length !== kept.length || result.some((chunk, i) => !chunk.bytes.equals(kept[i].bytes))) {
    throw new Error('La limpieza alteró datos de imagen');
  }
  return { bytes: cleaned, removed };
}

function auditLogos(write = false) {
  const root = path.resolve(__dirname, '..', 'logos');
  const report = [];
  for (const group of ['COMERCIAL', 'INDUSTRIA', 'RESIDENCIAL']) {
    const folder = path.join(root, group);
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.png')) continue;
      const filename = path.join(folder, entry.name);
      const original = fs.readFileSync(filename);
      const cleaned = stripPngMetadata(original);
      if (!cleaned.removed.length) continue;
      if (write) fs.writeFileSync(filename, cleaned.bytes);
      report.push({ file: `${group}/${entry.name}`, removed: cleaned.removed,
        savedBytes: original.length - cleaned.bytes.length, imageDataUnchanged: true });
    }
  }
  return report;
}

if (require.main === module) {
  const option = process.argv[2] || '--check';
  if (!['--check', '--write'].includes(option)) throw new Error('Usa --check o --write');
  const report = auditLogos(option === '--write');
  console.log(JSON.stringify({ mode: option, files: report.length, report }, null, 2));
  if (option === '--check' && report.length) process.exitCode = 1;
}

module.exports = { parsePng, stripPngMetadata };
