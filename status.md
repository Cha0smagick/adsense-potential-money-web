# Estado del proyecto — adsense-auditor v2

Actualizado: 2026-11-24 · Raíz: `D:\Paginas web\Validador de adsense web`
Producción actual: **`https://adsense-auditor-3kh.pages.dev/`** (Cloudflare Pages, proyecto `adsense-auditor`, cuenta Cloudflare `b0e0d06a…`). El antiguo GitHub Pages sigue vivo, pero su canonical ya apunta a Pages.

**Verificado en vivo en Pages:** `200`, 745 palabras en el HTML, canonical y `og:url` al dominio nuevo, `robots.txt`/`sitemap.xml`/`ads.txt` en la raíz, assets y `data/*.json` con su `Content-Type` correcto. Auditoría ejecutada en el navegador contra el propio sitio: **98.3/100**, «Contenido apto, dominio pendiente», aprobación **1-32 % (base 12 %)**, 0 bloqueadores. Sigue pendiente el **dominio propio**: `pages.dev` también es subdominio de plataforma.

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

Muestra final: **280 aprobados** (115 de Tranco con AdSense + 38 de Reddit + resto) y **44 rechazos válidos**; 171 rechazos descartados por ya mostrar anuncios. **AUC 0,405** (IC99 0,272–0,542): no discrimina, y la mediana de los rechazos (91,7) es **mayor** que la de los aprobados (84,0). La banda 85–100 tiene LR 0,78: un score alto no protege. El único dato con 99 % de confianza es que el 95 % de los aprobados puntúa ≥15, un umbral inútil para decidir. No se aplica el LR; el modelo sigue **no validado**. Para IC99 ±5 en AUC hacen falta 442 por clase (884 casos).
Dataset: `data/approval-cases.json` · mediciones: `data/reddit-measured.json` · análisis: `data/calibration.md`.

## Pendiente

1. **Re-auditar tras cada cambio** (hecho: producción en 98.8/100). El contenido ya está; el bloqueador es el dominio.
2. **Verificación visual en navegador real**: el MCP de BrowserOS no está conectado en esta sesión. Revisar formulario, informe, waterfall y PDF A4.
3. **F4 cohorte de referencia** (B7): 8 nichos × 8 sitios medidos con el parser; percentiles honestos.
4. **GSC CSV** (B8/B9): import local de consultas, CTR y posiciones.
5. **Checklist por tipo de sitio** (B10) y heatmap de políticas (B11).
6. **CMP y consentimiento** (C9) antes de activar anuncios; **hosting con dominio propio** (C10).
7. **AdSense**: `pages.dev` es subdominio de plataforma, igual que `github.io`. AdSense trabaja a nivel de dominio: hace falta **dominio propio** apuntando a Pages (registro CNAME a `adsense-auditor-3kh.pages.dev`) y, después, cambiar el host en 12 archivos (`index.html`, páginas, guías, `public/robots.txt`, `public/sitemap.xml`).

## Despliegue en Cloudflare Pages

- Proyecto `adsense-auditor` creado por **direct upload** (sin Git): el repo está en la cuenta `Cha0smagick` y la sesión de GitHub era `MagiaCaotica`, así que la integración Git no estaba disponible.
- Redesplegar: `npm run build` y subir un zip de `dist` (entradas con `/`, no `\`) en *Create deployment*. El zip hecho con `Compress-Archive` de PowerShell 5.1 usa `\` y **pierde las carpetas**: el primer intento dejó solo los 22 archivos planos y el sitio sin CSS/JS.
- Limpieza hecha: token `adsense-pages-deploy` **eliminado** y app de GitHub «Cloudflare Workers and Pages» **desinstalada** (se había concedido acceso a 23 repos y no se usó).

## Riesgos

- **Aprobación**: la calibración pública con 15 casos no discriminó (AUC 0,51); siete de nueve rechazos ya mostraban anuncios. El modelo se declara **no validado**, con intervalo ±20 puntos. No es una tasa de Google.
- **Datos públicos**: Common Crawl devolvió 504 en la primera prueba; RDAP/Tranco/Wayback responden. Todo degrada a `unknown`, nunca a `fail`.
- **Proxies del motor rápido**: disyuntor + presupuesto lógico; si caen, el informe pierde confianza pero no inventa.
- **PDF**: sigue siendo el diálogo de impresión del navegador (A4), no un archivo generado.

## Próximo paso

El contenido de producción está listo. Para monetizar **este** sitio: comprar un dominio, publicarlo en Cloudflare Pages/Netlify, añadir la CMP certificada y solicitar AdSense. Después, cerrar F4 (cohorte de referencia) y B8/B9 (import de Search Console para CTR y posiciones reales).
