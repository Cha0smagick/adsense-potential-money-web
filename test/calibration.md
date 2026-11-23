# Calibración — batería de sitios reales

Ejecutado el 2026-11-23 con el motor profundo (`node src/deep/node-audit.ts`), `--pages 4`,
`--sessions 20000`, `--country ES`. Los informes completos quedaron en `reports/`.

## Resultados

| # | Sitio | Puntuación | Confianza | Bloqueadores | Nicho detectado | Juicio esperado | Veredicto |
|---|-------|-----------|-----------|--------------|-----------------|-----------------|-----------|
| 1 | xataka.com | 93.3 | 90% | — | Tecnología (9.61 USD) | medio grande con AdSense activo y contenido denso | correcto |
| 2 | es.wikipedia.org | 92.1 | 90% | — | General (3.2 USD) | contenido masivo, sin anuncios, sin política de privacidad propia | correcto con matiz ¹ |
| 3 | googleblog.blogspot.com | 86.6 | 78% | — | General (3.2 USD) | blog corporativo en Blogspot, plantilla pesada | correcto |
| 4 | bbc.com | 88.6 | 90% | — | Noticias (2.14 USD) | medio de noticias, contenido amplio | correcto |
| 5 | mozilla.org | 93.9 | 90% | — | General (3.2 USD) | fundación tecnológica, muy cuidado técnicamente | correcto |
| 6 | shopify.com | 87.5 | 88% | — | General (3.2 USD) | e-commerce corporativo | correcto |
| 7 | dominio inexistente (DNS secuestrado por el router local) | 15 | 11% | Sin contenido accesible (15), Contenido insuficiente (65) | General | no debe puntuar alto | correcto |

¹ Wikipedia no tiene política de privacidad en el dominio del artículo: la señal queda en aviso,
no en bloqueador, porque Google evalúa el sitio tal como se publica. Es un falso negativo aceptado.

## Falsos positivos corregidos durante la calibración

| Síntoma | Causa real | Corrección |
|---|---|---|
| Blogspot puntuaba "contenido vacío" | la densidad se medía sobre el HTML bruto y la plantilla lleva cientos de KB de JS inline | `textRatio` se mide sobre el marcado (HTML menos scripts) y los umbrales bajan a 5 %/2 % |
| Xataka aparecía con tope 70 (sin privacidad) de forma intermitente | un fallo de red transitorio en la sonda legal se trataba como "no existe" | `LegalProbe.verifiable`: sin respuesta o 5xx ⇒ señal `unknown`, no `fail`; además reintento en el fetcher directo |
| Noticias y enciclopedias recibían nichos absurdos | ganaba el nicho con más coincidencias, aunque fueran tangenciales | normalización por tamaño del diccionario + desempate: sin ventaja del 30 % o con 3+ verticales fuertes ⇒ `general` |

## Límites conocidos del modelo

- **Sin PSI** (falta API key) el bloque de rendimiento queda `unknown`: la puntuación se reparte
  sobre 90 puntos y la confianza baja al 79-90 %. No se penaliza lo que no se mide.
- **Sitios renderizados por JS**: en el motor rápido depende de que jina renderice. Si no,
  el contenido aparece vacío y la señal baja a `unknown` en vez de declarar thin content.
- **Nicho**: es una heurística de léxico. En portales transversales acierta poco por diseño
  (devuelve `general`) y el selector manual manda cuando el usuario lo cambia.
- **Prohibiciones de Google no verificables desde fuera**: historial de sanciones, tráfico real,
  Safe Browsing, propiedad de la cuenta. El informe lo declara en «Base normativa aplicada».

## Cómo repetir la batería

```bash
npm run audit -- https://sitio.com --pages 4 --sessions 20000 --country ES
```

Cada ejecución escribe un JSON en `reports/` con todas las señales y su evidencia.
