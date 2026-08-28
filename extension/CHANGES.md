# Historial de Cambios — Rewards Auto Search & Claimer

---

## Versión 4.4.0 (Actual)

### 1. Reclamación Automática Universal de Tareas en `rewards.bing.com` (/earn y /dashboard)
- **Navegación determinista a `/earn`**: `openRewardsDashboard()` ahora navega directamente al centro de tareas `https://rewards.bing.com/earn` y activa la pestaña para asegurar el renderizado completo de Web Components.
- **Eliminación de la exclusión en `/earn`**: Se eliminaron las restricciones `if (!isEarn)` en `content.js` que impedían escanear Daily Set y Punch Cards en `/earn`.
- **Control determinista de pestañas con `openTaskTab`**: En lugar de depender de clics indirectos o `sessionStorage`, `claimSingleTask()` solicita la creación de la pestaña directamente a `background.js`, garantizando que `isAutomationTab` sea siempre `true` y que el ciclo de vida de apertura, resolución de quiz y cierre esté 100% coordinado.
- **Escáner Multiselector Universal**:
  - `workers/daily-set.js`: Nuevo soporte para encabezados en español e inglés ("racha de conjunto diario", "daily set streak", "conjunto diario") y fallback global para capturar las 3 tareas diarias en cualquier variante del DOM de Microsoft Rewards.
  - `workers/punch-cards.js`: Escaneo global en todo el DOM si no existe un contenedor `<mee-card-group>` explícito.
  - `workers/more-activities.js`: Detección ampliada de todas las tarjetas promocionales y de quizzes.

### 2. Búsquedas de Bing 100% Confiables
- **Navegación determinista y `waitForTabLoad`**: `runSessionLoop()` navega directamente a la URL de búsqueda, espera que el documento cargue por completo, e inyecta interacciones humanas (`simulateSearchPageInteractions`: scroll en `#b_results`, mouseover en enlaces de resultados).
- **Modo Pestaña Activa**: Activado por defecto en Ajustes para evitar el estrangulamiento de timers y pérdida de foco de Chromium en pestañas ocultas.
- **Modo Cooldown de 15 Minutos**: Pausa inteligente de 15 minutos cada 4 búsquedas para cuentas con la restricción de Microsoft Rewards.

---

## Versión 4.3.0 / 4.3.1
- Solucionado el envío del formulario de Bing en la página principal (`#sb_form` / `#sb_form_go` / `requestSubmit()` / fallback `window.location.href`).
- Inyectado el override de Page Visibility API (`visibilityState = 'visible'`, `hidden = false`, `hasFocus = true`).
- Añadido `startAutoClaimAll` entre `background.js` y `content.js`.

---

## Versión 4.2.0
- Auditoría exhaustiva de estabilidad (`onStartup`, `chrome.alarms`, mutex de arrays de storage, sanitización HTML contra XSS en `content.js`).
- Cierre automático de pestañas huérfanas (`openedTabIds`).
