# Historial de Cambios — Rewards Auto Search & Claimer v4.2.0

Este documento detalla de forma quirúrgica las mejoras implementadas en la extensión.

---

## MEJORA 1: Búsquedas y Tareas en Segundo Plano (Tabs en Background)
- Modificación en `openRewardsDashboard()` de `background.js` para abrir el dashboard en segundo plano usando la propiedad `{ active: false }`.
- Esto previene que se interrumpa al usuario mientras navega en otras pestañas.

## MEJORA 2: Cierre Automático de Pestañas
- Introducción de `openedTabIds` en el objeto `DEFAULT_SESSION` para registrar de manera persistente las pestañas abiertas por la extensión.
- Implementación de las funciones auxiliares `trackOpenedTab()`, `removeTrackedTab()`, y `cleanupSessionTabs()` para registrar, remover de la cola, y cerrar todas las pestañas creadas por la extensión al finalizar, detenerse, o encontrar un error.
- Vinculación del evento `chrome.runtime.onSuspend` para garantizar la limpieza si la extensión se desactiva.
- Agregado en `popup.html` y `popup.js` un contador en tiempo real de "Tabs abiertos" dentro del panel de control de la sesión activa.

## MEJORA 3: Eliminación del Modo de Búsqueda Móvil
- Eliminación de todas las referencias de User Agent y debugger de emulación móvil en `background.js` (incluyendo `MOBILE_UA`, debugger attachments/detaches, lógica de secuencia en queue, y contadores de `stats`).
- Limpieza en la interfaz de usuario (`popup.html` y `popup.js`) eliminando el botón "Móvil" del launcher y la configuración de cantidad de búsquedas móviles.
- Remoción de la propiedad `mobileSearches` de los ajustes por defecto y lógica de guardado de configuración.

## MEJORA 4: Mejoras Visuales / UI-UX
- **Badge de progreso dinámico**: Se implementó `updateBadge(session)` en `background.js` para actualizar en tiempo real el badge del icono de la extensión con la cantidad de búsquedas restantes en color verde (`#10B981`) y mostrar un check `✓` por 2 segundos al completar.
- **Notificación nativa al completar**: Se programó una notificación nativa al finalizar toda la cola de búsqueda detallando búsquedas realizadas, puntos estimados obtenidos, y la duración exacta del ciclo, incluyendo un botón interactivo para "Ver Dashboard".
- **Tema de color según el modo activo**: Implementación de clases de color mediante CSS variables (`--mode-color`) en `popup.css` que cambian el borde de la ventana y el header dinámicamente (`mode-desktop` en azul `#3B82F6`, `mode-edge` en verde esmeralda `#10B981`, `mode-idle` por defecto).
- **Log de Actividad en tiempo real**: Creación de un panel colapsable "Registro de Actividad" en `popup.html`, `popup.css` y `popup.js`. Muestra las últimas 20 acciones de la automatización en formato monoespaciado con scroll automático hacia el último evento y preserva el estado expandido/colapsado entre sesiones.
