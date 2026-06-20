/**
 * human-sim.js — Simulación de comportamiento humano para la extensión de Microsoft Rewards
 *
 * Proporciona funciones que imitan interacciones humanas reales:
 * clics con secuencia completa de eventos del mouse, escritura carácter por carácter,
 * scroll suave con velocidad variable y delays aleatorios.
 *
 * Esto es esencial para evitar la detección de bots en las páginas de Bing y Rewards.
 *
 * Se carga como content script antes de content.js.
 * No usa import/export — todo se expone en window.RewardsUtils.Human.
 */

window.RewardsUtils = window.RewardsUtils || {};

window.RewardsUtils.Human = (function () {
  'use strict';

  // ──────────────────────────────────────────────
  // Utilidades internas
  // ──────────────────────────────────────────────

  /**
   * Genera un número aleatorio entre min y max (inclusive).
   * @param {number} min — Valor mínimo.
   * @param {number} max — Valor máximo.
   * @returns {number} Entero aleatorio en el rango [min, max].
   */
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ──────────────────────────────────────────────
  // Funciones principales
  // ──────────────────────────────────────────────

  /**
   * delay — Pausa aleatoria entre minMs y maxMs milisegundos.
   *
   * Simula el tiempo variable que tarda un humano entre acciones.
   * Si solo se pasa minMs, se usa como delay fijo.
   *
   * @param {number} minMs — Milisegundos mínimos de espera.
   * @param {number} [maxMs=minMs] — Milisegundos máximos de espera.
   * @returns {Promise<void>} Promesa que se resuelve tras el delay.
   *
   * @example
   *   await Human.delay(500, 1500); // Espera entre 0.5 y 1.5 segundos
   */
  function delay(minMs, maxMs) {
    // Si no se especifica máximo, usar el mínimo como valor fijo
    const max = maxMs !== undefined ? maxMs : minMs;
    const ms = randomInt(minMs, max);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * click — Simula un clic humano realista con la secuencia completa de eventos del mouse.
   *
   * Secuencia de eventos (igual que un clic real del navegador):
   *   1. mouseover  — el cursor entra en el elemento
   *   2. mousedown  — se presiona el botón del mouse
   *   3. mouseup    — se suelta el botón del mouse
   *   4. click      — evento de clic sintético
   *
   * Cada evento tiene un pequeño delay aleatorio entre sí (10-50ms)
   * para simular el tiempo real de un clic humano.
   *
   * @param {Element} element — Elemento sobre el cual simular el clic.
   * @returns {Promise<void>} Se resuelve cuando toda la secuencia termina.
   */
  async function click(element) {
    if (!element) {
      console.warn('[RewardsUtils.Human] click: elemento no proporcionado');
      return;
    }

    // Calcular coordenadas aproximadas del centro del elemento
    // para que los eventos tengan posiciones creíbles
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + randomInt(-3, 3);   // Pequeña variación
    const y = rect.top + rect.height / 2 + randomInt(-3, 3);

    // Opciones base compartidas por todos los eventos del mouse
    const baseOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0, // Botón izquierdo
    };

    // 1. mouseover — el cursor "llega" al elemento
    element.dispatchEvent(new MouseEvent('mouseover', baseOpts));
    await delay(10, 50);

    // 2. mousedown — se presiona el botón
    element.dispatchEvent(new MouseEvent('mousedown', baseOpts));
    await delay(10, 50);

    // 3. mouseup — se suelta el botón
    element.dispatchEvent(new MouseEvent('mouseup', baseOpts));
    await delay(10, 50);

    // 4. click — evento final de clic
    element.dispatchEvent(new MouseEvent('click', baseOpts));
  }

  /**
   * scroll — Realiza un scroll suave con velocidad variable.
   *
   * En lugar de hacer un scroll instantáneo (que se detecta fácilmente como bot),
   * divide el scroll en pasos pequeños con intervalos variables,
   * simulando el movimiento natural de la rueda del mouse.
   *
   * @param {number} pixels — Cantidad de píxeles a desplazar (positivo = abajo, negativo = arriba).
   * @returns {Promise<void>} Se resuelve cuando el scroll termina.
   */
  function scroll(pixels) {
    return new Promise((resolve) => {
      // Tamaño de cada paso de scroll (variable para parecer natural)
      const direction = pixels > 0 ? 1 : -1;
      let remaining = Math.abs(pixels);

      function step() {
        if (remaining <= 0) {
          resolve();
          return;
        }

        // Cada paso mueve entre 15 y 45 píxeles (simula rueda del mouse)
        const stepSize = Math.min(remaining, randomInt(15, 45));
        window.scrollBy({
          top: stepSize * direction,
          behavior: 'auto', // Usamos 'auto' porque nosotros controlamos la animación
        });
        remaining -= stepSize;

        // Intervalo variable entre pasos (simula velocidad irregular del scroll humano)
        const intervalMs = randomInt(10, 35);
        setTimeout(step, intervalMs);
      }

      step();
    });
  }

  /**
   * typeIntoInput — Escribe texto carácter por carácter en un campo de entrada.
   *
   * Simula la escritura humana:
   *   - Establece el foco en el input
   *   - Agrega un carácter a la vez al valor del input
   *   - Dispara el evento 'input' después de cada carácter
   *   - Espera un tiempo aleatorio entre caracteres (40-120ms) simulando
   *     la velocidad variable de tecleo humano
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} input — Campo de entrada.
   * @param {string} text — Texto a escribir.
   * @returns {Promise<void>} Se resuelve cuando se termina de escribir todo el texto.
   */
  async function typeIntoInput(input, text) {
    if (!input || !text) {
      console.warn('[RewardsUtils.Human] typeIntoInput: input o texto faltante');
      return;
    }

    // Asegurar que el input tenga el foco
    input.focus();
    // Limpiar valor previo
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Escribir carácter por carácter
    for (let i = 0; i < text.length; i++) {
      input.value += text[i];

      // Disparar evento 'input' para que la página reaccione
      // (autocompletado de Bing, validaciones, etc.)
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Delay variable entre teclas — los humanos no escriben a velocidad constante
      // Teclas comunes son más rápidas, espacios y puntuación más lentos
      const isSpecialChar = text[i] === ' ' || /[^a-zA-Z0-9]/.test(text[i]);
      const minDelay = isSpecialChar ? 50 : 40;
      const maxDelay = isSpecialChar ? 150 : 120;
      await delay(minDelay, maxDelay);
    }
  }

  /**
   * submitSearch — Envía el formulario de búsqueda después de escribir.
   *
   * Intenta múltiples estrategias para enviar el formulario:
   *   1. Busca un botón de submit dentro del formulario padre del input
   *   2. Llama a form.submit() directamente
   *   3. Como último recurso, simula la tecla Enter en el input
   *
   * @param {HTMLInputElement} input — Campo de búsqueda desde el cual enviar.
   * @returns {Promise<void>} Se resuelve cuando se ejecuta el envío.
   */
  async function submitSearch(input) {
    if (!input) {
      console.warn('[RewardsUtils.Human] submitSearch: input no proporcionado');
      return;
    }

    // Pequeña pausa antes de enviar (como un humano que revisa lo que escribió)
    await delay(200, 600);

    // Buscar el formulario padre del input
    const form = input.closest('form');

    if (form) {
      // Estrategia 1: Buscar botón de submit dentro del formulario
      const submitBtn = form.querySelector(
        'input[type="submit"], button[type="submit"], button:not([type]), [aria-label*="Search"], [aria-label*="Buscar"]'
      );

      if (submitBtn) {
        console.log('[RewardsUtils.Human] Enviando búsqueda via botón de submit');
        await click(submitBtn);
        return;
      }

      // Estrategia 2: Enviar el formulario directamente
      try {
        console.log('[RewardsUtils.Human] Enviando búsqueda via form.submit()');
        form.submit();
        return;
      } catch (e) {
        console.warn('[RewardsUtils.Human] form.submit() falló:', e.message);
      }
    }

    // Estrategia 3 (fallback): Simular tecla Enter
    console.log('[RewardsUtils.Human] Enviando búsqueda via tecla Enter');
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(enterEvent);

    // También disparar 'keypress' y 'keyup' para mayor compatibilidad
    input.dispatchEvent(
      new KeyboardEvent('keypress', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );
  }

  /**
   * jitterMs — Aplica variación aleatoria a un valor base de milisegundos.
   *
   * Útil para hacer que los timings de la extensión no sean perfectamente
   * predecibles, evitando patrones detectables por anti-bots.
   *
   * @param {number} baseMs            — Valor base en milisegundos.
   * @param {number} variationPercent  — Porcentaje de variación (ej: 20 = ±20%).
   * @returns {number} Valor con jitter aplicado (nunca menor que 0).
   *
   * @example
   *   jitterMs(1000, 25); // Devuelve entre 750 y 1250
   */
  function jitterMs(baseMs, variationPercent) {
    const variation = baseMs * (variationPercent / 100);
    const jittered = baseMs + (Math.random() * 2 - 1) * variation;
    // Asegurar que nunca devuelva un valor negativo
    return Math.max(0, Math.round(jittered));
  }

  // ──────────────────────────────────────────────
  // API pública del módulo
  // ──────────────────────────────────────────────
  return {
    delay,
    click,
    scroll,
    typeIntoInput,
    submitSearch,
    jitterMs,
  };
})();
