const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// DOM mínimo para probar eventos y conservación de nodos, no para validar el
// dibujo del navegador. La prueba HTML independiente comprueba el dibujo real.
function setup(t, { width = 1100, height = 144, reduced = false } = {}) {
  const state = { width, height, requests: 0, frames: new Map(), nextFrame: 1, observers: [], animations: [] };
  class Element extends EventTarget {
    constructor(tag) {
      super();
      this.tagName = tag;
      this.children = [];
      this.attributes = new Map();
      this.style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => this.classList.toggle(name, true),
        toggle: (name, force) => {
          const classes = new Set(this.className.split(/\s+/).filter(Boolean));
          const add = force === undefined ? !classes.has(name) : force;
          if (add) classes.add(name); else classes.delete(name);
          this.className = [...classes].join(' ');
          return add;
        }
      };
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    get className() { return this.getAttribute('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get clientWidth() { return state.width; }
    get clientHeight() { return state.height; }
    appendChild(child) {
      if (child.tagName === '#fragment') {
        [...child.children].forEach(item => this.appendChild(item));
      } else {
        child.remove();
        this.children.push(child);
        child.parent = this;
      }
      return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) {
      [...this.children].forEach(child => child.remove());
      this.append(...children);
    }
    remove() {
      if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
    querySelectorAll(selector) {
      const result = [];
      for (const child of this.children) {
        if (selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.tagName === selector) result.push(child);
        result.push(...child.querySelectorAll(selector));
      }
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    set innerHTML(value) {
      this.replaceChildren();
      const stack = [this];
      for (const [, end, tag, attrs] of value.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/g)) {
        if (end) { stack.pop(); continue; }
        const node = new Element(tag);
        for (const [, name, val] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(name, val);
        stack.at(-1).appendChild(node);
        stack.push(node);
      }
    }
    cloneNode(deep) {
      const clone = new Element(this.tagName);
      clone.attributes = new Map(this.attributes);
      clone.style.values = new Map(this.style.values);
      clone.naturalWidth = this.naturalWidth;
      clone.naturalHeight = this.naturalHeight;
      if (deep) this.children.forEach(child => clone.appendChild(child.cloneNode(true)));
      return clone;
    }
    animate(keyframes, options) {
      const animation = {
        keyframes, options, currentTime: 0, playState: 'running',
        pause() { this.playState = 'paused'; },
        play() { this.playState = 'running'; },
        cancel() { this.playState = 'idle'; }
      };
      state.animations.push(animation);
      return animation;
    }
  }
  class Image extends Element {
    constructor() { super('img'); this.complete = false; }
    set src(value) {
      this.source = value;
      state.requests += 1;
      queueMicrotask(() => {
        this.complete = true;
        this.naturalWidth = 600;
        this.naturalHeight = 300;
        this.dispatchEvent(new Event('load'));
      });
    }
    // Una vista oculta puede posponer la decodificación indefinidamente.
    decode() { return new Promise(() => {}); }
  }
  const document = Object.assign(new EventTarget(), {
    hidden: false, baseURI: 'https://example.test/CARRUSEL-LOGOS./',
    createElement: tag => tag === 'img' ? new Image() : new Element(tag),
    createDocumentFragment: () => new Element('#fragment')
  });
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => preference, visualViewport: new EventTarget()
  });
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; state.observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const context = {
    module: { exports: {} }, window, document, ResizeObserver,
    AbortController, URL, URLSearchParams, setTimeout, clearTimeout,
    requestAnimationFrame: callback => { const id = state.nextFrame++; state.frames.set(id, callback); return id; },
    cancelAnimationFrame: id => state.frames.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8'), context);
  const { createCarousel, DEFAULTS } = context.module.exports;
  const target = new Element('main');
  const logos = ['one.svg', 'two.png', 'three.svg'].map(src => ({ src: `logos/INDUSTRIA/${src}`, alt: src }));
  const controller = createCarousel(target, logos, DEFAULTS, 'INDUSTRIA');
  t.after(() => controller.destroy());
  return Object.assign(state, {
    target, document, window, preference, controller,
    stage: target.querySelector('.embed-stage'),
    viewport: target.querySelector('.logos-viewport'),
    group: target.querySelector('.logos-group'),
    track: target.querySelector('.logos-track'),
    flush() { const callbacks = [...state.frames.values()]; state.frames.clear(); callbacks.forEach(callback => callback()); },
    async loaded() { await new Promise(setImmediate); this.flush(); },
    resize(nextWidth, nextHeight = state.height) {
      state.width = nextWidth;
      state.height = nextHeight;
      window.dispatchEvent(new Event('resize'));
      state.observers.forEach(observer => observer.callback());
      this.flush();
    }
  });
}

test('El carrusel no tiene botón ni se pausa por puntero, clic, toque o foco', async t => {
  const page = setup(t);
  await page.loaded();
  assert.equal(page.target.querySelector('button'), null);
  assert.equal(page.viewport.getAttribute('tabindex'), null);
  const animation = page.animations.at(-1);
  for (const type of ['pointerenter', 'pointerleave', 'click', 'touchstart', 'focusin', 'focusout']) {
    page.viewport.dispatchEvent(Object.assign(new Event(type), { pointerType: 'mouse' }));
    assert.equal(animation.playState, 'running', type);
  }
  assert.equal(page.requests, 3);
  assert.equal(page.group.children.filter(item => item.getAttribute('aria-hidden') !== 'true').length, 3);
  assert.equal(page.track.children.length, 2);
  assert.ok(page.track.children.every(group => group.children.every(item => item.style.values.has('--logo-width'))));
  assert.equal(animation.keyframes[1].transform, 'translateX(-50%)');
});

test('Computadora, teléfono, ancho cero y regreso al mismo tamaño conservan logos y movimiento', async t => {
  const page = setup(t);
  await page.loaded();
  const originals = page.group.children.filter(item => item.getAttribute('aria-hidden') !== 'true');
  for (const width of [390, 320, 240, 390, 1100]) {
    page.resize(width);
    let animation = page.animations.at(-1);
    animation.currentTime = animation.options.duration * 0.4;
    const count = page.animations.length;
    page.resize(0);
    assert.equal(animation.playState, 'paused');
    page.resize(width);
    animation = page.animations.at(-1);
    assert.equal(page.animations.length, count + 1);
    assert.equal(animation.playState, 'running');
    assert.ok(Math.abs(animation.currentTime / animation.options.duration - 0.4) < 1e-10);
    assert.deepEqual(page.group.children.slice(0, 3), originals);
    assert.equal(page.requests, 3);
  }
});

test('Un carrusel que se carga oculto o con alto cero aparece sin volver a pedir las imágenes', async t => {
  for (const size of [{ width: 0 }, { height: 0 }]) {
    const page = setup(t, size);
    await page.loaded();
    assert.equal(page.animations.length, 0);
    assert.equal(page.group.querySelectorAll('.is-loaded').length, 3);
    page.resize(320, 144);
    assert.equal(page.animations.at(-1).playState, 'running');
    assert.equal(page.requests, 3);
  }
});

test('Los avisos duplicados de tamaño se reúnen en un único cuadro', async t => {
  const page = setup(t);
  await page.loaded();
  page.width = 390;
  page.window.dispatchEvent(new Event('resize'));
  page.window.visualViewport.dispatchEvent(new Event('resize'));
  page.window.dispatchEvent(new Event('orientationchange'));
  page.observers[0].callback();
  assert.equal(page.frames.size, 1);
  page.flush();
  assert.equal(page.animations.length, 2);
  assert.equal(page.requests, 3);
});

test('Restaurar pestaña o historial recupera el ciclo y destruirlo retira los observadores', async t => {
  const page = setup(t);
  await page.loaded();
  page.document.hidden = true;
  page.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(page.animations.at(-1).playState, 'paused');
  page.document.hidden = false;
  page.document.dispatchEvent(new Event('visibilitychange'));
  page.flush();
  assert.equal(page.animations.at(-1).playState, 'running');
  page.window.dispatchEvent(new Event('pageshow'));
  page.flush();
  assert.equal(page.animations.length, 3);
  assert.equal(page.requests, 3);
  page.controller.destroy();
  assert.ok(page.observers.every(observer => observer.disconnected));
  page.window.dispatchEvent(new Event('resize'));
  page.window.dispatchEvent(new Event('pageshow'));
  assert.equal(page.frames.size, 0);
});

test('Movimiento reducido mantiene los logos visibles y permite desplazarlos con teclado', async t => {
  const page = setup(t, { reduced: true });
  await page.loaded();
  assert.equal(page.animations.length, 0);
  assert.equal(page.viewport.getAttribute('tabindex'), '0');
  assert.equal(page.group.children.length, 3);
  assert.equal(page.group.querySelectorAll('.is-loaded').length, 3);
  page.preference.matches = false;
  page.preference.dispatchEvent(new Event('change'));
  page.flush();
  assert.equal(page.viewport.getAttribute('tabindex'), null);
  assert.equal(page.animations.at(-1).playState, 'running');
  assert.equal(page.requests, 3);
});
