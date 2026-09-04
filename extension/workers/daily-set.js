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
    'conjunto diario',
    'daily set',
    'actividades diarias',
    'daily activities',
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
   * encabezados y elementos visibles en la página.
   * @returns {Element|null} — el elemento sección padre, o null si no se encuentra
   */
  function _findDailySetSection() {
    let section = null;

    // Buscar encabezados y títulos en cualquier elemento estructural común
    const headingTags = 'h1, h2, h3, h4, h5, [class*="heading"], [class*="title"], [class*="Heading"], [class*="Title"], mee-card-group, p, span, div';
    const headings = DOM.deepQueryAll(document.body, headingTags);

    for (const heading of headings) {
      const rawText = (heading.innerText || heading.textContent || '').trim();
      if (rawText.length === 0 || rawText.length > 50) continue;
      const text = rawText.toLowerCase();

      // Ignorar expresamente contadores de rachas y niveles
      if (text.includes('racha') || text.includes('streak') || text.includes('subida de nivel') || text.includes('tu actividad')) {
        continue;
      }

      if (SECTION_HEADINGS.some(h => text.includes(h))) {
        console.log(`${TAG} Encabezado de Daily Set encontrado: "${rawText}"`);
        
        // Subir por la jerarquía hasta encontrar el contenedor que agrupa las tarjetas (máx 6 niveles)
        let container = heading;
        for (let i = 0; i < 6; i++) {
          const parent = container.parentElement || (container.getRootNode && container.getRootNode().host);
          if (parent && parent !== document.body && parent !== document.documentElement) {
            container = parent;
            const links = container.querySelectorAll('a[href], div[role="button"], [class*="card"]');
            if (links.length >= 3) {
              section = container;
              console.log(`${TAG} Contenedor de Daily Set validado con ${links.length} elementos`);
              break;
            }
          } else {
            break;
          }
        }
        if (section) break;
      }
    }

    if (!section) {
      // Fallback: buscar por atributos analíticos de la plataforma
      section = document.querySelector('[data-bi-area="DailySet"]') 
             || document.querySelector('[data-bi-id="DailySet"]');
    }

    if (section) return section;

    // Fallback: buscar por atributos data comunes de la plataforma
    const fallbackSelectors = [
      '[data-bi-area="DailySet"]',
      '[data-bi-area="daily-set"]',
      'mee-card-group[data-bi-area*="daily" i]',
      'mee-card-group[data-bi-area*="Daily" i]'
    ];

    for (const sel of fallbackSelectors) {
      try {
        const els = DOM.deepQueryAll(document.body, sel);
        if (els.length > 0) {
          console.log(`${TAG} Sección encontrada vía fallback: "${sel}"`);
          return els[0];
        }
      } catch (e) {}
    }

    console.log(`${TAG} No se pudo localizar la sección Daily Set por contenedor. Retornando null.`);
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

  /**
   * Encuentra el verdadero contenedor de la tarjeta ascendiendo desde enlaces o botones
   * para asegurar que incluya los badges de puntos y los textos de estado (ej: "Completadas").
   */
  function _findCardContainer(card) {
    if (!card) return card;
    let current = card;
    if (current.tagName === 'A' || current.getAttribute('role') === 'button' || (current.className && typeof current.className === 'string' && current.className.includes('group'))) {
      if (current.parentElement && current.parentElement !== document.body) {
        current = current.parentElement;
      }
    }
    const container = current.closest('div[class*="card" i], div[class*="item" i], li, article, mee-card, [data-bi-area]') || current;
    return container;
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
    let cards = [];

    if (section) {
      const cardSelectors = [
        'a.group\\/ctrl.cursor-pointer[href]',
        'a[href][class*="cursor-pointer"]',
        'a[href][class*="group"]',
        'mee-rewards-daily-set-item a',
        'div[class*="c-card"] a',
        'div[class*="card"] a',
        'a[href*="bing.com/search"]',
        'a[href*="rewards"]',
        'a[href]'
      ];
      for (const sel of cardSelectors) {
        try {
          const found = Array.from(section.querySelectorAll(sel));
          if (found.length > 0) {
            cards = found;
            console.log(`${TAG} Selector "${sel}" encontró ${cards.length} enlaces en sección.`);
            break;
          }
        } catch(e) {}
      }
    }

    // Fallback: Si no hay sección o tarjetas en sección, buscar globalmente los 3 primeros items diarios
    if (cards.length === 0) {
      console.log(`${TAG} Buscando Daily Set globalmente en la página...`);
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      cards = allLinks.filter(a => {
        const h = a.href || '';
        if (!/bing\.com|microsoft\.com/i.test(h)) return false;
        if (/\/(redeem|profile|signin|status|history|earn$|dashboard$)/i.test(h)) return false;
        
        // Excluir elementos en nav, header, footer
        if (a.closest('nav, header, footer, [role="navigation"]')) return false;

        const parentContainer = _findCardContainer(a);
        const text = (a.innerText || '') + ' ' + (parentContainer.innerText || '');
        
        // Ignorar si es de la sección rachas o está bloqueada
        if (text.toLowerCase().includes('racha') || text.toLowerCase().includes('streak') || text.toLowerCase().includes('bloqueada')) return false;
        
        // Aceptar si tiene puntajes típicos del daily set (+10, ✔10, 10, +30, +50) o palabras de actividades
        return /[+✓✔✅]?\s*(10|30|50)\b/i.test(text) || /\b(completad[oa]s?|quiz|poll|encuesta)\b/i.test(text);
      }).slice(0, 3);
      console.log(`${TAG} Fallback global encontró ${cards.length} enlaces.`);
    }

    const tasks = [];
    const seenUrls = new Set();

    for (const card of cards) {
      try {
        const url = card.href || card.getAttribute('href') || card.querySelector('a[href]')?.href || '';
        if (!url || url.startsWith('javascript:')) continue;
        if (!/bing\.com|microsoft\.com/i.test(url)) continue;
        if (/\/(redeem|profile|signin|status|history|earn$|dashboard$)/i.test(url)) continue;

        const parentContainer = _findCardContainer(card);
        const fullText = (card.innerText || '') + ' ' + (parentContainer.innerText || '');
        
        let points = '';
        const pointsEl = parentContainer.querySelector('.text-statusInformativeTintFg, .text-metadata, [class*="statusInformative"], [class*="points"], [class*="badge"]');
        if (pointsEl) {
          const match = pointsEl.innerText.match(/[+✓✔✅]?\s*(\d+)/);
          if (match) points = '+' + match[1];
        }
        if (!points) {
          const match = fullText.match(/[+✓✔✅]\s*(\d{1,3})/);
          if (match) points = '+' + match[1];
        }
        if (!points) {
          points = _extractPoints(fullText) || '+10';
        }

        const hasCheckmark = 
          (DOM && DOM.hasCompletionMark && (DOM.hasCompletionMark(card) || DOM.hasCompletionMark(parentContainer))) ||
          parentContainer.querySelector('.text-statusPositiveTintFg, [class*="statusPositive"], [class*="StatusPositive"], .c-indicator-check, [class*="checkmark"], [class*="complete"], [class*="done"], [class*="success"], [class*="claimed"]') !== null || 
          /\b(completad[oa]s?|listo|hecho|done|completed|claimed|finished)\b/i.test(fullText) ||
          /[✓✔✅]/.test(fullText);

        // Si no tiene puntos detectables Y no tiene marca de completado, verificar si es tarea válida
        if (!points && !hasCheckmark) {
          if (/quiz|poll|supersonic|search|bing/i.test(url)) {
            points = '+10';
          } else {
            continue;
          }
        }

        const urlKey = url;
        if (seenUrls.has(urlKey)) continue;
        seenUrls.add(urlKey);

        const completed = hasCheckmark;
        const type = _detectType(url, card);

        let title = "Tarea del Conjunto Diario";
        const titleEl = parentContainer.querySelector('.text-globalBody2Strong, .text-globalBody1Strong, [class*="Body2Strong"], [class*="Body1Strong"], h3, h4, strong, [class*="title"]');
        if (titleEl && titleEl.innerText && titleEl.innerText.trim().length > 2) {
          title = titleEl.innerText.trim();
        } else if (parentContainer.getAttribute('aria-label')) {
          title = parentContainer.getAttribute('aria-label');
        } else if (fullText) {
          const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 2 && !/^\+?\d+$/.test(l));
          if (lines.length > 0) title = lines[0];
        }

        tasks.push({
          title: title,
          points: points || '+10',
          type: type,
          completed: completed,
          element: card,
          url: url
        });

      } catch (err) {
        console.error(`${TAG} Error parseando tarjeta:`, err);
      }
    }

    console.log(`${TAG} Escaneo completado. Tareas detectadas: ${tasks.length}`);
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
      try {
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
      } catch (err) {
        console.error(`[DailySet] Error processing task ${i + 1}/${pending.length}:`, err);
        if (onProgress) {
          onProgress({ index: i, total: pending.length, status: 'error', error: err.message });
        }
        // Continue with next task instead of crashing the entire worker
        continue;
      }
    }

    console.log(`${TAG} ✅ Todas las tareas diarias procesadas`);
  }

  // ---------------------------------------------------------------------------
  // Registrar el worker en el namespace global
  // ---------------------------------------------------------------------------

  window.RewardsWorkers.DailySet = { scan, completeAll };

  console.log(`${TAG} Worker registrado correctamente`);
})();
