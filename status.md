# Estado del proyecto â€” adsense-auditor

Actualizado: 2026-11-23 Â· RaÃ­z: `D:\Paginas web\Validador de adsense web`

## Hecho y verificado

| Fase | Entrega | VerificaciÃ³n real |
|---|---|---|
| 0 | Vite + TS + Vitest, sin runtime deps | `npm run build` â†’ `dist/` 73 KB JS (29 KB gzip) |
| 1 | NÃºcleo: normalize, html, robots, lexicon, signals, score, projection | `npm test` â†’ 44 pruebas en verde |
| 2 | Motor rÃ¡pido: cadena jina â†’ allorigins â†’ jina-text, presupuesto 16, PSI opcional | `npm run probe -- https://www.xataka.com` â†’ jina-html, 8 peticiones, fallback 502 resuelto |
| 3 | UI, gauge, barras, grÃ¡fico 60 meses, PDF por impresiÃ³n, JSON, CSV | `npm run build` verde; **render visual pendiente de navegador** |
| 4 | `deploy.yml` + `deep-audit.yml` + disparo con PAT | workflows escritos; **ejecuciÃ³n pendiente de publicar el repo** |
| 5 | BaterÃ­a de 7 sitios, 3 falsos positivos corregidos | `test/calibration.md` con puntuaciones reales |

BaterÃ­a final: xataka 93.3 Â· wikipedia 92.1 Â· blogspot 86.6 Â· bbc 88.6 Â· mozilla 93.9 Â·
shopify 87.5 Â· dominio inexistente 15 (confianza 11 %).

## Pendiente (bloqueado por el usuario)

1. **VerificaciÃ³n visual en BrowserOS neo**: el MCP no estÃ¡ conectado en esta sesiÃ³n (solo aparece
   `blender`). No se ha podido revisar la interfaz, el PDF ni el estado de carga en un navegador real.
2. **Publicar el repositorio** para confirmar despliegue en Pages y una ejecuciÃ³n real de
   `deep-audit.yml`. Sin `gh` instalado ni sesiÃ³n, lo hace el usuario con `git push`.
3. **API key de PageSpeed** para activar el bloque de rendimiento (sin ella queda `unknown`).
4. **RPM/CTR propios** para que las proyecciones usen datos reales en vez de rangos de industria.

## Riesgos conocidos

- Los proxies gratuitos son el punto frÃ¡gil del motor rÃ¡pido: jina limita a 20 peticiones/min y
  veta dominios por abuso ajeno. Mitigado con cadena de 3, presupuesto y `unknown` en vez de `fail`.
- El modelo de ingresos es condicional a sus supuestos (impresos en el informe).
- El PDF depende del diÃ¡logo de impresiÃ³n del navegador.

## PrÃ³ximo paso

Publicar el repo y abrir la URL de Pages con BrowserOS neo conectado: comprobar una auditorÃ­a
completa, la vista de impresiÃ³n y la descarga de JSON/CSV.
