"""
Prepara las capas del GeoVisor La Presidenta.

Lee los datos crudos de la carpeta Datos/ (KML, KMZ, GPKG, GeoJSON dentro de
zips), los limpia, simplifica y escribe GeoJSON livianos en data/, junto con
data/resumen.json (estadísticas precalculadas e inventario de capas).

Uso:
    python -X utf8 scripts/preparar_datos.py [--datos RUTA_A_DATOS]

Por defecto busca Datos/ como carpeta hermana del repositorio
(E:/Trabajo/DAVID/GeoVisor/Datos). Se puede correr las veces que se quiera:
siempre regenera data/ desde cero.
"""

import argparse
import json
import re
import warnings
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

warnings.filterwarnings("ignore", category=RuntimeWarning)

REPO = Path(__file__).resolve().parents[1]
SALIDA = REPO / "data"

CRS_WEB = 4326
CRS_METRICO = 9377  # MAGNA-SIRGAS 2018 / Origen Nacional

MUNICIPIOS = {"001": "Medellín", "266": "Envigado", "360": "Itagüí"}

# Códigos de la capa de amenaza por inundación. La equivalencia con el nivel
# es provisional: confirmar contra la fuente (POT Medellín).
AMENAZA = {
    "ZAIA": {"nivel": "Alta", "orden": 1},
    "ZAIM": {"nivel": "Media", "orden": 2},
    "ZAIMB": {"nivel": "Baja", "orden": 3},
}


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def rutas_fuente(datos: Path) -> dict:
    basica = datos / "Kmz_Basica"
    especial = datos / "Kmz_Especializadas"
    zip_lp = datos / "Capas_LaPresidenta_ComunaXIV.zip"
    zip_geo = datos / "Capas_Geologia_Cuenca.zip"
    zip_insp = next((datos / "Geovisor de Inspecciones Tecnicas").glob("*.zip"))
    return {
        "medellin": basica / "Medellin.kml",
        "comuna": basica / "Comuna 14.kml",
        "cuenca": basica / "Delimitación de la Cuenca.kml",
        "barrios": basica / "Barrios.kml",
        "rio": basica / "Río Medellín.kml",
        "quebrada": basica / "Quebrada La Presidenta.kml",
        "red": basica / "Red Hídrica.kml",
        "amenaza": basica / "Amenaza Inundación.kml",
        "mascerca": f"/vsizip/{especial / 'MasCerca_El_Poblado.kmz'}/doc.kml",
        "censo": f"/vsizip/{zip_lp}/export_capas/Censo_CNPV2018_ComunaXIV.geojson",
        "geologia": f"/vsizip/{zip_geo}/Geologia_Depositos_Cuenca.geojson",
        "inspecciones": f"/vsizip/{zip_insp}",
        "pavimentos": datos / "pavimentospermeables.gpkg",
        "laderas": datos / "restauracionladeras.gpkg",
        "riberas": datos / "restauracionriberas.gpkg",
        "tanques": datos / "tanquesalmacenamiento.gpkg",
    }


FAMILIAS = {
    "Polygon": ("Polygon", "MultiPolygon"),
    "LineString": ("LineString", "MultiLineString"),
    "Point": ("Point", "MultiPoint"),
}


def familia(tipo: str) -> str:
    return next(f for f, tipos in FAMILIAS.items() if tipo in tipos)


def solo_familia(geom, fam: str):
    """Deja solo las partes de la familia indicada (make_valid puede mezclar tipos)."""
    if geom is None or geom.is_empty or geom.geom_type in FAMILIAS[fam]:
        return geom
    partes = [p for p in shapely.get_parts(geom) if p.geom_type in FAMILIAS[fam]]
    if not partes:
        return None
    return shapely.union_all(partes)


def leer(ruta) -> gpd.GeoDataFrame:
    """Lee una capa, la deja en 2D, válida, de un solo tipo de geometría y en WGS84."""
    gdf = gpd.read_file(ruta)
    if gdf.crs is None:
        gdf = gdf.set_crs(CRS_WEB)
    gdf = gdf.to_crs(CRS_WEB)
    fam = familia(gdf.geom_type.dropna().mode()[0])
    geom = gdf.geometry.force_2d().make_valid()
    gdf["geometry"] = [solo_familia(g, fam) for g in geom]
    return gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].reset_index(drop=True)


def metrico(gdf: gpd.GeoDataFrame) -> gpd.GeoSeries:
    return gdf.geometry.to_crs(CRS_METRICO)


def simplificar(gdf: gpd.GeoDataFrame, tolerancia_m: float) -> gpd.GeoDataFrame:
    """Simplifica en metros conservando la topología de cada geometría."""
    if tolerancia_m <= 0:
        return gdf
    geom = metrico(gdf).simplify(tolerancia_m, preserve_topology=True)
    return gdf.set_geometry(geom.to_crs(CRS_WEB))


def parsear_descripcion(html: str) -> dict:
    """Convierte '<b>Clave:</b> valor<br>' en {'Clave': 'valor'}."""
    if not isinstance(html, str):
        return {}
    pares = re.findall(r"<b>\s*([^<:]+?)\s*:\s*</b>\s*([^<]*)", html)
    return {k.strip(): v.strip() for k, v in pares if v.strip()}


def numero(serie: pd.Series) -> pd.Series:
    return pd.to_numeric(serie, errors="coerce")


def guardar(gdf: gpd.GeoDataFrame, nombre: str, inventario: list, decimales: int = 6):
    """Escribe GeoJSON RFC 7946 con precisión de coordenadas limitada."""
    ruta = SALIDA / f"{nombre}.geojson"
    gdf = gdf.to_crs(CRS_WEB)
    # Ajustar a la rejilla aquí (y no en el escritor) mantiene las geometrías
    # válidas: los fragmentos que colapsan al redondear se eliminan.
    fam = familia(gdf.geom_type.dropna().mode()[0])
    geom = shapely.set_precision(gdf.geometry.values, 10 ** -decimales)
    gdf = gdf.set_geometry([solo_familia(g, fam) for g in geom], crs=CRS_WEB)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].reset_index(drop=True)
    gdf.to_file(
        ruta,
        driver="GeoJSON",
        engine="pyogrio",
        layer_options={"RFC7946": "YES", "COORDINATE_PRECISION": str(decimales), "WRITE_BBOX": "NO"},
    )
    kb = ruta.stat().st_size / 1024
    inventario.append({
        "capa": nombre,
        "archivo": f"data/{ruta.name}",
        "elementos": len(gdf),
        "geometria": sorted(gdf.geom_type.unique().tolist()),
        "campos": [c for c in gdf.columns if c != "geometry"],
        "tamano_kb": round(kb, 1),
        "extension": [round(v, 5) for v in gdf.total_bounds],
    })
    print(f"  {nombre:28s} {len(gdf):5d} elementos  {kb:8.1f} KB")


# --------------------------------------------------------------------------
# Capas
# --------------------------------------------------------------------------

def capa_limite(ruta, nombre: str, tolerancia: float) -> gpd.GeoDataFrame:
    gdf = leer(ruta).dissolve().reset_index(drop=True)
    gdf["nombre"] = nombre
    gdf["area_ha"] = (metrico(gdf).area / 1e4).round(1)
    return simplificar(gdf[["nombre", "area_ha", "geometry"]], tolerancia)


def capa_barrios(ruta) -> gpd.GeoDataFrame:
    gdf = leer(ruta)
    gdf = gdf.rename(columns={"Name": "nombre"}).dissolve(by="nombre").reset_index()
    gdf["area_ha"] = (metrico(gdf).area / 1e4).round(1)
    return gdf[["nombre", "area_ha", "geometry"]]


def capa_cauce(ruta, nombre: str) -> gpd.GeoDataFrame:
    gdf = leer(ruta).dissolve().reset_index(drop=True)
    gdf["nombre"] = nombre
    gdf["longitud_km"] = (metrico(gdf).length / 1000).round(2)
    return simplificar(gdf[["nombre", "longitud_km", "geometry"]], 0.5)


def capa_red_hidrica(ruta) -> gpd.GeoDataFrame:
    gdf = leer(ruta).explode(index_parts=False).reset_index(drop=True)
    gdf["jerarquia"] = gdf["Name"].str.contains("principal", case=False).map(
        {True: "Principal", False: "Secundario"})
    gdf["longitud_m"] = metrico(gdf).length.round(0)
    return simplificar(gdf[["jerarquia", "longitud_m", "geometry"]], 0.5)


def capa_amenaza(ruta) -> gpd.GeoDataFrame:
    gdf = leer(ruta).rename(columns={"Name": "codigo"})
    gdf = gdf.dissolve(by="codigo").reset_index()
    gdf["nivel"] = gdf["codigo"].map(lambda c: AMENAZA.get(c, {}).get("nivel", "Sin clasificar"))
    gdf["orden"] = gdf["codigo"].map(lambda c: AMENAZA.get(c, {}).get("orden", 9))
    gdf["area_ha"] = (metrico(gdf).area / 1e4).round(2)
    gdf = gdf.sort_values("orden").reset_index(drop=True)
    return simplificar(gdf[["codigo", "nivel", "orden", "area_ha", "geometry"]], 0.5)


def capa_geologia(ruta) -> gpd.GeoDataFrame:
    gdf = leer(ruta)
    gdf = gdf.rename(columns={"UG": "unidad", "ORIGEN": "origen", "TIPO": "tipo",
                              "NIVEL": "nivel", "INCISION": "incision"})
    gdf["unidad"] = gdf["unidad"].fillna(gdf["origen"])
    gdf["area_ha"] = (metrico(gdf).area / 1e4).round(2)
    cols = ["unidad", "origen", "tipo", "nivel", "incision", "area_ha", "geometry"]
    return simplificar(gdf[cols], 0.5)


def capa_inspecciones(ruta) -> gpd.GeoDataFrame:
    gdf = leer(ruta)
    campos = {
        "Evento_id": "evento_id",
        "direccion": "direccion",
        "vereda_nombre": "barrio",
        "comuna_corregimiento_nombre": "comuna",
        "fecha_ocurrencia": "fecha_ocurrencia",
        "fecha_registro": "fecha_registro",
        "fecha_visita": "fecha_visita",
        "fenomeno_amenazante_nombre": "fenomeno",
        "tipo_incidente_nombre": "tipo_incidente",
        "tipo_incidente_fenomeno_nombre": "tipo_incidente_fenomeno",
        "origen_nombre": "origen",
        "evento_materializado": "evento_materializado",
        "puntaje_amenaza": "puntaje_amenaza",
        "puntaje_vulnerabilidad": "puntaje_vulnerabilidad",
        "puntaje_riesgo": "puntaje_riesgo",
        "elementos_expuestos": "elementos_expuestos",
        "numero_muertos": "muertos",
        "numero_lesionados": "lesionados",
        "numero_evacuacion_temporal": "evacuacion_temporal",
        "numero_evacuacion_definitiva": "evacuacion_definitiva",
        "tipo_evacu": "tipo_evacuacion",
        "tipo_recepcion": "tipo_recepcion",
        "Estado3": "estado",
        "url_nuevo_informe_tecnico": "url_informe",
    }
    gdf = gdf.rename(columns=campos)[list(campos.values()) + ["geometry"]]
    for c in ["puntaje_amenaza", "puntaje_vulnerabilidad", "puntaje_riesgo"]:
        gdf[c] = numero(gdf[c]).round(2)
    for c in ["elementos_expuestos", "muertos", "lesionados",
              "evacuacion_temporal", "evacuacion_definitiva"]:
        gdf[c] = numero(gdf[c]).astype("Int64")
    for c in ["fecha_ocurrencia", "fecha_registro", "fecha_visita"]:
        gdf[c] = pd.to_datetime(gdf[c], errors="coerce").dt.strftime("%Y-%m-%d")
    # Varias inspecciones no tienen fecha de ocurrencia: para ordenar y filtrar
    # en el tiempo se usa la de registro como respaldo.
    gdf["fecha_referencia"] = gdf["fecha_ocurrencia"].fillna(gdf["fecha_registro"])
    return gdf.sort_values("fecha_referencia").reset_index(drop=True)


def capa_mascerca(ruta) -> gpd.GeoDataFrame:
    gdf = leer(ruta)
    filas = []
    for _, r in gdf.iterrows():
        attrs = parsear_descripcion(r.get("description"))
        filas.append({
            "nombre": r.get("Name"),
            "direccion": attrs.get("Dirección"),
            "barrio": attrs.get("Barrio"),
            "comuna": attrs.get("Comuna"),
            "detalle": "; ".join(f"{k}: {v}" for k, v in attrs.items()
                                 if k not in ("Dirección", "Barrio", "Comuna")) or None,
        })
    return gpd.GeoDataFrame(filas, geometry=gdf.geometry.values, crs=CRS_WEB)


def capa_propuesta(ruta, tipo: str, descripcion: str) -> gpd.GeoDataFrame:
    gdf = leer(ruta).explode(index_parts=False).reset_index(drop=True)
    gdf["tipo"] = tipo
    gdf["descripcion"] = descripcion
    if gdf.geom_type.isin(["Polygon", "MultiPolygon"]).all():
        gdf["area_ha"] = (metrico(gdf).area / 1e4).round(2)
        cols = ["tipo", "descripcion", "area_ha", "geometry"]
    else:
        cols = ["tipo", "descripcion", "geometry"]
    gdf["id"] = range(1, len(gdf) + 1)
    return gdf[["id"] + cols]


def capa_censo(ruta, cuenca, comuna, barrios, amenaza) -> gpd.GeoDataFrame:
    gdf = leer(ruta)
    num = [c for c in gdf.columns if c not in ("geometry", "COD_DANE_A", "MPIO_CCDGO")]
    for c in num:
        gdf[c] = numero(gdf[c]).fillna(0)

    out = gpd.GeoDataFrame({
        "cod_dane": gdf["COD_DANE_A"],
        "municipio": gdf["MPIO_CCDGO"].map(MUNICIPIOS).fillna(gdf["MPIO_CCDGO"]),
        "personas": gdf["total_per"].astype(int),
        "hogares": gdf["total_hog"].astype(int),
        "viviendas": gdf["total_viv"].astype(int),
        "personas_may_60": gdf["per_may_60"].astype(int),
        "personas_men_15": gdf["per_men_15"].astype(int),
        "personas_con_dificultad": gdf["dificul_si"].astype(int),
        "personas_sin_educacion": gdf["no_educaci"].astype(int),
        "viv_acueducto": gdf["acueducto"].astype(int),
        "viv_alcantarillado": gdf["alcantari"].astype(int),
        "viv_energia": gdf["electrica"].astype(int),
        "viv_internet": gdf["internet"].astype(int),
    }, geometry=gdf.geometry, crs=CRS_WEB)

    geom_m = metrico(out)
    area_m2 = geom_m.area
    out["area_ha"] = (area_m2 / 1e4).round(3)
    out["densidad_hab_ha"] = (out["personas"] / (area_m2 / 1e4)).round(1)

    def pct(parte, total):
        return (100 * parte / total.where(total > 0)).round(1)

    out["pct_may_60"] = pct(out["personas_may_60"], out["personas"])
    out["pct_men_15"] = pct(out["personas_men_15"], out["personas"])
    out["pct_viv_internet"] = pct(out["viv_internet"], out["viviendas"])

    # Pertenencia territorial (por punto interior, para no partir manzanas)
    punto = gpd.GeoDataFrame(geometry=geom_m.representative_point(), crs=CRS_METRICO)
    out["en_cuenca"] = punto.within(metrico(cuenca).union_all()).values
    out["en_comuna14"] = punto.within(metrico(comuna).union_all()).values
    union_barrios = gpd.sjoin(
        punto, barrios.to_crs(CRS_METRICO)[["nombre", "geometry"]],
        how="left", predicate="within")
    out["barrio"] = union_barrios.groupby(level=0)["nombre"].first().reindex(out.index).values

    # Exposición a amenaza por inundación: ponderación por área
    amz = amenaza.to_crs(CRS_METRICO)
    for _, a in amz.iterrows():
        frac = (geom_m.intersection(a.geometry).area / area_m2).fillna(0)
        out[f"pob_amenaza_{a['nivel'].lower()}"] = (out["personas"] * frac).round(1)
    cols_amz = [c for c in out.columns if c.startswith("pob_amenaza_")]
    out["pob_amenaza_total"] = out[cols_amz].sum(axis=1).round(1)

    return simplificar(out, 0.5)


# --------------------------------------------------------------------------
# Resumen
# --------------------------------------------------------------------------

def resumen_censo(censo: pd.DataFrame) -> dict:
    cols_amz = [c for c in censo.columns if c.startswith("pob_amenaza_")]

    def agregar(df):
        return {
            "manzanas": int(len(df)),
            "personas": int(df["personas"].sum()),
            "hogares": int(df["hogares"].sum()),
            "viviendas": int(df["viviendas"].sum()),
            "personas_may_60": int(df["personas_may_60"].sum()),
            "personas_men_15": int(df["personas_men_15"].sum()),
            **{c: round(float(df[c].sum())) for c in cols_amz},
        }

    return {
        "total_capa": agregar(censo),
        "por_municipio": {m: agregar(d) for m, d in censo.groupby("municipio")},
        "cuenca": agregar(censo[censo["en_cuenca"]]),
        "comuna_14": agregar(censo[censo["en_comuna14"]]),
        "por_barrio": {b: agregar(d) for b, d in censo.dropna(subset=["barrio"]).groupby("barrio")},
    }


# --------------------------------------------------------------------------
# Principal
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datos", type=Path, default=REPO.parent / "Datos",
                    help="Carpeta con los datos crudos (por defecto ../Datos)")
    args = ap.parse_args()

    src = rutas_fuente(args.datos)
    SALIDA.mkdir(exist_ok=True)
    for viejo in SALIDA.glob("*.geojson"):
        viejo.unlink()

    inventario = []
    print("Contexto territorial")
    medellin = capa_limite(src["medellin"], "Municipio de Medellín", 5)
    comuna = capa_limite(src["comuna"], "Comuna 14 - El Poblado", 1)
    cuenca = capa_limite(src["cuenca"], "Cuenca Quebrada La Presidenta", 0.5)
    barrios = capa_barrios(src["barrios"])
    mascerca = capa_mascerca(src["mascerca"])

    print("Hidrografía y amenaza")
    rio = capa_cauce(src["rio"], "Río Medellín")
    quebrada = capa_cauce(src["quebrada"], "Quebrada La Presidenta")
    red = capa_red_hidrica(src["red"])
    amenaza = capa_amenaza(src["amenaza"])
    geologia = capa_geologia(src["geologia"])
    inspecciones = capa_inspecciones(src["inspecciones"])

    print("Propuestas de intervención")
    pavimentos = capa_propuesta(src["pavimentos"], "Pavimentos permeables", "")
    laderas = capa_propuesta(src["laderas"], "Restauración de laderas", "")
    riberas = capa_propuesta(src["riberas"], "Restauración de riberas", "")
    tanques = capa_propuesta(src["tanques"], "Tanques de almacenamiento", "")

    print("Censo CNPV 2018")
    censo = capa_censo(src["censo"], cuenca, comuna, barrios, amenaza)

    # Enriquecer barrios e inspecciones con datos derivados
    cen_b = censo.dropna(subset=["barrio"]).groupby("barrio")
    barrios["personas"] = barrios["nombre"].map(cen_b["personas"].sum()).fillna(0).astype(int)
    barrios["hogares"] = barrios["nombre"].map(cen_b["hogares"].sum()).fillna(0).astype(int)
    barrios["viviendas"] = barrios["nombre"].map(cen_b["viviendas"].sum()).fillna(0).astype(int)
    barrios["pob_amenaza_total"] = barrios["nombre"].map(cen_b["pob_amenaza_total"].sum()).fillna(0).round(0).astype(int)
    barrios["inspecciones"] = barrios["nombre"].map(inspecciones["barrio"].value_counts()).fillna(0).astype(int)
    barrios = simplificar(barrios, 0.5)

    print("\nEscribiendo data/")
    guardar(medellin, "limite_medellin", inventario, 5)
    guardar(comuna, "comuna_14", inventario)
    guardar(cuenca, "cuenca_la_presidenta", inventario)
    guardar(barrios, "barrios_afectados", inventario)
    guardar(mascerca, "mascerca_el_poblado", inventario)
    guardar(rio, "rio_medellin", inventario)
    guardar(quebrada, "quebrada_la_presidenta", inventario)
    guardar(red, "red_hidrica", inventario)
    guardar(amenaza, "amenaza_inundacion", inventario)
    guardar(geologia, "geologia_depositos", inventario)
    guardar(inspecciones, "inspecciones_tecnicas", inventario)
    guardar(pavimentos, "propuesta_pavimentos_permeables", inventario)
    guardar(laderas, "propuesta_restauracion_laderas", inventario)
    guardar(riberas, "propuesta_restauracion_riberas", inventario)
    guardar(tanques, "propuesta_tanques_almacenamiento", inventario)
    guardar(censo, "censo_manzanas", inventario, 5)  # 5 decimales ≈ 1 m

    # Controles de calidad que conviene revisar a mano
    cuenca_m = metrico(cuenca).union_all()
    avisos = []
    if metrico(geologia).intersection(cuenca_m).area.sum() == 0:
        avisos.append("La capa de geología no se superpone con la cuenca; revisar ubicación o fuente.")
    fuera = (~censo["en_cuenca"]).sum()
    avisos.append(f"El censo trae {len(censo)} manzanas; {fuera} quedan fuera de la cuenca "
                  f"(municipios: {', '.join(sorted(censo['municipio'].unique()))}).")
    avisos.append("La equivalencia ZAIA/ZAIM/ZAIMB → Alta/Media/Baja es provisional.")

    resumen = {
        "generado": date.today().isoformat(),
        "cuenca": {
            "area_ha": float(cuenca["area_ha"].iloc[0]),
            "longitud_quebrada_km": float(quebrada["longitud_km"].iloc[0]),
            "longitud_red_hidrica_km": round(float(red["longitud_m"].sum()) / 1000, 2),
        },
        "amenaza_inundacion_ha": dict(zip(amenaza["nivel"], amenaza["area_ha"].astype(float))),
        "inspecciones": {
            "total": int(len(inspecciones)),
            "por_fenomeno": inspecciones["fenomeno"].value_counts().to_dict(),
            "por_barrio": inspecciones["barrio"].value_counts().to_dict(),
            "rango_fechas": [inspecciones["fecha_ocurrencia"].dropna().min(),
                             inspecciones["fecha_ocurrencia"].dropna().max()],
        },
        "propuestas": {
            "pavimentos_permeables_ha": round(float(pavimentos["area_ha"].sum()), 2),
            "restauracion_laderas_ha": round(float(laderas["area_ha"].sum()), 2),
            "restauracion_riberas_ha": round(float(riberas["area_ha"].sum()), 2),
            "tanques_almacenamiento": int(len(tanques)),
        },
        "censo": resumen_censo(censo),
        "avisos": avisos,
        "capas": inventario,
    }
    (SALIDA / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")

    total_kb = sum(c["tamano_kb"] for c in inventario)
    print(f"\nTotal: {len(inventario)} capas, {total_kb / 1024:.2f} MB")
    print("\nAvisos:")
    for a in avisos:
        print(" -", a)


if __name__ == "__main__":
    main()
