/**
 * Servicio de Reservas: reglas de negocio.
 * Valida los datos, verifica que existan sede/servicio/vehículo, que la cita
 * entre en la agenda de la sede y que no haya otra reserva en el mismo horario.
 * Luego llama al repositorio.
 */
const HttpError = require('../utils/http-error');
const modelo = require('../models/reserva.model');
const repo = require('../repositories/reserva.repository');
const lookups = require('../repositories/lookups.repository');
const repoSedes = require('../repositories/sedes.repository');
const repoServicios = require('../repositories/servicios.repository');

const DIAS_MAXIMOS_ANTICIPACION = 30;

/** Verifica que los IDs relacionados existan en sus tablas (foreign keys). */
async function verificarRelaciones(datos) {
  if (datos.sede_id !== undefined && !(await lookups.existeSede(datos.sede_id))) {
    throw new HttpError(404, `La sede con id ${datos.sede_id} no existe o está dada de baja`);
  }
  if (datos.servicio_id !== undefined && !(await lookups.existeServicio(datos.servicio_id))) {
    throw new HttpError(404, `El servicio con id ${datos.servicio_id} no existe o está dado de baja`);
  }
  if (datos.vehiculo_id !== undefined && !(await lookups.existeVehiculo(datos.vehiculo_id))) {
    throw new HttpError(404, `El vehículo con id ${datos.vehiculo_id} no existe`);
  }
}

function minutosDelDia(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

/** La cita debe ser futura, dentro de la anticipación máxima y en horario de la sede. */
async function verificarAgenda({ fecha, hora, sede_id, servicio_id }) {
  const ahora = new Date();
  const inicio = new Date(`${fecha}T${hora}:00`);
  if (inicio <= ahora) {
    throw new HttpError(400, 'La cita no puede ser en una fecha u hora pasada');
  }

  const limite = new Date(ahora);
  limite.setDate(limite.getDate() + DIAS_MAXIMOS_ANTICIPACION);
  limite.setHours(23, 59, 59, 999);
  if (inicio > limite) {
    throw new HttpError(400, `La cita se puede agendar con máximo ${DIAS_MAXIMOS_ANTICIPACION} días de anticipación`);
  }

  const sede = await repoSedes.buscarPorId(sede_id);
  if (inicio.getDay() === 0 && !sede.atiende_domingo) {
    throw new HttpError(400, `La sede ${sede.nombre} no atiende los domingos`);
  }

  const servicio = await repoServicios.buscarPorId(servicio_id);
  const minutoInicio = minutosDelDia(hora);
  if (minutoInicio < minutosDelDia(sede.hora_apertura)
    || minutoInicio + servicio.duracion_min > minutosDelDia(sede.hora_cierre)) {
    const apertura = sede.hora_apertura.slice(0, 5);
    const cierre = sede.hora_cierre.slice(0, 5);
    throw new HttpError(
      400,
      `El servicio dura ${servicio.duracion_min} minutos y debe empezar y terminar dentro del horario de la sede (${apertura} a ${cierre})`,
    );
  }
}

/** Ni la sede ni el vehículo pueden tener otra reserva vigente en ese horario. */
async function verificarChoques(cita, idExcluir = null) {
  if (await repo.existeChoque(cita, idExcluir)) {
    throw new HttpError(409, 'Ya existe otra reserva en esa sede, fecha y hora');
  }
  if (await repo.existeChoqueVehiculo(cita, idExcluir)) {
    throw new HttpError(409, 'El vehículo ya tiene otra reserva en esa fecha y hora');
  }
}

function verificarTransicion(estadoActual, estadoNuevo) {
  const permitidos = modelo.TRANSICIONES[estadoActual];
  if (permitidos.length === 0) {
    throw new HttpError(409, `La reserva está ${estadoActual} y ya no se puede modificar`);
  }
  if (estadoNuevo !== undefined && estadoNuevo !== estadoActual && !permitidos.includes(estadoNuevo)) {
    throw new HttpError(409, `Una reserva ${estadoActual} solo puede pasar a: ${permitidos.join(', ')}`);
  }
}

async function listar(filtros) {
  return repo.listar(filtros);
}

async function obtenerPorId(id) {
  const reserva = await repo.obtenerPorId(id);
  if (!reserva) throw new HttpError(404, `La reserva con id ${id} no existe`);
  return reserva;
}

async function crear(body) {
  modelo.revisarCampos(body);

  const errores = modelo.validar(body);
  if (errores.length) throw new HttpError(400, 'Datos de reserva inválidos', errores);

  const datos = modelo.limpiar(body);
  await verificarRelaciones(datos);
  await verificarAgenda(datos);
  await verificarChoques(datos);

  return repo.crear(datos);
}

async function actualizar(id, body) {
  const actual = await obtenerPorId(id); // lanza 404 si no existe
  modelo.revisarCampos(body);

  const errores = modelo.validar(body, { parcial: true });
  if (errores.length) throw new HttpError(400, 'Datos de reserva inválidos', errores);

  const datos = modelo.limpiar(body);
  if (Object.keys(datos).length === 0) {
    throw new HttpError(400, 'No se envió ningún campo para actualizar');
  }

  verificarTransicion(actual.estado, datos.estado);

  // Para las reglas se usan los valores nuevos o, si no cambian, los actuales
  const cita = {
    fecha: datos.fecha ?? actual.fecha,
    hora: datos.hora ?? actual.hora,
    sede_id: datos.sede_id ?? actual.sede.id,
    servicio_id: datos.servicio_id ?? actual.servicio.id,
    vehiculo_id: datos.vehiculo_id ?? actual.vehiculo.id,
  };

  // Una cita ya pasada debe poder marcarse como atendida: la agenda solo se revisa si se mueve
  const cambiaAgenda = cita.fecha !== actual.fecha
    || cita.hora !== actual.hora
    || cita.sede_id !== actual.sede.id
    || cita.servicio_id !== actual.servicio.id;

  await verificarRelaciones(cambiaAgenda ? cita : datos);
  if (cambiaAgenda) await verificarAgenda(cita);

  if (modelo.ESTADOS_VIGENTES.includes(datos.estado ?? actual.estado)) {
    await verificarChoques(cita, id);
  }

  return repo.actualizar(id, datos);
}

async function eliminar(id) {
  const eliminada = await repo.eliminar(id);
  if (!eliminada) throw new HttpError(404, `La reserva con id ${id} no existe`);
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
