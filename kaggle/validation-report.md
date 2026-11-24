# Validación del paquete

Generado: 2026-11-24T20:41:28.795Z

| Comprobación | Resultado |
|---|---|
| case_id único | OK |
| site_key único | OK |
| outcomes válidos | OK |
| score 0-100 | OK |
| stale implica adsense_code=1 | OK |
| sin columnas de autor | OK |
| sin emails en títulos | OK |
| posts único | OK |
| 4 bandas | OK |
| SQLite existe | OK |
| XLSX existe | OK |

## Conteos

- Casos: **618** (site_key únicos: 618)
- Incluidos en calibración: **326**
- Distribución: approved=300, rejected=318
- Posts: **6000**
- Bandas: 4
- AUC: 0.405 (IC99 0.272–0.542)
- Stale: 171
- Conflictos: 1
- Títulos con email: 0
- Columnas prohibidas: ninguna

## Archivos

- `kaggle/adsense_approval.xlsx` — 676.3 KB
- `kaggle/coverage-report.md` — 4.0 KB
- `kaggle/data/calibration_bands.csv` — 0.3 KB
- `kaggle/data/calibration_meta.csv` — 1.0 KB
- `kaggle/data/calibration_meta.json` — 1.9 KB
- `kaggle/data/cases.csv` — 203.0 KB
- `kaggle/data/forum_cases.csv` — 2.0 KB
- `kaggle/data/posts.csv` — 1203.1 KB
- `kaggle/data/tranco_sites.csv` — 36.9 KB
- `kaggle/dataset-card.md` — 2.7 KB
- `kaggle/db/adsense_approval.sqlite` — 1752.0 KB
- `kaggle/manifest.json` — 3.4 KB
- `kaggle/raw/forum_cases_raw.json` — 12.1 KB
- `kaggle/raw/README.md` — 0.3 KB
- `kaggle/raw/reddit_cases_raw.json` — 121.8 KB
- `kaggle/raw/reddit_posts_full.csv` — 3489.0 KB
- `kaggle/raw/tranco_scan_raw.json` — 84.4 KB
- `kaggle/README.md` — 2.6 KB
- `kaggle/schema.sql` — 2.0 KB
- `kaggle/validation-report.md` — 1.5 KB
