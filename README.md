# Auditor AdSense

Web estática que audita cualquier sitio y responde tres preguntas en este orden: **cuánto puede ganar**, **por qué no lo está ganando** y **qué hacer para corregirlo**. Sin servidor, sin base de datos y sin dependencias de runtime.

- **Web**: GitHub Pages (producción actual) o cualquier hosting estático con dominio propio.
- **Motor rápido**: navegador, ~10 s, portada + `robots.txt` + `ads.txt` + `sitemap` + páginas legales + datos públicos.
- **Motor profundo**: GitHub Actions, muestra aleatoria del sitemap y estadística inferencial.
- **Informe**: HTML, PDF A4 (impresión), JSON `report.v2` y CSV de señales.

## Qué mide

| Categoría | Peso | Qué comprueba |
|---|---|---|
| Contenido y originalidad | 30 | volumen, densidad, estructura, autoría, repetición, duplicados |
| Cumplimiento de políticas | 20 | 10 categorías de riesgo con la política de Google citada |
| Páginas esenciales | 15 | privacidad, términos, sobre, contacto (verificadas por HTTP) |
| Navegación y UX | 15 | enlaces internos, capas intrusivas, viewport, enlaces rotos |
| Rastreo técnico | 10 | HTTPS, Mediapartners-Google, AdsBot, noindex, sitemap, canonical |
| Rendimiento | 10 | PageSpeed con tu clave: LCP, CLS, TBT |

**Bloqueadores** (acotan, no suman): sin contenido legible 15, dominio aparcado 15, infracción grave 20, rastreador bloqueado 40, menos de 300 palabras 65, sin privacidad 70.

Regla dura: **una señal que no se pudo medir es `unknown`, nunca `fail`**. Si la confianza baja del 60 %, el veredicto es «faltan datos», no «apto».

## Dinero, pérdida y aprobación

- **Potencial**: `sesiones × páginas/vista × RPM / 1000`, con RPM de industria por nicho, país y dispositivo. Si aportas tu RPM real, manda el tuyo.
- **Capacidad**: cada página aporta 120/300/500 sesiones según tenga <300, 300-800 o >800 palabras.
- **Pérdida con mecanismo**: binaria (rastreador, noindex, idioma), medida (rendimiento, viewport) o esperada por riesgo (thin content, duplicados, políticas). Lo que no tiene mecanismo no se convierte en dólares.
- **Aprobación**: probabilidad en rango y días P50/P80/P90, con anclas declaradas. Google no publica tasas: es una estimación, no una promesa. Incluye la decisión «aplicar ya o preparar primero».
- **Cada hallazgo** trae un enlace oficial «¿Cómo lo corrijo?».

## Estadística

Con el motor profundo: muestra aleatoria sin reemplazo sobre el sitemap (semilla impresa), descriptiva completa (media, mediana, DE, CV, cuartiles, IQR, asimetría, curtosis, histograma) e inferencia no paramétrica (Mann-Whitney U con delta de Cliff, Kruskal-Wallis, Spearman por permutación, chi-cuadrado 2×2, Jarque-Bera, Holm). Límite impreso: describe el sitemap, no el tráfico, y con muestras pequeñas solo detecta efectos grandes.

## Plataformas

Funciona con dominio propio, `miblog.blogspot.com`, `miweb.wordpress.com`, `usuario.github.io/mi-proyecto` y otros hosts compartidos. Detecta la plataforma, separa la subruta del project page y marca si el dominio es **verificable para AdSense**. En `github.io` no lo es: AdSense trabaja a nivel de dominio y la raíz pertenece a GitHub. Blogger es la excepción.

## Cómo se usa

1. Pega la URL, ajusta sesiones/mes, nicho y país.
2. Opcional: tu RPM/CTR reales, API key de PageSpeed y motor profundo.
3. **Analizar**. Obtienes dinero, pérdida atribuida, probabilidad/tiempo, plan con enlaces y señales con evidencia.
4. Descarga PDF, JSON o CSV.

### Motor profundo

Necesita el repositorio publicado y un PAT *fine-grained* con **Actions: write** y **Contents: read**. El navegador dispara `deep-audit.yml`, la Action crawlea una muestra del sitemap y comitea `reports/<requestId>.json`. El token se guarda solo en tu navegador.

## Comandos

```bash
npm install
npm run dev            # servidor local
npm test               # 98 pruebas del núcleo determinista
npm run build          # typecheck + build multi-página a dist/
npm run audit -- https://sitio.com --pages 12 --sessions 20000 --country ES
npm run probe -- https://sitio.com   # cadena de proveedores del navegador
```

## Estructura

```
src/core/      normalize · html · robots · lexicon · signals · score · projection
               economics · attribution · approval · remediation · stats · inference
               sample · analysis · audit
src/fetch/     chain (navegador) · psi · public-data (RDAP/DNS/Tranco/Wayback)
src/deep/      node-audit · ssrf · dispatch
src/ui/        render · charts · export
public/        robots.txt · sitemap.xml · ads.txt · og.png
*.html         portada + metodología + guías + legales + sobre/contacto
.github/       deploy.yml y deep-audit.yml
test/          98 pruebas + calibration.md
```

## Límites y honestidad

- No lee tu cuenta de AdSense, ni sanciones, ni tráfico real, ni backlinks. Evalúa lo público y verificable.
- Los proxies CORS gratuitos (`r.jina.ai`, `api.allorigins.win`) son el punto frágil del motor rápido: disyuntor, presupuesto lógico y `unknown` visible.
- La probabilidad de aprobación es un modelo declarado; se etiqueta «sin calibrar» hasta tener resultados reales.
- El PDF es el diálogo de impresión del navegador (A4), no un archivo generado por JavaScript.
- Para monetizar **este** sitio con AdSense hace falta dominio propio y CMP certificada. `github.io` no es verificable a nivel de dominio.

Herramienta independiente, sin afiliación con Google. Creada por **Frater Alek0s** para **Cha0sMagick Labs**. Licencia MIT. Contacto: `magiadelcaospractica@gmail.com`.
