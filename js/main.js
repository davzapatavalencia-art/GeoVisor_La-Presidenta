// Punto de entrada del GeoVisor La Presidenta.

import { GestorCapas } from "./capas.js";
import { Panel } from "./panel.js";
import { icono, escapar } from "./util.js";

const esMovil = () => window.matchMedia("(max-width: 760px)").matches;

/** Margen que debe dejar el mapa libre según dónde esté el panel. */
function rellenoMapa() {
  const panel = document.getElementById("panel");
  if (esMovil()) {
    return { paddingTopLeft: [20, 70], paddingBottomRight: [20, panel.offsetHeight + 20] };
  }
  const ancho = panel.classList.contains("oculto") ? 0 : panel.offsetWidth + 16;
  return { paddingTopLeft: [ancho + 30, 70], paddingBottomRight: [80, 40] };
}

async function cargarJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo cargar ${url} (${resp.status})`);
  return resp.json();
}

function crearMapa() {
  const mapa = L.map("mapa", {
    zoomControl: false,
    minZoom: 11,
    maxZoom: 20,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 90,
    center: [6.205, -75.555],
    zoom: 14,
  });
  mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 120 }).addTo(mapa);

  // Etiquetas solo con zoom cercano
  const ajustarEtiquetas = () => mapa.getContainer().classList.toggle("zoom-lejos", mapa.getZoom() < 14.5);
  mapa.on("zoomend", ajustarEtiquetas);
  ajustarEtiquetas();
  return mapa;
}

function mapasBase(mapa, config) {
  const contenedor = document.getElementById("mapas-base");
  const capas = new Map();
  let actual = null;

  const elegir = (id) => {
    if (actual) mapa.removeLayer(capas.get(actual));
    capas.get(id).addTo(mapa);
    actual = id;
    contenedor.querySelectorAll(".mapa-base").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
  };

  for (const mb of config.mapasBase) {
    capas.set(mb.id, L.tileLayer(mb.url, {
      attribution: mb.atribucion,
      maxZoom: mb.maxZoom ?? 20,
      maxNativeZoom: mb.maxNativeZoom ?? mb.maxZoom ?? 19,
      subdomains: "abcd",
      detectRetina: false,
    }));
    const boton = document.createElement("button");
    boton.className = "mapa-base";
    boton.type = "button";
    boton.dataset.id = mb.id;
    boton.setAttribute("role", "radio");
    boton.textContent = mb.nombre;
    boton.addEventListener("click", () => elegir(mb.id));
    contenedor.append(boton);
  }
  elegir(config.visor.mapaBase ?? config.mapasBase[0].id);
}

function controles(mapa, encuadrar) {
  const contenedor = document.getElementById("controles");
  const botones = [
    ["mas", "Acercar", () => mapa.zoomIn()],
    ["menos", "Alejar", () => mapa.zoomOut()],
    null,
    ["casa", "Ver toda la cuenca", encuadrar],
    ["ubicar", "Mi ubicación", () => mapa.locate({ setView: true, maxZoom: 17 })],
  ];
  for (const b of botones) {
    if (!b) { contenedor.append(document.createElement("hr")); continue; }
    const [ic, titulo, accion] = b;
    const boton = document.createElement("button");
    boton.className = "boton-icono";
    boton.type = "button";
    boton.title = titulo;
    boton.setAttribute("aria-label", titulo);
    boton.innerHTML = icono(ic);
    boton.addEventListener("click", accion);
    contenedor.append(boton);
  }

  let marcaUbicacion = null;
  mapa.on("locationfound", (e) => {
    marcaUbicacion?.remove();
    marcaUbicacion = L.circleMarker(e.latlng, { radius: 7, color: "#fff", weight: 2, fillColor: "#3FA9F5", fillOpacity: 1 }).addTo(mapa);
  });
  mapa.on("locationerror", () => alert("No fue posible obtener tu ubicación."));
}

function coordenadas(mapa) {
  const caja = document.getElementById("coordenadas");
  const f = (v) => v.toFixed(5);
  mapa.on("mousemove", (e) => { caja.textContent = `${f(e.latlng.lat)}° N · ${f(Math.abs(e.latlng.lng))}° O`; });
  mapa.on("mouseout", () => { caja.textContent = ""; });
}

async function iniciar() {
  const [config, resumen] = await Promise.all([cargarJSON("config/capas.json"), cargarJSON("data/resumen.json")]);
  document.title = `GeoVisor ${config.visor.titulo} · ${config.visor.institucion}`;

  const mapa = crearMapa();
  mapasBase(mapa, config);
  coordenadas(mapa);

  const gestor = new GestorCapas(mapa, config.grupos);
  const aviso = document.getElementById("cargando");
  let pendientes = 0;
  gestor.addEventListener("carga", (e) => {
    pendientes += e.detail.cargando ? 1 : -1;
    aviso.hidden = pendientes === 0;
  });

  const encuadrar = async () => {
    const limites = await gestor.limites(config.visor.capaEncuadre);
    mapa.flyToBounds(limites, { ...rellenoMapa(), duration: 0.8 });
  };
  controles(mapa, encuadrar);

  new Panel({ config, resumen, gestor, alEncuadrar: encuadrar, rellenoMapa });

  const iniciales = config.grupos.flatMap((g) => g.capas).filter((c) => c.visible).map((c) => c.id);
  await Promise.all(iniciales.map((id) => gestor.alternar(id, true)));
  // Esperar a que el diseño (p. ej. la hoja móvil) tenga su tamaño final antes de encuadrar
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  mapa.invalidateSize();
  const limites = await gestor.limites(config.visor.capaEncuadre);
  mapa.fitBounds(limites, rellenoMapa());
}

iniciar().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend",
    `<div class="cargando" style="top:50%">No se pudo iniciar el visor: ${escapar(err.message)}</div>`);
});
