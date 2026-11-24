# Dataset Card — AdSense Approval & Rejection (case-control)

## Resumen

- **Qué**: 618 sitios con resultado de AdSense, features de contenido y banderas de calidad.
- **Fuentes**: r/Adsense vía Arctic Shift (6.000 posts), foro oficial de AdSense, lista Tranco,
  medición directa del HTML público.
- **Fecha de recolección**: 2026-11-24.
- **Idioma**: títulos en inglés (Reddit/foro); features en inglés.
- **Licencia de la compilación**: CC BY 4.0. Los textos de terceros siguen siendo de sus autores;
  no se incluye `selftext` en la base limpia.

## Composición

| Clase | n |
|---|---:|
| Aprobados | 280 |
| Rechazos válidos | 46 |
| Stale (rechazo que hoy muestra anuncios) | 171 |
| Conflictos de etiqueta | 1 |

## Metodología

1. Descarga de 6.000 posts de r/Adsense desde Arctic Shift (archivo público).
2. Extracción de URL del sitio desde título, texto y enlace; normalización y deduplicación por
   dominio registrable (host en blogspot/wordpress/github.io/netlify/vercel).
3. Etiquetado por título/texto: aprobado, rechazado o pendiente; se descartan preguntas ambiguas.
4. Medición con el auditor: portada, robots, sitemap y hasta 4 páginas legales.
5. Limpieza: `stale` si el rechazo ya muestra AdSense; `label_conflict` si hay etiquetas opuestas;
   `included_in_calibration` solo para casos legibles, sin conflicto y sin stale.

## Usos previstos

- Estudiar qué features distinguen (o no) sitios aprobados y rechazados.
- Medir deriva de etiquetas: sitios rechazados que después fueron aprobados.
- Benchmark de auditores de contenido/AdSense.
- NLP sobre títulos (no sobre selftext en la versión limpia).

## Limitaciones

- **Muestra no representativa**: los foros sobrerrepresentan rechazos; Tranco no es la población
  de solicitantes.
- **Etiquetas autodeclaradas**: aprobaciones/rechazos de Reddit no están verificados por Google.
- **Features actuales, no históricas**: el sitio se midió en 2026-11-24, no en la fecha del post.
- **Deriva**: 171 rechazos ya muestran anuncios.
- **AUC 0,405 (IC99 0,272–0,542)**: el score no discrimina; no usar como probabilidad.
- **Sin datos personales** en la base limpia; el `selftext` crudo está en `raw/` y es local.

## Ética y privacidad

- No se guardan nombres de usuario, IDs de autor ni correos.
- Los títulos se sanean (emails/teléfonos reemplazados).
- `raw/reddit_posts_full.csv` contiene texto íntegro de usuarios: **no publicar** hasta anonimizar.
- Contacto para retiradas: magiadelcaospractica@gmail.com.

## Cita

```bibtex
@dataset{cha0smagick_adsense_2026,
  title = {AdSense Approval & Rejection Dataset (case-control)},
  author = {Cha0sMagick Labs},
  year = {2026},
  note = {Compilación de fuentes públicas; CC BY 4.0}
}
```
