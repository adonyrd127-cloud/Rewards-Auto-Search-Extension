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
    'otras actividades',
    'explore more',
    'explora más',
    'explorar más',
    'seguir ganando',
    'keep earning',
    'sigue ganando',
    'earn more',
    'gana más',
    'ganar más'
  ];

  /** URLs que debemos ignorar (no son tareas reales) */
  const IGNORED_URL_PATTERNS = [
    /redeem/i,
    /canjear/i,
    /signin/i,
    /welcome/i,
    /profile/i,
    /dashboard$/i,
    /\/earn$/i,
    /\/status/i,
    /\/history/i,
    /^javascript:/i,
    /privacy/i,
    /terms/i,
    /legal/i,
    /about/i,
    /help/i,
    /support/i,
    /feedback/i,
    /microsoft\.com\/store/i,
    /pointsbreakdown/i,
    /#$/
  ];

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  /**
   * Localiza el contenedor de la sección "More Activities" / "Seguir ganando".
   * Recorre encabezados buscando coincidencias de texto, luego sube
   * al contenedor padre que agrupa las tarjetas.
   * @returns {Element|null}
   */
  function _findMoreActivitiesSection() {
    // Estrategia 1: Buscar por texto en encabezados visibles
    const headingTags = 'h1, h2, h3, h4, h5, [class*="heading"], [class*="title"], [class*="Heading"], [class*="Title"], mee-card-group, p, span, div';
    const headings = DOM.deepQueryAll(document.body, headingTags);

    for (const heading of headings) {
      // Solo considerar elementos con texto corto (< 50 chars) para evitar falsos positivos
      const rawText = (heading.innerText || heading.textContent || '').trim();
      if (rawText.length > 50 || rawText.length === 0) continue;
      
      const text = rawText.toLowerCase();

      if (SECTION_HEADINGS.some(h => text.includes(h))) {
        console.log(`${TAG} Sección encontrada por texto: "${rawText}"`);

        // Ascender al contenedor padre de tarjetas (máx. 5 niveles)
        let container = heading;
        for (let i = 0; i < 5; i++) {
          const parent = container.parentElement || (container.getRootNode && container.getRootNode().host);
          if (parent && parent !== document.body && parent !== document.documentElement) {
            container = parent;
          } else {
            break;
          }
        }
        
        // Verificar que el contenedor tiene enlaces/tarjetas dentro
        const links = container.querySelectorAll('a[href]');
        if (links.length > 0) {
          console.log(`${TAG} Contenedor validado con ${links.length} enlaces dentro.`);
          return container;
        }
        
        // Si no encontró enlaces, intentar subir un nivel más
        const grandParent = container.parentElement;
        if (grandParent && grandParent !== document.body) {
          const gpLinks = grandParent.querySelectorAll('a[href]');
          if (gpLinks.length > 0) {
            console.log(`${TAG} Contenedor validado (nivel extra) con ${gpLinks.length} enlaces.`);
            return grandParent;
          }
        }
        
        return container;
      }
    }

    // Estrategia 2: Buscar por innerText completo del body
    try {
      const bodyText = document.body.innerText || '';
      for (const heading of SECTION_HEADINGS) {
        const idx = bodyText.toLowerCase().indexOf(heading);
        if (idx !== -1) {
          console.log(`${TAG} Texto "${heading}" encontrado en body.innerText en posición ${idx}`);
          // Buscar el elemento DOM que contiene exactamente este texto
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
          let node;
          while (node = walker.nextNode()) {
            if (node.textContent && node.textContent.trim().toLowerCase().includes(heading)) {
              const parent = node.parentElement;
              if (parent) {
                console.log(`${TAG} Encontrado vía TreeWalker: <${parent.tagName}> "${parent.textContent.trim().substring(0, 50)}"`);
                // Subir al contenedor que tenga tarjetas
                let container = parent;
                for (let i = 0; i < 6; i++) {
                  container = container.parentElement;
                  if (!container || container === document.body) break;
                  const links = container.querySelectorAll('a[href]');
                  if (links.length >= 2) {
                    console.log(`${TAG} Contenedor encontrado vía TreeWalker con ${links.length} enlaces.`);
                    return container;
                  }
                }
              }
            }
          }
          break;
        }
      }
    } catch (e) {
      console.log(`${TAG} Error en búsqueda por TreeWalker:`, e);
    }

    // Estrategia 3: Atributos data específicos de la plataforma
    const fallbackSelectors = [
      '[data-bi-area="MoreActivities"]',
      '[data-bi-area="more-activities"]',
      '[data-bi-area="More promotions"]',
      '[data-bi-area="KeepEarning"]',
      '[data-bi-area="keep-earning"]',
      'mee-card-group[data-bi-area*="more"]',
      'mee-card-group[data-bi-area*="earn"]'
    ];

    for (const sel of fallbackSelectors) {
      const els = DOM.deepQueryAll(document.body, sel);
      if (els.length > 0) {
        console.log(`${TAG} Sección encontrada vía fallback: "${sel}"`);
        return els[0];
      }
    }

    let section = null;
    if (!section) {
      // Fallback: try data-bi-* attributes (analytics hooks, rarely change)
      section = document.querySelector('[data-bi-area="MoreActivities"]') 
             || document.querySelector('[data-bi-id="MoreActivities"]');
    }
    if (section) return section;

    console.log(`${TAG} No se pudo localizar la sección More Activities / Seguir ganando. Retornando null.`);
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
   * Parsea una tarjeta/enlace y extrae su información.
   * @param {Element} card — Elemento <a> o tarjeta clickable
   * @param {Set<string>} seenUrls — Set para deduplicar
   * @returns {Object|null} — tarea parseada o null si no es válida
   */
  function _parseCard(card, seenUrls) {
    try {
      const url = card.href || card.getAttribute('href') || card.querySelector('a[href]')?.href || '';
      if (!url || url.startsWith('javascript:')) return null;
      if (_shouldIgnoreUrl(url)) return null;

      const parentContainer = card.closest('div[class*="card"], [class*="item"], li, article, section, [class*="group"]') || card.parentElement || card;
      const fullText = (card.innerText || card.textContent || '') + ' ' + (parentContainer.innerText || parentContainer.textContent || '');
      
      // Ignorar tareas bloqueadas exclusivas de la app móvil
      if (/\b(bloquead[oa]s?|locked|solo en la aplicación|app only)\b/i.test(fullText)) {
        return null;
      }

      let points = '';
      const pointsSelectors = [
        '.text-statusInformativeTintFg',
        '.text-metadata',
        '[class*="statusInformative"]',
        '[class*="StatusInformative"]',
        '[class*="points"]',
        '[class*="badge"]'
      ];
      for (const sel of pointsSelectors) {
        const pointsEl = parentContainer.querySelector(sel);
        if (pointsEl) {
          const match = pointsEl.innerText.match(/[+✓✔✅]?\s*(\d+)/);
          if (match) {
            points = '+' + match[1];
            break;
          }
        }
      }
      if (!points) {
        const match = fullText.match(/[+✓✔✅]\s*(\d{1,3})/);
        if (match) points = '+' + match[1];
      }
      if (!points) {
        points = _extractPoints(fullText);
      }

      const hasCheckmark = 
        (DOM && DOM.hasCompletionMark && (DOM.hasCompletionMark(card) || DOM.hasCompletionMark(parentContainer))) ||
        parentContainer.querySelector('.text-statusPositiveTintFg, [class*="statusPositive"], [class*="StatusPositive"], .c-indicator-check, [class*="checkmark"], [class*="complete"], [class*="done"], [class*="success"], [class*="claimed"]') !== null || 
        /\b(completad[oa]s?|listo|hecho|done|completed|claimed|finished)\b/i.test(fullText) ||
        /[✓✔✅]/.test(fullText);

      // Si no tiene puntos detectables Y no tiene marca de completado, comprobar si es enlace de tarea válido
      if (!points && !hasCheckmark) {
        if (/bing\.com|rewards|quiz|poll/i.test(url)) {
          points = '+5';
        } else {
          return null;
        }
      }

      const urlKey = url;
      if (seenUrls.has(urlKey)) return null;
      seenUrls.add(urlKey);

      const completed = hasCheckmark;
      const type = _detectType(url, card);

      let title = 'Actividad Promocional';
      const titleSelectors = [
        '.text-globalBody2Strong',
        '.text-globalBody1Strong',
        '[class*="Body2Strong"]',
        '[class*="Body1Strong"]',
        '[class*="title"]',
        '[class*="Title"]',
        'h3', 'h4', 'strong'
      ];
      for (const sel of titleSelectors) {
        const titleEl = parentContainer.querySelector(sel);
        if (titleEl && titleEl.innerText && titleEl.innerText.trim().length > 2) {
          title = titleEl.innerText.trim();
          break;
        }
      }
      if (title === 'Actividad Promocional' && parentContainer.getAttribute('aria-label')) {
        title = parentContainer.getAttribute('aria-label');
      }
      if (title === 'Actividad Promocional' && fullText) {
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 2 && !/^\+?\d+$/.test(l));
        if (lines.length > 0) {
          title = lines[0];
        }
      }

      return {
        title: title,
        points: points || '+5',
        type: type,
        completed: completed,
        element: card,
        url: url
      };
    } catch (err) {
      console.error(`${TAG} Error parseando tarjeta:`, err);
      return null;
    }
  }

  /**
   * Fuerza la carga de contenido lazy-loaded haciendo scroll al fondo de la página.
   */
  async function _triggerLazyLoad() {
    const originalScroll = window.scrollY;
    
    // Scroll progresivo al fondo para activar lazy loading
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    
    for (let y = 0; y < docHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    
    // Esperar 1.5s para que React/Next.js rendericen el contenido lazy
    await new Promise(r => setTimeout(r, 1500));
    
    // Restaurar posición de scroll
    window.scrollTo(0, originalScroll);
  }

  /**
   * Escanea la sección "More Activities" / "Seguir ganando" y devuelve las tareas detectadas.
   * Implementa múltiples estrategias de detección y manejo de contenido lazy-loaded.
   *
   * @returns {Array<{title: string, points: string, type: string, completed: boolean, element: Element, url: string}>}
   */
  async function scan() {
    console.log(`${TAG} Iniciando escaneo de More Activities / Seguir ganando...`);
    console.log(`${TAG} Página actual: ${window.location.pathname}`);

    // Forzar carga de contenido lazy-loaded si estamos en /earn
    if (window.location.pathname.includes('/earn')) {
      console.log(`${TAG} Detectada página /earn — forzando lazy load vía scroll...`);
      await _triggerLazyLoad();
    }

    const section = _findMoreActivitiesSection();
    
    const tasks = [];
    const seenUrls = new Set();

    if (section) {
      // Estrategia principal: buscar tarjetas dentro del contenedor detectado
      // Intentar múltiples selectores de tarjetas (la UI de Microsoft cambia frecuentemente)
      const cardSelectorList = [
        'a.group\\/ctrl.cursor-pointer[href]',  // Selector original Tailwind
        'a[href][class*="group"]',               // Variante más amplia
        'a[href][class*="cursor-pointer"]',       // Otra variante Tailwind
        'a[href]'                                 // Fallback: cualquier enlace con href
      ];

      let cards = [];
      for (const sel of cardSelectorList) {
        try {
          cards = Array.from(section.querySelectorAll(sel));
          console.log(`${TAG} Selector "${sel}" → ${cards.length} candidatos en sección`);
          if (cards.length > 0) break;
        } catch (e) {
          // Selector inválido — ignorar
        }
      }

      for (const card of cards) {
        const task = _parseCard(card, seenUrls);
        if (task) tasks.push(task);
      }

      console.log(`${TAG} Tareas encontradas dentro de sección: ${tasks.length}`);
    } else {
      console.log(`${TAG} Sección no encontrada, intentando escaneo global de la página...`);
    }

    // Fallback global: si encontramos 0 tareas, escanear toda la página
    // buscando tarjetas con badges de puntos que NO pertenezcan al Daily Set
    if (tasks.length === 0) {
      console.log(`${TAG} Ejecutando escaneo global (fallback)...`);

      // Encontrar la sección Daily Set para excluirla
      let dailySetContainer = null;
      try {
        const dailySetHeadings = ['daily set', 'conjunto diario', 'daily activities', 'actividades diarias', 'formas diarias de ganar', 'daily ways to earn'];
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, p, span, div');
        for (const h of allHeadings) {
          const text = (h.innerText || '').trim().toLowerCase();
          if (text.length < 50 && dailySetHeadings.some(ds => text.includes(ds))) {
            dailySetContainer = h;
            for (let i = 0; i < 5; i++) {
              dailySetContainer = dailySetContainer.parentElement;
              if (!dailySetContainer || dailySetContainer === document.body) break;
            }
            break;
          }
        }
      } catch (e) {}

      // Buscar TODOS los enlaces en la página con puntos o marcas de completado
      const allLinks = document.querySelectorAll('a[href]');
      console.log(`${TAG} Total de enlaces en la página: ${allLinks.length}`);
      
      let candidateCount = 0;
      for (const link of allLinks) {
        // Excluir enlaces dentro del Daily Set
        if (dailySetContainer && dailySetContainer.contains(link)) continue;
        
        // Excluir enlaces de navegación/header/footer (generalmente cortos o en nav)
        const closestNav = link.closest('nav, header, footer, [role="navigation"]');
        if (closestNav) continue;

        // Excluir el panel de la extensión
        if (link.closest('#rewards-auto-panel')) continue;

        const fullText = link.innerText || link.textContent || '';
        
        // Solo considerar enlaces con contenido sustancial (no solo un icono)
        if (fullText.trim().length < 5) continue;
        
        candidateCount++;
        const task = _parseCard(link, seenUrls);
        if (task) tasks.push(task);
      }

      console.log(`${TAG} Escaneo global: ${candidateCount} candidatos evaluados, ${tasks.length} tareas válidas encontradas.`);
    }

    console.log(`${TAG} ✅ Escaneo completado. Tareas detectadas en More Activities: ${tasks.length}`);
    if (tasks.length > 0) {
      console.log(`${TAG} Detalle:`);
      tasks.forEach((t, i) => console.log(`${TAG}   [${i}] "${t.title}" ${t.points} ${t.completed ? '✔ completada' : '⏳ pendiente'}`));
    }
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
      try {
        const task = pending[i];

        // Notificar progreso
        if (typeof onProgress === 'function') {
          try {
            onProgress(i, pending.length, task.title);
          } catch (cbErr) {
            console.log(`${TAG} Error en callback onProgress:`, cbErr);
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
      } catch (err) {
        console.error(`[MoreActivities] Error processing task ${i + 1}/${pending.length}:`, err);
        if (onProgress) {
          onProgress({ index: i, total: pending.length, status: 'error', error: err.message });
        }
        // Continue with next task instead of crashing the entire worker
        continue;
      }
    }

    console.log(`${TAG} ✅ Todas las actividades extra procesadas`);
  }

  // ---------------------------------------------------------------------------
  // Registrar el worker
  // ---------------------------------------------------------------------------

  window.RewardsWorkers.MoreActivities = { scan, completeAll };

  console.log(`${TAG} Worker registrado correctamente`);
})();
