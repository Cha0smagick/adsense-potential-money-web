# Calibración pública (2026-11-24)

## Qué se hizo

1. **Reddit**: 6.000 posts de r/Adsense descargados del archivo público Arctic Shift (sin login).
   344 sitios únicos con URL y resultado declarado: 306 rechazos y 38 aprobaciones.
2. **Tranco**: 1.800 dominios escaneados; 115 sitios que hoy sirven AdSense.
3. **Medición**: auditor ligero (portada, robots, sitemap, hasta 4 sondas legales) sobre 344 sitios.
4. **Limpieza**: se descartan los rechazos que hoy ya muestran anuncios (etiqueta muerta) y los
   sitios sin contenido legible.

## Muestra final

| Métrica | Valor |
|---|---:|
| Aprobados (Tranco con AdSense + Reddit autodeclarado) | **280** |
| Rechazos válidos (siguen sin AdSense y tienen contenido) | **44** |
| Rechazos descartados por ya mostrar anuncios | **171** |
| Posts de Reddit processados | 6.000 |
| AUC | **0,405** (IC99 0,272–0,542) |
| Mediana aprobados | 84,0 |
| Mediana rechazados | **91,7** |
| 95 % de aprobados puntúa ≥ | **15** (n=280, confianza 100 %) |
| Muestra por clase para IC99 ±0,05 en AUC | **442** (884 total) |

## Bandas

| Banda | Pos | Neg | LR | IC99 LR | Prior | Posterior |
|---|---:|---:|---:|---|---:|---:|
| <50 | 8 | 2 | 0,54 | 0,12–4,01 | 5,1 % | 4,1 % |
| 50–70 | 61 | 9 | 1,04 | 0,51–2,86 | 27,0 % | 27,3 % |
| 70–85 | 78 | 6 | 1,93 | 0,88–7,95 | 58,5 % | 64,7 % |
| 85–100 | 133 | 27 | **0,78** | 0,57–1,20 | 78,0 % | 76,2 % |

**Ninguna banda es distinguible de 1**: todos los IC99 incluyen 1. La banda alta (85–100) tiene
LR **menor que 1**, es decir, en esta muestra un score alto aparece *menos* entre los aprobados
que entre los rechazos. No se aplica ninguna corrección: sería ruido.

## Lectura

- El score **no predice aprobación**. El AUC puntual está por debajo de 0,5 y el IC99 cruza 0,5.
- Los rechazos de Reddit son, en general, sitios con mucho contenido (blogs de 130+ artículos,
  herramientas, webs de nicho) que fueron rechazados por revisión manual, antigüedad, tráfico o
  matices de política que el auditor no puede ver. Por eso puntúan alto.
- Los aprobados incluyen sitios grandes de Tranco con scores dispares y aprobaciones
  autodeclaradas de sitios pequeños. La muestra **no es la población de solicitantes**.
- El único dato con 99 % de confianza es el umbral: el 95 % de los aprobados puntúa ≥15.
  Es cierto y es inútil: un sitio con 15 puede estar aprobado y uno con 98 rechazado.

## Por qué no se llega a 442 por clase

- **171 de 306 rechazos ya muestran anuncios**: fueron aprobados después. Etiqueta muerta.
- **~90 rechazos restantes** no responden, bloquean o no tienen contenido legible.
- **Wayback**: solo 3 de 30 capturas del listado devolvieron el listado; el resto falló.
- **Reddit directo**: bloqueado (403) y RSS vacío. Arctic Shift fue la única puerta.
- **Sin features históricas**: medir el sitio de hoy no es medir el que Google rechazó.

## Consecuencia para el producto

- La probabilidad de aprobación **no se calibra** con esta muestra. Se queda en el prior declarado,
  con intervalo ±20 puntos y la etiqueta «no validado». No se aplica el LR.
- El score sigue siendo útil como **diagnóstico de defectos** (contenido, políticas, rastreo, UX),
  no como pronóstico de aprobación.
- El umbral observado se publica con su n y su confianza, pero se advierte que es demasiado bajo.

## Qué haría falta para un 99 % real

- **442 positivos y 442 negativos** con features en la fecha de la decisión (884 casos).
- **Cohorte prospectiva**: registrar cada solicitud con fecha, estado del sitio y resultado.
- **Snapshots propios** en el momento de solicitar, no Wayback meses después.
- **Muestra representativa**: los foros sobrerrepresentan rechazos y los aprobados que no publican
  no entran.

## Fuentes y datos

- `data/raw/reddit-posts.json`: 6.000 posts (sin autores).
- `data/raw/reddit-cases.json`: 344 sitios únicos con resultado.
- `data/raw/reddit-measured.json`: 344 mediciones, 165 descartadas por anuncios.
- `data/raw/tranco-scan.json`: 115 sitios con AdSense.
- `data/raw/negatives-measured.json`: 19 rechazos del foro, 10 descartados.
- `data/calibration-latest.json`: tabla generada con IC99.
- Scripts: `collect-reddit.mjs`, `reprocess-reddit.mjs`, `measure-reddit.ts`, `scan-tranco.ts`,
  `calibrate.ts`.
