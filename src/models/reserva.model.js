/**
 * Modelo de Reserva (tabla `reservas` de kodo_db).
 *
 * Define la forma de una reserva, sus estados válidos, las reglas de
 * validación de entrada y el mapeo de una fila de MySQL a un objeto JSON.
 * No accede a la base de datos: de eso se encarga el repositorio.
 *
 * Columnas de la tabla:
 *   id, fecha, hora, sede_id, servicio_id, vehiculo_id, estado, observacion, activo, created_at
 *
 * activo es la bandera del borrado lógico: solo cambia con DELETE, nunca desde el body.
 */

const { revisarCamposPermitidos } = require('../utils/validaciones');

const ESTADOS = ['pendiente', 'confirmada', 'cancelada', 'atendida'];

/** Estados que ocupan un horario en la agenda. */
const ESTADOS_VIGENTES = ['pendiente', 'confirmada'];

/** Estado actual → estados a los que puede pasar. Cancelada y atendida son finales. */
const TRANSICIONES = {
  pendiente: ['confirmada', 'cancelada'],
  confirmada: ['atendida', 'cancelada'],
  cancelada: [],
  atendida: [],
};

/** Campos que el cliente puede enviar al crear o actualizar. */
const CAMPOS_ENTRADA = ['fecha', 'hora', 'sede_id', 'servicio_id', 'vehiculo_id', 'estado', 'observacion'];

/** Campos obligatorios al crear. */
const CAMPOS_OBLIGATORIOS = ['fecha', 'hora', 'sede_id', 'servicio_id', 'vehiculo_id'];

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;      // YYYY-MM-DD
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;  // HH:MM

function esEnteroPositivo(valor) {
  return Number.isInteger(Number(valor)) && Number(valor) > 0;
}

function revisarCampos(datos) {
  revisarCamposPermitidos(datos, CAMPOS_ENTRADA);
}

/**
 * Valida los datos de una reserva.
 * @param {object} datos  Cuerpo recibido en la petición.
 * @param {{ parcial?: boolean }} opciones  parcial=true para PUT (no exige todos los campos).
 * @returns {string[]} Lista de mensajes de error. Vacía si todo está bien.
 */
function validar(datos = {}, { parcial = false } = {}) {
  const errores = [];

  if (!parcial) {
    for (const campo of CAMPOS_OBLIGATORIOS) {
      if (datos[campo] === undefined || datos[campo] === null || datos[campo] === '') {
        errores.push(`El campo '${campo}' es obligatorio`);
      }
    }
  }

  if (datos.fecha !== undefined && !REGEX_FECHA.test(String(datos.fecha))) {
    errores.push("El campo 'fecha' debe tener formato YYYY-MM-DD");
  }

  if (datos.hora !== undefined && !REGEX_HORA.test(String(datos.hora))) {
    errores.push("El campo 'hora' debe tener formato HH:MM");
  }

  for (const campo of ['sede_id', 'servicio_id', 'vehiculo_id']) {
    if (datos[campo] !== undefined && !esEnteroPositivo(datos[campo])) {
      errores.push(`El campo '${campo}' debe ser un entero positivo`);
    }
  }

  if (datos.estado !== undefined && !ESTADOS.includes(datos.estado)) {
    errores.push(`El campo 'estado' debe ser uno de: ${ESTADOS.join(', ')}`);
  }

  if (datos.observacion !== undefined && datos.observacion !== null) {
    if (typeof datos.observacion !== 'string') {
      errores.push("El campo 'observacion' debe ser texto");
    } else if (datos.observacion.length > 255) {
      errores.push("El campo 'observacion' no puede superar 255 caracteres");
    }
  }

  if (datos.activo !== undefined) {
    errores.push("El campo 'activo' no se puede enviar; para dar de baja usa DELETE");
  }

  return errores;
}

/**
 * Deja solo los campos permitidos y normaliza tipos antes de enviarlos al repositorio.
 * Ignora cualquier campo extra que mande el cliente (id, created_at, etc.).
 */
function limpiar(datos = {}) {
  const limpio = {};
  for (const campo of CAMPOS_ENTRADA) {
    if (datos[campo] === undefined) continue;
    if (['sede_id', 'servicio_id', 'vehiculo_id'].includes(campo)) {
      limpio[campo] = Number(datos[campo]);
    } else if (campo === 'observacion') {
      limpio[campo] = datos[campo] === null ? null : String(datos[campo]).trim();
    } else {
      limpio[campo] = String(datos[campo]).trim();
    }
  }
  return limpio;
}

/**
 * Convierte una fila de MySQL (con o sin JOIN) en el objeto que devuelve la API.
 * Si la fila trae columnas del JOIN (sede_nombre, servicio_nombre, vehiculo_placa,
 * vehiculo_modelo) las agrupa en objetos anidados.
 */
function desdeFila(fila) {
  if (!fila) return null;

  const reserva = {
    id: fila.id,
    fecha: fila.fecha instanceof Date ? fila.fecha.toISOString().slice(0, 10) : fila.fecha,
    hora: typeof fila.hora === 'string' ? fila.hora.slice(0, 5) : fila.hora,
    estado: fila.estado,
    observacion: fila.observacion ?? null,
    activo: Boolean(fila.activo),
    created_at: fila.created_at,
  };

  reserva.sede = fila.sede_nombre !== undefined
    ? { id: fila.sede_id, nombre: fila.sede_nombre }
    : { id: fila.sede_id };

  reserva.servicio = fila.servicio_nombre !== undefined
    ? { id: fila.servicio_id, nombre: fila.servicio_nombre, precio: fila.servicio_precio }
    : { id: fila.servicio_id };

  reserva.vehiculo = fila.vehiculo_placa !== undefined
    ? { id: fila.vehiculo_id, placa: fila.vehiculo_placa, modelo: fila.vehiculo_modelo }
    : { id: fila.vehiculo_id };

  return reserva;
}

module.exports = {
  ESTADOS,
  ESTADOS_VIGENTES,
  TRANSICIONES,
  CAMPOS_ENTRADA,
  CAMPOS_OBLIGATORIOS,
  revisarCampos,
  validar,
  limpiar,
  desdeFila,
};