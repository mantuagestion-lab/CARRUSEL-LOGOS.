'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parsePng, stripPngMetadata } = require('../scripts/sanitize-metadata.cjs');
const original = fs.readFileSync(path.join(__dirname, '../logos/INDUSTRIA/17.png'));

function chunk(type, content) {
  const bytes = Buffer.from(content);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(bytes.length);
  header.write(type, 4, 4, 'ascii');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([header.subarray(4), bytes])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const footer = Buffer.alloc(4);
  footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, bytes, footer]);
}

test('Quitar metadatos conserva exactamente los bloques de imagen', () => {
  const clean = stripPngMetadata(original).bytes;
  const blocks = parsePng(clean);
  const decorated = Buffer.concat([clean.subarray(0, 8), blocks[0].bytes,
    chunk('tEXt', 'Software\0Editor de prueba'), chunk('iTXt', 'Prueba\0\0\0\0\0datos de prueba'),
    chunk('eXIf', 'metadatos de prueba'), chunk('zTXt', 'Prueba\0\0datos de prueba'),
    ...blocks.slice(1).map(block => block.bytes)]);
  const result = stripPngMetadata(decorated);
  assert.deepEqual(result.removed, ['tEXt', 'iTXt', 'eXIf', 'zTXt']);
  assert.deepEqual(result.bytes, clean);
});

test('Una segunda limpieza no cambia un PNG que ya está limpio', () => {
  const first = stripPngMetadata(original).bytes;
  const second = stripPngMetadata(first);
  assert.deepEqual(second.removed, []);
  assert.strictEqual(second.bytes, first);
});

test('Un PNG incompleto o con datos después del final no se modifica', () => {
  assert.throws(() => stripPngMetadata(original.subarray(0, -5)), /PNG/);
  assert.throws(() => stripPngMetadata(Buffer.concat([original, Buffer.from('unexpected')])));
});
