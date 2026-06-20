# Rewards Auto Search & Claimer

![Icon](./extension/icons/icon-128.png)

Una poderosa extensión para navegador que automatiza la recolección diaria de puntos en Microsoft Rewards. A diferencia de otros scripts, esta extensión incorpora rutinas con simulación humana real y prevención de detecciones avanzadas para garantizar que los puntos sean sumados con éxito.

## ✨ Características Principales

* **Búsquedas Humanizadas**: No se limita a cambiar las URLs. La extensión **escribe físicamente letra por letra** en la barra de búsqueda de Bing con intervalos aleatorios, burlando las estrictas medidas anti-bots de Microsoft.
* **Auto-Reclamador de Tareas**: Lee y navega por el panel de Rewards (`rewards.bing.com`) extrayendo y completando tarjetas diarias de forma automática.
* **Penetración de Shadow DOM**: El algoritmo de raspado (scraping) penetra a través de múltiples capas de "Shadow DOMs" (Web Components) para poder leer y clicar en las tarjetas incluso si Microsoft cambia el diseño interno.
* **Aislamiento de Componentes**: Evita clics duplicados usando un algoritmo que filtra y aísla tarjetas individuales de sus agrupaciones lógicas.
* **Tiempos Aleatorios**: Retrasos variables configurables (cooldowns) entre cada búsqueda y tarea para emular un comportamiento natural.
* **Spoofing de User-Agent**: Simula el entorno de Microsoft Edge directamente para reclamar el bono exclusivo sin necesidad de usar el navegador Edge.
* **Panel de Control Intuitivo**: Interfaz moderna (estilo dark-mode) con estadísticas en tiempo real, historial de ganancias y programación de horarios.

## 🚀 Instalación

Al ser una extensión sin publicar en la Chrome Web Store, debes instalarla manualmente activando el "Modo de desarrollador".

1. Descarga o clona este repositorio en tu computadora.
2. Abre tu navegador (Google Chrome, Brave, Edge, etc.).
3. Ve a la página de extensiones:
   * Chrome / Brave: `chrome://extensions/`
   * Edge: `edge://extensions/`
4. Activa la opción de **"Modo de desarrollador"** (suele estar en la esquina superior derecha o en el menú izquierdo).
5. Haz clic en el botón **"Cargar descomprimida"** (Load unpacked).
6. Selecciona la carpeta `extension/` que se encuentra dentro de este proyecto.
7. ¡Listo! Verás el ícono de la extensión en tu navegador.

## ⚙️ Configuración

Haz clic en el ícono de la extensión para abrir el panel de control. Desde allí podrás:
* Iniciar secuencias de búsqueda en Escritorio y Edge.
* En la pestaña del **Engranaje (Ajustes)**, configurar:
   * La cantidad de búsquedas (60 puntos = 20 búsquedas, 90 puntos = 30 búsquedas).
   * Los tiempos de espera máximos y mínimos.
   * La fuente de palabras a buscar (o colocar tus propias consultas personalizadas).
* Programar una hora exacta del día para que la extensión comience a trabajar sola automáticamente.

## ⚠️ Descargo de Responsabilidad

Este software ha sido creado exclusivamente con fines educativos y de investigación sobre automatización de interfaces web. Microsoft puede modificar sus términos de servicio o sus algoritmos de detección en cualquier momento. El uso excesivo o irresponsable de esta herramienta podría resultar en la suspensión de tu cuenta de Microsoft Rewards. Úsalo bajo tu propio riesgo.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
