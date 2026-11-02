// Servicio de sedes: reglas de negocio; no conoce req/res ni SQL
const repositorio = require('../repositories/sedes.repository');
const repositorioReservas = require('../repositories/reserva.repository');
const modelo = require('../models/sede.model');
const HttpError = require('../utils/http-error');
const { hoyISO } = require('../validators/common');

async function listarSedes(filtros = {}) {
  const filtrosLimpios = modelo.validarFiltros(filtros);
  return repositorio.listar(filtrosLimpios);
}

async function buscarSedePorId(id) {
  const sede = await repositorio.buscarPorId(id);
  if (!sede) {
    throw new HttpError(404, `No existe una sede con id ${id}`);
  }
  return sede;
}

// El nombre es único también frente a las sedes dadas de baja
async function verificarNombreLibre(nombre, idActual = null) {
  const otra = await repositorio.buscarPorNombre(nombre);
  if (!otra || otra.id === idActual) return;
  if (otra.activa) {
    throw new HttpError(409, `Ya existe una sede con el nombre "${nombre}"`);
  }
  throw new HttpError(409, `El nombre "${nombre}" pertenece a una sede dada de baja (id ${otra.id})`);
}

async function crearSede(datos) {
  modelo.revisarCampos(datos);
  const sedeLimpia = modelo.validarSede(datos);
  await verificarNombreLibre(sedeLimpia.nombre);

  const idNuevo = await repositorio.crear(sedeLimpia);
  return buscarSedePorId(idNuevo);
}

async function actualizarSede(id, cambios) {
  modelo.revisarCampos(cambios);
  if (Object.keys(cambios).length === 0) {
    throw new HttpError(400, 'Envía al menos un campo para actualizar');
  }

  const sedeActual = await buscarSedePorId(id);

  const sedeCombinada = { ...sedeActual, ...cambios };
  const sedeLimpia = modelo.validarSede(sedeCombinada);
  await verificarNombreLibre(sedeLimpia.nombre, id);

  await repositorio.actualizar(id, sedeLimpia);
  return buscarSedePorId(id);
}

async function eliminarSede(id) {
  const citasPendientes = await repositorioReservas.contarCitasPendientesDeSede(id, hoyISO());
  if (citasPendientes > 0) {
    throw new HttpError(409, `No se puede dar de baja la sede: tiene citas generadas pendientes (${citasPendientes})`);
  }

  const eliminada = await repositorio.eliminar(id);
  if (!eliminada) {
    throw new HttpError(404, `No existe una sede con id ${id}`);
  }
}

module.exports = {
  listarSedes,
  buscarSedePorId,
  crearSede,
  actualizarSede,
  eliminarSede,
};
