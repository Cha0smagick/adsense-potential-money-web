# Calibración — batería de sitios reales

## v2 (2026-11-24)

Ejecutado con el motor profundo (`node src/deep/node-audit.ts`) y datos públicos activados.

| Sitio | Puntuación | Confianza | Aprobación | P50 | Esperado | Brecha | Bloqueadores |
|---|---|---|---|---|---|---|---|
| xataka.com (3 páginas) | **95/100** | 90 % | **80 %** (72-85) | 5 d | 269 USD/mes | «potencial»: sin RPM real | ninguno |
| Producción después de F6 (`cha0smagick.github.io/adsense-potential-money-web/`) | **98.8/100** | 87 % | **12 %** (4-20) | 37 d | 22,4 USD/mes | «bloqueado»: sin dominio verificable | ninguno de contenido; falta dominio propio |

**Lectura:** xataka puntúa como apto y la proyección es coherente con su nicho (tecnología, ES). La producción pasó de 15/100 (SPA vacía) a **98.8/100** con 688 palabras en el HTML y las páginas legales detectadas. El contenido ya está listo; lo que falta es un **dominio propio**: en `github.io` AdSense no puede verificar la propiedad a nivel de sitio, así que el veredicto es «Contenido apto, dominio pendiente» y la aprobación se capa al 12 %.

La brecha de xataka se marca **«potencial»**, no «pérdida medida», porque no se aportó un RPM real. Es la distinción que evita vender humo: sin RPM propio no se puede saber cuánto se está dejando.

### Verificación automática

- `npm test` → **98 pruebas** en 9 archivos.
- `npm run build` → 9 HTML, 116 kB JS (44 kB gzip), 15 kB CSS.
- `dist/index.html` → 688 palabras, 1 H1, 6 H2, 9 enlaces internos, 0 mojibake.
- CORS comprobado el 2026-11-24: RDAP, DNS, Tranco, Wayback y Common Crawl (`*`). CDX de Wayback no envía CORS: en el navegador queda sin datos.

### Cómo repetir

```bash
npm run audit -- https://www.xataka.com --pages 3 --sessions 20000 --country ES
node src/deep/node-audit.ts https://cha0smagick.github.io/adsense-potential-money-web/ --pages 6 --sessions 5000 --country ES
```

Los informes completos quedan en `reports/`.

---

## Calibración pública del modelo de aprobación (2026-11-24)

Se descargaron **6.000 posts** de r/Adsense desde Arctic Shift (sin login) y se escanearon 1.800 dominios de Tranco. Tras limpiar, quedan **344 sitios únicos** de Reddit (306 rechazos, 38 aprobaciones) y 115 sitios de Tranco con AdSense. Se midieron todos con el auditor ligero.

| Métrica | Valor |
|---|---|
| Aprobados | **280** |
| Rechazos válidos | **44** |
| Rechazos descartados por ya mostrar anuncios | **171** |
| AUC | **0,405** (IC99 0,272–0,542) |
| Mediana aprobados | 84,0 |
| Mediana rechazados | **91,7** |
| LR banda 85–100 | **0,78** (IC99 0,57–1,20) |
| 95 % de aprobados ≥ | 15 (n=280, 100 % de confianza) |
| Muestra por clase para IC99 ±5 | 442 (884 total) |

**Conclusión:** el score **no predice aprobación**. El AUC puntual está por debajo de 0,5, el IC99 cruza 0,5 y los rechazos puntúan más alto. Ninguna banda se distingue de 1; no se aplica corrección. El único dato robusto es el umbral de 15, demasiado bajo para decidir. La causa principal: 171 de 306 rechazos ya muestran anuncios y los restantes suelen ser sitios con mucho contenido rechazados por revisión manual, antigüedad o tráfico, cosas que el auditor no ve.

Dataset: `data/approval-cases.json` · mediciones: `data/reddit-measured.json` · análisis: `data/calibration.md`.

## v1 (2026-11-23) — histórico

| # | Sitio | Puntuación | Confianza | Bloqueadores | Juicio |
|---|---|---|---|---|---|
| 1 | xataka.com | 93.3 | 90 % | — | correcto |
| 2 | es.wikipedia.org | 92.1 | 90 % | — | correcto con matiz ¹ |
| 3 | googleblog.blogspot.com | 86.6 | 78 % | — | correcto |
| 4 | bbc.com | 88.6 | 90 % | — | correcto |
| 5 | mozilla.org | 93.9 | 90 % | — | correcto |
| 6 | shopify.com | 87.5 | 88 % | — | correcto |
| 7 | dominio inexistente | 15 | 11 % | sin contenido, thin | correcto |

¹ Wikipedia no tiene política de privacidad en el dominio del artículo: queda en aviso, no en bloqueador.

### Falsos positivos corregidos en v1

| Síntoma | Causa real | Corrección |
|---|---|---|
| Blogspot puntuaba «contenido vacío» | densidad medida sobre HTML bruto con cientos de KB de JS inline | `textRatio` sobre el marcado y umbrales 5 %/2 % |
| Xataka con tope 70 intermitente | fallo de red transitorio tratado como «no existe» | `LegalProbe.verifiable`: 5xx/0 ⇒ `unknown` |
| Noticias y enciclopedias con nichos absurdos | ganaba el nicho con más coincidencias tangenciales | normalización por tamaño + desempate ⇒ `general` |
