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

    // Último recurso: buscar tarjetas con indicador de progreso en todo el body
    // Las punch cards pueden no tener sección dedicada en algunos diseños
    console.log(`${TAG} No se encontró sección dedicada — buscando tarjetas con progreso en todo el dashboard`);
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
      'mee-card',
      '[class*="card"]',
      '[class*="punch"]',
      '[data-bi-id]'
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

    // Buscar tarjetas punch card dentro de la sección (o en todo el body)
    const root = section || document.body;
    const punchCards = _findPunchCardElements(root);

    console.log(`${TAG} Punch Cards detectadas: ${punchCards.length}`);

    const tasks = [];
    const seenUrls = new Set();

    for (const card of punchCards) {
      try {
        const fullText = DOM.getDeepText(card);
        const progress = _extractProgress(fullText);

        // Este filtro ya lo hicimos, pero verificamos por seguridad
        if (!progress) continue;

        // Buscar elemento clickeable
        const clickable = DOM.findClickable(card);
        const url = clickable
          ? (clickable.href || clickable.getAttribute('data-href') || '')
          : '';

        // Deduplicar
        if (url) {
          const urlKey = url.split('?')[0];
          if (seenUrls.has(urlKey)) continue;
          seenUrls.add(urlKey);
        }

        // Detectar si la punch card está completamente terminada
        const completed = progress.current >= progress.total ||
          DOM.hasCompletionMark(card) ||
          /\b(completad[oa]|finished|terminad[oa])\b/i.test(fullText);

        // Extraer puntos
        const points = _extractPoints(fullText);

        // Construir título
        let title = fullText
          .replace(/\+\s*\d+/, '')
          .replace(/\d+\s*[\/]\s*\d+/, '') // quitar indicador de progreso
          .replace(/\d+\s+(?:of|de)\s+\d+/i, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (title.length > 50) title = title.substring(0, 47) + '...';
        if (!title || title.length < 2) {
          title = (clickable && (clickable.title || clickable.getAttribute('aria-label'))) || 'Punch Card';
        }

        tasks.push({
          title,
          points,
          currentStep: progress.current,
          totalSteps: progress.total,
          completed,
          element: clickable || card,
          url
        });

        console.log(`${TAG}   → ${completed ? '✅' : '🔲'} "${title}" — paso ${progress.current}/${progress.total} (${points})`);
      } catch (err) {
        console.error(`${TAG} Error procesando punch card:`, err);
      }
    }

    console.log(`${TAG} Escaneo completado: ${tasks.length} punch cards (${tasks.filter(t => !t.completed).length} pendientes)`);
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
