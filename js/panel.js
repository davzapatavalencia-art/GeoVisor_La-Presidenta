// Panel lateral: pestañas Territorio, Capas y Acerca; leyenda flotante.

import { escapar, formatear, icono, el } from "./util.js";
import { leyendaCapa, muestraCapa } from "./estilos.js";

export class Panel {
  constructor({ config, resumen, gestor, alEncuadrar, rellenoMapa }) {
    this.config = config;
    this.resumen = resumen;
    this.gestor = gestor;
    this.alEncuadrar = alEncuadrar;
    this.rellenoMapa = rellenoMapa;
    this.raiz = document.getElementById("panel");

    this.cabecera();
    this.pestanas();
    this.territorio();
    this.capas();
    this.acerca();
    this.leyenda();
    this.hojaMovil();
    this.colapsar();

    gestor.addEventListener("cambio", () => {
      this.sincronizarCapas();
      this.leyenda();
    });
  }

  // -------------------------------------------------------------------------
  cabecera() {
    const v = this.config.visor;
    const partes = v.titulo.split(" ");
    const corte = Math.max(1, partes.length - 2);
    document.querySelector('[data-visor="titulo"]').innerHTML =
      `${escapar(partes.slice(0, corte).join(" "))} <span>${escapar(partes.slice(corte).join(" "))}</span>`;
    document.querySelector('[data-visor="subtitulo"]').textContent = v.subtitulo;
    document.querySelector('[data-visor="curso"]').textContent = v.curso;
  }

  pestanas() {
    const etiquetas = { territorio: ["mapa", "Territorio"], capas: ["capas", "Capas"], acerca: ["info", "Acerca"] };
    const botones = this.raiz.querySelectorAll(".pestana");
    botones.forEach((b) => {
      const [ic, texto] = etiquetas[b.dataset.pestana];
      b.innerHTML = `${icono(ic)}<span>${texto}</span>`;
      b.addEventListener("click", () => this.abrirPestana(b.dataset.pestana));
    });
  }

  abrirPestana(nombre) {
    this.raiz.querySelectorAll(".pestana").forEach((b) => {
      const activa = b.dataset.pestana === nombre;
      b.classList.toggle("activa", activa);
      b.setAttribute("aria-selected", String(activa));
    });
    this.raiz.querySelectorAll(".contenido-pestana").forEach((s) => {
      s.classList.toggle("activa", s.id === `pestana-${nombre}`);
    });
    this.raiz.querySelector(".panel-cuerpo").scrollTop = 0;
  }

  // -------------------------------------------------------------------------
  territorio() {
    const r = this.resumen;
    const c = r.censo.cuenca;
    const f = (v, fmt = "entero") => formatear(v, fmt);
    const barrios = Object.entries(r.censo.por_barrio)
      .map(([nombre, d]) => ({ nombre, ...d, inspecciones: r.inspecciones.por_barrio[nombre] ?? 0 }))
      .sort((a, b) => b.personas - a.personas);
    const maxPersonas = Math.max(...barrios.map((b) => b.personas));

    const html = `
      <div class="bloque">
        <p class="texto">La <strong>Quebrada La Presidenta</strong> nace en las laderas orientales de Medellín y atraviesa la Comuna 14 hasta el río Medellín. Este geovisor reúne lo que sabemos del <strong>territorio</strong> y de la <strong>comunidad</strong> que lo habita, para entender su relación con el agua y el riesgo de inundación, y para mostrar propuestas de intervención.</p>
      </div>

      <div class="bloque" style="--color-bloque:var(--unad-amarillo)">
        <h2 class="bloque-titulo">La comunidad en la cuenca</h2>
        <div class="cifras">
          <div class="cifra" style="--color:var(--unad-amarillo)"><div class="cifra-valor">${f(c.personas)}</div><div class="cifra-etiqueta">personas viven en la cuenca</div></div>
          <div class="cifra" style="--color:#36C2BC"><div class="cifra-valor">${f(c.viviendas)}</div><div class="cifra-etiqueta">viviendas · ${f(c.hogares)} hogares</div></div>
          <div class="cifra" style="--color:var(--unad-naranja)"><div class="cifra-valor"><small>≈</small>${f(c.pob_amenaza_total)}</div><div class="cifra-etiqueta">personas en zona de amenaza por inundación*</div></div>
          <div class="cifra" style="--color:var(--unad-magenta)"><div class="cifra-valor">${f(100 * c.personas_may_60 / c.personas, "decimal")}<small>%</small></div><div class="cifra-etiqueta">tiene más de 60 años</div></div>
        </div>
        <div class="acciones">
          <button class="chip" data-accion="comunidad">${icono("personas")}Ver censo por manzana</button>
        </div>
      </div>

      <div class="bloque" style="--color-bloque:#5BD1FF">
        <h2 class="bloque-titulo">El agua y la amenaza</h2>
        <div class="cifras">
          <div class="cifra" style="--color:#5BD1FF"><div class="cifra-valor">${f(r.cuenca.area_ha)}<small>ha</small></div><div class="cifra-etiqueta">área de la cuenca</div></div>
          <div class="cifra" style="--color:#5BD1FF"><div class="cifra-valor">${f(r.cuenca.longitud_quebrada_km, "decimal")}<small>km</small></div><div class="cifra-etiqueta">de quebrada · ${f(r.cuenca.longitud_red_hidrica_km, "decimal")} km de red hídrica</div></div>
          <div class="cifra" style="--color:#FF4D5E"><div class="cifra-valor">${f(r.amenaza_inundacion_ha.Alta, "decimal")}<small>ha</small></div><div class="cifra-etiqueta">en amenaza alta por inundación</div></div>
          <div class="cifra" style="--color:var(--unad-naranja)"><div class="cifra-valor">${f(r.inspecciones.total)}</div><div class="cifra-etiqueta">inspecciones técnicas por inundación en 2026</div></div>
        </div>
        <div class="acciones">
          <button class="chip" data-accion="agua">${icono("gota")}Ver red hídrica y amenaza</button>
        </div>
      </div>

      <div class="bloque" style="--color-bloque:#36C2BC">
        <h2 class="bloque-titulo">Barrios</h2>
        <div class="lista-barrios">
          ${barrios.map((b) => `
            <button class="barrio" data-barrio="${escapar(b.nombre)}" title="Ver ${escapar(b.nombre)} en el mapa">
              <span class="barrio-nombre">${escapar(b.nombre)}</span>
              <span class="barrio-dato">${f(b.personas)} pers. · ${b.inspecciones} insp.</span>
              <span class="barrio-barra"><i style="width:${(100 * b.personas / maxPersonas).toFixed(1)}%"></i><b style="width:${(100 * b.pob_amenaza_total / maxPersonas).toFixed(1)}%"></b></span>
            </button>`).join("")}
        </div>
        <div class="leyenda-mini">
          <span><i style="background:#36C2BC"></i>Personas</span>
          <span><i style="background:var(--unad-naranja)"></i>En zona de amenaza*</span>
        </div>
      </div>

      <div class="bloque" style="--color-bloque:var(--unad-verde)">
        <h2 class="bloque-titulo">Propuestas de intervención</h2>
        <div class="cifras">
          <div class="cifra" style="--color:var(--unad-verde)"><div class="cifra-valor">${f(r.propuestas.restauracion_laderas_ha)}<small>ha</small></div><div class="cifra-etiqueta">restauración de laderas</div></div>
          <div class="cifra" style="--color:#36C2BC"><div class="cifra-valor">${f(r.propuestas.restauracion_riberas_ha, "decimal")}<small>ha</small></div><div class="cifra-etiqueta">restauración de riberas</div></div>
          <div class="cifra" style="--color:#B4E05A"><div class="cifra-valor">${f(r.propuestas.pavimentos_permeables_ha, "decimal")}<small>ha</small></div><div class="cifra-etiqueta">pavimentos permeables</div></div>
          <div class="cifra" style="--color:#36C2BC"><div class="cifra-valor">${f(r.propuestas.tanques_almacenamiento)}</div><div class="cifra-etiqueta">tanques de almacenamiento</div></div>
        </div>
        <div class="acciones">
          <button class="chip" data-accion="propuestas">${icono("brote")}Ver propuestas</button>
        </div>
        <p class="nota">*Estimación: la población de cada manzana se reparte según la parte de su área que cae en zona de amenaza. Fuente: DANE, CNPV 2018.</p>
      </div>`;

    const seccion = document.getElementById("pestana-territorio");
    seccion.innerHTML = html;

    seccion.querySelectorAll("[data-barrio]").forEach((b) => {
      b.addEventListener("click", () => {
        this.alMovil("minimo");
        this.gestor.mostrarElemento("barrios_afectados", "nombre", b.dataset.barrio, this.rellenoMapa());
      });
    });

    const escenas = {
      comunidad: { activar: ["censo_manzanas", "barrios_afectados"], apagar: ["amenaza_inundacion"] },
      agua: { activar: ["red_hidrica", "amenaza_inundacion", "inspecciones_tecnicas"], apagar: ["censo_manzanas"] },
      propuestas: {
        activar: ["propuesta_restauracion_laderas", "propuesta_restauracion_riberas", "propuesta_pavimentos_permeables", "propuesta_tanques_almacenamiento"],
        apagar: ["censo_manzanas"],
      },
    };
    seccion.querySelectorAll("[data-accion]").forEach((b) => {
      b.addEventListener("click", async () => {
        const escena = escenas[b.dataset.accion];
        await Promise.all([
          ...escena.apagar.map((id) => this.gestor.alternar(id, false)),
          ...escena.activar.map((id) => this.gestor.alternar(id, true)),
        ]);
        this.alMovil("minimo");
        this.alEncuadrar();
      });
    });
  }

  // -------------------------------------------------------------------------
  capas() {
    const seccion = document.getElementById("pestana-capas");
    seccion.innerHTML = "";
    for (const grupo of this.config.grupos) {
      const nodo = el(`
        <div class="grupo" data-grupo="${grupo.id}">
          <button class="grupo-cabecera" aria-expanded="true">
            <span class="grupo-icono">${icono(grupo.icono)}</span>
            <span class="grupo-nombre">${escapar(grupo.nombre)}</span>
            <span class="grupo-conteo"></span>
            <i class="chevron"></i>
          </button>
          <div class="grupo-capas"></div>
        </div>`);
      const cab = nodo.querySelector(".grupo-cabecera");
      cab.addEventListener("click", () => {
        nodo.classList.toggle("cerrado");
        cab.setAttribute("aria-expanded", String(!nodo.classList.contains("cerrado")));
      });
      const lista = nodo.querySelector(".grupo-capas");
      grupo.capas.forEach((c) => lista.append(this.filaCapa(this.gestor.confs.get(c.id))));
      seccion.append(nodo);
    }
    this.sincronizarCapas();
  }

  filaCapa(conf) {
    const est = this.gestor.estado.get(conf.id);
    const idControl = `capa-${conf.id}-activa`;
    const variables = conf.estilo.variables;
    const nodo = el(`
      <div class="capa inactiva" data-capa="${conf.id}">
        <div class="capa-fila">
          <label class="interruptor" title="Mostrar u ocultar">
            <input type="checkbox" id="${idControl}">
            <span></span>
          </label>
          <span class="capa-muestra">${muestraCapa(conf)}</span>
          <span class="capa-texto">
            <label class="capa-nombre" for="${idControl}">${escapar(conf.nombre)}</label>
            ${conf.descripcion ? `<span class="capa-desc">${escapar(conf.descripcion)}</span>` : ""}
          </span>
          <button class="boton-icono capa-mas" aria-expanded="false" aria-label="Opciones de ${escapar(conf.nombre)}" title="Opciones">${icono("ajustes")}</button>
        </div>
        <div class="capa-detalle">
          ${variables ? `
            <label for="var-${conf.id}">Variable</label>
            <select id="var-${conf.id}">${variables.map((v) => `<option value="${v.campo}">${escapar(v.etiqueta)}</option>`).join("")}</select>` : ""}
          <label for="op-${conf.id}">Opacidad</label>
          <input type="range" id="op-${conf.id}" min="0" max="1" step="0.05" value="${est.opacidad}">
          <div class="capa-leyenda"></div>
        </div>
      </div>`);

    nodo.querySelector("input[type=checkbox]").addEventListener("change", (e) => {
      this.gestor.alternar(conf.id, e.target.checked).catch((err) => {
        console.error(err);
        e.target.checked = false;
      });
    });
    const mas = nodo.querySelector(".capa-mas");
    mas.addEventListener("click", () => {
      const abierta = nodo.classList.toggle("abierta");
      mas.setAttribute("aria-expanded", String(abierta));
    });
    nodo.querySelector("input[type=range]").addEventListener("input", (e) => {
      this.gestor.opacidad(conf.id, Number(e.target.value));
    });
    nodo.querySelector("select")?.addEventListener("change", (e) => {
      this.gestor.cambiarVariable(conf.id, e.target.value);
    });
    return nodo;
  }

  sincronizarCapas() {
    for (const [id, est] of this.gestor.estado) {
      const nodo = document.querySelector(`.capa[data-capa="${id}"]`);
      if (!nodo) continue;
      nodo.classList.toggle("inactiva", !est.activa);
      nodo.querySelector("input[type=checkbox]").checked = est.activa;
      nodo.querySelector(".capa-leyenda").innerHTML = leyendaCapa(this.gestor.confs.get(id), est);
    }
    document.querySelectorAll(".grupo").forEach((g) => {
      const total = g.querySelectorAll(".capa").length;
      const activas = g.querySelectorAll(".capa:not(.inactiva)").length;
      g.querySelector(".grupo-conteo").textContent = `${activas}/${total}`;
    });
  }

  // -------------------------------------------------------------------------
  acerca() {
    const v = this.config.visor;
    document.getElementById("pestana-acerca").innerHTML = `
      <div class="bloque">
        <h2 class="bloque-titulo">Sobre el geovisor</h2>
        <p class="texto">Proyecto del curso <strong>${escapar(v.curso)}</strong> de la Universidad Nacional Abierta y a Distancia (<strong>${escapar(v.institucion)}</strong>). Lee la cuenca de la Quebrada La Presidenta como un territorio vivo: el agua, el riesgo y las personas que lo habitan.</p>
        <p class="texto">Haz clic en cualquier punto del mapa para ver todo lo que hay en ese lugar: manzana censal, barrio, nivel de amenaza y cuenca.</p>
      </div>
      <div class="bloque" style="--color-bloque:#36C2BC">
        <h2 class="bloque-titulo">Fuentes</h2>
        <p class="texto"><strong>DANE</strong> — Censo Nacional de Población y Vivienda 2018, por manzana.</p>
        <p class="texto"><strong>Alcaldía de Medellín</strong> — SIRMED (inspecciones técnicas), cartografía base, red hídrica, amenaza por inundación (POT) y ortofoto.</p>
        <p class="texto"><strong>Mapas base</strong> — Esri y OpenStreetMap.</p>
      </div>
      <div class="bloque" style="--color-bloque:var(--unad-naranja)">
        <h2 class="bloque-titulo">Notas</h2>
        <p class="texto">La población en zona de amenaza es una estimación: la población de cada manzana se reparte según la parte de su área que cae en la zona de amenaza.</p>
        <p class="texto">La equivalencia de los niveles de amenaza (ZAIA, ZAIM, ZAIMB) es provisional mientras se confirma con el POT.</p>
        <p class="nota">Datos procesados el ${escapar(this.resumen.generado)}.</p>
      </div>`;
  }

  // -------------------------------------------------------------------------
  leyenda() {
    const cuerpo = document.getElementById("leyenda-cuerpo");
    const contenedor = document.getElementById("leyenda");
    const activas = this.gestor.activas.sort((a, b) => (b.orden ?? 0) - (a.orden ?? 0));
    contenedor.hidden = activas.length === 0;
    cuerpo.innerHTML = activas.map((conf) => {
      const est = this.gestor.estado.get(conf.id);
      const simple = !["categorias", "coropleta"].includes(conf.estilo.tipo);
      return `<div class="leyenda-capa">${simple ? "" : `<h4>${escapar(conf.nombre)}</h4>`}${leyendaCapa(conf, est)}</div>`;
    }).join("");

    if (!this._leyendaLista) {
      this._leyendaLista = true;
      const boton = document.getElementById("leyenda-alternar");
      boton.addEventListener("click", () => {
        const cerrada = contenedor.classList.toggle("cerrada");
        boton.setAttribute("aria-expanded", String(!cerrada));
      });
      if (window.matchMedia("(max-width: 760px)").matches) {
        contenedor.classList.add("cerrada");
        boton.setAttribute("aria-expanded", "false");
      }
    }
  }

  // -------------------------------------------------------------------------
  hojaMovil() {
    const asa = document.getElementById("panel-asa");
    const estados = ["minimo", "medio", "completo"];
    this.estadoHoja = "medio";
    asa.addEventListener("click", () => {
      const sig = estados[(estados.indexOf(this.estadoHoja) + 1) % estados.length];
      this.alMovil(sig, true);
    });
    // Al tocar una pestaña con la hoja mínima, se abre
    this.raiz.querySelectorAll(".pestana").forEach((b) =>
      b.addEventListener("click", () => { if (this.estadoHoja === "minimo") this.alMovil("medio"); }));
  }

  alMovil(estado, forzar = false) {
    if (!window.matchMedia("(max-width: 760px)").matches && !forzar) return;
    this.estadoHoja = estado;
    this.raiz.classList.toggle("minimo", estado === "minimo");
    this.raiz.classList.toggle("completo", estado === "completo");
  }

  colapsar() {
    const ocultar = document.getElementById("panel-colapsar");
    const abrir = document.getElementById("panel-abrir");
    ocultar.innerHTML = icono("izquierda");
    abrir.innerHTML = icono("panel");
    const alternar = (oculto) => {
      this.raiz.classList.toggle("oculto", oculto);
      document.body.classList.toggle("panel-oculto", oculto);
      (oculto ? abrir : ocultar).focus();
    };
    ocultar.addEventListener("click", () => alternar(true));
    abrir.addEventListener("click", () => alternar(false));
  }
}
