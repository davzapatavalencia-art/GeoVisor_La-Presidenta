// Gestión de capas: carga diferida, estilos, opacidad e identificación por clic.

import { funcionEstilo, crearMarcador, clasificar, opcionesLeaflet } from "./estilos.js";
import { contenidoPopup } from "./popups.js";

const OPCIONES_POPUP = { className: "popup-visor", maxWidth: 300, minWidth: 280, autoPanPadding: [24, 24] };

export class GestorCapas extends EventTarget {
  constructor(mapa, grupos) {
    super();
    this.mapa = mapa;
    this.confs = new Map();
    this.estado = new Map();

    for (const grupo of grupos) {
      for (const conf of grupo.capas) {
        this.confs.set(conf.id, { ...conf, grupo: grupo.id });
        this.estado.set(conf.id, {
          activa: false,
          opacidad: 1,
          capa: null,
          datos: null,
          variable: conf.estilo.variables?.[0]?.campo ?? null,
          clasificacion: null,
        });
        const pane = mapa.createPane(`capa-${conf.id}`);
        pane.style.zIndex = String(400 + (conf.orden ?? 0));
      }
    }

    this.resaltado = L.layerGroup().addTo(mapa);
    mapa.createPane("resaltado").style.zIndex = "590";
    mapa.on("click", (e) => this.identificar(e));
    mapa.on("popupclose", () => this.resaltado.clearLayers());
  }

  get activas() {
    return [...this.confs.values()].filter((c) => this.estado.get(c.id).activa);
  }

  async alternar(id, activar) {
    const est = this.estado.get(id);
    if (activar === est.activa) return;
    if (activar) {
      await this.cargar(id);
      est.capa.addTo(this.mapa);
    } else if (est.capa) {
      this.mapa.removeLayer(est.capa);
    }
    est.activa = activar;
    this.emitir();
  }

  async cargar(id) {
    const est = this.estado.get(id);
    if (est.capa) return;
    const conf = this.confs.get(id);
    this.dispatchEvent(new CustomEvent("carga", { detail: { id, cargando: true } }));
    try {
      const resp = await fetch(conf.archivo);
      if (!resp.ok) throw new Error(`${resp.status} ${conf.archivo}`);
      est.datos = await resp.json();
      est.datos.features.forEach((f) => { f._bbox = cajaFeature(f.geometry); });
      if (conf.estilo.tipo === "coropleta") this.reclasificar(id);
      est.capa = this.construir(conf, est);
    } finally {
      this.dispatchEvent(new CustomEvent("carga", { detail: { id, cargando: false } }));
    }
  }

  construir(conf, est) {
    const pane = `capa-${conf.id}`;
    const estilo = funcionEstilo(conf, est);
    const esLinea = (f) => /LineString/.test(f.geometry.type);

    return L.geoJSON(est.datos, {
      pane,
      style: estilo,
      // Los polígonos no capturan el clic: se identifican todos a la vez (ver identificar)
      interactive: true,
      onEachFeature: (f, capa) => {
        const esPoligono = /Polygon/.test(f.geometry.type);
        if (esPoligono) capa.options.interactive = false;
        if (conf.etiqueta && f.properties[conf.etiqueta]) {
          capa.bindTooltip(String(f.properties[conf.etiqueta]), {
            permanent: true, direction: "center", className: "etiqueta-mapa", pane: "tooltipPane",
          });
        }
        if (!conf.popup || esPoligono) {
          if (!conf.popup && !esPoligono) capa.options.interactive = false;
          return;
        }
        capa.options.bubblingMouseEvents = false;
        capa.bindPopup(() => contenidoPopup(conf.popup, f.properties, colorFeature(conf, f)), OPCIONES_POPUP);
        if (esLinea(f)) {
          capa.on("mouseover", () => capa.setStyle({ weight: (estilo(f).weight ?? 2) + 2 }));
          capa.on("mouseout", () => capa.setStyle(estilo(f)));
        }
      },
      pointToLayer: (f, latlng) => crearMarcador(conf.estilo, latlng, pane),
    });
  }

  opacidad(id, valor) {
    this.estado.get(id).opacidad = valor;
    this.mapa.getPane(`capa-${id}`).style.opacity = String(valor);
  }

  cambiarVariable(id, campo) {
    const est = this.estado.get(id);
    est.variable = campo;
    if (!est.datos) return;
    this.reclasificar(id);
    est.capa.eachLayer((l) => est.capa.resetStyle(l));
    this.emitir();
  }

  reclasificar(id) {
    const conf = this.confs.get(id);
    const est = this.estado.get(id);
    est.clasificacion = clasificar(est.datos.features, est.variable, conf.estilo.campoDestacado, conf.estilo.clases ?? 5);
  }

  async limites(id) {
    await this.cargar(id);
    return this.estado.get(id).capa.getBounds();
  }

  /** Busca un elemento por valor de atributo, lo encuadra y abre su ficha. */
  async mostrarElemento(id, campo, valor, padding) {
    if (!this.estado.get(id).activa) await this.alternar(id, true);
    const est = this.estado.get(id);
    const conf = this.confs.get(id);
    const f = est.datos.features.find((x) => x.properties[campo] === valor);
    if (!f) return;
    const limites = L.geoJSON(f).getBounds();
    this.mapa.flyToBounds(limites, { ...padding, maxZoom: 17, duration: 0.8 });
    this.mapa.once("moveend", () => {
      L.popup(OPCIONES_POPUP)
        .setLatLng(limites.getCenter())
        .setContent(contenidoPopup(conf.popup, f.properties, colorFeature(conf, f)))
        .openOn(this.mapa);
      this.resaltar(f);
    });
  }

  /** Clic en el mapa: reúne en una sola ficha todos los polígonos activos bajo el punto. */
  identificar(e) {
    const p = [e.latlng.lng, e.latlng.lat];
    const hallazgos = this.activas
      .filter((c) => c.popup)
      .flatMap((conf) => {
        const est = this.estado.get(conf.id);
        const f = est.datos.features.find((x) => /Polygon/.test(x.geometry.type) && dentroCaja(p, x._bbox) && puntoEnGeometria(p, x.geometry));
        return f ? [{ conf, f }] : [];
      })
      // De lo más específico (área menor) a lo más general
      .sort((a, b) => areaCaja(a.f._bbox) - areaCaja(b.f._bbox));
    if (!hallazgos.length) return;

    this.resaltar(hallazgos[0].f);
    const html = hallazgos.slice(0, 4)
      .map(({ conf, f }) => `<section class="popup-seccion">${contenidoPopup(conf.popup, f.properties, colorFeature(conf, f))}</section>`)
      .join("");
    L.popup(OPCIONES_POPUP).setLatLng(e.latlng).setContent(html).openOn(this.mapa);
    // openOn dispara popupclose del anterior, que limpia el resaltado; se vuelve a dibujar
    this.resaltar(hallazgos[0].f);
  }

  resaltar(feature) {
    this.resaltado.clearLayers();
    L.geoJSON(feature, {
      pane: "resaltado",
      interactive: false,
      style: opcionesLeaflet({ color: "#ffffff", peso: 2.5, guiones: "4 5", relleno: "#ffffff", opacidadRelleno: 0.08 }),
    }).addTo(this.resaltado);
  }

  emitir() {
    this.dispatchEvent(new CustomEvent("cambio"));
  }
}

function colorFeature(conf, f) {
  const e = conf.estilo;
  if (e.tipo === "categorias") {
    const cat = e.categorias.find((c) => c.valor === f.properties[e.campo]);
    return cat?.estilo.color ?? e.base?.color ?? "#F1B621";
  }
  if (e.tipo === "coropleta") return e.paleta[e.paleta.length - 1];
  return e.color ?? "#F1B621";
}

// ---------------------------------------------------------------------------
// Geometría: caja envolvente y punto en polígono (par-impar, con huecos)
// ---------------------------------------------------------------------------

function cajaFeature(geom) {
  const caja = [Infinity, Infinity, -Infinity, -Infinity];
  const recorrer = (c) => {
    if (typeof c[0] === "number") {
      caja[0] = Math.min(caja[0], c[0]); caja[1] = Math.min(caja[1], c[1]);
      caja[2] = Math.max(caja[2], c[0]); caja[3] = Math.max(caja[3], c[1]);
    } else c.forEach(recorrer);
  };
  if (geom?.coordinates?.length) recorrer(geom.coordinates);
  return caja;
}

function areaCaja(c) {
  return (c[2] - c[0]) * (c[3] - c[1]);
}

function dentroCaja([x, y], c) {
  return x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3];
}

function puntoEnAnillos([x, y], anillos) {
  let dentro = false;
  for (const anillo of anillos) {
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i];
      const [xj, yj] = anillo[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

function puntoEnGeometria(p, geom) {
  if (geom.type === "Polygon") return puntoEnAnillos(p, geom.coordinates);
  if (geom.type === "MultiPolygon") return geom.coordinates.some((poli) => puntoEnAnillos(p, poli));
  return false;
}
