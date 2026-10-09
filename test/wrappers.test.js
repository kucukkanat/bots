import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zip, stickerManifest, toDesign } from '../src/stickers.js';
import { crc32 } from '../src/export.js';
import { decodeDNA, encodeDNA } from '../src/options.js';
import { DEFAULTS } from '../src/bot.js';

const enc = new TextEncoder(), dec = new TextDecoder();

/** Read a ZIP back through its central directory, checking each local header and CRC. */
function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50, 'end of central directory');
  const n = v.getUint16(eocd + 10, true), size = v.getUint32(eocd + 12, true);
  let p = v.getUint32(eocd + 16, true);
  assert.equal(p + size, eocd, 'central directory runs up to the end record');
  const files = [];
  for (let i = 0; i < n; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    assert.equal(v.getUint16(p + 10, true), 0, 'STORE');
    const crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    assert.equal(csize, usize);
    assert.equal(v.getUint32(off, true), 0x04034b50, 'local header');
    assert.equal(v.getUint32(off + 14, true), crc);
    const lnlen = v.getUint16(off + 26, true), lxlen = v.getUint16(off + 28, true);
    assert.equal(dec.decode(buf.subarray(off + 30, off + 30 + lnlen)), name);
    const data = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    files.push({ name, data });
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(enc.encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

test('zip writer: STORE entries read back through the central directory', () => {
  const input = [
    { name: 'a.txt', data: enc.encode('hello') },
    { name: 'dir/ünï.json', data: enc.encode('{"x":1}') },
    { name: 'empty', data: new Uint8Array(0) },
    { name: 'bin', data: Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 255) },
  ];
  const out = zip(input, new Date(2026, 9, 9, 12, 30, 10));
  const files = unzip(out);
  assert.deepEqual(files.map((f) => f.name), input.map((f) => f.name));
  files.forEach((f, i) => assert.deepEqual([...f.data], [...input[i].data]));
  // DOS date/time in the first local header.
  const v = new DataView(out.buffer);
  assert.equal(v.getUint16(10, true), (12 << 11) | (30 << 5) | 5);
  assert.equal(v.getUint16(12, true), (46 << 9) | (10 << 5) | 9);
  assert.equal(v.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 names flag');
});

test('zip writer: an empty archive is just the end record', () => {
  const out = zip([]);
  assert.equal(out.length, 22);
  assert.equal(unzip(out).length, 0);
});

test('sticker manifest: names from label/type, DNA that round-trips', () => {
  const cat = { type: 'cat', hat: 'party', color: '#ff8800' };
  const dna = encodeDNA({ type: 'clover', state: 'working' }, DEFAULTS);
  const list = [cat, { type: 'star', label: 'Héllo Wörld!' }, dna, 'someone@example.com'];
  const m = stickerManifest(list);
  assert.deepEqual(m.map((e) => e.file), ['01-cat.png', '02-hello-world.png', '03-clover.png', m[3].file]);
  assert.match(m[3].file, /^04-[a-z0-9-]+\.png$/);
  const back = decodeDNA(m[0].dna);
  assert.equal(back.type, 'cat'); assert.equal(back.hat, 'party'); assert.equal(back.color, '#ff8800');
  assert.equal({ ...DEFAULTS, ...decodeDNA(m[2].dna) }.type, 'clover'); // the default type isn't stored
  assert.equal(decodeDNA(m[2].dna).state, 'working');
  assert.equal(m[1].label, 'Héllo Wörld!');
  assert.equal(stickerManifest([cat], { format: 'webp' })[0].file, '01-cat.webp');
  // Grouped options normalise before encoding.
  assert.equal(decodeDNA(toDesign({ type: 'cat', wear: { hat: 'witch' } }).dna).hat, 'witch');
});

const has = async (name) => import(name).then(() => true, () => false);

test('vue wrapper imports and defines a component', { skip: !(await has('vue')) && 'vue not installed' }, async () => {
  const m = await import('../src/vue.js');
  assert.equal(m.BotAvatar.name, 'BotAvatar');
  assert.ok(m.BotAvatar.emits.includes('poke') && m.BotAvatar.emits.includes('ready'));
  const registered = [];
  m.install({ component: (n, c) => registered.push([n, c]) });
  assert.deepEqual(registered, [['BotAvatar', m.BotAvatar]]);
  assert.equal(m.default, m.BotAvatar);
});

test('svelte action module imports without svelte', async () => {
  const m = await import('../src/svelte.js');
  assert.equal(typeof m.bot, 'function');
  assert.equal(m.default, m.bot);
});
