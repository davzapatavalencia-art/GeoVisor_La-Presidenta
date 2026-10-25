// Construye el contenido HTML de los popups a partir de la configuración de cada capa.

import { escapar, formatear, plantilla, icono } from "./util.js";

export function contenidoPopup(confPopup, props, color) {
  const titulo = plantilla(confPopup.titulo, props) || "Elemento";
  const subtitulo = plantilla(confPopup.subtitulo, props);

  const campos = (confPopup.campos ?? [])
    .filter((c) => props[c.campo] !== null && props[c.campo] !== undefined && props[c.campo] !== "")
    .map((c) => {
      const valor = formatear(props[c.campo], c.formato);
      const unidad = c.unidad ? ` ${escapar(c.unidad)}` : "";
      // Los textos largos (direcciones, estados) ocupan su propia fila
      const largo = !c.formato && String(props[c.campo]).length > 18 ? ' class="largo"' : "";
      return `<dt${largo}>${escapar(c.etiqueta)}</dt><dd${largo}>${valor}${unidad}</dd>`;
    })
    .join("");

  const barras = (confPopup.barras ?? [])
    .filter((b) => typeof props[b.campo] === "number")
    .map((b) => {
      const pct = Math.max(0, Math.min(100, (props[b.campo] / (b.max ?? 10)) * 100));
      return `<div class="popup-barra"><span>${escapar(b.etiqueta)}</span>
        <span class="pista"><i style="width:${pct}%"></i></span><b>${formatear(props[b.campo], "decimal")}</b></div>`;
    })
    .join("");

  const url = confPopup.enlace && props[confPopup.enlace.campo];
  const enlace = url && /^https?:\/\//.test(url)
    ? `<a class="popup-enlace" href="${escapar(url)}" target="_blank" rel="noopener">${escapar(confPopup.enlace.texto)}${icono("enlace")}</a>`
    : "";

  return `
    <div class="popup-cabecera" style="--color:${color}">
      ${subtitulo ? `<div class="popup-subtitulo">${subtitulo}</div>` : ""}
      <div class="popup-titulo">${titulo}</div>
    </div>
    <div class="popup-cuerpo">
      ${campos ? `<dl class="popup-campos">${campos}</dl>` : ""}
      ${barras ? `<div class="popup-barras">${barras}</div>` : ""}
      ${enlace}
      ${confPopup.nota ? `<p class="popup-nota">${escapar(confPopup.nota)}</p>` : ""}
    </div>`;
}
