# CLAUDE.md — CLEAR (NASA Space Apps 2026)

Leé este archivo entero antes de tocar código. Es la fuente de verdad del proyecto.

## 1. Contexto
- **Evento:** NASA Space Apps Challenge 2026. Nuestro evento local **empezó el viernes 13 nov 2026**. El envío cierra el **domingo 15 nov a las 23:59, hora de Asunción (UTC-3)**; confirmarlo con el líder local (Local Lead).
- **Desafío:** "Dancing with the SARs": app interactiva que usa datos de radar de **NISAR** para seguir y visualizar un tipo de cambio en la superficie terrestre.
- **Producto:** **CLEAR — Chaco L-band Early Alerts from Radar.** En español: *alertas de desmonte en el Chaco con radar de banda L*.
  - Muestra **dónde y cuándo se desmonta el monte chaqueño**, con una imagen NISAR cada 12 días entre noviembre de 2025 y octubre de 2026 (26 fechas).
  - La señal es la **caída sostenida del canal HV**: al talar el bosque se pierde la dispersión de volumen de las copas.
  - Se presenta como un **recorrido guiado (story map)** con un mapa interactivo en el centro.
- **Público:** jueces de Space Apps, docentes, periodistas, técnicos ambientales y público general. Muchos lo van a ver en el celular.
- **Idioma:**
  - Con el equipo: **español**.
  - En inglés: README, formulario de envío, demo, código y comentarios (los jueces leen el repo).
  - La interfaz: bilingüe ES/EN.
- **Origen del repo:** arranca del esqueleto de Field Shift (web, i18n, deploy). El código de rotaciones y soja **no se usa**. No lo borres sin preguntar.

## 2. Lo que el desafío exige (checklist de Relevancia)
Cada feature tiene que poder ubicarse en uno de estos puntos. Si no encaja, preguntá antes de hacerla.
- [ ] App **interactiva** con datos **NISAR** que siga un cambio de superficie: el desmonte.
- [ ] Área de estudio elegida y justificada: **Chaco central, al norte de Mariscal Estigarribia (Boquerón)**.
- [ ] Datos complementarios ópticos o SIG para dar contexto: HLS, OPERA DIST-ALERT y MapBiomas.
- [ ] **Hipótesis de los motores físicos:** pérdida de dispersión de volumen, cordones de troncos, quema, humedad del suelo.
- [ ] **Qué polarización muestra el cambio:** HH vs HV vs HV/HH, explicado en la app.
- [ ] Opcional que suma: comparar con otra frecuencia (Sentinel-1, banda C), motores humanos (ganadería) y contexto local.
- [ ] Aplicaciones futuras de NISAR: alertas cada 12 días, trazabilidad, humedales.

**Capítulos del recorrido** (en este orden de prioridad):
1. **"El monte que se va"** (obligatorio): desmonte en el Chaco central.
2. **"Agua bajo el monte"** (solo si el 1 está publicado): inundación de julio de 2026 en Ñeembucú.
3. **"Lo que no cambia"** (opcional): Bosque Atlántico en la Reserva Mbaracayú, como control.

## 3. Reglas de Space Apps que el repo tiene que respetar
- **Originalidad:** todo el código del producto se escribe durante el evento, desde el inicio de nuestro evento local (viernes 13 nov). Se pueden usar dependencias open source, pero se citan.
  - **No copies código** de otros repos de "Dancing with the SARs": hay varios públicos.
  - Los tutoriales oficiales de ASF (NISAR Cookbook) se pueden usar como referencia, y se citan.
- **`docs/REFERENCES.md`:** toda fuente de datos, librería, paper, imagen o herramienta que se use. Si agregás algo, agregás la entrada.
- **`docs/AI_USAGE.md`:** registrar el uso de IA (incluido vos, Claude Code), indicando qué archivo o feature y cómo se usó. Al crear o reescribir un archivo de forma sustancial, poné en la cabecera: `# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md`.
- **Prohibido:**
  - logos, banderas o identificadores de misión de NASA, ni modificados;
  - "NASA" en nombres de dominio o marcas;
  - publicidad comercial (tampoco de la empresa de hosting: solo se le agradece en REFERENCES);
  - datos personales y nombres de propietarios o empresas;
  - imágenes generadas por IA sin marca de agua visible.
- **Crédito de los datos:** "Data courtesy of NASA/JPL", más la cita de cada colección NISAR usada.
- **Licencia:** `LICENSE` Apache-2.0 en la raíz. Las dependencias tienen que tener licencias compatibles.
- **Demo:** video de hasta 30 s (con subtítulos en inglés) o hasta 7 diapositivas. Si se pasa del límite, queda fuera del juicio global.

## 4. Reglas éticas (no negociables)
- **Mostramos cambios de cobertura, no ilegalidad.** Nunca escribir "ilegal" ni acusar a nadie. Juzgar la legalidad exige catastro y permisos que no tenemos.
- **No mostrar ni señalar el territorio Ayoreo Totobiegosode (PNCAT).** Tiene medidas cautelares de la CIDH para proteger a grupos en aislamiento voluntario. La zona de estudio queda fuera. No agregar capas de comunidades indígenas.
- **Sin catastro ni nombres de propietarios.**
- **Lenguaje:**
  - Siempre "desmonte estimado por radar", con la fecha como "±12 días".
  - Para la validación: "en X de N casos coincide con alertas ópticas".
  - Nunca presentar resultados como verdad de campo.

## 5. Arquitectura: sitio estático en hosting compartido
```
[pipeline/ Python, en laptops o Colab]  →  web/public/data/*  →  [web/ Vite build]  →  dist/  →  SSH (tar)  →  hosting compartido (HTTPS)
```
- **No hay backend.** En el servidor no corre Python, Node ni base de datos. No agregues código de servidor.
- Todo lo pesado se **precalcula** en `pipeline/` y se exporta como WebP, GeoJSON y JSON: descarga NISAR, recorte, dB, detección y validación.
- El navegador solo dibuja: mapa, deslizador, línea de tiempo, gráficos y textos.
- **La demo nunca depende de una llamada en vivo.** Todo lo que se muestra está en `web/public/data/`.
- Hosting: cPanel compartido, sin `rsync`. Producción en `https://clear.rohayhu.org`, staging en `https://staging.rohayhu.org` (los dos con SSL de Let's Encrypt). `.htaccess` para compresión gzip, caché y tipos MIME. Espejo de respaldo en GitHub Pages.
- Deploy: `deploy/deploy.sh <build_dir> <docroot>` sube el build por SSH con `tar`, lo deja en `~/releases/` (guarda los últimos 3) y lo copia al docroot sin tocar `.well-known`, `.user.ini` ni `php.ini`. Si `web/` todavía no existe, sube `deploy/placeholder/`.

## 6. Estructura del repo (convención; crear así)
```
pipeline/
  requirements.txt
  config.yaml          # AOIs, órbita/frame, fechas esperadas, umbrales
  run.py               # --stage fetch|process|validate|export|all
  fetch/               # nisar.py, dist_alert.py, hls.py, mapbiomas.py, power.py
  process/             # calibrate.py (dB, speckle), normalize.py, detect.py, polygons.py, water.py (cap. 2)
  validate/            # dist_compare.py
  export/              # rgb_png.py, to_json.py
  tests/
data/
  raw/                 # NO se commitea (.gitignore)
  interim/             # GeoTIFF recortados; NO se commitean si pesan más de 50 MB
web/
  src/                 # TypeScript: map/, compare/, timeline/, charts/, story/, i18n/{es,en}.json
  public/data/         # salidas del pipeline (sí se commitean, son chicas)
  .htaccess
docs/
  REFERENCES.md  AI_USAGE.md  DATA_CONTRACT.md  METHODS.md
deploy/deploy.sh               # subida por SSH (tar), usada por el workflow
.github/workflows/deploy.yml   # rama staging → staging.rohayhu.org; tag v* → clear.rohayhu.org
```

## 7. Comandos (mantenerlos así; actualizar esta sección si cambian)
```bash
# Pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt
python -m pipeline.run --config pipeline/config.yaml --stage all
pytest pipeline/tests

# Web
cd web && npm install
npm run fixtures     # datos SINTÉTICOS para desarrollo (web/fixtures/, no se commitean)
npm run dev          # local; si web/public/data/ está vacío usa los sintéticos y lo avisa
npm run build        # genera web/dist
npm run check        # typecheck + chequeo de claves i18n + build + tamaño del bundle
```
- **Dependencias del pipeline:** `asf_search`, `earthaccess`, `fsspec`, `aiohttp`, `h5py`, `h5netcdf`, `xarray`, `rioxarray`, `rasterio`, `numpy`, `scipy`, `shapely`, `geopandas`, `pyproj`, `pillow`, `pyyaml`, `requests`, `pytest`, `ruff`.
- **Secretos:**
  - Token de Earthdata Login en `.env` (`EARTHDATA_TOKEN=...`), que está en `.gitignore`.
  - Credenciales de deploy (clave SSH, host, puerto, usuario, known_hosts) **solo** en GitHub Actions Secrets: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`.
  - El repo es público: nunca commitees credenciales.

## 8. Datos

### 8.1 NISAR (verificado en ASF Vertex el 14 nov 2026)
| Dato | Valor |
|---|---|
| Producto | **L2 GCOV** (covarianza geocodificada, γ⁰ lineal, con corrección radiométrica de terreno) |
| Colecciones | `NISAR_L2_GCOV_PROVISIONAL_V1` (CRID P05023) y `NISAR_L2_GCOV_V1` (VALIDATED, CRID P05036) |
| Órbita principal | **track 161, ascendente, frame 167**; cobertura de frame "Full" |
| Modo | 20+5 MHz, `DHDH`: HH y HV en las dos bandas. Usar **frequencyA** (20 m) |
| Tamaño | ~1,9 GB por archivo HDF5. **Nunca bajarlo entero**: leer solo el recorte |
| Hueco del instrumento | sin datos entre 2026-07-27 y 2026-08-10 |
| Datasets HDF5 | `/science/LSAR/GCOV/grids/frequencyA/HHHH`, `.../HVHV`, `.../xCoordinates`, `.../yCoordinates`, `.../projection` (código EPSG) |

**Fechas disponibles (track 161, frame 167).** Además de la tabla, hay 15 fechas anteriores, todas PROVISIONAL (CRID P05023, DHDH): 2025-11-21, 12-03, 12-15, 12-27, 2026-01-08, 01-20, 02-01, 02-13, 02-25, 03-09, 03-21, 04-02, 04-26 (falta 04-14), 05-08 y 05-20. Se agregaron el 14/11 porque en la AOI el desmonte ocurrió antes de junio: con la serie desde junio, la línea de base ya veía el monte caído.
| Fecha | Ciclo | Colección | Nota |
|---|---|---|---|
| 2026-06-01 | 021 | PROVISIONAL | |
| 2026-06-13 | 022 | PROVISIONAL | |
| 2026-06-25 | 023 | PROVISIONAL | hay `_001` y `_002`: usar **`_002`** |
| 2026-07-07 | 024 | PROVISIONAL | |
| 2026-07-19 | 025 | PROVISIONAL | |
| 2026-08-24 | 028 | PROVISIONAL | faltan el 31/07 (hueco) y el 12/08 |
| 2026-09-05 | 029 | PROVISIONAL | hay `_001` y `_002`: usar **`_002`** |
| 2026-09-17 | 030 | PROVISIONAL | |
| 2026-09-29 | 031 | PROVISIONAL | |
| 2026-10-11 | 032 | PROVISIONAL | |
| 2026-10-23 | 033 | VALIDATED | CRID distinto: revisar que no salte sola |

El 04/11 solo existe el frame 166. Nombre de ejemplo: `NISAR_L2_PR_GCOV_032_161_A_167_2005_DHDH_A_20261011T095756_20261011T095834_P05023_N_F_J_001`.

**Reglas de acceso:**
- Buscar con `asf_search`:
  - parámetros: `dataset=["NISAR"]`, `processingLevel=["GCOV"]`, `productionConfiguration=["PR"]`, `relativeOrbit=[161]`, `flightDirection="ASCENDING"`;
  - filtrar `"_161_A_167_"` en `fileID`;
  - de-duplicar: por fecha, quedarse con el CRID más nuevo y, a igual CRID, con el sufijo de versión más alto.
- **Tomar las URLs de los resultados de la búsqueda; no armarlas a mano.**
- Lectura parcial por HTTPS:
  - `fsspec.filesystem("http", headers={"Authorization": f"Bearer {token}"})`, abrir con `h5py` o `xarray` (motor `h5netcdf`);
  - calcular los índices del recorte desde `xCoordinates` / `yCoordinates` en la proyección del archivo (`pyproj`);
  - leer solo esa ventana. Todo el cálculo va **dentro** del `with` que abre el archivo.
- Guardar cada recorte apenas llega en `data/interim/` (GeoTIFF, γ⁰ lineal, HH y HV). Si ya existe, no volver a bajarlo.
- Píxeles con 0 o NaN → NaN.

### 8.2 Áreas de interés (lon_min, lat_min, lon_max, lat_max; EPSG:4326)
| AOI | bbox | Uso |
|---|---|---|
| `chaco-central-norte` | `[-60.78, -21.73, -60.18, -21.33]` | Capítulo 1. Entra entera en el frame 167 (~60 × 45 km). Movida el 14/11 (ver abajo) |
| `neembucu` | `[-57.9, -27.3, -57.3, -26.6]` | Capítulo 2. Hay 6 productos GCOV entre el 1 y el 27/07 y 6 entre el 10 y el 31/08; la órbita no está verificada: buscarla |
| `mbaracayu` | `[-55.7, -24.3, -55.2, -23.9]` | Capítulo 3. 60 productos entre jun y nov; órbita sin elegir |

**Revisado el 14/11 con OPERA DIST-ALERT y NISAR.** El bbox original `[-61.0, -21.95, -60.4, -21.55]` casi no tuvo desmonte en jun–oct (22 ha en DIST-ALERT, ~86 ha en NISAR). La actividad estaba al norte y al este, dentro del mismo frame 167, así que no hizo falta pasar al frame 166. Se eligió la caja actual (unas 320 ha de pérdida confirmada ≥ 50 % en DIST-ALERT) y no las de más al norte, por cercanía al PNCAT. En el sur de Boquerón (frame 166) hubo más desmonte, pero en jun–jul, antes de la línea de base del radar: no se puede detectar.

### 8.3 Datos complementarios
| Fuente | Acceso | Uso | Tipo |
|---|---|---|---|
| OPERA DIST-ALERT-HLS V1 (`OPERA_L3_DIST-ALERT-HLS_V1`, DOI 10.5067/SNWG/OPERA_L3_DIST-ALERT-HLS_V1.001) | `earthaccess` (LP DAAC), COG por capa | **Validación**: alertas ópticas de pérdida de vegetación con fecha, 30 m. Verificar los nombres de capa en la Product Specification antes de usarlas | satellite |
| HLS (Landsat 8/9 + Sentinel-2) | `earthaccess` / AppEEARS | Imagen en color real para comparar y revisar a ojo. **Cuenta como dato de socio (ESA)** | satellite |
| MapBiomas Paraguay, Colección 2 (1985–2023) | Earth Engine o descarga | Máscara de bosque 2023 | modeled |
| NASA POWER (`PRECTOTCORR` diaria) | API REST | Barras de lluvia en el gráfico: explican subidas de HH por suelo húmedo | modeled |
| Sentinel-1 GRD (ESA, banda C) | Earth Engine / Vertex | Opcional: comparación de frecuencias | satellite |
| Animación Landsat 1985–2025 (NASA SVS 15026) | descarga directa | Portada del recorrido y video. Crédito: NASA GSFC | satellite |

**Procedencia obligatoria:** cada valor o capa que se muestra lleva su tipo (`satellite`, `modeled` o `measured`), su fuente y, para NISAR, su madurez (PROVISIONAL o VALIDATED). La UI lo muestra.

## 9. Método (detalle en `docs/METHODS.md`)
1. **Recortar** HH y HV de cada fecha sobre la AOI (§8.1).
2. **Pasar a dB:** `10·log10(γ⁰)`.
3. **Bajar el moteado:** promedio en ventana de 5 × 5 píxeles (100 m), en lineal, antes del dB.
4. **Máscara:** analizar solo lo que es bosque en MapBiomas 2023. *Provisorio (14/11): ESA WorldCover 2021 (tree cover), porque MapBiomas no tiene descarga directa simple; `pipeline/fetch/worldcover.py` es el único punto a cambiar.* Como esa máscara es de 2021, además el píxel tiene que verse como bosque para el radar en la línea de base (HV normalizado ≥ `min_baseline_db`).
5. **Normalizar:** restar por fecha la mediana de HV de todos los píxeles de bosque de la AOI. Corrige la lluvia y la diferencia PROVISIONAL/VALIDATED, porque en 5 meses casi todo el bosque no cambia. Opcional: un bloque de bosque estable dentro del frame, fuera de la AOI y del PNCAT.
6. **Detectar:**
   - línea de base = mediana de las 3 primeras fechas (nov–dic 2025);
   - solo píxeles que en la línea de base parecen bosque (HV normalizado ≥ `min_baseline_db`, −3 dB);
   - desmonte cuando ΔHV ≤ `threshold_db` en esa fecha y en `persistence` de 3 fechas (2 de 3, tolera una fecha húmeda);
   - fecha de detección = la primera de esas fechas.
7. **Polígonos:** unir píxeles vecinos (sin separar por fecha) y descartar los menores a `min_area_ha`. Propiedades: fecha (mediana de los píxeles), área (ha) y caída media (dB).
8. **Validar contra DIST-ALERT** en la misma ventana de fechas (±24 días). Dos números:
   - **acuerdo** = % del área de nuestros polígonos con alerta óptica;
   - **cobertura** = % del área de alertas ópticas (en bosque, ≥ 5 ha) que detectamos.

   Ajustar el umbral **una sola vez** con esos números y documentarlo.
9. **RGB por fecha:** R = HH, G = HV, B = HH/HV. Estirar con percentiles fijos para **todas** las fechas (si no, la animación parpadea).
10. **Exportar** según el contrato (§10).

**Capítulo 2 (agua).** Mismo recorte y dB, con una fecha antes y otra después del hueco. Agua abierta = HH muy bajo; vegetación inundada = HH muy alto con HH/HV alto. Los umbrales se calibran a ojo con HLS y se marcan como estimados.

**Parámetros por defecto** (`config.yaml`; cada uno con comentario de origen):
```yaml
detection:
  speckle_window: 5
  baseline_dates: 3
  threshold_db: -3.0     # punto de partida; el ejemplo de ASF usa -2 dB
  persistence: 2
  min_area_ha: 5
  normalize: forest_median
```

**Chequeos de sanidad** (heurísticos; avisar y frenar si se violan):
- La mediana de HV del bosque cambia más de 2 dB entre dos fechas → revisar versión, calibración o lluvia antes de seguir.
- Más del 5 % del bosque marcado como desmonte en una sola fecha → falso positivo masivo.
- Polígonos sobre agua o sobre píxeles fuera de la máscara → bug de alineación.

**Fuera de alcance este fin de semana:** interferometría (GUNW, coherencia), descomposición polarimétrica y aprendizaje automático. Van como "siguientes pasos".

## 10. Contrato de datos pipeline → web
No cambiarlo sin acordar; si cambia, subir `schema_version`. Coordenadas en EPSG:4326. Las imágenes RGB son **WebP** (calidad 80, ~250 KB cada una; se cambió de PNG el 14/11 porque pesaban 2,1 MB) y se reproyectan a EPSG:4326 antes de exportarse, para alinearlas como `image` source en MapLibre.

`web/public/data/index.json`
```json
{ "schema_version": 1, "generated_at": "2026-11-14T18:00:00-03:00",
  "aoi": { "id": "chaco-central-norte", "bbox": [-60.78, -21.73, -60.18, -21.33] },
  "nisar": { "track": 161, "direction": "ASCENDING", "frame": 167, "mode": "20+5 DHDH" },
  "scenes": [ { "date": "2026-06-01", "id": "NISAR_L2_PR_GCOV_021_...", "maturity": "PROVISIONAL", "crid": "P05023",
                "rgb": "rgb/2026-06-01.webp" } ],
  "image_coordinates": [[-60.78, -21.33], [-60.18, -21.33], [-60.18, -21.73], [-60.78, -21.73]],
  "detection": { "threshold_db": -3.0, "persistence": 2, "min_area_ha": 5, "n_polygons": 0, "area_ha_total": 0 },
  "validation": { "agreement_pct": null, "coverage_pct": null, "reference": "OPERA DIST-ALERT-HLS V1" },
  "provenance": [ { "layer": "rgb", "type": "satellite", "source": "NISAR L2 GCOV (NASA/JPL, ASF DAAC)" } ] }
```
`web/public/data/polygons.geojson`: `FeatureCollection`. Propiedades por feature: `id`, `first_date` (ISO), `area_ha`, `mean_drop_db`, `dist_confirmed` (true, false o null) y `status: "estimado"`.

`web/public/data/grid_500m.json`: series para el gráfico al tocar el mapa (se carga al primer clic).
```json
{ "dates": ["2026-06-01", "..."], "origin": [-60.78, -21.33], "cell_deg": [0.0048, -0.0045], "nx": 125, "ny": 89,
  "hv_db_x10": [[-118, -120, null, "..."]], "hh_db_x10": [["..."]] }
```
Una fila por fecha, alineada con `dates`; las celdas van en orden fila por fila; los valores son enteros dB×10 o `null`.

`web/public/data/rain.json`: `{ "dates": [...], "mm": [...], "source": "NASA POWER PRECTOTCORR", "point": [-60.7, -21.75] }`

## 11. Web
- **Stack:** Vite + TypeScript estricto + MapLibre GL JS. Gráficos con uPlot o Chart.js. Sin frameworks pesados salvo que el equipo lo decida.
- **Pantallas del recorrido:**
  1. **Portada:** animación Landsat + una frase.
  2. **Cómo ve el radar:** esquema simple bosque vs. pastura y un botón para alternar HH y HV.
  3. **El mapa:**
     - RGB por fecha;
     - **deslizador antes/después** (dos fechas a elegir);
     - **línea de tiempo con play** en pasos de 12 días;
     - polígonos coloreados por fecha de detección;
     - al tocar: gráfico de HH y HV en el tiempo + barras de lluvia + si hubo alerta óptica.
  4. **¿Le creemos al radar?:** los dos números de validación y 3 casos lado a lado (radar vs. HLS).
  5. **Agua bajo el monte** (capítulo 2, si llega).
  6. **Qué sigue:** usos futuros de NISAR, límites del método y créditos.
- **Requisitos:**
  - bundle de menos de 500 KB gzip (sin contar datos ni tiles);
  - funciona en celular de 360 px de ancho;
  - `grid_500m.json` y las imágenes RGB se cargan cuando hacen falta (lazy);
  - sin textos escritos directamente en el código: todo va en `i18n/es.json` y `i18n/en.json`;
  - cada capa muestra fuente y madurez.

## 12. Convenciones de código
- **Python 3.11:**
  - type hints y funciones puras para los cálculos (dB, filtro, normalización, detección, métricas);
  - `ruff format` + `ruff check`;
  - `pytest` para todo cálculo que termine en la UI, con rasters sintéticos chicos (no hace falta bajar datos para testear).
- **Unidades:** dB, ha, m, mm. Fechas en ISO (`2026-06-01`).
- **Commits:** chicos, uno por feature, en inglés (`feat:`, `fix:`, `data:`, `docs:`). Nunca commitear `data/raw/`, `.env` ni archivos de más de 50 MB.

## 13. Cómo tenés que trabajar
1. **Prioridad absoluta:** recorrido de punta a punta del capítulo 1 (recorte → RGB → mapa con deslizador → detección → polígonos → gráfico) antes que cualquier extra.
2. Antes de implementar, decí en 2–3 líneas qué vas a hacer y qué archivos tocás.
3. **Preguntá antes de:**
   - cambiar el contrato de datos o la AOI;
   - agregar una dependencia que pese más de 100 KB o que necesite servidor;
   - tocar el workflow de deploy a producción;
   - borrar datos o código de Field Shift;
   - reescribir un módulo de otra persona.
4. Después de cada cambio: corré los tests o `npm run check` y reportá el resultado real. Si algo falla, decilo; no lo escondas.
5. Actualizá `docs/REFERENCES.md`, `docs/AI_USAGE.md` y `docs/METHODS.md` en el mismo commit que la feature.
6. Si ASF falla o es lento: usá los recortes ya guardados en `data/interim/` y seguí avanzando. Nunca reintentes en bucle una descarga de 2 GB.
7. Después del cierre (15/11, 23:59), **producción queda congelada** en el tag de entrega. Cualquier cambio va a `staging`.

## 14. Hitos (hora de Asunción)
| Cuándo | Hito |
|---|---|
| Sáb 14, 12:00 | Desafío cambiado en la página del equipo. Repo con LICENSE y docs/. Búsqueda NISAR funcionando y primer recorte HV guardado |
| Sáb 14, 18:00 | Punta a punta con 2 fechas: recorte → RGB → mapa con deslizador en local |
| Sáb 14, 23:00 | **Producto mínimo en staging:** 11 fechas, detección, polígonos, línea de tiempo y gráfico |
| Dom 15, 12:00 | Validación con DIST-ALERT cerrada, umbral final, textos ES/EN |
| Dom 15, 16:00 | Capítulo 2 (Ñeembucú), solo si el mínimo ya está publicado |
| Dom 15, 18:00 | Freeze de producción (tag `v1.0.0`) |
| Dom 15, 21:00 | Envío completo: video de 30 s, formulario en inglés, REFERENCES y AI_USAGE |
| Dom 15, 23:59 | Cierre del envío (confirmar con el Local Lead) |

## 15. Referencias rápidas
- NISAR, disponibilidad de datos: https://nisar-docs.asf.alaska.edu/availability-overview/
- NISAR GCOV, especificación: https://nisar-docs.asf.alaska.edu/gcov/
- NISAR Cookbook, buscar y leer GCOV por streaming: https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/search-stream-nisar-gcov-asf-search
- NISAR Cookbook, detección de cambios con GCOV: https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/nisar-gcov-sarchangedetectionmethods
- ASF Vertex: https://search.asf.alaska.edu/
- Cita de la colección PROVISIONAL: https://www.earthdata.nasa.gov/data/catalog/asf-nisar-l2-gcov-provisional-v1-1
- asf_search: https://docs.asf.alaska.edu/asf_search/basics/
- earthaccess: https://earthaccess.readthedocs.io/
- OPERA DIST: https://www.earthdata.nasa.gov/data/projects/nsite/solutions/opera-near-global-surface-dist-product-suite
- MapBiomas Paraguay: https://paraguay.mapbiomas.org/
- NASA POWER Daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA SVS, desmonte en el Chaco 1985–2025: https://svs.gsfc.nasa.gov/15026
- Plan del equipo (documento compartido): https://claude.ai/artifact/EeuRaC9fYzeef4kdHWyNug
- Guía de envío Space Apps: https://www.spaceappschallenge.org/resources/project-submission-guide/
