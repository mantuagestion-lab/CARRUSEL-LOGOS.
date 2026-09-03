'use strict';

(() => {
  const DEFAULTS = Object.freeze({ h: 144, logo: 72, gap: 18, speed: 42, bg: 'ffffff' });

  function numberInRange(value, fallback, min, max) {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeConfig(values = {}) {
    const background = String(values.bg || DEFAULTS.bg).replace(/^#/, '');
    return {
      h: Math.round(numberInRange(values.h, DEFAULTS.h, 60, 720)),
      logo: numberInRange(values.logo, DEFAULTS.logo, 16, 200),
      gap: numberInRange(values.gap, DEFAULTS.gap, 0, 64),
      speed: numberInRange(values.speed, DEFAULTS.speed, 10, 200),
      bg: /^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(background) ? background : DEFAULTS.bg
    };
  }

  function getParams(search) {
    const query = new URLSearchParams(search);
    return { ...normalizeConfig(Object.fromEntries(query)), mode: query.get('mode') || 'panel', grupo: query.get('grupo') || '' };
  }

  function titleCase(value) {
    return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function normalizeManifest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Catálogo inválido');
    const result = Object.create(null);
    for (const [name, logos] of Object.entries(value)) {
      if (!Array.isArray(logos)) continue;
      const seen = new Set();
      const entries = logos.flatMap(logo => {
        const src = typeof logo === 'string' ? logo : logo?.src;
        if (typeof src !== 'string') return [];
        const [assetPath, version, extra] = src.split('?');
        if (!assetPath.startsWith('logos/') || /[\\#]/.test(src) || extra !== undefined || (version !== undefined && !/^v=[a-f\d]{12,64}$/i.test(version)) || assetPath.split('/').some(part => part === '..' || part === '.' || !part) || !/\.(png|jpe?g|webp|svg|gif)$/i.test(assetPath) || seen.has(assetPath)) return [];
        seen.add(assetPath);
        return [{ src, alt: typeof logo?.alt === 'string' ? logo.alt : '' }];
      });
      if (entries.length) result[name] = entries;
    }
    if (!Object.keys(result).length) throw new Error('No hay logos disponibles');
    return result;
  }

  async function loadManifest(fallback, { fetcher = globalThis.fetch, timeout = 4000, attempts = 2 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      let timer;
      try {
        // El límite también cubre una respuesta cuyo cuerpo no termina de llegar.
        const request = (async () => {
          const response = await fetcher('manifest.json', { signal: controller.signal, cache: 'no-cache' });
          if (!response.ok) throw new Error('No se pudo leer el catálogo');
          return normalizeManifest(await response.json());
        })();
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Tiempo de espera agotado')); }, timeout);
        });
        return await Promise.race([request, deadline]);
      } catch {
        // Un fallo del catálogo remoto nunca elimina los logos del respaldo integrado.
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    return normalizeManifest(fallback);
  }

  function buildEmbedUrl(base, group, config) {
    const url = new URL(base);
    url.hash = '';
    url.search = new URLSearchParams({ mode: 'embed', grupo: group, ...normalizeConfig(config) }).toString();
    return url.href;
  }

  function buildIframeCode(url, height) {
    const h = normalizeConfig({ h: height }).h;
    return `<iframe src="${escapeHtml(url)}" title="Clientes de Mantua Decoración" width="100%" height="${h}" loading="eager" scrolling="no" style="display:block;width:100%;height:${h}px;border:0;overflow:hidden;"></iframe>`;
  }

  function calculateLayout(width, height, count, config, reducedMotion = false) {
    if (!(width > 0 && height > 0 && count > 0)) return null;
    const gap = Math.min(config.gap, width / 10);
    const visible = width < 360 ? 2 : 3;
    const slot = width < 640 ? Math.max(1, (width - gap * (visible - 1)) / visible) : Math.min(200, config.logo * 1.8);
    const setWidth = count * (slot + gap);
    const repeats = reducedMotion ? 1 : Math.max(1, Math.ceil((width + 1) / setWidth));
    return { gap, slot, logoHeight: Math.max(1, Math.min(config.logo, height - 12)), repeats, distance: setWidth * repeats };
  }

  function animationPhase(currentTime, duration) {
    return duration > 0 && Number.isFinite(Number(currentTime)) ? ((Number(currentTime) % duration) + duration) % duration / duration : 0;
  }

  function imageAttempt(img, url, signal, timeout) {
    return new Promise(resolve => {
      let finished = false;
      let timer;
      const finish = success => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', failed);
        signal?.removeEventListener('abort', failed);
        resolve(success);
      };
      const loaded = () => {
        if (!img.naturalWidth || !img.naturalHeight) return finish(false);
        // load + dimensiones válidas bastan. decode() puede quedar pendiente si
        // Google Sites oculta el marco al cambiar de vista; no es un fallo de red.
        finish(true);
      };
      const failed = () => finish(false);
      if (signal?.aborted) return finish(false);
      img.addEventListener('load', loaded);
      img.addEventListener('error', failed);
      signal?.addEventListener('abort', failed, { once: true });
      timer = setTimeout(failed, timeout);
      img.src = url;
      if (img.complete) {
        if (img.naturalWidth) loaded();
        else failed();
      }
    });
  }

  async function loadLogo(img, path, { signal, timeout = 4500, attempts = 2, base = globalThis.document?.baseURI } = {}) {
    const [assetPath, version = ''] = path.split('?');
    const encodedPath = assetPath.split('/').map(encodeURIComponent).join('/');
    for (let attempt = 0; attempt < attempts && !signal?.aborted; attempt += 1) {
      const url = new URL(encodedPath, base);
      url.search = version;
      if (attempt) url.searchParams.set('retry', String(attempt));
      if (await imageAttempt(img, url.href, signal, timeout)) return true;
    }
    return false;
  }

  function showError(target, message, retry) {
    const section = document.createElement('section');
    section.className = 'empty-state';
    const text = document.createElement('p');
    text.setAttribute('role', 'status');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'retry-btn';
    button.textContent = 'Volver a intentar';
    button.addEventListener('click', retry);
    section.append(text, button);
    target.replaceChildren(section);
    target.setAttribute('aria-busy', 'false');
  }

  function createCarousel(target, logos, config, groupName) {
    const abort = new AbortController();
    const cleanup = [];
    let destroyed = false;
    let ready = false;
    let layoutFrame = 0;
    let animation = null;
    let duration = 0;
    let layoutKey = '';
    let originals = [];
    let hasSpace = false;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stage = document.createElement('section');
    stage.className = 'embed-stage';
    stage.setAttribute('aria-label', `Clientes de ${titleCase(groupName)}`);
    stage.innerHTML = '<div class="logos-viewport"><div class="logos-track"><div class="logos-group" role="list"></div></div></div><p class="carousel-status" role="status">Cargando logos…</p>';
    const viewport = stage.querySelector('.logos-viewport');
    viewport.setAttribute('role', 'group');
    viewport.setAttribute('aria-label', 'Logos de clientes');
    const track = stage.querySelector('.logos-track');
    const group = stage.querySelector('.logos-group');
    const status = stage.querySelector('.carousel-status');
    target.replaceChildren(stage);
    target.setAttribute('aria-busy', 'true');

    const on = (element, event, handler) => {
      element.addEventListener(event, handler);
      cleanup.push(() => element.removeEventListener(event, handler));
    };
    function syncPlayback() {
      if (!animation) return;
      if (document.hidden || !hasSpace) animation.pause();
      else animation.play();
    }
    function duplicate(element) {
      const clone = element.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('img').forEach(img => { img.alt = ''; });
      return clone;
    }
    function layout() {
      layoutFrame = 0;
      if (destroyed || !ready) return;
      const reduced = motionPreference.matches || typeof track.animate !== 'function';
      stage.classList.toggle('is-static', reduced);
      // Solo se permite desplazar con teclado si el sistema solicita menos movimiento.
      if (reduced) viewport.setAttribute('tabindex', '0');
      else viewport.removeAttribute('tabindex');
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const metrics = calculateLayout(width, height, originals.length, config, reduced);
      hasSpace = !!metrics;
      if (!metrics) {
        // Un marco oculto puede regresar al MISMO tamaño. Debe reconstruir el
        // ciclo al reaparecer, no conservar un ajuste marcado como terminado.
        layoutKey = '';
        syncPlayback();
        return;
      }
      const nextKey = `${width}:${height}:${reduced}`;
      if (nextKey === layoutKey) { syncPlayback(); return; }
      layoutKey = nextKey;
      const phase = animationPhase(animation?.currentTime, duration);
      stage.style.setProperty('--logo-slot', `${metrics.slot}px`);
      stage.style.setProperty('--logo-height', `${metrics.logoHeight}px`);
      stage.style.setProperty('--logo-gap', `${metrics.gap}px`);
      const fragment = document.createDocumentFragment();
      originals.forEach(item => fragment.appendChild(item));
      for (let repeat = 1; repeat < metrics.repeats; repeat += 1) {
        originals.forEach(item => fragment.appendChild(duplicate(item)));
      }
      group.replaceChildren(fragment);
      track.replaceChildren(group);
      animation?.cancel();
      animation = null;
      track.classList.toggle('is-animated', !reduced);
      if (reduced) return;
      track.appendChild(duplicate(group));
      duration = metrics.distance / config.speed * 1000;
      // Hay dos grupos idénticos: media pista es exactamente un ciclo, incluso
      // con medidas fraccionarias o una vista previa escalada por Google Sites.
      animation = track.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration, iterations: Infinity, easing: 'linear' });
      // Mantiene la posición relativa al cambiar de ancho; nunca vuelve a solicitar las imágenes.
      animation.currentTime = phase * duration;
      syncPlayback();
    }
    function scheduleLayout() {
      if (!destroyed && !layoutFrame) layoutFrame = requestAnimationFrame(layout);
    }

    function restoreLayout() {
      layoutKey = '';
      scheduleLayout();
    }
    on(document, 'visibilitychange', () => {
      if (!document.hidden) restoreLayout();
      syncPlayback();
    });
    on(window, 'pageshow', restoreLayout);
    on(window, 'orientationchange', restoreLayout);
    on(window, 'resize', scheduleLayout);
    if (window.visualViewport) on(window.visualViewport, 'resize', scheduleLayout);
    if (motionPreference.addEventListener) on(motionPreference, 'change', scheduleLayout);
    else {
      motionPreference.addListener(scheduleLayout);
      cleanup.push(() => motionPreference.removeListener(scheduleLayout));
    }
    // Todos los avisos se agrupan en un solo ajuste por cuadro, sin pedir los logos otra vez.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scheduleLayout);
      observer.observe(viewport);
      cleanup.push(() => observer.disconnect());
    }

    const loading = logos.map((logo, index) => {
      const item = document.createElement('div');
      item.className = 'logo-item';
      item.setAttribute('role', 'listitem');
      const img = document.createElement('img');
      img.alt = logo.alt || `Cliente de ${titleCase(groupName)} ${index + 1}`;
      if (/\.svg(?:\?|$)/i.test(logo.src)) img.classList.add('is-vector');
      img.loading = 'eager';
      img.decoding = 'async';
      img.draggable = false;
      item.appendChild(img);
      group.appendChild(item);
      return loadLogo(img, logo.src, { signal: abort.signal }).then(success => {
        if (destroyed) return null;
        if (!success) { item.remove(); return null; }
        img.width = img.naturalWidth;
        img.height = img.naturalHeight;
        item.classList.add('is-loaded');
        status.hidden = true;
        return item;
      });
    });
    Promise.all(loading).then(items => {
      if (destroyed) return;
      originals = items.filter(Boolean);
      target.setAttribute('aria-busy', 'false');
      if (!originals.length) {
        showError(target, 'No pudimos cargar los logos. Comprueba tu conexión e inténtalo de nuevo.', () => location.reload());
        return;
      }
      ready = true;
      scheduleLayout();
    });
    return {
      destroy() {
        destroyed = true;
        abort.abort();
        cancelAnimationFrame(layoutFrame);
        animation?.cancel();
        cleanup.forEach(dispose => dispose());
      }
    };
  }

  function renderPanel(target, manifest) {
    target.innerHTML = '<div class="panel-page"><header class="panel-header"><h1 class="panel-title">Carruseles Mantua</h1><p class="panel-subtitle">Ajusta cada carrusel y copia su enlace para insertarlo en Google Sites.</p><p class="quality-note">Para que los logos se vean nítidos, utiliza SVG o imágenes originales de buena resolución. Los archivos pequeños conservan su tamaño para evitar que se pixelen al estirarlos.</p></header><div class="cards-grid"></div><footer class="panel-footer"><a href="creditos.html">Revisar la calidad y el origen de los logos</a></footer></div>';
    target.setAttribute('aria-busy', 'false');
    const grid = target.querySelector('.cards-grid');
    Object.entries(manifest).forEach(([name, logos], index) => {
      const card = document.createElement('article');
      card.className = 'carousel-card';
      const controls = [['h', 'Alto del carrusel (px)', 60, 720], ['logo', 'Alto máximo del logo (px)', 16, 200], ['gap', 'Separación (px)', 0, 64], ['speed', 'Velocidad (px/s)', 10, 200]];
      card.innerHTML = `<div class="carousel-card-head"><h2 class="carousel-card-title">${escapeHtml(titleCase(name))}</h2><span class="carousel-card-count">${logos.length} logos</span></div><div class="preview-shell"><iframe class="embed-frame" title="Vista previa: ${escapeHtml(titleCase(name))}" loading="lazy" scrolling="no"></iframe></div><div class="controls-grid">${controls.map(([key, label, min, max]) => `<div class="control-box"><label for="setting-${index}-${key}">${label}</label><input id="setting-${index}-${key}" data-role="${key}" type="number" min="${min}" max="${max}" value="${DEFAULTS[key]}"></div>`).join('')}</div><label class="output-label" for="link-${index}">Enlace para Google Sites</label><div class="output-row"><input id="link-${index}" data-role="link" type="url" readonly><button type="button" class="copy-btn" data-copy="link">Copiar enlace</button></div><label class="output-label" for="code-${index}">Código para insertar</label><div class="output-row"><textarea id="code-${index}" data-role="iframe" rows="3" readonly spellcheck="false"></textarea><button type="button" class="copy-btn" data-copy="iframe">Copiar código</button></div><a class="open-btn" target="_blank" rel="noopener" data-open>Abrir carrusel</a><p class="copy-status" role="status"></p>`;
      grid.appendChild(card);
      const frame = card.querySelector('iframe');
      frame.loading = 'eager';
      const link = card.querySelector('[data-role="link"]');
      const code = card.querySelector('[data-role="iframe"]');
      let refreshTimer;
      const refresh = () => {
        const config = normalizeConfig(Object.fromEntries(controls.map(([key]) => [key, card.querySelector(`[data-role="${key}"]`).value])));
        const previewUrl = buildEmbedUrl(location.href, name, config);
        // Usa la dirección real de esta publicación, también en una cuenta nueva.
        const url = previewUrl;
        frame.height = config.h;
        frame.style.height = `${config.h}px`;
        if (frame.src !== previewUrl) frame.src = previewUrl;
        link.value = url;
        code.value = buildIframeCode(url, config.h);
        card.querySelector('[data-open]').href = previewUrl;
      };
      controls.forEach(([key]) => card.querySelector(`[data-role="${key}"]`).addEventListener('input', () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 250);
      }));
      card.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
        const field = button.dataset.copy === 'link' ? link : code;
        const status = card.querySelector('.copy-status');
        try {
          await navigator.clipboard.writeText(field.value);
          status.textContent = 'Copiado.';
        } catch {
          field.focus();
          field.select();
          status.textContent = 'Texto seleccionado. Usa la opción Copiar de tu dispositivo.';
        }
      }));
      refresh();
    });
  }

  async function init() {
    const params = getParams(location.search);
    const target = document.getElementById('app');
    const embed = params.mode === 'embed';
    document.documentElement.classList.toggle('embed-mode', embed);
    document.documentElement.style.setProperty('--embed-bg', `#${params.bg}`);
    let controller = null;
    let renderedKey = '';
    const render = manifest => {
      const name = Object.keys(manifest).find(key => key.toLowerCase() === params.grupo.toLowerCase());
      const key = JSON.stringify(embed ? (manifest[name] || []) : manifest);
      if (key === renderedKey) return;
      renderedKey = key;
      controller?.destroy();
      if (!embed) return renderPanel(target, manifest);
      if (!name) return showError(target, 'Este grupo no tiene logos disponibles.', () => location.reload());
      controller = createCarousel(target, manifest[name], params, name);
    };
    let fallback;
    try {
      fallback = normalizeManifest(JSON.parse(document.getElementById('logo-manifest').textContent));
      render(fallback); // Los logos empiezan a cargar sin esperar otra petición de catálogo.
    } catch { /* Si el respaldo no está disponible, se intenta el catálogo externo. */ }
    // El catálogo integrado pertenece a esta publicación. Un JSON antiguo en caché
    // no debe reemplazarlo; el archivo separado se usa solo como recuperación.
    if (!renderedKey) {
      try {
        render(await loadManifest(fallback));
      } catch {
        showError(target, 'No pudimos cargar los logos. Inténtalo de nuevo.', () => location.reload());
      }
    }
    window.addEventListener('pagehide', event => { if (!event.persisted) controller?.destroy(); });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEFAULTS, normalizeConfig, getParams, normalizeManifest, loadManifest, buildEmbedUrl, buildIframeCode, calculateLayout, animationPhase, loadLogo, createCarousel };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})();
