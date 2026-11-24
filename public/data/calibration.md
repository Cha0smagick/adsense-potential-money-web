# Calibración pública (2026-11-24)

## Qué se intentó

1. **Positivos**: muestra aleatoria de Tranco (top 1M), detección de código AdSense
   (`ca-pub-` / `adsbygoogle`) en el HTML y auditoría ligera del sitio.
2. **Negativos**: rechazos públicos del foro de AdSense con URL del sitio, más capturas
   históricas del listado en Wayback. Se descartan los que hoy ya muestran anuncios
   (etiqueta desactualizada) y los que no tienen contenido legible.
3. **Medición**: motor rápido del auditor, 4 sondas legales, sin datos públicos.

## Resultado

| Métrica | Valor |
|---|---|
| Sitios aprobados medidos (AdSense hoy) | **115** |
| Rechazos públicos con URL | 19 |
| Rechazos descartados por ya mostrar anuncios | 10 |
| Rechazos con contenido legible y sin anuncios | **1** |
| AUC | **0,02** (IC99 0,00–1,00) |
| Mediana aprobados | 88,8 |
| El único rechazo válido | 98,3 (`localbuzz24.com`) |
| Umbral observado: 95 % de aprobados puntúa ≥ | **40** (n=115, confianza 99,7 %) |
| Muestra por clase para IC99 ±0,05 en AUC | **442** (884 en total) |

**Lectura:** el único rechazo válido puntúa **más alto que el 98 % de los aprobados**.
No hay separación entre clases; el score no predice aprobación en esta muestra. El umbral
de 40 es cierto con 99,7 % de confianza, pero es tan bajo que no sirve para decidir.

## Por qué no hay más negativos

- **Paginación cerrada**: el foro de AdSense solo muestra 20 hilos por página; el botón
  «View more» usa un token de cliente que no responde a `start`, `page` ni `paginationToken`
  por GET. Se probaron 40+ combinaciones.
- **Wayback**: de 30 capturas recientes del listado, solo 3 devolvieron el listado; el resto
  falló o devolvió páginas de cuenta/identidad. Aportaron 60 hilos, casi todos fuera de
  «Site Approvals».
- **Reddit**: RSS vacío y HTML bloqueado (403) sin sesión.
- **Etiquetas desactualizadas**: 10 de 19 rechazos ya muestran anuncios; fueron aprobados
  después. Un rechazo de abril no es un negativo válido en noviembre.
- **Sitios muertos**: la mayoría de los rechazos restantes no responde o bloquea al auditor.
- **Sin features históricas**: solo 1 de 4 sitios comprobados tenía captura en Wayback en la
  fecha de la decisión. Medir el sitio de hoy no es medir el que Google rechazó.

## Consecuencia para el producto

- La **probabilidad de aprobación no se calibra** con esta muestra. Se queda en el prior
  declarado, con intervalo ±20 puntos y la etiqueta «no validado».
- No se aplica la razón de verosimilitud por banda: con 1 negativo sería ruido.
- Sí se publica el **umbral observado** (95 % de aprobados ≥40, 99,7 % de confianza).
  Es un dato real, pero débil: un sitio con 40 puede estar aprobado y uno con 98 rechazado.

## Qué haría falta para un 99 % real

- **442 positivos y 442 negativos** con features en la fecha de la decisión (884 casos).
- Una **cohorte prospectiva**: registrar cada solicitud con fecha, estado del sitio y
  resultado. Sin backend, el registro local + exportación CSV es el primer paso.
- **Snapshots propios** en el momento de solicitar, no Wayback meses después.
- **Muestra representativa**: los foros sobrerrepresentan rechazos y los aprobados que no
  publican no entran.

## Fuentes y datos

- `data/raw/tranco-scan.json`: 115 aprobados medidos.
- `data/raw/negatives-measured.json`: 19 rechazos, 10 descartados por anuncios.
- `data/approval-cases.json`: 15 casos curados con fuente y fecha.
- `data/calibration-latest.json`: tabla generada con IC99.
- Scripts: `scan-tranco.ts`, `collect-forum.mjs`, `collect-wayback.mjs`,
  `measure-negatives.ts`, `calibrate.ts`.
