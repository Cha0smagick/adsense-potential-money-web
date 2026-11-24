# AdSense Approval & Rejection Dataset

Dataset case-control de sitios web con resultado declarado u observado de Google AdSense,
medidos con el auditor. Generado el 2026-11-24.

## Contenido

| Archivo | Filas | Qué es |
|---|---:|---|
| `data/cases.csv` | 618 | Base única por sitio: resultado, fuente, features, flags de calidad |
| `data/posts.csv` | 6000 | Metadatos de 6.000 posts de r/Adsense (sin texto ni autores) |
| `data/tranco_sites.csv` | 258 | Sitios de Tranco que hoy sirven AdSense |
| `data/forum_cases.csv` | 19 | Rechazos públicos del foro de AdSense |
| `data/calibration_bands.csv` | 4 | LR por banda con IC99 |
| `data/calibration_meta.json` | — | Metadatos de la calibración |
| `db/adsense_approval.sqlite` | — | Misma base en SQLite, con índices y vista `calibration_ready` |
| `adsense_approval.xlsx` | — | Excel multi-hoja |
| `raw/` | — | Crudo completo: selftext de Reddit sin autores. **Local, no publicar sin anonimizar** |
| `coverage-report.md` | — | Cobertura campo a campo y límites |

## Base única: `cases.csv`

Un registro por `site_key` (dominio registrable; host en plataformas compartidas).
Columnas clave:

- `outcome`: approved / rejected / pending / unknown.
- `outcome_source`: observed_adsense (código en el HTML), self_reported (post), curated.
- `stale`: 1 si el sitio fue rechazado pero hoy ya muestra anuncios. Etiqueta desactualizada.
- `reachable`: 1 si se pudo leer contenido.
- `score`, `confidence`, `gates`, `words`, `content_pages`, `privacy`.
- `label_conflict`: 1 si el sitio aparece aprobado y rechazado en fuentes distintas.
- `included_in_calibration`: 1 solo si cumple las reglas de limpieza (sin conflicto, sin stale,
  legible, con score y, en rechazos, contenido).

**Conteos de la base:** 618 sitios, 326 incluidos en calibración
(280 aprobados / 46 rechazados), 171 con etiqueta stale,
1 con conflicto.

> Nota: la tabla de calibración se generó con 44 rechazos; la base limpia tiene 46 tras una
> deduplicación posterior. El AUC (0,405) no cambia de forma material.

## Cómo cargarlo

```python
import pandas as pd
cases = pd.read_csv("kaggle/data/cases.csv")
cal = cases.query("included_in_calibration == 1")
print(cal["outcome"].value_counts())
```

```bash
sqlite3 kaggle/db/adsense_approval.sqlite "SELECT outcome, COUNT(*) FROM cases GROUP BY 1;"
```

## Advertencia

El score del auditor **no predice la aprobación** en esta muestra: AUC 0,405 (IC99 0,272–0,542),
y los rechazos puntúan más alto. El dataset es valioso para estudiar **defectos de contenido,
deriva de etiquetas y sesgo de foros**, no como oráculo de aprobación. Ver `dataset-card.md`.
