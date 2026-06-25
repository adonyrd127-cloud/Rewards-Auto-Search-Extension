// =============================================================================
// Worker: Punch Cards — Escanea y completa las tarjetas de pasos múltiples
// Se carga como content script en rewards.bing.com
// Depende de: window.RewardsUtils (DOM, Human, Retry)
// =============================================================================

window.RewardsWorkers = window.RewardsWorkers || {};

(function () {
  'use strict';

  const TAG = '[RewardsBot][PunchCards]';
  const { DOM, Human, Retry } = window.RewardsUtils;

  // ---------------------------------------------------------------------------
  // Patrones para identificar Punch Cards y su progreso
  // ---------------------------------------------------------------------------

  /** Textos que identifican la sección de Punch Cards (EN / ES) */
  const SECTION_HEADINGS = [
    'punch card',
    'tarjeta perforada',
    'punch cards',
    'tarjetas perforadas',
    'tarjetas de puntos'
  ];

  /**
   * Regex para detectar indicadores de progreso tipo "2/4", "1 of 3", "2 de 4".
   * Captura los dos números: grupo 1 = actual, grupo 2 = total.
   */
  const PROGRESS_PATTERNS = [
    /(\d+)\s*\/\s*(\d+)/,                           // "2/4"
    /(\d+)\s+(?:of|de|von)\s+(\d+)/i,              // "2 of 4", "2 de 4"
    /(\d+)\s*(?:completed|completad[oa]s?)\s*(?:of|de)\s*(\d+)/i  // "2 completed of 4"
  ];

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  /**
   * Localiza la sección de Punch Cards en el dashboard.
   * @returns {Element|null}
   */
  function _findPunchCardSection() {
    // Buscar secciones por encabezado
    const headings = DOM.deepQueryAll(document.body, 'h2, h3, h4, [class*="heading"], [class*="title"], mee-card-group');

    for (const heading of headings) {
      const text = DOM.getDeepText(heading).toLowerCase().trim();

      if (SECTION_HEADINGS.some(h => text.includes(h))) {
        console.log(`${TAG} Sección encontrada: "${text}"`);
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

    // Fallback: buscar por atributos data de la plataforma
    const fallbackSelectors = [
      '[data-bi-area="PunchCards"]',
      '[data-bi-area="punch-cards"]',
      '[data-bi-area*="punch"]',
      'mee-card-group[data-bi-area*="Punch"]'
    ];

    for (const sel of fallbackSelectors) {
      const els = DOM.deepQueryAll(document.body, sel);
      if (els.length > 0) {
        console.log(`${TAG} Sección encontrada vía fallback: "${sel}"`);
        return els[0];
      }
    }

    // Último recurso: retornar null
    console.log(`${TAG} No se pudo localizar la sección Punch Cards. Retornando null.`);
    return null;
  }

  /**
   * Intenta extraer el progreso (pasos actual/total) del texto de una tarjeta.
   * @param {string} text — texto completo de la tarjeta
   * @returns {{ current: number, total: number } | null}
   */
  function _extractProgress(text) {
    for (const pattern of PROGRESS_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        // Validar que los números sean razonables para una punch card
        if (total > 0 && total <= 20 && current <= total) {
          return { current, total };
        }
      }
    }
    return null;
  }

  /**
   * Busca tarjetas que parezcan Punch Cards, ya sea dentro de una sección
   * específica o en todo el body si no se encontró sección.
   * Una tarjeta es candidata si tiene un indicador de progreso.
   * @param {Element} root — contenedor donde buscar
   * @returns {Element[]}
   */
  function _findPunchCardElements(root) {
    const cardSelectors = [
      'mee-rewards-punch-card-item',
      'mee-card-group[data-bi-area="PunchCards"] mee-card',
      'mee-card[data-bi-area="PunchCards"]',
      '.punch-card-item'
    ].join(', ');

    let cards = DOM.deepQueryAll(root, cardSelectors);

    // Conservar solo las tarjetas hoja
    cards = cards.filter(card =>
      !cards.some(other => other !== card && card.contains(other))
    );

    // Filtrar: solo tarjetas que contienen indicador de progreso
    return cards.filter(card => {
      const text = DOM.getDeepText(card);
      return _extractProgress(text) !== null;
    });
  }

  /**
   * Extrae puntos del texto.
   * @param {string} text
   * @returns {string}
   */
  function _extractPoints(text) {
    const explicit = text.match(/\+\s*(\d+)/);
    if (explicit) return '+' + explicit[1];

    const loose = text.match(/\b(\d{2,4})\s*(?:pts?|points?|puntos?)\b/i);
    if (loose) return '+' + loose[1];

    return '';
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Escanea el dashboard en busca de Punch Cards.
   * Devuelve un array con los datos de cada tarjeta, incluyendo su progreso.
   *
   * @returns {Array<{title: string, points: string, currentStep: number, totalSteps: number, completed: boolean, element: Element, url: string}>}
   */
  async function scan() {
    console.log(`${TAG} Iniciando escaneo de Punch Cards...`);

    const section = _findPunchCardSection();
    if (!section) {
      console.log(`${TAG} Sección Punch Cards no encontrada.`);
      return [];
    }

    const cards = _findPunchCardElements(section);
    console.log(`${TAG} Elementos Punch Cards encontrados: ${cards.length}`);

    const tasks = [];
    const seenUrls = new Set();

    for (const card of cards) {
      try {
        const text = DOM.getDeepText(card);
        const progress = _extractProgress(text);
        if (!progress) continue;

        // Intentar encontrar el enlace de la punch card
        const link = DOM.deepQuery(card, 'a[href]');
        if (!link) continue;

        const url = link.href || '';
        if (!url || url.startsWith('javascript:')) continue;

        // Evitar duplicados
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const points = _extractPoints(text) || '+100';
        const completed = progress.current === progress.total;

        // Intentar extraer el título
        let title = "Tarjeta perforada";
        const titleEl = DOM.deepQuery(card, 'h3, h4, .title, [class*="title"], [class*="heading"]');
        if (titleEl) {
          title = DOM.getDeepText(titleEl).trim();
        }

        tasks.push({
          title: title,
          points: points,
          currentStep: progress.current,
          totalSteps: progress.total,
          completed: completed,
          element: link, // Guardar el enlace para poder hacer clic
          url: url
        });

      } catch (err) {
        console.error(`${TAG} Error parseando punch card:`, err);
      }
    }

    console.log(`${TAG} Escaneo completado. Punch Cards detectadas: ${tasks.length}`);
    return tasks;
  }

  /**
   * Completa las punch cards pendientes paso a paso.
   * Para cada punch card:
   *   1. Hace clic para abrir la vista de detalle
   *   2. Espera a que se cargue la página de detalle
   *   3. Busca y hace clic en el botón del paso disponible
   *   4. Espera la confirmación y pasa a la siguiente
   *
   * @param {Array} tasks — resultado de scan()
   * @param {Function} [onProgress] — callback(taskIndex, totalTasks, taskTitle)
   */
  async function completeAll(tasks, onProgress) {
    const pending = tasks.filter(t => !t.completed);
    console.log(`${TAG} Iniciando completado de ${pending.length} punch cards pendientes...`);

    if (pending.length === 0) {
      console.log(`${TAG} No hay punch cards pendientes`);
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

      console.log(`${TAG} [${i + 1}/${pending.length}] Procesando: "${task.title}" (paso ${task.currentStep}/${task.totalSteps})`);

      // Hacer clic en la punch card para abrirla
      await Retry.safeAction(async () => {
        const el = task.element;

        // Forzar apertura en pestaña nueva
        if (el.tagName === 'A') {
          el.setAttribute('target', '_blank');
        }

        await Human.click(el);
        await Human.delay(200, 400);
      }, 2, `click-punch-${i}`);

      // Esperar más tiempo que para tareas normales, ya que las punch cards
      // requieren navegar a una vista de detalle y completar sub-pasos
      const waitTime = 10000 + Math.floor(Math.random() * 5000);
      console.log(`${TAG}   ⏱️ Esperando ${(waitTime / 1000).toFixed(1)}s para que se registre el paso...`);
      await Human.delay(waitTime, waitTime + 2000);

      // Intentar buscar y completar el paso siguiente dentro de la misma página
      // (algunas punch cards muestran todos los pasos inline)
      await _tryCompleteInlineStep(task);
    }

    console.log(`${TAG} ✅ Todas las punch cards procesadas`);
  }

  /**
   * Intenta completar un paso inline si la punch card muestra los pasos
   * en la misma página del dashboard (sin navegar a otra URL).
   * @param {Object} task — tarea de punch card
   */
  async function _tryCompleteInlineStep(task) {
    try {
      // Buscar botones de paso dentro de la tarjeta que no estén completados
      const stepSelectors = [
        'button:not([disabled])',
        'a[href]:not([class*="complete"])',
        '[role="button"]:not([aria-disabled="true"])'
      ].join(', ');

      const steps = DOM.deepQueryAll(task.element, stepSelectors);

      for (const step of steps) {
        const stepText = DOM.getDeepText(step).toLowerCase();

        // Buscar botones que parezcan pasos activos (no completados)
        const isActiveStep = (
          stepText.includes('start') ||
          stepText.includes('iniciar') ||
          stepText.includes('go') ||
          stepText.includes('ir') ||
          stepText.includes('open') ||
          stepText.includes('abrir') ||
          stepText.includes('visit') ||
          stepText.includes('visitar')
        );

        if (isActiveStep) {
          console.log(`${TAG}   🔘 Paso inline encontrado: "${stepText.substring(0, 30)}"`);

          // Forzar apertura en nueva pestaña si es un enlace
          if (step.tagName === 'A') {
            step.setAttribute('target', '_blank');
          }

          await Human.click(step);
          await Human.delay(3000, 5000);
          break; // Solo un paso por iteración
        }
      }
    } catch (err) {
      // No es crítico — el paso pudo haberse abierto en otra pestaña
      console.log(`${TAG}   ℹ️ No se encontró paso inline (puede haberse abierto en otra pestaña)`);
    }
  }

  // ---------------------------------------------------------------------------
  // Registrar el worker
  // ---------------------------------------------------------------------------

  window.RewardsWorkers.PunchCards = { scan, completeAll };

  console.log(`${TAG} Worker registrado correctamente`);
})();
