// =============================================================================
// Worker: Streak Bonus — Detecta y reclama bonificaciones por racha diaria
// Se carga como content script en rewards.bing.com
// Depende de: window.RewardsUtils (DOM, Human, Retry)
// =============================================================================

window.RewardsWorkers = window.RewardsWorkers || {};

(function () {
  'use strict';

  const TAG = '[RewardsBot][StreakBonus]';
  const { DOM, Human, Retry } = window.RewardsUtils;

  // ---------------------------------------------------------------------------
  // Selectores y patrones para detectar la racha y el bono
  // ---------------------------------------------------------------------------

  /** Textos que identifican elementos relacionados con la racha (EN / ES) */
  const STREAK_KEYWORDS = [
    'streak',
    'racha',
    'daily streak',
    'racha diaria',
    'day streak',
    'días de racha'
  ];

  /** Textos que indican un bono disponible para reclamar */
  const CLAIM_KEYWORDS = [
    'claim',
    'reclamar',
    'collect',
    'recoger',
    'get bonus',
    'obtener bono',
    'bonus available',
    'bono disponible'
  ];

  /** Patrón para extraer el número de días de racha */
  const STREAK_DAY_PATTERNS = [
    /(\d+)\s*(?:day|día|days|días)\s*(?:streak|racha)/i,
    /(?:streak|racha)\s*[:.]?\s*(\d+)/i,
    /(\d+)\s*(?:day|día)/i
  ];

  /** Patrón para extraer la cantidad del bono */
  const BONUS_AMOUNT_PATTERNS = [
    /\+\s*(\d+)\s*(?:pts?|points?|puntos?)/i,
    /(\d+)\s*(?:bonus|bono)\s*(?:pts?|points?|puntos?)?/i,
    /\+\s*(\d+)/
  ];

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  /**
   * Busca todos los elementos relacionados con la racha en el dashboard.
   * Devuelve un array de nodos que contienen texto de racha.
   * @returns {Element[]}
   */
  function _findStreakElements() {
    // Selectores amplios para encontrar la zona de racha
    const candidates = DOM.deepQueryAll(document.body, [
      '[class*="streak"]',
      '[class*="racha"]',
      '[id*="streak"]',
      '[data-bi-id*="streak"]',
      '[data-bi-area*="streak"]',
      'mee-card',
      '[class*="bonus"]',
      '[class*="bono"]'
    ].join(', '));

    // Filtrar por los que realmente contienen texto de racha
    return candidates.filter(el => {
      const text = DOM.getDeepText(el).toLowerCase();
      return STREAK_KEYWORDS.some(kw => text.includes(kw));
    });
  }

  /**
   * Extrae el número de días de racha desde un texto.
   * @param {string} text
   * @returns {number} — días de racha, o 0 si no se detecta
   */
  function _extractStreakDays(text) {
    for (const pattern of STREAK_DAY_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const days = parseInt(match[1], 10);
        // Validar rango razonable (máx. 999 días)
        if (days >= 0 && days < 1000) return days;
      }
    }
    return 0;
  }

  /**
   * Extrae la cantidad del bono desde un texto.
   * @param {string} text
   * @returns {number} — cantidad del bono, o 0
   */
  function _extractBonusAmount(text) {
    for (const pattern of BONUS_AMOUNT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 0;
  }

  /**
   * Busca un botón de claim (reclamar) dentro de un elemento.
   * @param {Element} root
   * @returns {Element|null} — el botón de claim, o null
   */
  function _findClaimButton(root) {
    const buttons = DOM.deepQueryAll(root, 'button, [role="button"], a[href]');

    for (const btn of buttons) {
      const btnText = DOM.getDeepText(btn).toLowerCase();

      if (CLAIM_KEYWORDS.some(kw => btnText.includes(kw))) {
        // Verificar que el botón no esté deshabilitado
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
          console.log(`${TAG}   Botón de claim encontrado pero deshabilitado`);
          continue;
        }
        return btn;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Escanea el dashboard en busca del streak bonus.
   * Detecta los días de racha, si hay un bono disponible, su cantidad,
   * y el elemento DOM relevante.
   *
   * @returns {{ streakDays: number, bonusAvailable: boolean, bonusAmount: number, element: Element|null }}
   */
  async function scan() {
    console.log(`${TAG} Iniciando escaneo de Streak Bonus...`);

    const streakElements = _findStreakElements();

    // Resultado por defecto (sin racha detectada)
    const result = {
      streakDays: 0,
      bonusAvailable: false,
      bonusAmount: 0,
      element: null
    };

    if (streakElements.length === 0) {
      console.log(`${TAG} No se detectaron elementos de racha en el dashboard`);

      // Intento extra: buscar cualquier texto de racha en todo el body
      const bodyText = DOM.getDeepText(document.body).toLowerCase();
      const bodyDays = _extractStreakDays(bodyText);

      if (bodyDays > 0) {
        console.log(`${TAG} Racha detectada en body (fallback): ${bodyDays} días`);
        result.streakDays = bodyDays;
      }

      return result;
    }

    // Procesar los elementos encontrados para extraer datos de racha
    let bestStreakDays = 0;
    let claimButton = null;
    let bonusAmount = 0;
    let mainElement = null;

    for (const el of streakElements) {
      try {
        const text = DOM.getDeepText(el);
        const textLower = text.toLowerCase();

        // Extraer días de racha
        const days = _extractStreakDays(text);
        if (days > bestStreakDays) {
          bestStreakDays = days;
          mainElement = el;
        }

        // Buscar bono disponible
        const amount = _extractBonusAmount(text);
        if (amount > bonusAmount) {
          bonusAmount = amount;
        }

        // Buscar botón de claim
        if (!claimButton) {
          const btn = _findClaimButton(el);
          if (btn) {
            claimButton = btn;
            mainElement = el; // Priorizar el elemento que tiene el botón
          }
        }

        // Verificar si el texto indica bono disponible explícitamente
        if (CLAIM_KEYWORDS.some(kw => textLower.includes(kw))) {
          // Aunque no encontremos botón específico, marcar como disponible
          if (!claimButton) {
            // Intentar usar el elemento clickeable como fallback
            claimButton = DOM.findClickable(el);
          }
        }
      } catch (err) {
        console.error(`${TAG} Error procesando elemento de racha:`, err);
      }
    }

    // Construir resultado
    result.streakDays = bestStreakDays;
    result.bonusAvailable = claimButton !== null;
    result.bonusAmount = bonusAmount;
    result.element = mainElement;

    // Log detallado del estado
    console.log(`${TAG} Estado de racha:`);
    console.log(`${TAG}   🔥 Días de racha: ${result.streakDays}`);
    console.log(`${TAG}   🎁 Bono disponible: ${result.bonusAvailable ? 'SÍ' : 'NO'}`);
    if (result.bonusAmount > 0) {
      console.log(`${TAG}   💰 Cantidad del bono: +${result.bonusAmount}`);
    }

    return result;
  }

  /**
   * Reclama el bono de racha si está disponible.
   * Busca el botón de claim y lo activa con un clic humano simulado.
   *
   * @returns {boolean} — true si se reclamó exitosamente, false si no
   */
  async function claim() {
    console.log(`${TAG} Intentando reclamar bono de racha...`);

    // Primero escanear para obtener estado actualizado
    const status = await scan();

    if (!status.bonusAvailable) {
      console.log(`${TAG} No hay bono de racha disponible para reclamar`);
      return false;
    }

    if (!status.element) {
      console.warn(`${TAG} Bono detectado pero no se encontró elemento interactivo`);
      return false;
    }

    // Buscar el botón de claim dentro del elemento de racha
    const claimButton = _findClaimButton(status.element);

    if (!claimButton) {
      // Fallback: intentar hacer clic en el elemento clickeable general
      const fallbackClickable = DOM.findClickable(status.element);
      if (fallbackClickable) {
        console.log(`${TAG} Usando fallback clickeable para reclamar`);
        return await _executeClaimClick(fallbackClickable);
      }

      console.warn(`${TAG} No se encontró botón de claim ni elemento clickeable`);
      return false;
    }

    return await _executeClaimClick(claimButton);
  }

  /**
   * Ejecuta el clic de reclamación con reintentos y verificación.
   * @param {Element} button — elemento a clickear
   * @returns {boolean} — true si el clic se ejecutó correctamente
   */
  async function _executeClaimClick(button) {
    let success = false;

    await Retry.safeAction(async () => {
      console.log(`${TAG}   🖱️ Haciendo clic en botón de claim...`);

      // Simular comportamiento humano: pequeña pausa antes del clic
      await Human.delay(500, 1000);

      // Hacer scroll suave hacia el botón si no es visible
      const rect = button.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        console.log(`${TAG}   📜 Haciendo scroll hacia el botón de claim...`);
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await Human.delay(500, 800);
      }

      // Clic humano simulado
      await Human.click(button);

      // Esperar a que se procese el claim
      await Human.delay(1500, 2500);

      success = true;
      console.log(`${TAG}   ✅ Clic de claim ejecutado correctamente`);
    }, 3, 'claim-streak-bonus');

    if (success) {
      // Verificar que el bono se reclamó revisando si el botón desapareció
      // o si ahora tiene un estado de completado
      await Human.delay(1000, 1500);

      const postClaimElements = _findStreakElements();
      let stillAvailable = false;

      for (const el of postClaimElements) {
        if (_findClaimButton(el)) {
          stillAvailable = true;
          break;
        }
      }

      if (!stillAvailable) {
        console.log(`${TAG} 🎉 ¡Bono de racha reclamado exitosamente!`);
        return true;
      } else {
        console.warn(`${TAG} ⚠️ El botón de claim sigue visible — puede que no se haya reclamado`);
        return true; // Devolvemos true porque el clic sí se ejecutó
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Registrar el worker
  // ---------------------------------------------------------------------------

  window.RewardsWorkers.StreakBonus = { scan, claim };

  console.log(`${TAG} Worker registrado correctamente`);
})();
