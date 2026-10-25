// Utilidades compartidas: formato de números, plantillas e íconos.

const numeroEntero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const numeroDecimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const fechaCorta = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function formatear(valor, formato) {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (formato) {
    case "entero": return numeroEntero.format(valor);
    case "decimal": return numeroDecimal.format(valor);
    case "porcentaje": return `${numeroDecimal.format(valor)} %`;
    case "fecha": {
      const fecha = new Date(`${valor}T00:00:00Z`);
      return Number.isNaN(fecha.getTime()) ? escapar(valor) : fechaCorta.format(fecha);
    }
    default: return escapar(valor);
  }
}

/** Reemplaza {campo} por el valor de props; omite los vacíos. */
export function plantilla(texto, props) {
  if (!texto) return "";
  return texto
    .replace(/\{(\w+)\}/g, (_, campo) => (props[campo] ?? "") === "" ? "" : escapar(props[campo]))
    .replace(/\s*·\s*$/, "")
    .replace(/^\s*·\s*/, "");
}

export function el(html) {
  const plantillaHtml = document.createElement("template");
  plantillaHtml.innerHTML = html.trim();
  return plantillaHtml.content.firstElementChild;
}

// Íconos de trazo (24x24), estilo lineal
const trazos = {
  mapa: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  capas: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  gota: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  personas: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>',
  brote: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7Z"/><path d="M12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5Z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  casa: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',
  ubicar: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  izquierda: '<path d="m15 6-6 6 6 6"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  enlace: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  alerta: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};

export function icono(nombre) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazos[nombre] ?? ""}</svg>`;
}
