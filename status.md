# Estado del proyecto — adsense-auditor v2

Actualizado: 2026-11-24 · Raíz: `D:\Paginas web\Validador de adsense web`
Producción actual: `https://cha0smagick.github.io/adsense-potential-money-web/`

## Hecho y verificado

| Fase | Entrega | Verificación real |
|---|---|---|
| F1 | 15 defectos del plan v2: robots 5xx, URL final, fallback HTTP, confianza mínima, presupuesto lógico, X-Robots-Tag, marca en keyword stuffing, píxeles, enlaces rotos, SSRF, topes, RPM/CTR inválidos, muestreo, typos | `npm test` → **97 pruebas en verde** (9 archivos) |
| F2 | Economía (bruto/esperado/actual/brecha), atribución por mecanismo, aprobación con probabilidad y P50/P80/P90, decisión aplicar/preparar, estadística descriptiva e inferencial | `test/money.test.ts`, `test/stats.test.ts`, `test/pipeline.test.ts` |
| F3 | Datos públicos: RDAP, DNS (A/NS/MX/TXT/SPF/DMARC), Tranco, Wayback, con timeout y degradación | CORS verificado el 2026-11-24; `xataka-v2.json` con datos reales |
| F6 | 9 páginas estáticas (home + metodología + 3 guías + legales + sobre/contacto), CTA de adquisición, créditos, `robots.txt`, `sitemap.xml`, `ads.txt`, `og.png` | `npm run build` → 9 HTML; `dist/index.html` con **688 palabras**, 1 H1, 6 H2, 0 mojibake |
| — | Soporte de subdominios y project pages (`blogspot`, `wordpress.com`, `usuario.github.io/repo/`) | `test/pipeline.test.ts`: `siteRoot`, `basePath`, `subject`, `slug` y enlaces internos por carpeta |
| — | Enlace «¿Cómo lo corrijo?» en cada señal, gate y plan | Test que exige URL `https` de dominio permitido en las 46 señales |

## Batería real

| Sitio | Resultado | Observación |
|---|---|---|
| xataka.com (profundo, 3 páginas) | **95/100**, confianza 90 %, aprobación 80 % (72-85 %), P50 5 d, esperado 269 USD/mes | La brecha se marca «potencial» porque no se aportó RPM real |
| Producción actual (antes de este cambio) | 15/100, «faltan datos», 0 palabras visibles | El HTML era una SPA vacía: por eso F6 era obligatorio |

Los informes completos están en `reports/`.

## Pendiente

1. **Desplegar** (commit + push a `main`) y volver a auditar la URL de producción. Sin desplegar, la web sigue siendo la SPA de 15/100.
2. **Verificación visual en navegador real**: el MCP de BrowserOS no está conectado en esta sesión. Revisar formulario, informe, waterfall y PDF A4.
3. **F4 cohorte de referencia** (B7): 8 nichos × 8 sitios medidos con el parser; percentiles honestos.
4. **GSC CSV** (B8/B9): import local de consultas, CTR y posiciones.
5. **Checklist por tipo de sitio** (B10) y heatmap de políticas (B11).
6. **CMP y consentimiento** (C9) antes de activar anuncios; **hosting con dominio propio** (C10).
7. **AdSense**: la URL actual es `github.io`, un subdominio de plataforma. AdSense trabaja a nivel de dominio y no se puede verificar la raíz. Para monetizar este sitio hace falta dominio propio (Cloudflare Pages/Netlify) o publicar en Blogger.

## Riesgos

- **Aprobación**: el modelo es una estimación con anclas declaradas; Google no publica tasas. Se etiqueta «sin calibrar» hasta tener resultados reales.
- **Datos públicos**: Common Crawl devolvió 504 en la primera prueba; RDAP/Tranco/Wayback responden. Todo degrada a `unknown`, nunca a `fail`.
- **Proxies del motor rápido**: disyuntor + presupuesto lógico; si caen, el informe pierde confianza pero no inventa.
- **PDF**: sigue siendo el diálogo de impresión del navegador (A4), no un archivo generado.

## Próximo paso

Commit y push. Después, auditar la URL publicada y comprobar que el contenido estático aparece con ≥600 palabras y que la privacidad se detecta desde el menú.
