# Calibración pública del modelo de aprobación

Fecha: 2026-11-24 · Estado: **no validado**.

## Qué se hizo

Se buscaron casos públicos de aprobación y rechazo de AdSense con URL del sitio y fecha:
foro oficial de AdSense (Site Approvals), casos publicados y sitios que hoy sirven anuncios.
Se midieron con el motor profundo del auditor el 2026-11-24 (4 páginas de muestra, sin datos públicos).

- **15 casos**: 6 aprobados y 9 rechazados.
- **AUC (Mann-Whitney)**: **0,51**. Un modelo sin capacidad de discriminación daría 0,50.
- **Mediana de puntuación**: aprobados 92,2 · rechazados 83,5. Las distribuciones se solapan.

## Casos

| Resultado | Sitio | Fecha del caso | Puntuación | Bloqueadores | ¿Anuncios hoy? | Etiqueta |
|---|---|---|---|---|---|---|
| rechazado | uksalarycalculator.io | 2026-04-05 | 94,0 | — | sí | desactualizada |
| rechazado | vumaths.com | 2026-07-25 | 92,9 | — | sí | desactualizada |
| rechazado | aivatcalc.com | 2026-10-25 | 15,0 | unreachable, thin | no | no medible |
| rechazado | theconversionhub.net | 2026-04-30 | 65,0 | thin | sí | desactualizada |
| rechazado | onegocube.com | 2026-11-08 | 95,1 | — | sí | desactualizada |
| rechazado | azeemarchitects.com | 2026-09-09 | 83,5 | — | sí | desactualizada |
| rechazado | infojano.com | 2026-11-15 | 70,0 | no-privacy | sí | desactualizada |
| rechazado | localbuzz24.com | 2026-01-16 | 94,6 | — | no | vigente |
| rechazado | yourbeautybug.blogspot.com | 2022-03-28 | 70,0 | no-privacy | sí | desactualizada |
| aprobado | chaosgoo.com | 2025-01-01 | 65,0 | thin | sí | caso publicado |
| aprobado | adsenseaproval.tistory.com | 2025-06-01 | 92,2 | — | sí | caso publicado |
| aprobado | roadtoblogging.com | 2026-11-24 | 70,0 | no-privacy | no | proxy débil |
| aprobado | shoutmeloud.com | 2026-11-24 | 70,0 | no-privacy | sí | proxy |
| aprobado | xataka.com | 2026-11-24 | 97,1 | — | sí | proxy |
| aprobado | genbeta.com | 2026-11-24 | 93,3 | — | sí | proxy |

## Por qué falla

1. **Etiquetas desactualizadas.** Siete de los nueve rechazos ya muestran código de anuncios: fueron aprobados después del post. Un rechazo de abril no es un negativo válido en noviembre.
2. **Features medidas hoy, no en la fecha de la decisión.** El auditor mide el sitio actual; el rechazo ocurrió meses antes. Un sitio arreglado después puntúa alto y sigue etiquetado como rechazo.
3. **Sin histórico suficiente.** Se probaron 4 sitios en Wayback con la fecha del caso: solo 1 tenía captura. No hay base para reconstruir el estado en el momento de la decisión.
4. **Sesgo de selección.** Los foros sobrerrepresentan rechazos; los aprobados que no publican no entran. La tasa absoluta de la muestra no es la tasa real de aprobación.

## Decisión de producto

No se usa esta muestra para ajustar la probabilidad. El informe muestra:

- La probabilidad como **escenario**, con intervalo ampliado (±20 puntos) y la etiqueta **«modelo no validado»**.
- La tarjeta de calibración con n, AUC, etiquetas desactualizadas y el enlace al dataset.
- La recomendación «aplicar ya o preparar primero» se mantiene, porque compara días esperados, no tasas.

## Qué haría falta para calibrar de verdad

- Una **cohorte prospectiva**: registrar solicitudes con fecha, estado del sitio en ese momento y resultado.
- **Snapshots en la fecha de la decisión** (Wayback o captura propia) para medir las features históricas.
- **Muestra representativa**, no solo foros: incluir aprobaciones que no se publican.
- Con 30-50 casos y etiquetas vigentes se puede ajustar una regresión logística y reportar Brier + curva de calibración.

Mientras tanto, el modelo es un prior declarado. No una tasa.

## Fuentes

- Foro de AdSense, categoría Site Approvals: `https://support.google.com/adsense/threads?hl=en&thread_filter=(category:site_approvals)`
- Casos publicados: `chaosgoo.com` y `adsenseaproval.tistory.com`.
- Sitios que hoy sirven anuncios: verificación de código en la medición.
- Dataset: `data/approval-cases.json` · Mediciones: `data/approval-cases.measured.json`.
