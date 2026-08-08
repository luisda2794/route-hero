# Route Hero

Vamos a construir un proyecto nuevo llamado **RUTAFACIL** — una web app/PWA para repartidores, 100% client-side (sin backend), enfocada exclusivamente en la experiencia del repartidor/almacén: enrutamiento por zonas con clustering geográfico + escaneo de paquetes.

## Flujo completo

### Paso 1 — Configuración del día
Pantalla inicial con:
1. Dropzone para subir el ePOD del día (Excel de Cainiao, formato "EPOD_TASK_LIST_V2..."). Usa SheetJS para parsear client-side. Crea un resolver de columnas bilingüe (español/inglés) tipo `resolveColumns()` que acepte, como mínimo: "Número de Waybill"/"Waybill Number", "Estado de la Tarea"/"Task Status", "Código postal"/"Zip Code", "Dirección detallada"/"Detailed address", "Receptor a latitud"/"Receiver to Latitude", "Receptor a longitud"/"Receiver to Longitude", "Fecha de la tarea"/"Task Date".
2. Input numérico: "¿Cuántos conductores tienes hoy?"
3. Input numérico: "¿Cuántos paquetes aproximados quieres por conductor?" (orientativo — sirve para sugerir cuántas zonas crear: N zonas ≈ Total paquetes del día ÷ paquetes deseados por conductor).
4. Botón "Calcular zonas".

### Paso 2 — Clustering geográfico (el "IA" de agrupamiento)
Al calcular:
1. Filtra solo paquetes en reparto hoy: Estado = "Driver_received"/"Driver_received_incidencias" (o equivalente inglés) en la fecha más reciente del archivo.
2. Extrae waybill, latitud, longitud, CP, dirección de cada uno.
3. Corre K-means (impleméntalo directo en TypeScript, es simple — o usa una librería liviana tipo `ml-kmeans`) sobre las coordenadas, con K = número de conductores ingresado.
4. No hace falta balance estricto de cantidad — el objetivo es agrupar por cercanía real. Muestra el conteo por zona como referencia para que el usuario pueda ajustar el número de conductores y recalcular si alguna zona quedó muy desproporcionada.
5. Asigna cada zona a "Conductor 1", "Conductor 2", etc. (renombrable en el paso siguiente).
6. Si algún paquete no tiene coordenadas lat/lon, sepáralo en una lista aparte "Sin ubicación — asignar manualmente" sin que rompa el clustering del resto.

### Paso 3 — Vista previa de zonas
Después de calcular:
- Mapa real con Leaflet + tiles de OpenStreetMap (gratis, sin API key) mostrando cada paquete como punto, coloreado por zona/conductor.
- Lista de zonas: número de conductor (con campo editable para poner el nombre real), cantidad de paquetes asignados.
- Botón "Recalcular" (vuelve al paso 2 con otro número de conductores si se desea ajustar).
- Botón "Confirmar y guardar" — guarda el mapeo waybill→zona/conductor en localStorage (para que sobreviva si se cierra el navegador durante la jornada).

### Paso 4 — Pantalla de escaneo (la pantalla principal, mobile-first)
Pensada para usarse de pie, en almacén, con el celular en la mano:
- Texto GRANDE, alto contraste, legible a distancia de brazo y con poca luz.
- Usa la cámara del dispositivo para leer código de barras 1D (librería html5-qrcode o @zxing/browser — prioriza buena lectura de códigos de barras de waybill, no solo QR).
- Campo alterno para escribir el número manualmente si falla el escaneo.
- Al escanear un waybill que SÍ está en el mapeo: pantalla con fondo verde mostrando en letra enorme el nombre/número del Conductor asignado, y debajo CP + dirección de referencia.
- Si NO está en el mapeo: pantalla con fondo rojo, "No encontrado — verificar".
- Sonido/vibración de confirmación al escanear exitosamente (si el navegador lo permite).
- Contador en vivo visible: cuántos paquetes van escaneados por zona/conductor en la sesión actual, con botón "Reiniciar sesión" para el día siguiente.

## Diseño

Mobile-first en todo el proyecto (esto es una PWA para usarse desde el celular, no desde escritorio). Paleta simple y de alto contraste — prioriza legibilidad sobre estética recargada. Configura el manifest de PWA para que se pueda "Añadir a pantalla de inicio" desde el navegador móvil.

## Técnico

- Todo el procesamiento en el navegador, sin backend ni base de datos.
- El estado del día (zonas calculadas + mapeo waybill→conductor) vive en localStorage.

Empieza por el Paso 1 (subida de ePOD + inputs de configuración) y el resolver de columnas — cuando tengas eso, avísame antes de seguir con el clustering para que revisemos juntos.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/849bffbb-7d6a-4da7-a946-2e598d7e00d6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
