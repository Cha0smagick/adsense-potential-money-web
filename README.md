# Auditor AdSense

Web estÃ¡tica que puntÃºa de 0 a 100 la aptitud de un sitio para Google AdSense, explica cada
hallazgo con evidencia, marca los bloqueadores con su tope y proyecta ingresos a 1, 6, 12 y 60
meses. Sin servidor, sin base de datos, sin dependencias de runtime.

- **Web**: GitHub Pages (despliegue automÃ¡tico con GitHub Actions).
- **Motor rÃ¡pido**: navegador, ~10 s, 1 pÃ¡gina + `robots.txt` + `ads.txt` + `sitemap` + pÃ¡ginas legales.
- **Motor profundo**: GitHub Actions, crawlea hasta 12 pÃ¡ginas del sitemap y comitea el informe.

## CÃ³mo se usa

1. Escribe la URL (`midominio.com`, `miblog.blogspot.com`, `miweb.wordpress.com`â€¦).
2. Ajusta sesiones/mes, nicho y paÃ­s. Si tienes RPM o CTR reales de AdSense, ponlos: mandan sobre
   los rangos de industria.
3. **Analizar**. ObtendrÃ¡s puntuaciÃ³n, bloqueadores, seÃ±ales con evidencia, plan de acciÃ³n
   priorizado por puntos recuperables y proyecciÃ³n de ingresos.
4. **Descargar PDF** (diÃ¡logo de impresiÃ³n del navegador, formato A4), **JSON crudo** o **CSV** de seÃ±ales.

### Opcional: velocidad real

El bloque de rendimiento necesita una API key de PageSpeed Insights (gratuita). Sin ella queda
`unknown`, la puntuaciÃ³n se reparte sobre 90 puntos y la confianza baja. La key se guarda solo en
el `localStorage` de tu navegador.

### Opcional: motor profundo

Necesita el repositorio publicado (`usuario/repo`) y un token PAT *fine-grained* con
**Actions: write** y **Contents: read**. El navegador dispara `deep-audit.yml`, la Action ejecuta
el crawl y comitea `reports/<requestId>.json`; la web lo recoge y renderiza con confianza alta.
El token se guarda solo en tu navegador. No hay backend que lo reciba.

ConfiguraciÃ³n en el repositorio: **Settings â†’ Pages â†’ Source: GitHub Actions**. Nada mÃ¡s.

## Modelo de puntuaciÃ³n

| CategorÃ­a | Peso | QuÃ© mide |
|---|---|---|
| Contenido y originalidad | 30 | volumen, densidad de texto, estructura, autorÃ­a, thin content, duplicados |
| Cumplimiento de polÃ­ticas | 20 | sexual, violencia, armas, drogas, apuestas, farmacia, deshonestidad, engaÃ±o, ilegal, propiedad intelectual, idioma |
| PÃ¡ginas esenciales | 15 | privacidad (requisito), tÃ©rminos, sobre el sitio, contacto |
| NavegaciÃ³n y UX | 15 | enlaces internos, capas intrusivas, viewport, enlaces roto |
| Rastreo tÃ©cnico | 10 | HTTPS, `Mediapartners-Google`/`AdsBot`, noindex, sitemap, canonical, meta description |
| Page experience | 10 | PSI: rendimiento, LCP, CLS, TBT |

**Bloqueadores** (no suman, acotan): sin contenido accesible 15, dominio aparcado 15, infracciÃ³n
grave 20, rastreador de AdSense bloqueado 40, menos de 300 palabras 65, sin polÃ­tica de privacidad 70.

Regla dura: **una seÃ±al que no se pudo medir es `unknown`, nunca `fail`**. El informe publica el
margen de confianza (peso resuelto) y lista las seÃ±ales no medidas. Cada seÃ±al incluye el impacto
en puntos que recuperas al arreglarla.

## ProyecciÃ³n de ingresos

```
pageRPM   = baseRPM(nicho) Ã— geoFactor(paÃ­s) Ã— deviceFactor(mÃ³vil) Ã— qualityFactor(PSI)
ingresos  = sesiones Ã— pÃ¡ginas/visita Ã— pageRPM / 1000
```

Crecimiento logÃ­stico con techo de sesiones (400 por pÃ¡gina de contenido), tres escenarios
(pesimista Ã—0,8 RPM, base, optimista Ã—1,25), inflaciÃ³n de CPM del 3 % anual y la inversa:
**sesiones y pÃ¡ginas necesarias para un objetivo de ingresos**. Todos los supuestos se imprimen
junto a las cifras. Son proyecciones condicionales, no promesas.

## Comandos

```bash
npm install
npm run dev            # servidor local
npm test               # 44 pruebas del nÃºcleo determinista
npm run build          # typecheck + build a dist/
npm run audit -- https://sitio.com --pages 12 --sessions 20000 --country ES
npm run probe -- https://sitio.com   # cadena de proveedores del navegador, sin CORS
```

## LÃ­mites y honestidad

- No lee tu cuenta de AdSense, ni sanciones previas, ni trÃ¡fico real, ni Safe Browsing. EvalÃºa lo
  que es pÃºblico y verificable.
- El motor rÃ¡pido depende de proxies CORS gratuitos (`r.jina.ai`, `api.allorigins.win`). Si caen,
  la seÃ±al correspondiente pasa a `unknown` con aviso, no a fallo. El motor profundo evita los
  proxies por completo (Node no tiene CORS).
- Complimiento de polÃ­ticas â‰  aprobaciÃ³n: la decisiÃ³n es de Google. Los enlaces a las polÃ­ticas
  oficiales estÃ¡n en el informe.
- El PDF es el diÃ¡logo de impresiÃ³n del navegador (A4), no un archivo generado por JavaScript:
  mejor tipografÃ­a y texto seleccionable.

## Estructura

```
src/core/      nÃºcleo determinista: normalizar, HTML, robots, lÃ©xico, seÃ±ales, score, proyecciÃ³n
src/fetch/     cadena de proveedores del navegador + PageSpeed
src/deep/      ejecutor Node (sin CORS) y disparo de la Action con PAT
src/ui/        render, grÃ¡ficos SVG, exportaciÃ³n
.github/       deploy.yml (Pages) y deep-audit.yml (motor profundo)
test/          pruebas + calibration.md con la baterÃ­a de sitios reales
```

CalibraciÃ³n y falsos positivos corregidos: `test/calibration.md`.
