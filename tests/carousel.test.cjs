const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, getParams, normalizeManifest, loadManifest, buildEmbedUrl, buildIframeCode, calculateLayout, animationPhase, loadLogo } = require('../script.js');

const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
const response = data => ({ ok: true, json: async () => data });

test('Los enlaces actuales de Google Sites conservan grupo, color, alto, logo, separación y velocidad', () => {
  for (const group of ['INDUSTRIA', 'RESIDENCIAL', 'COMERCIAL']) {
    const config = getParams(`?mode=embed&grupo=${group}&h=600&logo=120&gap=6&speed=90&bg=ffffff`);
    assert.equal(config.grupo, group);
    assert.equal(config.mode, 'embed');
    assert.deepEqual([config.h, config.logo, config.gap, config.speed, config.bg], [600, 120, 6, 90, 'ffffff']);
  }
});

test('El alto del iframe es el solicitado, sin forzar 600 px ni 100vh', () => {
  const url = buildEmbedUrl('https://cuenta-nueva.github.io/CARRUSEL-MANTUA/?anterior=1#panel', 'INDUSTRIA', DEFAULTS);
  const code = buildIframeCode(url, 144);
  assert.match(code, /height="144"/);
  assert.match(code, /height:144px/);
  assert.match(code, /loading="eager"/);
  assert.doesNotMatch(code, /600|100vh|min-height/);
  assert.equal(new URL(url).origin, 'https://cuenta-nueva.github.io');
  assert.equal(new URL(url).pathname, '/CARRUSEL-MANTUA/');
  assert.equal(new URL(url).hash, '');
  assert.equal(new URL(url).searchParams.has('anterior'), false);
  assert.equal(new URL(url).searchParams.get('grupo'), 'INDUSTRIA');
});

test('Una pérdida de conexión o un cuerpo JSON atascado tiene un límite y recupera el respaldo', async () => {
  for (const fetcher of [async () => { throw Error('offline'); }, async () => ({ ok: true, json: () => new Promise(() => {}) })]) {
    const manifest = await loadManifest(original, { fetcher, timeout: 5 });
    assert.deepEqual(manifest, normalizeManifest(original));
  }
});

test('Un fallo transitorio del catálogo se reintenta; se usa la respuesta actual válida', async () => {
  let calls = 0;
  const manifest = await loadManifest(original, { fetcher: async () => ++calls === 1 ? { ok: false } : response({ NUEVO: ['logos/NUEVO/uno.svg'] }) });
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(manifest), ['NUEVO']);
});

test('Un catálogo vacío o inválido no sustituye los datos válidos', async () => {
  const manifest = await loadManifest(original, { fetcher: async () => response({ INVALIDO: ['https://other.example/logo.png', 'logos/../secreto.png'] }) });
  assert.deepEqual(manifest, normalizeManifest(original));
  assert.throws(() => normalizeManifest({}));
});

test('Respaldo, catálogo y todos los archivos que se publican coinciden', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const fallback = JSON.parse(html.match(/<script id="logo-manifest" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(fallback, original);
  assert.ok(Object.values(original).flat().length > 0);
  for (const entry of Object.values(original).flat()) {
    const source = typeof entry === 'string' ? entry : entry.src;
    assert.ok(fs.existsSync(path.join(__dirname, '..', source.split('?')[0])), source);
  }
});

test('El ciclo cubre el ancho sin huecos y los logos caben en marcos pequeños, móviles y pantallas grandes', () => {
  for (const width of [240, 320, 360, 390, 640, 768, 1200, 1920, 3840]) {
    for (const count of [1, 2, 8, 15]) {
      const layout = calculateLayout(width, 70, count, DEFAULTS);
      assert.ok(layout.distance >= width, `Ancho ${width}; ${count} logos`);
      assert.ok(layout.logoHeight <= 70);
      assert.ok(layout.repeats >= 1 && Number.isFinite(layout.repeats));
      const expectedVisible = width < 360 ? 2 : 3;
      if (width < 640) assert.ok(Math.abs(layout.slot * expectedVisible + layout.gap * (expectedVisible - 1) - width) < 0.01);
    }
  }
  assert.equal(calculateLayout(0, 0, 15, DEFAULTS), null);
  assert.equal(calculateLayout(1200, 144, 0, DEFAULTS), null);
  assert.equal(calculateLayout(1200, 144, 1, DEFAULTS, true).repeats, 1);
});

test('El cambio de ancho conserva la posición relativa de una animación en curso', () => {
  const oldDuration = 28000;
  const currentTime = 71400;
  const nextDuration = 19000;
  const phase = animationPhase(currentTime, oldDuration);
  const nextTime = phase * nextDuration;
  assert.ok(phase > 0);
  assert.ok(Math.abs(animationPhase(nextTime, nextDuration) - phase) < 1e-10);
});

test('Los PNG pequeños ocupan su ancho real, sin cajas vacías a los lados', () => {
  const sizes = Array.from({ length: 8 }, () => ({ width: 80, height: 50, vector: false }));
  const config = { ...DEFAULTS, gap: 18 };
  const layout = calculateLayout(1100, 144, sizes.length, config, false, sizes);
  assert.deepEqual(layout.widths, Array(8).fill(80));
  assert.equal(layout.distance, 8 * (80 + 18) * 2);
  assert.equal(layout.repeats, 2);
});

test('La separación predeterminada recupera los 12 px del carrusel anterior', () => {
  assert.equal(DEFAULTS.gap, 12);
  assert.equal(getParams('?gap=18').gap, 18); // Respeta enlaces ya configurados.
});

test('Logos anchos, verticales y vectoriales caben sin ampliar los PNG', () => {
  const sizes = [
    { width: 80, height: 50 },
    { width: 1200, height: 300 },
    { width: 200, height: 800 },
    { width: 20, height: 20, vector: true }
  ];
  const layout = calculateLayout(320, 144, sizes.length, DEFAULTS, false, sizes);
  assert.deepEqual(layout.widths, [80, layout.slot, 18, 72]);
  assert.equal(layout.logoHeight, 72);
});

test('El ciclo compacto sigue cubriendo el marco con pocos logos y alturas pequeñas', () => {
  for (const width of [240, 320, 390, 640, 1100, 1920, 3840]) {
    for (const height of [24, 60, 144]) {
      for (const count of [1, 2, 8, 15]) {
        const sizes = Array.from({ length: count }, (_, i) => i % 2 ? { width: 100, height: 600 } : { width: 80, height: 50 });
        const layout = calculateLayout(width, height, count, DEFAULTS, false, sizes);
        assert.ok(layout.distance >= width + 1);
        assert.equal(layout.widths.length, count);
        assert.ok(layout.widths.every(value => value > 0 && value <= layout.slot));
        const expected = layout.widths.reduce((sum, value) => sum + value + layout.gap, 0) * layout.repeats;
        assert.ok(Math.abs(layout.distance - expected) < 1e-8);
      }
    }
  }
});

class TestImage extends EventTarget {
  constructor(behaviors) {
    super(); this.behaviors = behaviors; this.requests = []; this.complete = false;
    this.naturalWidth = 0; this.naturalHeight = 0;
  }
  set src(url) {
    this.requests.push(url);
    this.complete = false;
    const behavior = this.behaviors[this.requests.length - 1] || 'error';
    if (behavior === 'hang') return;
    queueMicrotask(() => {
      if (behavior === 'error') this.dispatchEvent(new Event('error'));
      else {
        this.complete = true; this.naturalWidth = 600; this.naturalHeight = 300;
        this.dispatchEvent(new Event('load'));
      }
    });
  }
  decode() { return Promise.resolve(); }
}

test('Una imagen atascada no impide terminar la carga de las otras', async () => {
  const good = new TestImage(['load']);
  const blocked = new TestImage(['hang', 'hang']);
  const options = { base: 'https://mantua-decoracion.github.io/CARRUSEL-LOGOS/', timeout: 5 };
  const results = await Promise.all([loadLogo(good, 'logos/COMERCIAL/19.png', options), loadLogo(blocked, 'logos/COMERCIAL/20.png', options)]);
  assert.deepEqual(results, [true, false]);
  assert.equal(good.requests.length, 1);
  assert.equal(blocked.requests.length, 2);
});

test('La imagen se recupera tras un fallo sin reutilizar la respuesta fallida en caché', async () => {
  const image = new TestImage(['error', 'load']);
  assert.equal(await loadLogo(image, 'logos/INDUSTRIA/19.png', { base: 'https://example.test/CARRUSEL-LOGOS/', timeout: 20 }), true);
  assert.notEqual(image.requests[0], image.requests[1]);
});

test('La versión del logo y los nombres con espacios sobreviven al primer intento y al reintento', async () => {
  const image = new TestImage(['error', 'load']);
  const src = 'logos/INDUSTRIA/Logo Honda.png?v=abc123def4567890';
  assert.equal(normalizeManifest({ INDUSTRIA: [src] }).INDUSTRIA[0].src, src);
  assert.equal(await loadLogo(image, src, { base: 'https://example.test/CARRUSEL-LOGOS/', timeout: 20 }), true);
  for (const request of image.requests) {
    const url = new URL(request);
    assert.equal(url.pathname, '/CARRUSEL-LOGOS/logos/INDUSTRIA/Logo%20Honda.png');
    assert.equal(url.searchParams.get('v'), 'abc123def4567890');
  }
  assert.equal(new URL(image.requests[1]).searchParams.get('retry'), '1');
  assert.throws(() => normalizeManifest({ INDUSTRIA: ['logos/INDUSTRIA/logo.png?redirect=https://example.test'] }));
});

test('Cancelar una carga pendiente la termina y evita nuevos intentos', async () => {
  const controller = new AbortController();
  const image = new TestImage(['hang']);
  const promise = loadLogo(image, 'logos/INDUSTRIA/19.png', { base: 'https://example.test/', signal: controller.signal, timeout: 5000 });
  controller.abort();
  assert.equal(await promise, false);
  assert.equal(image.requests.length, 1);
});

test('Una imagen cargada no se descarta si el marco oculto retrasa decode()', async () => {
  const image = new TestImage(['load']);
  image.decode = () => new Promise(() => {});
  assert.equal(await loadLogo(image, 'logos/INDUSTRIA/19.png', { base: 'https://example.test/', timeout: 5 }), true);
  assert.equal(image.requests.length, 1);
});

test('Un SVG con dimensiones válidas no depende de que decode() esté disponible', async () => {
  const image = new TestImage(['load']);
  image.decode = () => { throw new Error('El navegador no admite decode para este SVG'); };
  assert.equal(await loadLogo(image, 'logos/INDUSTRIA/20.svg', { base: 'https://example.test/', timeout: 5 }), true);
  assert.equal(image.requests.length, 1);
});
