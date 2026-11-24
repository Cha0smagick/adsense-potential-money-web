# Estado del proyecto — adsense-auditor v2

Actualizado: 2026-11-24 · Raíz: `D:\Paginas web\Validador de adsense web`
Producción actual: `https://cha0smagick.github.io/adsense-potential-money-web/` (desplegada el 2026-11-24, commit `cae9083`).

**Verificado en vivo:** 98.8/100 · «Contenido apto, dominio pendiente» · 90 % de confianza · 0 bloqueadores · 688 palabras en el HTML · privacidad detectada. Aprobación estimada **12 % (1-32 %)** —modelo no validado— y P50 37 días **por el subdominio `github.io`**, no por el contenido.

## Hecho y verificado

| Fase | Entrega | Verificación real |
|---|---|---|
| F1 | 15 defectos del plan v2: robots 5xx, URL final, fallback HTTP, confianza mínima, presupuesto lógico, X-Robots-Tag, marca en keyword stuffing, píxeles, enlaces rotos, SSRF, topes, RPM/CTR inválidos, muestreo, typos | `npm test` → **99 pruebas en verde** (9 archivos) |
| F2 | Economía (bruto/esperado/actual/brecha), atribución por mecanismo, aprobación con probabilidad y P50/P80/P90, decisión aplicar/preparar, estadística descriptiva e inferencial | `test/money.test.ts`, `test/stats.test.ts`, `test/pipeline.test.ts` |
| F3 | Datos públicos: RDAP, DNS (A/NS/MX/TXT/SPF/DMARC), Tranco, Wayback, con timeout y degradación | CORS verificado el 2026-11-24; `xataka-v2.json` con datos reales |
| F6 | 9 páginas estáticas (home + metodología + 3 guías + legales + sobre/contacto), CTA de adquisición, créditos, `robots.txt`, `sitemap.xml`, `ads.txt`, `og.png` | `npm run build` → 9 HTML; `dist/index.html` con **688 palabras**, 1 H1, 6 H2, 0 mojibake |
| — | Soporte de subdominios y project pages (`blogspot`, `wordpress.com`, `usuario.github.io/repo/`) | `test/pipeline.test.ts`: `siteRoot`, `basePath`, `subject`, `slug` y enlaces internos por carpeta |
| — | Enlace «¿Cómo lo corrijo?» en cada señal, gate y plan | Test que exige URL `https` de dominio permitido en las 46 señales |

## Batería real

| Sitio | Resultado | Observación |
|---|---|---|
| xataka.com (profundo, 3 páginas) | **95/100**, confianza 90 %, aprobación 80 % (60-95 %), P50 5 d, esperado 269 USD/mes | La brecha se marca «potencial» porque no se aportó RPM real |
| Producción actual (después de F6) | **98.8/100**, «Contenido apto, dominio pendiente», confianza 90 % | 688 palabras en el HTML, 0 bloqueadores, privacidad detectada. Aprobación 12 % (1-32 %) y P50 37 d por el subdominio `github.io` |

Los informes completos están en `reports/`.

## Calibración pública (2026-11-24)

Muestra final: **115 sitios aprobados** (Tranco con AdSense) y **1 rechazo válido**; 10 rechazos descartados por ya mostrar anuncios. **AUC 0,02** (IC99 0,00–1,00): el único rechazo puntúa 98,3, más alto que el 98 % de los aprobados. El score **no predice aprobación** en esta muestra. El umbral observado (95 % de aprobados ≥40) es cierto con 99,7 % de confianza, pero es demasiado bajo para decidir. No se aplica la razón de verosimilitud; el modelo sigue **no validado**. Para un IC99 ±5 puntos en AUC hacen falta 442 por clase (884 casos).
Dataset: `data/approval-cases.json` · mediciones: `data/negatives-measured.json` · análisis: `data/calibration.md`.

## Pendiente

1. **Re-auditar tras cada cambio** (hecho: producción en 98.8/100). El contenido ya está; el bloqueador es el dominio.
2. **Verificación visual en navegador real**: el MCP de BrowserOS no está conectado en esta sesión. Revisar formulario, informe, waterfall y PDF A4.
3. **F4 cohorte de referencia** (B7): 8 nichos × 8 sitios medidos con el parser; percentiles honestos.
4. **GSC CSV** (B8/B9): import local de consultas, CTR y posiciones.
5. **Checklist por tipo de sitio** (B10) y heatmap de políticas (B11).
6. **CMP y consentimiento** (C9) antes de activar anuncios; **hosting con dominio propio** (C10).
7. **AdSense**: la URL actual es `github.io`, un subdominio de plataforma. AdSense trabaja a nivel de dominio y no se puede verificar la raíz. Para monetizar este sitio hace falta dominio propio (Cloudflare Pages/Netlify) o publicar en Blogger.

## Riesgos

- **Aprobación**: la calibración pública con 15 casos no discriminó (AUC 0,51); siete de nueve rechazos ya mostraban anuncios. El modelo se declara **no validado**, con intervalo ±20 puntos. No es una tasa de Google.
- **Datos públicos**: Common Crawl devolvió 504 en la primera prueba; RDAP/Tranco/Wayback responden. Todo degrada a `unknown`, nunca a `fail`.
- **Proxies del motor rápido**: disyuntor + presupuesto lógico; si caen, el informe pierde confianza pero no inventa.
- **PDF**: sigue siendo el diálogo de impresión del navegador (A4), no un archivo generado.

## Próximo paso

El contenido de producción está listo. Para monetizar **este** sitio: comprar un dominio, publicarlo en Cloudflare Pages/Netlify, añadir la CMP certificada y solicitar AdSense. Después, cerrar F4 (cohorte de referencia) y B8/B9 (import de Search Console para CTR y posiciones reales).
