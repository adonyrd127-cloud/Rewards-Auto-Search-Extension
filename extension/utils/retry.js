/**
 * retry.js — Utilidades de reintentos y timeout para la extensión de Microsoft Rewards
 *
 * Proporciona ejecución resiliente de acciones asíncronas con:
 *   - Reintentos con backoff exponencial + jitter aleatorio
 *   - Timeout configurable para evitar bloqueos indefinidos
 *
 * Esencial para manejar fallos transitorios comunes en la automatización web:
 * elementos que tardan en cargar, Shadow DOMs que se renderizan tarde,
 * navegación lenta, etc.
 *
 * Se carga como content script antes de content.js.
 * No usa import/export — todo se expone en window.RewardsUtils.Retry.
 */

window.RewardsUtils = window.RewardsUtils || {};

window.RewardsUtils.Retry = (function () {
  'use strict';

  /**
   * safeAction — Ejecuta una función asíncrona con reintentos y backoff exponencial.
   *
   * Política de reintentos:
   *   - Espera: 2^intento × 1000ms + aleatorio(0-1000ms)
   *     → Intento 1: ~1-2 segundos
   *     → Intento 2: ~2-3 segundos
   *     → Intento 3: ~4-5 segundos
   *   - El jitter aleatorio evita que múltiples acciones se sincronicen
   *     (problema conocido como "thundering herd")
   *
   * @param {Function} fn          — Función asíncrona a ejecutar (debe retornar una Promise o valor).
   * @param {number}   [maxRetries=3] — Número máximo de reintentos (no cuenta el intento inicial).
   * @param {string}   [label='action'] — Etiqueta para identificar la acción en los logs.
   * @returns {Promise<*>} El resultado de la función en caso de éxito.
   * @throws {Error} Si todos los reintentos se agotan, lanza el último error.
   *
   * @example
   *   const result = await Retry.safeAction(
   *     () => document.querySelector('#points').textContent,
   *     3,
   *     'obtener puntos'
   *   );
   */
  async function safeAction(fn, maxRetries, label) {
    // Valores por defecto
    const retries = maxRetries !== undefined ? maxRetries : 3;
    const actionLabel = label || 'action';

    /** @type {Error|null} Último error capturado para relanzar si se agotan los intentos */
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Registrar el intento actual en consola (útil para debugging)
        if (attempt > 0) {
          console.log(
            '[RewardsUtils.Retry] Reintento ' +
              attempt +
              '/' +
              retries +
              ' para "' +
              actionLabel +
              '"'
          );
        }

        // Ejecutar la función — soporta tanto funciones sync como async
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;

        // Si aún quedan reintentos, esperar con backoff exponencial
        if (attempt < retries) {
          // Cálculo del backoff: 2^attempt × 1000ms base + jitter aleatorio (0-1000ms)
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.floor(Math.random() * 1000);
          const totalDelay = baseDelay + jitter;

          console.warn(
            '[RewardsUtils.Retry] "' +
              actionLabel +
              '" falló (intento ' +
              (attempt + 1) +
              '/' +
              (retries + 1) +
              '): ' +
              (error.message || error) +
              ' — reintentando en ' +
              totalDelay +
              'ms'
          );

          // Esperar antes del próximo intento
          await new Promise((resolve) => setTimeout(resolve, totalDelay));
        } else {
          // Se agotaron todos los reintentos
          console.error(
            '[RewardsUtils.Retry] "' +
              actionLabel +
              '" falló después de ' +
              (retries + 1) +
              ' intentos. Último error:',
            error.message || error
          );
        }
      }
    }

    // Si llegamos aquí, todos los intentos fallaron — relanzar el último error
    throw lastError;
  }

  /**
   * withTimeout — Envuelve una función asíncrona con un timeout máximo.
   *
   * Si la función no se resuelve dentro del tiempo especificado,
   * la promesa se rechaza con un error descriptivo.
   *
   * NOTA: Esto NO cancela la ejecución de la función original —
   * JavaScript no permite cancelar promesas arbitrarias. Lo que hace
   * es ignorar el resultado si llega después del timeout.
   *
   * @param {Function} fn            — Función asíncrona a ejecutar.
   * @param {number}   [timeoutMs=10000] — Tiempo máximo en milisegundos (default: 10 segundos).
   * @param {string}   [label='action']  — Etiqueta para el mensaje de error.
   * @returns {Promise<*>} El resultado de la función si termina a tiempo.
   * @throws {Error} Si se excede el timeout.
   *
   * @example
   *   const el = await Retry.withTimeout(
   *     () => waitForElement('#reward-card'),
   *     5000,
   *     'esperar tarjeta de recompensa'
   *   );
   */
  function withTimeout(fn, timeoutMs, label) {
    // Valores por defecto
    const timeout = timeoutMs !== undefined ? timeoutMs : 10000;
    const actionLabel = label || 'action';

    return new Promise((resolve, reject) => {
      /** Bandera para evitar resolver/rechazar después de que uno ya ocurrió */
      let settled = false;

      // Configurar el temporizador de timeout
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              '[RewardsUtils.Retry] Timeout: "' +
                actionLabel +
                '" excedió el límite de ' +
                timeout +
                'ms'
            )
          );
        }
      }, timeout);

      // Ejecutar la función
      Promise.resolve()
        .then(() => fn())
        .then((result) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        });
    });
  }

  // ──────────────────────────────────────────────
  // API pública del módulo
  // ──────────────────────────────────────────────
  return {
    safeAction,
    withTimeout,
  };
})();
