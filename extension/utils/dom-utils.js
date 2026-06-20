/**
 * dom-utils.js — Utilidades de DOM para la extensión de Microsoft Rewards
 *
 * Proporciona funciones para penetrar Shadow DOMs (Web Components como mee-card),
 * buscar elementos con selectores robustos y detectar marcas de completitud.
 *
 * Se carga como content script antes de content.js.
 * No usa import/export — todo se expone en window.RewardsUtils.DOM.
 */

window.RewardsUtils = window.RewardsUtils || {};

window.RewardsUtils.DOM = (function () {
  'use strict';

  // ──────────────────────────────────────────────
  // Selectores conocidos para las distintas secciones de la página de Rewards.
  // Microsoft cambia la UI con frecuencia, así que mantenemos múltiples
  // selectores de respaldo (fallback) para cada tipo de tarjeta.
  // ──────────────────────────────────────────────
  const CARD_SELECTORS = {
    /** Tarjetas del "Set Diario" (Daily Set) */
    dailySet: [
      'mee-card.ds-card-set',
      'mee-card.daily-set-card',
      '.daily-set-section mee-card',
      '[data-bi-area="DailySet"] mee-card',
      '.ds-card-set',
      '.daily-set mee-card',
      'mee-card[data-bi-area="DailySet"]',
    ],

    /** Tarjetas de "Más Actividades" (More Activities) */
    moreActivities: [
      'mee-card.ds-card-set-more',
      '.more-activities mee-card',
      '[data-bi-area="MoreActivities"] mee-card',
      '.c-card-section mee-card',
      'mee-card[data-bi-area="MoreActivities"]',
      '.more-promotions mee-card',
    ],

    /** Tarjetas de tipo "Punch Card" (tarjetas con progreso acumulativo) */
    punchCards: [
      'mee-card.ds-card-punch',
      '.punch-card mee-card',
      '[data-bi-area="PunchCard"] mee-card',
      'mee-card[data-bi-area="PunchCard"]',
      '.ds-card-punch',
    ],

    /** Elementos relacionados con bonus de racha (streak bonus) */
    streakBonus: [
      '.streak-bonus',
      '[data-bi-area="Streak"]',
      'mee-card.streak-card',
      '.daily-streak',
      '.streak-bonus-card',
      '[data-bi-id*="streak"]',
    ],

    /** Selectores genéricos para cualquier tarjeta de Rewards */
    generic: [
      'mee-card',
      '[data-bi-id]',
      '.card-container',
      '.c-card',
      '.rewards-card',
      '[class*="card"]',
    ],
  };

  // ──────────────────────────────────────────────
  // Funciones principales
  // ──────────────────────────────────────────────

  /**
   * deepQueryAll — Busca recursivamente en Shadow DOMs.
   *
   * Recorre el árbol del DOM partiendo de `root`, entrando en cada shadowRoot
   * que encuentre, y recolecta todos los elementos que coincidan con al menos
   * uno de los selectores proporcionados.
   *
   * @param {Node}     root      — Nodo raíz desde donde buscar (document, element, shadowRoot).
   * @param {string[]} selectors — Array de selectores CSS a probar.
   * @returns {Element[]} Lista (sin duplicados) de elementos encontrados.
   */
  function deepQueryAll(root, selectors) {
    /** @type {Set<Element>} Evita duplicados cuando un elemento aparece en varios niveles */
    const found = new Set();

    /**
     * Función recursiva interna que recorre el sub-árbol.
     * @param {Node} node — Nodo actual a inspeccionar.
     */
    function walk(node) {
      // Intentar cada selector en el nodo actual (si soporta querySelector)
      if (node && typeof node.querySelectorAll === 'function') {
        for (const sel of selectors) {
          try {
            const matches = node.querySelectorAll(sel);
            matches.forEach((el) => found.add(el));
          } catch (_e) {
            // Selector inválido — lo ignoramos silenciosamente
          }
        }
      }

      // Penetrar en el shadowRoot del nodo, si existe
      if (node && node.shadowRoot) {
        walk(node.shadowRoot);
      }

      // Recorrer hijos directos buscando más shadowRoots
      if (node && node.children) {
        for (const child of node.children) {
          // Solo descender si el hijo tiene shadowRoot (optimización)
          if (child.shadowRoot) {
            walk(child.shadowRoot);
          }
          // También recorrer hijos que puedan contener Web Components anidados
          if (child.children && child.children.length > 0) {
            walk(child);
          }
        }
      }
    }

    walk(root);
    return Array.from(found);
  }

  /**
   * deepQueryOne — Igual que deepQueryAll pero devuelve solo el primer resultado.
   *
   * Más eficiente que deepQueryAll cuando solo se necesita un elemento,
   * porque detiene la búsqueda al encontrar la primera coincidencia.
   *
   * @param {Node}     root      — Nodo raíz.
   * @param {string[]} selectors — Selectores CSS.
   * @returns {Element|null} El primer elemento encontrado o null.
   */
  function deepQueryOne(root, selectors) {
    /** @type {Element|null} */
    let result = null;

    function walk(node) {
      // Si ya encontramos algo, detenemos la búsqueda
      if (result) return;

      if (node && typeof node.querySelector === 'function') {
        for (const sel of selectors) {
          if (result) return;
          try {
            const match = node.querySelector(sel);
            if (match) {
              result = match;
              return;
            }
          } catch (_e) {
            // Selector inválido — ignorar
          }
        }
      }

      if (result) return;

      // Penetrar shadowRoot
      if (node && node.shadowRoot) {
        walk(node.shadowRoot);
      }

      if (result) return;

      // Recorrer hijos
      if (node && node.children) {
        for (const child of node.children) {
          if (result) return;
          if (child.shadowRoot) {
            walk(child.shadowRoot);
          }
          if (child.children && child.children.length > 0) {
            walk(child);
          }
        }
      }
    }

    walk(root);
    return result;
  }

  /**
   * getDeepText — Extrae todo el texto visible de un nodo, penetrando Shadow DOMs.
   *
   * Útil para obtener el texto de tarjetas de Rewards que usan Web Components
   * internos donde textContent normal no alcanza.
   *
   * @param {Node} node — Nodo del cual extraer texto.
   * @returns {string} Texto limpio (sin espacios extra).
   */
  function getDeepText(node) {
    if (!node) return '';

    const parts = [];

    function collect(n) {
      // Nodo de texto puro — recoger su contenido
      if (n.nodeType === Node.TEXT_NODE) {
        const trimmed = (n.textContent || '').trim();
        if (trimmed) parts.push(trimmed);
        return;
      }

      // Si el nodo tiene shadowRoot, descender primero ahí
      if (n.shadowRoot) {
        collect(n.shadowRoot);
      }

      // Recorrer hijos del nodo (o del shadowRoot/documentFragment)
      if (n.childNodes) {
        for (const child of n.childNodes) {
          collect(child);
        }
      }
    }

    collect(node);
    // Unir partes y colapsar espacios múltiples
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * hasCompletionMark — Detecta si un nodo contiene indicadores de tarea completada.
   *
   * Revisa múltiples señales:
   *   1. SVGs con path data que contenga '16.17' o 'CheckMark' (iconos de check de Microsoft)
   *   2. Clases CSS: 'checkmark', 'complete', 'done'
   *   3. Texto en español/inglés: 'Completado', 'completada', 'Listo', 'Hecho'
   *   4. Caracteres Unicode de check: ✓ (U+2713), ✔ (U+2714)
   *
   * @param {Node} node — Nodo a inspeccionar.
   * @returns {boolean} true si se detecta alguna marca de completitud.
   */
  function hasCompletionMark(node) {
    if (!node) return false;

    // ── 1. Buscar SVGs con datos de path de checkmark ──
    const svgs = deepQueryAll(node, ['svg', 'svg path']);
    for (const svg of svgs) {
      // Revisar el atributo 'd' de los <path> dentro del SVG
      const paths = svg.tagName === 'path' ? [svg] : svg.querySelectorAll('path');
      for (const path of paths) {
        const d = path.getAttribute('d') || '';
        if (d.includes('16.17') || d.toLowerCase().includes('checkmark')) {
          return true;
        }
      }
      // También revisar data-icon o aria-label del propio SVG
      const label = (svg.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('checkmark') || label.includes('complete')) {
        return true;
      }
    }

    // ── 2. Buscar clases CSS indicadoras de completitud ──
    const completionClasses = ['checkmark', 'complete', 'done', 'completed'];
    const allElements = deepQueryAll(node, ['*']);
    for (const el of allElements) {
      if (el.classList) {
        for (const cls of completionClasses) {
          if (el.classList.contains(cls)) {
            return true;
          }
        }
        // También revisar si alguna clase contiene la palabra (ej: 'is-complete')
        for (const cls of el.classList) {
          const lower = cls.toLowerCase();
          if (
            lower.includes('complete') ||
            lower.includes('checkmark') ||
            lower.includes('done')
          ) {
            return true;
          }
        }
      }
    }

    // ── 3. Buscar texto indicador de completitud ──
    const deepText = getDeepText(node).toLowerCase();
    const completionTexts = ['completado', 'completada', 'listo', 'hecho'];
    for (const text of completionTexts) {
      if (deepText.includes(text)) {
        return true;
      }
    }

    // ── 4. Buscar símbolos de check Unicode ──
    if (deepText.includes('✓') || deepText.includes('✔')) {
      return true;
    }

    return false;
  }

  /**
   * findClickable — Busca el mejor elemento clicable dentro de una tarjeta.
   *
   * Prioridad de búsqueda:
   *   1. <a> con href válido (no '#' ni vacío)
   *   2. Elementos con atributo data-href
   *   3. <button> o elementos con role="button"
   *   4. La propia tarjeta como último recurso
   *
   * Penetra Shadow DOMs para encontrar enlaces ocultos en Web Components.
   *
   * @param {Element} card — Elemento tarjeta donde buscar.
   * @returns {Element|null} El elemento clicable encontrado, o la tarjeta misma.
   */
  function findClickable(card) {
    if (!card) return null;

    // 1. Buscar enlaces <a> con href válido
    const links = deepQueryAll(card, ['a[href]']);
    for (const link of links) {
      const href = link.getAttribute('href');
      // Filtrar hrefs vacíos o anchors sin destino
      if (href && href !== '#' && href !== 'javascript:void(0)') {
        return link;
      }
    }

    // 2. Buscar elementos con data-href (patrón usado por Microsoft)
    const dataHrefEls = deepQueryAll(card, ['[data-href]']);
    if (dataHrefEls.length > 0) {
      return dataHrefEls[0];
    }

    // 3. Buscar botones
    const buttons = deepQueryAll(card, ['button', '[role="button"]', 'input[type="submit"]']);
    if (buttons.length > 0) {
      return buttons[0];
    }

    // 4. Último recurso: devolver la propia tarjeta
    return card;
  }

  /**
   * containsDeep — Verifica si `parent` contiene a `child`, incluso a través de Shadow DOMs.
   *
   * @param {Node} parent — Posible contenedor.
   * @param {Node} child  — Posible hijo.
   * @returns {boolean} true si parent contiene a child (no cuenta si son el mismo nodo).
   */
  function containsDeep(parent, child) {
    if (!parent || !child || parent === child) return false;

    // Intentar con contains() nativo primero
    if (parent.contains && parent.contains(child)) {
      return true;
    }

    // Subir por la cadena de host/parentNode del child
    let current = child;
    while (current) {
      // Si el padre del current es un shadowRoot, subir al host
      if (current.parentNode === parent) return true;
      if (current.getRootNode && current.getRootNode() !== document) {
        const rootNode = current.getRootNode();
        if (rootNode.host === parent) return true;
        current = rootNode.host || current.parentNode;
      } else {
        current = current.parentNode;
      }
    }

    return false;
  }

  /**
   * getInnermostCards — Filtra un array de tarjetas para quedarse solo con las más internas.
   *
   * Cuando se hace deepQueryAll con selectores genéricos, es posible obtener tanto
   * contenedores padre como sus tarjetas hijas. Esta función elimina los padres
   * para evitar doble procesamiento.
   *
   * Ejemplo: si tenemos [divContenedor, mee-card1, mee-card2] y divContenedor
   * contiene a mee-card1 y mee-card2, solo devolvemos [mee-card1, mee-card2].
   *
   * @param {Element[]} cards — Array de elementos tarjeta.
   * @returns {Element[]} Solo las tarjetas que no contienen otras tarjetas del array.
   */
  function getInnermostCards(cards) {
    if (!cards || cards.length <= 1) return cards || [];

    return cards.filter((card) => {
      // Una tarjeta es "innermost" si ninguna otra tarjeta del array está contenida en ella
      const containsOther = cards.some(
        (other) => other !== card && containsDeep(card, other)
      );
      return !containsOther;
    });
  }

  // ──────────────────────────────────────────────
  // API pública del módulo
  // ──────────────────────────────────────────────
  return {
    CARD_SELECTORS,
    deepQueryAll,
    deepQueryOne,
    getDeepText,
    hasCompletionMark,
    findClickable,
    getInnermostCards,
    // Exportamos containsDeep también, puede ser útil externamente
    containsDeep,
  };
})();
