# Rewards Auto Search & Claimer v3.0

![Icon](./extension/icons/icon-128.png)

Una poderosa extensión para navegador que automatiza la recolección **completa** de puntos en Microsoft Rewards. Incluye sistema modular de workers, simulación humana avanzada, soporte para búsquedas móviles, y notificaciones por Webhooks.

## ✨ Características v3.0

### 🔍 Búsquedas Automatizadas
* **Escritura y lectura humanizada**: Escribe físicamente letra por letra en la barra de búsqueda de Bing con intervalos aleatorios, hace scroll suave, y pausas aleatorias de lectura.
* **Spoofing de User-Agent**: Simula Microsoft Edge y dispositivos móviles de forma nativa.
* **Secuencia Completa**: Automatiza búsquedas de **Escritorio -> Móvil -> Edge** secuencialmente.

### 🔔 Notificaciones y Resiliencia
* **Webhooks (Discord/Telegram)**: Recibe notificaciones en tu servidor cuando los ciclos de búsqueda inicien, finalicen o fallen.
* **Jitter de Horarios**: Añade tiempos aleatorios (±30 mins) a la programación diaria para evadir detección de bots.
* **Auto-recovery**: Reintenta automáticamente (con retroceso exponencial) si Microsoft Rewards falla la carga de datos.

### 🎯 Workers Modulares de Tareas
| Worker | Descripción | Puntos Potenciales |
|---|---|---|
| `daily-set.js` | Completa el Daily Set (quizzes, encuestas, "This or That") | ~15+ pts/día |
| `more-activities.js` | Completa actividades adicionales del dashboard | Variable |
| `punch-cards.js` | Completa Punch Cards mensuales | ~50 pts/mes |
| `streak-bonus.js` | Reclama bonificaciones de racha | 45-150 pts |

### 🧠 Simulación Humana Avanzada
* **Clicks realistas**: Secuencia completa `mouseover → mousedown → mouseup → click` con coordenadas y timing variable
* **Escritura natural**: Cada tecla con 40-120ms de variación
* **Scroll suave**: Velocidad variable para simular lectura
* **Delays de "lectura"**: 2-10 segundos antes de responder quizzes
* **Reintentos con backoff**: Recuperación automática ante errores con backoff exponencial

### 🛡️ Penetración de Shadow DOM
* Algoritmo recursivo que penetra múltiples capas de Web Components (`mee-card`, etc.)
* Selectores múltiples con fallbacks para resistir cambios de UI de Microsoft
* Filtrado inteligente de tarjetas (aísla individuales de contenedores padre)

### 🔔 Notificaciones
* Notificación nativa al completar tareas
* Recordatorio a las 10 PM si hay tareas pendientes

### 📊 Panel de Control
* Interfaz dark-mode con estadísticas en tiempo real
* Panel flotante en rewards.bing.com con desglose por categoría
* Historial de sesiones y programación de horarios

## 📁 Arquitectura del Proyecto

```
extension/
├── manifest.json          — Configuración y permisos
├── background.js          — Orquestador principal, búsquedas, scheduling
├── content.js             — Panel flotante en Rewards + auto-solver
├── utils/
│   ├── dom-utils.js       — Penetración Shadow DOM + selectores robustos
│   ├── human-sim.js       — Simulación humana (clicks, typing, scroll)
│   └── retry.js           — Reintentos con backoff exponencial
├── workers/
│   ├── daily-set.js       — Worker para Daily Set
│   ├── more-activities.js — Worker para More Activities
│   ├── punch-cards.js     — Worker para Punch Cards
│   └── streak-bonus.js    — Worker para bonos de racha
├── popup.html/css/js      — Panel de control de la extensión
└── words.js               — Banco de palabras para búsquedas
```

## 🚀 Instalación

1. Descarga o clona este repositorio.
2. Abre tu navegador (Chrome, Brave, Edge, etc.).
3. Ve a la página de extensiones:
   * Chrome / Brave: `chrome://extensions/`
   * Edge: `edge://extensions/`
4. Activa **"Modo de desarrollador"**.
5. Clic en **"Cargar descomprimida"** (Load unpacked).
6. Selecciona la carpeta `extension/`.
7. ¡Listo! 🎉

## ⚙️ Uso

### Búsquedas Automáticas
1. Haz clic en el ícono de la extensión.
2. Selecciona "Escritorio", "Edge" o "🚀 Ejecutar Todos".

### Tareas Diarias
1. Haz clic en **"🎁 Abrir & Reclamar Tareas"** en el panel.
2. Se abrirá `rewards.bing.com` con un panel flotante que escanea automáticamente.
3. Haz clic en **"🚀 Reclamar Todo"** en el panel flotante.

### Programación Automática
1. Ve a la pestaña **"Horario"** en la extensión.
2. Activa la programación y selecciona hora y días.
3. La extensión ejecutará las tareas + búsquedas automáticamente.

## ⚠️ Descargo de Responsabilidad

Este software ha sido creado exclusivamente con fines educativos y de investigación sobre automatización de interfaces web. Microsoft puede modificar sus términos de servicio o sus algoritmos de detección en cualquier momento. Úsalo bajo tu propio riesgo.

## 📄 Licencia

MIT License. Ver [LICENSE](LICENSE).
