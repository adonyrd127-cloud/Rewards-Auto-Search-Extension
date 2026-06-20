// =============================================================================
// Worker: More Activities — Escanea y completa las actividades promocionales
// Se carga como content script en rewards.bing.com
// Depende de: window.RewardsUtils (DOM, Human, Retry)
// =============================================================================

window.RewardsWorkers = window.RewardsWorkers || {};

(function () {
  'use strict';

  const TAG = '[RewardsBot][MoreActivities]';
  const { DOM, Human, Retry } = window.RewardsUtils;

  // ---------------------------------------------------------------------------
  // Selectores y patrones para identificar la sección "More Activities"
  // ---------------------------------------------------------------------------

  /** Textos posibles del encabezado de la sección (EN / ES) */
  const SECTION_HEADINGS = [
    'more activities',
    'más actividades',
    'more promotions',
    'más promociones',
    'other activities',
    'otras actividades'
  ];

  /** URLs que debemos ignorar (no son tareas reales) */
  const IGNORED_URL_PATTERNS = [
    /redeem/i,
    /canjear/i,
    /signin/i,
    /welcome/i,
    /profile/i,
    /dashboard$/i,
    /^javascript:/i
  ];

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  /**
   * Localiza el contenedor de la sección "More Activities".
   * Recorre encabezados buscando coincidencias de texto, luego sube
   * al contenedor padre que agrupa las tarjetas.
   * @returns {Element|null}
   */
  function _findMoreActivitiesSection() {
    const headings = DOM.deepQueryAll(document.body, 'h2, h3, h4, [class*="heading"], [class*="title"], mee-card-group');

    for (const heading of headings) {
      const text = DOM.getDeepText(heading).toLowerCase().trim();

      if (SECTION_HEADINGS.some(h => text.includes(h))) {
        console.log(`${TAG} Sección encontrada: "${text}"`);

        // Ascender al contenedor padre de tarjetas (máx. 4 niveles)
        let container = heading;
        for (let i = 0; i < 4; i++) {
          const parent = container.parentElement || (container.getRootNode && container.getRootNode().host);
          if (parent && parent !== document.body) {
            container = parent;
          } else {
            break;
          }
        }
        return container;
      }
    }

    // Fallback: atributos data específicos de la plataforma
    const fallbackSelectors = [
      '[data-bi-area="MoreActivities"]',
      '[data-bi-area="more-activities"]',
      '[data-bi-area="More promotions"]',
      'mee-card-group[data-bi-area*="more"]'
    ];

    for (const sel of fallbackSelectors) {
      const els = DOM.deepQueryAll(document.body, sel);
      if (els.length > 0) {
        console.log(`${TAG} Sección encontrada vía fallback: "${sel}"`);
        return els[0];
      }
    }

    console.warn(`${TAG} No se pudo localizar la sección More Activities`);
    return null;
  }

  /**
   * Comprueba si una URL debe ser ignorada (no es una tarea completable).
   * @param {string} url
   * @returns {boolean}
   */
  function _shouldIgnoreUrl(url) {
    if (!url) return true;
    return IGNORED_URL_PATTERNS.some(pattern => pattern.test(url));
  }

  /**
   * Extrae puntos del texto de una tarjeta.
   * @param {string} text
   * @returns {string} — '+N' o ''
   */
  function _extractPoints(text) {
    const explicit = text.match(/\+\s*(\d+)/);
    if (explicit) return '+' + explicit[1];

    const loose = text.match(/\b(5|10|15|20|30|40|50|100)\b/);
    if (loose) return '+' + loose[1];

    return '';
  }

  /**
   * Detecta el tipo de actividad por su URL.
   * Las actividades "More" suelen ser quizzes, búsquedas o claims simples.
   * @param {string} url
   * @param {Element} card
   * @returns {string}
   */
  function _detectType(url, card) {
    if (/quiz/i.test(url)) return 'quiz';
    if (/poll/i.test(url)) return 'poll';
    if (/supersonic/i.test(url)) return 'thisOrThat';
    if (/bing\.com\/search/i.test(url)) return 'search';

    // Buscar botones de reclamar dentro de la tarjeta
    const buttons = DOM.deepQueryAll(card, 'button, [role="button"]');
    for (const btn of buttons) {
      const btnText = DOM.getDeepText(btn).toLowerCase();
      if (btnText.includes('claim') || btnText.includes('reclamar') || btnText.includes('obtener')) {
        return 'claim';
      }
    }

    return 'promo'; // Tipo por defecto para actividades promocionales
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Escanea la sección "More Activities" y devuelve las tareas detectadas.
   * Filtra tareas ya completadas y URLs no válidas.
   *
   * @returns {Array<{title: string, points: string, type: string, completed: boolean, element: Element, url: string}>}
   */
  async function scan() {
    console.log(`${TAG} Iniciando escaneo de More Activities...`);

    const section = _findMoreActivitiesSection();
    if (!section) {
      console.warn(`${TAG} Sección no encontrada — devolviendo lista vacía`);
      return [];
    }

    // Selectores para localizar tarjetas dentro de la sección
    const cardSelectors = [
      'mee-card',
      '[class*="card"]',
      '[class*="promo"]',
      '[data-bi-id]',
      'a[href]'
    ].join(', ');

    let cards = DOM.deepQueryAll(section, cardSelectors);

    // Conservar solo tarjetas hoja (sin hijos que sean otras tarjetas)
    cards = cards.filter(card =>
      !cards.some(other => other !== card && card.contains(other))
    );

    console.log(`${TAG} Tarjetas encontradas: ${cards.length}`);

    const tasks = [];
    const seenUrls = new Set();

    for (const card of cards) {
      try {
        const fullText = DOM.getDeepText(card);
        if (!fullText || fullText.trim().length < 3) continue;

        // Buscar elemento clickeable
        const clickable = DOM.findClickable(card);
        const url = clickable
          ? (clickable.href || clickable.getAttribute('data-href') || '')
          : '';

        // Filtrar URLs inválidas o de navegación
        if (_shouldIgnoreUrl(url)) continue;

        // Deduplicar por URL base
        const urlKey = url.split('?')[0];
        if (seenUrls.has(urlKey)) continue;
        seenUrls.add(urlKey);

        // Detectar estado de completado
        const completed = DOM.hasCompletionMark(card) ||
          /\b(completad[oa]s?|listo|hecho|done|completed)\b/i.test(fullText) ||
          /[✓✔]/.test(fullText);

        // Extraer puntos y tipo
        const points = _extractPoints(fullText);
        const type = _detectType(url, card);

        // Construir título limpio
        let title = fullText
          .replace(/\+\s*\d+/, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (title.length > 50) title = title.substring(0, 47) + '...';
        if (!title || title.length < 2) {
          title = (clickable && (clickable.title || clickable.getAttribute('aria-label'))) || 'Actividad extra';
        }

        tasks.push({
          title,
          points,
          type,
          completed,
          element: clickable || card,
          url
        });

        console.log(`${TAG}   → ${completed ? '✅' : '⬜'} [${type}] ${title} (${points})`);
      } catch (err) {
        console.error(`${TAG} Error procesando tarjeta:`, err);
      }
    }

    console.log(`${TAG} Escaneo completado: ${tasks.length} tareas (${tasks.filter(t => !t.completed).length} pendientes)`);
    return tasks;
  }

  /**
   * Completa secuencialmente las tareas pendientes de "More Activities".
   * Abre cada actividad en una pestaña nueva y espera el tiempo suficiente
   * para que Microsoft registre la visita.
   *
   * @param {Array} tasks — resultado de scan()
   * @param {Function} [onProgress] — callback(taskIndex, totalTasks, taskTitle)
   */
  async function completeAll(tasks, onProgress) {
    const pending = tasks.filter(t => !t.completed);
    console.log(`${TAG} Iniciando completado de ${pending.length} actividades pendientes...`);

    if (pending.length === 0) {
      console.log(`${TAG} No hay actividades pendientes`);
      return;
    }

    for (let i = 0; i < pending.length; i++) {
      const task = pending[i];

      // Notificar progreso
      if (typeof onProgress === 'function') {
        try {
          onProgress(i, pending.length, task.title);
        } catch (cbErr) {
          console.warn(`${TAG} Error en callback onProgress:`, cbErr);
        }
      }

      console.log(`${TAG} [${i + 1}/${pending.length}] Procesando: "${task.title}" (${task.type})`);

      // Abrir la actividad con clic humano simulado
      await Retry.safeAction(async () => {
        const el = task.element;

        // Forzar apertura en pestaña nueva
        if (el.tagName === 'A') {
          el.setAttribute('target', '_blank');
        }

        // Simular clic con comportamiento humano
        await Human.click(el);

        // Pequeña espera para que el navegador procese el clic
        await Human.delay(200, 400);
      }, 2, `click-more-${i}`);

      // Esperar entre 8-12 segundos para el registro de la actividad
      // Las promos suelen necesitar solo la visita, pero esperamos lo suficiente
      const waitTime = 8000 + Math.floor(Math.random() * 4000);
      console.log(`${TAG}   ⏱️ Esperando ${(waitTime / 1000).toFixed(1)}s...`);
      await Human.delay(waitTime, waitTime + 1000);
    }

    console.log(`${TAG} ✅ Todas las actividades extra procesadas`);
  }

  // ---------------------------------------------------------------------------
  // Registrar el worker
  // ---------------------------------------------------------------------------

  window.RewardsWorkers.MoreActivities = { scan, completeAll };

  console.log(`${TAG} Worker registrado correctamente`);
})();
