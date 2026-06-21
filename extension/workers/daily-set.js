// =============================================================================
// Worker: Daily Set — Escanea y completa las 3 actividades diarias
// Se carga como content script en rewards.bing.com
// Depende de: window.RewardsUtils (DOM, Human, Retry)
// =============================================================================

window.RewardsWorkers = window.RewardsWorkers || {};

(function () {
  'use strict';

  const TAG = '[RewardsBot][DailySet]';
  const { DOM, Human, Retry } = window.RewardsUtils;

  // ---------------------------------------------------------------------------
  // Selectores y patrones para identificar la sección "Daily Set"
  // ---------------------------------------------------------------------------

  /** Textos que identifican el encabezado de la sección diaria (EN / ES) */
  const SECTION_HEADINGS = [
    'daily set',
    'conjunto diario',
    'daily activities',
    'actividades diarias',
    'formas diarias de ganar',
    'daily ways to earn'
  ];

  /** Patrones de URL para clasificar el tipo de tarea */
  const TYPE_PATTERNS = {
    quiz:       /quiz/i,
    poll:       /poll/i,
    thisOrThat: /supersonic/i,
    search:     /bing\.com\/search/i
  };

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  /**
   * Localiza el contenedor de la sección "Daily Set" recorriendo
   * todos los encabezados visibles y comparando su texto.
   * @returns {Element|null} — el elemento sección padre, o null si no se encuentra
   */
  function _findDailySetSection() {
    // Buscar encabezados con texto que coincida
    const headings = DOM.deepQueryAll(document.body, 'h2, h3, h4, [class*="heading"], [class*="title"], mee-card-group');

    for (const heading of headings) {
      const text = DOM.getDeepText(heading).toLowerCase().trim();

      if (SECTION_HEADINGS.some(h => text.includes(h))) {
        console.log(`${TAG} Sección encontrada vía encabezado: "${text}"`);
        // Subir al contenedor padre que agrupa las tarjetas
        // Intentamos subir hasta 4 niveles para encontrar el contenedor real
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

    // Fallback: buscar por atributos data comunes de la plataforma
    const fallbackSelectors = [
      '[data-bi-area="DailySet"]',
      '[data-bi-area="daily-set"]',
      '[id*="daily"]',
      'mee-card-group[data-bi-area]'
    ];

    for (const sel of fallbackSelectors) {
      const els = DOM.deepQueryAll(document.body, sel);
      if (els.length > 0) {
        console.log(`${TAG} Sección encontrada vía fallback: "${sel}"`);
        return els[0];
      }
    }

    // No se encontró la sección Daily Set
    console.log(`${TAG} No se pudo localizar la sección Daily Set.`);
    return null;
  }

  /**
   * Clasifica una tarea según su URL.
   * @param {string} url — URL de la tarea
   * @param {Element} card — elemento de la tarjeta (para detectar botones de claim)
   * @returns {string} — tipo: 'quiz' | 'poll' | 'thisOrThat' | 'search' | 'claim' | 'unknown'
   */
  function _detectType(url, card) {
    for (const [type, regex] of Object.entries(TYPE_PATTERNS)) {
      if (regex.test(url)) return type;
    }

    // Detectar botón de claim dentro de la tarjeta
    const claimButtons = DOM.deepQueryAll(card, 'button, [role="button"]');
    for (const btn of claimButtons) {
      const btnText = DOM.getDeepText(btn).toLowerCase();
      if (btnText.includes('claim') || btnText.includes('reclamar') || btnText.includes('obtener')) {
        return 'claim';
      }
    }

    return 'unknown';
  }

  /**
   * Extrae el valor de puntos de un texto (busca '+N' o números sueltos).
   * @param {string} text — texto completo de la tarjeta
   * @returns {string} — puntos formateados como '+N', o '' si no se detectan
   */
  function _extractPoints(text) {
    // Primero buscamos el patrón explícito +N
    const explicit = text.match(/\+\s*(\d+)/);
    if (explicit) return '+' + explicit[1];

    // Fallback: buscar valores de puntos comunes como números sueltos
    const loose = text.match(/\b(5|10|15|20|30|40|50|100)\b/);
    if (loose) return '+' + loose[1];

    return '';
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Escanea la sección Daily Set del dashboard y devuelve las tareas detectadas.
   * Cada tarea incluye título, puntos, tipo, estado de completado, elemento DOM y URL.
   *
   * @returns {Array<{title: string, points: string, type: string, completed: boolean, element: Element, url: string}>}
   */
  async function scan() {
    console.log(`${TAG} Iniciando escaneo de Daily Set...`);

    const section = _findDailySetSection();
    if (!section) {
      console.log(`${TAG} Sección Daily Set no encontrada — devolviendo lista vacía`);
      return [];
    }

    // Buscar tarjetas individuales dentro de la sección
    const cardSelectors = [
      'mee-rewards-daily-set-item',
      'mee-card.daily-set-card',
      'mee-card-group[data-bi-area="DailySet"] mee-card',
      '[class*="ds-card"]',
      'mee-card'
    ].join(', ');

    let cards = DOM.deepQueryAll(section, cardSelectors);

    // Filtrar tarjetas anidadas — conservar solo las más internas
    cards = cards.filter(card =>
      !cards.some(other => other !== card && card.contains(other))
    );

    console.log(`${TAG} Tarjetas encontradas en Daily Set: ${cards.length}`);

    const tasks = [];
    const seenUrls = new Set();

    for (const card of cards) {
      try {
        // Extraer texto completo de la tarjeta
        const fullText = DOM.getDeepText(card);
        if (!fullText || fullText.trim().length < 3) continue;

        // Buscar enlace clickeable
        const clickable = DOM.findClickable(card);
        const url = clickable
          ? (clickable.href || clickable.getAttribute('data-href') || '')
          : '';

        // Ignorar tarjetas sin URL navegable
        // Filtrar URLs inválidas o de navegación
        if (!url || url.startsWith('javascript:')) continue;
        if (!/bing\.com|microsoft\.com/i.test(url)) continue; // Solo URLs de Bing/Microsoft
        if (/\/(redeem|profile|signin|status|history|earn$|dashboard$)/i.test(url)) continue;

        // Evitar duplicados por URL
        const urlKey = url.split('?')[0];
        if (seenUrls.has(urlKey)) continue;
        seenUrls.add(urlKey);

        // Extraer datos de la tarjeta
        const points = _extractPoints(fullText);
        const completed = DOM.hasCompletionMark(card) ||
          /\b(completad[oa]s?|listo|hecho|done|completed)\b/i.test(fullText) ||
          /[✓✔]/.test(fullText);

        const type = _detectType(url, card);

        // Limpiar título: quitar puntos y recortar
        let title = fullText
          .replace(/\+\s*\d+/, '')  // quitar puntos
          .replace(/\s+/g, ' ')     // normalizar espacios
          .trim();

        // Limitar longitud del título
        if (title.length > 50) {
          title = title.substring(0, 47) + '...';
        }

        // Si el título quedó vacío, usar aria-label o atributo title
        if (!title || title.length < 2) {
          title = (clickable && (clickable.title || clickable.getAttribute('aria-label'))) || 'Actividad diaria';
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
        // No romper el escaneo por un error en una tarjeta individual
        console.error(`${TAG} Error procesando tarjeta:`, err);
      }
    }

    console.log(`${TAG} Escaneo completado: ${tasks.length} tareas (${tasks.filter(t => !t.completed).length} pendientes)`);
    return tasks;
  }

  /**
   * Completa secuencialmente todas las tareas no completadas.
   * Abre cada tarea en una pestaña nueva con un clic humano simulado,
   * luego espera para que la página cargue y Microsoft registre la actividad.
   *
   * Para quizzes, polls y this-or-that, el auto-solver de content.js
   * se activa automáticamente en la pestaña abierta.
   *
   * @param {Array} tasks — tareas a completar (resultado de scan())
   * @param {Function} [onProgress] — callback(taskIndex, totalTasks, taskTitle)
   */
  async function completeAll(tasks, onProgress) {
    // Filtrar solo tareas pendientes
    const pending = tasks.filter(t => !t.completed);
    console.log(`${TAG} Iniciando completado de ${pending.length} tareas pendientes...`);

    if (pending.length === 0) {
      console.log(`${TAG} No hay tareas pendientes — nada que hacer`);
      return;
    }

    for (let i = 0; i < pending.length; i++) {
      const task = pending[i];

      // Notificar progreso al callback si existe
      if (typeof onProgress === 'function') {
        try {
          onProgress(i, pending.length, task.title);
        } catch (cbErr) {
          console.log(`${TAG} Error en callback onProgress:`, cbErr);
        }
      }

      console.log(`${TAG} [${i + 1}/${pending.length}] Procesando: "${task.title}" (${task.type})`);

      // Ejecutar el clic con reintentos para manejar tarjetas que
      // aún no terminaron de renderizar
      await Retry.safeAction(async () => {
        const el = task.element;

        // Asegurar que se abra en pestaña nueva
        if (el.tagName === 'A') {
          el.setAttribute('target', '_blank');
        }

        // Clic humano simulado (incluye movimiento de ratón y disparo de eventos)
        await Human.click(el);

        // Fallback: si el clic simulado no abrió pestaña, usar window.open
        // Esperamos 300ms para dar tiempo al navegador
        await Human.delay(200, 400);

      }, 2, `click-daily-${i}`);

      // Esperar entre 8-12 segundos para que Microsoft registre la actividad
      // y el auto-solver tenga tiempo de resolver quizzes/polls
      const waitTime = 8000 + Math.floor(Math.random() * 4000);
      console.log(`${TAG}   ⏱️ Esperando ${(waitTime / 1000).toFixed(1)}s antes de la siguiente tarea...`);
      await Human.delay(waitTime, waitTime + 1000);
    }

    console.log(`${TAG} ✅ Todas las tareas diarias procesadas`);
  }

  // ---------------------------------------------------------------------------
  // Registrar el worker en el namespace global
  // ---------------------------------------------------------------------------

  window.RewardsWorkers.DailySet = { scan, completeAll };

  console.log(`${TAG} Worker registrado correctamente`);
})();
