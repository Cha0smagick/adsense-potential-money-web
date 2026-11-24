# Cobertura del dataset

Generado: 2026-11-24. **No es un censo**: es una muestra case-control de sitios y posts públicos.

## Alcance

| Dimensión | Valor | Límite |
|---|---:|---|
| Sitios únicos | **618** | Una fracción mínima de los sitios del mundo |
| Posts de Reddit | **6.000** | Solo los más recientes; no todo el historial de r/Adsense |
| Casos aprobados | 300 | Etiqueta autodeclarada u observada, no decisión de Google |
| Casos rechazados | 318 | Idem |
| Incluidos en calibración | **326** (280 / 46) | Tras excluir stale, conflictos y no legibles |
| Rechazos descartados por ya mostrar anuncios | 171 | Deriva de etiquetas |
| Conflictos de etiqueta | 1 | Aprobado y rechazado en fuentes distintas |
| Rango de fechas de casos | 2022-03-28 → 2026-11-24 | |
| Rango de fechas de posts | 2024-05-15 → 2026-11-24 | **Solo 6.000 posts recientes** |
| Puntuación | 0–100, media 66,5 | 613 con score; 5 sin medir |

Fuentes (`source_type` del registro): Reddit 337, Tranco 258, foro 18, curado 5.

## Cobertura por campo (n/618)

| Campo | Cobertura | Nota |
|---|---:|---|
| `case_id`, `site_key`, `site_url`, `host`, `registrable`, `platform` | 618/618 | Clave única y URL normalizada |
| `outcome`, `outcome_source`, `source_type`, `source_url` | 618/618 | |
| `date` | 609/618 | 9 sin fecha |
| `stale`, `label_conflict`, `included_in_calibration` | 618/618 | Banderas de calidad |
| `reachable`, `score`, `confidence`, `privacy`, `can_monetize` | 613/618 | 5 sin medición |
| `words` | 611/618 | |
| `content_pages` | 608/618 | |
| `adsense_code` | 611/618 | |
| `title` | 608/618 | Saneado |
| `gates` | 317/618 no vacío | Vacío = sin bloqueadores, no dato perdido |
| `notes` | 20/618 | Solo incidencias |

## Posts

- 6.000 posts; **328 con sitio y resultado** (291 rechazos, 37 aprobaciones).
- **5.672 posts sin sitio/resultado útil** para análisis a nivel de sitio (preguntas, noticias, pagos, YouTube…).
- Sin `selftext` en la base limpia; el texto íntegro está en `raw/reddit_posts_full.csv` (local, sin autores).

## Lo que NO tiene

- **No tiene todos los sitios**: 618 no es la población. No existe un censo público de solicitantes de AdSense.
- **No tiene todas las decisiones de Google**: las etiquetas son autodeclaradas en foros o inferidas por el código de AdSense; no son la decisión oficial.
- **No tiene el historial completo de r/Adsense**: 6.000 posts desde 2024-05; el archivo tiene años anteriores.
- **No tiene las features en la fecha de la decisión**: se midieron en 2026-11-24, no cuando Google revisó el sitio.
- **No tiene tráfico, ingresos, RPM, CTR, Search Console, backlinks ni keywords**: no son públicos.
- **No tiene edad del dominio, país, idioma, PSI ni Core Web Vitals** para la muestra masiva: el escaneo usó `publicData:false` y sin clave de PageSpeed.
- **No tiene HTML crudo de los 618 sitios**: solo features derivadas. El texto de Reddit sí está en `raw/`.
- **No tiene el motivo oficial del rechazo**: solo el texto del post o el título.

## Lo que se puede añadir

1. **Más historial de Reddit**: paginar más de 60 páginas del archivo (30.000+ posts; cubre 2013–2024).
2. **Más Tranco**: 10.000–50.000 dominios; multiplica los positivos, no arregla los negativos.
3. **Más foros**: la paginación del foro de AdSense está cerrada; otras fuentes públicas son limitadas.
4. **Features públicas**: edad RDAP, DNS, PSI/Core Web Vitals, país/idioma, tamaño del sitemap, autoría/fecha.
5. **Snapshots en la fecha de la decisión**: Wayback o captura propia; hoy solo hay 1 de 4 comprobados.
6. **Tus datos**: Search Console (CTR, posiciones) y AdSense (RPM, ingresos). Es la única fuente de calidad real.

## Conclusión

El dataset tiene **mucha información para 618 sitios y 6.000 posts**, con cobertura alta en las features que medimos y banderas explícitas de calidad. **No tiene “toda la info de todos los sitios”**, y no puede tenerla: esa base solo existe dentro de Google. Lo que hay sirve para estudiar deriva de etiquetas, defectos de contenido y sesgo de foros; no para predecir aprobaciones con certeza.
