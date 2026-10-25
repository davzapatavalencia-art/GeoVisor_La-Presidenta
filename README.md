# GeoVisor Quebrada La Presidenta

Geovisor web de la cuenca de la Quebrada La Presidenta (Comuna 14 – El Poblado, Medellín), desarrollado para el curso **Comunidad y Territorio** de la UNAD.

Es un sitio estático (HTML + CSS + JavaScript, sin paso de compilación) publicado con GitHub Pages.

## Estructura

```
index.html            Página del visor
css/visor.css         Estilos (identidad UNAD, escritorio y móvil)
js/                   Lógica del visor (módulos ES, sin compilación)
  main.js             Arranque: mapa, mapas base, controles
  capas.js            Carga diferida de capas, opacidad, ficha al hacer clic
  estilos.js          Estilos, clasificación por cuantiles y leyendas
  popups.js           Contenido de las fichas
  panel.js            Pestañas Territorio / Capas / Acerca y leyenda
config/capas.json     Capas, grupos, estilos, fichas y mapas base
data/                 Capas listas para el visor (GeoJSON) y resumen.json
img/                  Íconos e imágenes
scripts/              Script que genera data/ a partir de los datos crudos
requirements.txt      Dependencias de Python del script
```

### Ver el visor en local

El visor carga sus datos con `fetch`, así que necesita un servidor (no funciona abriendo el archivo con doble clic):

```bash
python -m http.server 8090
```

Luego abre http://localhost:8090.

### Agregar o cambiar una capa

1. Pon el GeoJSON en `data/` (o genéralo con el script).
2. Agrega una entrada en el grupo correspondiente de `config/capas.json`: `archivo`, `estilo` (`simple`, `categorias`, `punto` o `coropleta`) y, si quieres ficha, `popup` con sus `campos`.

No hay que tocar el código.

## Datos

Los datos crudos **no** se suben al repositorio. Viven en la carpeta `Datos/`, al lado del repo:

```
GeoVisor/
├── Datos/          ← fuentes originales (KML, KMZ, GPKG, censo DANE)
└── Repositorio/    ← este repo
```

### Regenerar las capas

```bash
pip install -r requirements.txt
python -X utf8 scripts/preparar_datos.py
```

El script borra y vuelve a escribir todos los `data/*.geojson` y `data/resumen.json`. Si la carpeta de datos está en otro lugar: `--datos RUTA`.

Qué hace:

- Lleva todo a WGS84 en 2D, corrige geometrías inválidas y deja solo los atributos útiles, con nombres claros.
- Simplifica las geometrías (0,5 m; 5 m el límite municipal) y limita los decimales de las coordenadas.
- Cruza el censo con la cuenca, la Comuna 14, los barrios y la amenaza por inundación. Estima la población expuesta ponderando por área.
- Escribe `resumen.json` con las cifras precalculadas para el visor y un inventario de las capas.

### Capas generadas

| Capa | Fuente | Notas |
|---|---|---|
| `limite_medellin` | Kmz_Basica/Medellin.kml | Contexto |
| `comuna_14` | Kmz_Basica/Comuna 14.kml | |
| `cuenca_la_presidenta` | Kmz_Basica/Delimitación de la Cuenca.kml | Área calculada |
| `barrios_afectados` | Kmz_Basica/Barrios.kml | Con totales del censo, población expuesta y n.º de inspecciones |
| `mascerca_el_poblado` | Kmz_Especializadas/MasCerca_El_Poblado.kmz | |
| `rio_medellin`, `quebrada_la_presidenta` | Kmz_Basica | Disueltas en una sola línea |
| `red_hidrica` | Kmz_Basica/Red Hídrica.kml | `jerarquia`: Principal / Secundario |
| `amenaza_inundacion` | Kmz_Basica/Amenaza Inundación.kml | `nivel` provisional (ver abajo) |
| `inspecciones_tecnicas` | SIRMED (zip del 2026-09-11) | Con fechas, tipo de incidente, puntajes y enlace al informe |
| `propuesta_*` | Archivos `.gpkg` | Pavimentos permeables, restauración de laderas y riberas, tanques |
| `censo_manzanas` | Capas_LaPresidenta_ComunaXIV.zip (CNPV 2018) | Indicadores, `en_cuenca`, `en_comuna14`, `barrio`, `pob_amenaza_*` |

### Pendientes por revisar

- **Amenaza por inundación:** la equivalencia de los códigos ZAIA / ZAIM / ZAIMB con los niveles Alta / Media / Baja es provisional. Hay que confirmarla con el POT.
- **Geología:** `Capas_Geologia_Cuenca.zip` no se usa. Sus depósitos no tocan la cuenca (quedan al suroccidente, junto al río Medellín), así que se retiraron del visor. Si aparece la capa correcta, se puede volver a agregar.
- **Censo:** incluye manzanas de Medellín, Envigado e Itagüí. Se usan como contexto; las cifras de la cuenca salen del campo `en_cuenca`.
- **Manzanas degeneradas:** 2 manzanas del censo (`0500110000000009100353` y `0500110000000016090304`, 164 personas) tienen en la fuente una geometría de ~1 m², aunque su campo AREA dice 837 y 2.038 m². No se dibujan, pero sí cuentan en los totales.
- **Barrios:** cada manzana se asigna a un barrio por un punto interior, sin repetirla. Por eso los conteos son menores que los de los KMZ por barrio, que cuentan cualquier manzana que toque el barrio.
- **Inspecciones:** 4 de 12 no tienen fecha de ocurrencia; `fecha_referencia` usa la de registro en su lugar.
- **Propuestas:** les falta el texto descriptivo (campo `descripcion`).

## Fuentes

- DANE, Censo Nacional de Población y Vivienda 2018.
- Alcaldía de Medellín: SIRMED (inspecciones técnicas), cartografía base y POT.
- Ortofoto de Medellín (servicio WMTS de la Alcaldía).
