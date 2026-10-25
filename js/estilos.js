// Traduce los estilos de config/capas.json a opciones de Leaflet y a leyendas.

import { escapar, formatear } from "./util.js";

/** Convierte un estilo de la configuración en opciones de trazado de Leaflet. */
export function opcionesLeaflet(estilo = {}) {
  const sinRelleno = !estilo.relleno || estilo.relleno === "none";
  return {
    color: estilo.color ?? "#ffffff",
    weight: estilo.peso ?? 1.5,
    opacity: estilo.opacidad ?? 1,
    dashArray: estilo.guiones ?? null,
    fill: !sinRelleno,
    fillColor: sinRelleno ? undefined : estilo.relleno,
    fillOpacity: estilo.opacidadRelleno ?? 0.25,
    lineCap: "round",
    lineJoin: "round",
  };
}

function estiloCategoria(conf, valor) {
  const cat = conf.estilo.categorias.find((c) => c.valor === valor);
  return { ...conf.estilo.base, ...(cat?.estilo ?? {}) };
}

/** Clasificación por cuantiles de la variable activa, solo con las manzanas destacadas. */
export function clasificar(features, campo, campoDestacado, clases) {
  const valores = features
    .filter((f) => !campoDestacado || f.properties[campoDestacado])
    .map((f) => f.properties[campo])
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(v));

  // Si muchos valores son cero (p. ej. población expuesta), el cero va en una clase aparte
  const ceros = valores.filter((v) => v === 0).length;
  const ceroAparte = ceros / Math.max(valores.length, 1) > 0.3;
  const base = (ceroAparte ? valores.filter((v) => v > 0) : valores).sort((a, b) => a - b);
  if (!base.length) return { cortes: [], ceroAparte, min: 0 };

  const cortes = [];
  for (let i = 1; i <= clases; i++) {
    const idx = Math.min(base.length - 1, Math.ceil((i / clases) * base.length) - 1);
    const v = base[idx];
    if (!cortes.length || v > cortes[cortes.length - 1]) cortes.push(v);
  }
  return { cortes, ceroAparte, min: base[0] };
}

function colorCoropleta(valor, clasif, paleta) {
  if (valor === null || valor === undefined) return null;
  if (clasif.ceroAparte && valor === 0) return "cero";
  const n = clasif.cortes.length;
  const i = clasif.cortes.findIndex((c) => valor <= c);
  const clase = i === -1 ? n - 1 : i;
  // Reparte la paleta si hay menos clases que colores
  const idx = n <= 1 ? paleta.length - 1 : Math.round((clase / (n - 1)) * (paleta.length - 1));
  return paleta[idx];
}

/** Devuelve la función de estilo para L.geoJSON según el tipo de estilo de la capa. */
export function funcionEstilo(conf, estado) {
  const e = conf.estilo;
  switch (e.tipo) {
    case "categorias":
      return (f) => opcionesLeaflet(estiloCategoria(conf, f.properties[e.campo]));
    case "coropleta":
      return (f) => {
        const p = f.properties;
        if (e.campoDestacado && !p[e.campoDestacado]) return opcionesLeaflet(e.contexto);
        const color = colorCoropleta(p[estado.variable], estado.clasificacion, e.paleta);
        if (color === null) return opcionesLeaflet({ color: "#6F879C", peso: 0.4, relleno: "#6F879C", opacidadRelleno: 0.12 });
        if (color === "cero") return opcionesLeaflet({ color: "#9FB3C8", peso: 0.4, opacidad: 0.5, relleno: "#9FB3C8", opacidadRelleno: 0.1 });
        return opcionesLeaflet({ color: "#04131F", peso: 0.4, opacidad: 0.6, relleno: color, opacidadRelleno: 0.82 });
      };
    default:
      return () => opcionesLeaflet(e);
  }
}

/** Marcador HTML para capas de puntos. */
export function crearMarcador(estilo, latlng, pane) {
  const forma = estilo.forma ?? "pulso";
  const tam = (estilo.radio ?? 7) * 2;
  return L.marker(latlng, {
    pane,
    icon: L.divIcon({
      className: `marcador marcador-${forma}`,
      html: `<span style="--c:${estilo.color}"></span>`,
      iconSize: [tam, tam],
      popupAnchor: [0, -tam / 2],
    }),
    keyboard: true,
  });
}

// ---------------------------------------------------------------------------
// Leyendas
// ---------------------------------------------------------------------------

function tieneRelleno(e) {
  if (e.tipo === "categorias") {
    return [e.base, ...e.categorias.map((c) => c.estilo)].some((s) => s?.relleno && s.relleno !== "none");
  }
  return e.relleno && e.relleno !== "none";
}

export function simbolo(estilo, familia) {
  if (familia === "punto") {
    const forma = estilo.forma === "cuadro" ? "cuadro" : estilo.forma === "rombo" ? "rombo" : "punto";
    return `<i class="simbolo simbolo-${forma}" style="background:${estilo.color}"></i>`;
  }
  if (familia === "area") {
    const relleno = estilo.relleno && estilo.relleno !== "none" ? estilo.relleno : "transparent";
    const op = Math.min(1, Math.max(0.25, (estilo.opacidadRelleno ?? 0.25) * 1.6));
    return `<i class="simbolo simbolo-area" style="border-color:${estilo.color};background:${hexAlfa(relleno, op)}"></i>`;
  }
  const grosor = Math.max(2, Math.min(5, estilo.peso ?? 2));
  return `<i class="simbolo simbolo-linea${estilo.guiones ? " guiones" : ""}" style="border-color:${estilo.color};border-top-width:${grosor}px;opacity:${estilo.opacidad ?? 1}"></i>`;
}

export function familiaGeometrica(conf) {
  if (conf.estilo.tipo === "punto") return "punto";
  if (conf.estilo.tipo === "coropleta") return "area";
  return tieneRelleno(conf.estilo) ? "area" : "linea";
}

/** HTML de la leyenda de una capa (sin título). */
export function leyendaCapa(conf, estado) {
  const e = conf.estilo;
  const familia = familiaGeometrica(conf);

  if (e.tipo === "categorias") {
    return `<div class="items-leyenda">${e.categorias.map((c) => `
      <div class="item-leyenda">${simbolo({ ...e.base, ...c.estilo }, familia)}<span>${escapar(c.etiqueta ?? c.valor)}</span></div>`).join("")}
    </div>`;
  }

  if (e.tipo === "coropleta") {
    const variable = e.variables.find((v) => v.campo === estado.variable);
    const { cortes, ceroAparte, min } = estado.clasificacion ?? { cortes: [] };
    const items = [];
    if (ceroAparte) items.push([`<i class="simbolo simbolo-area" style="border-color:#9FB3C8;background:${hexAlfa("#9FB3C8", 0.2)}"></i>`, "0"]);
    cortes.forEach((hasta, i) => {
      const n = cortes.length;
      const color = e.paleta[n <= 1 ? e.paleta.length - 1 : Math.round((i / (n - 1)) * (e.paleta.length - 1))];
      // Cada clase empieza justo después del corte anterior
      const anterior = i === 0 ? null : cortes[i - 1];
      const desde = anterior === null ? min : variable.formato === "entero" ? anterior + 1 : anterior;
      const rango = desde >= hasta
        ? formatear(hasta, variable.formato)
        : `${anterior !== null && variable.formato !== "entero" ? "&gt; " : ""}${formatear(desde, variable.formato)} – ${formatear(hasta, variable.formato)}`;
      items.push([`<i class="simbolo simbolo-area" style="border-color:${color};background:${color}"></i>`, rango]);
    });
    items.push([simbolo(e.contexto, "area"), "Fuera de la cuenca (contexto)"]);
    return `<div class="escala-coropleta">
      <div class="item-leyenda" style="color:var(--texto);margin-bottom:2px">${escapar(variable.etiqueta)}</div>
      ${items.map(([s, t]) => `<div class="item-leyenda">${s}<span>${t}</span></div>`).join("")}
    </div>`;
  }

  return `<div class="items-leyenda"><div class="item-leyenda">${simbolo(e, familia)}<span>${escapar(conf.nombre)}</span></div></div>`;
}

/** Muestra pequeña para la fila de la capa en el panel. */
export function muestraCapa(conf) {
  const e = conf.estilo;
  const familia = familiaGeometrica(conf);
  if (e.tipo === "categorias") return simbolo({ ...e.base, ...e.categorias[0].estilo }, familia);
  if (e.tipo === "coropleta") {
    return `<i class="simbolo simbolo-area" style="border:0;background:linear-gradient(90deg,${e.paleta.join(",")})"></i>`;
  }
  return simbolo(e, familia);
}

function hexAlfa(hex, alfa) {
  if (!hex || hex === "transparent" || !hex.startsWith("#")) return "transparent";
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
