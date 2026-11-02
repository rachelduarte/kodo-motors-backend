/**
 * Repositorio de Reservas: único lugar con SQL de la tabla `reservas`.
 * Devuelve objetos ya mapeados con el modelo (desdeFila).
 * Borrado lógico: toda consulta filtra r.activo = 1 y eliminar() solo pone activo = 0.
 */
const { pool } = require('../config/db');
const { desdeFila } = require('../models/reserva.model');
const { incluyeInactivos } = require('../utils/validaciones');

// SELECT base con JOIN para traer nombres en vez de solo IDs
const SELECT_BASE = `
  SELECT r.id, r.fecha, r.hora, r.estado, r.observacion, r.activo, r.created_at,
         r.sede_id,     s.nombre AS sede_nombre,
         r.servicio_id, sv.nombre AS servicio_nombre, sv.precio AS servicio_precio,
         r.vehiculo_id, v.placa AS vehiculo_placa, v.modelo AS vehiculo_modelo
  FROM reservas r
  JOIN sedes     s  ON s.id  = r.sede_id
  JOIN servicios sv ON sv.id = r.servicio_id
  JOIN vehiculos v  ON v.id  = r.vehiculo_id
`;

/** Lista las reservas activas. Filtros opcionales: estado, fecha, sede_id, incluir_inactivos. */
async function listar(filtros = {}) {
  const condiciones = [];
  const valores = [];

  if (!incluyeInactivos(filtros.incluir_inactivos)) condiciones.push('r.activo = 1');
  if (filtros.estado) { condiciones.push('r.estado = ?'); valores.push(filtros.estado); }
  if (filtros.fecha) { condiciones.push('r.fecha = ?'); valores.push(filtros.fecha); }
  if (filtros.sede_id) { condiciones.push('r.sede_id = ?'); valores.push(Number(filtros.sede_id)); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [rows] = await pool.query(`${SELECT_BASE} ${where} ORDER BY r.fecha, r.hora`, valores);
  return rows.map(desdeFila);
}

/** Devuelve una reserva activa por ID o null si no existe o fue dada de baja. */
async function obtenerPorId(id) {
  const [rows] = await pool.query(`${SELECT_BASE} WHERE r.id = ? AND r.activo = 1`, [id]);
  return rows.length ? desdeFila(rows[0]) : null;
}

/** Inserta una reserva y devuelve el registro completo. */
async function crear(datos) {
  const [result] = await pool.query(
    `INSERT INTO reservas (fecha, hora, sede_id, servicio_id, vehiculo_id, estado, observacion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.fecha,
      datos.hora,
      datos.sede_id,
      datos.servicio_id,
      datos.vehiculo_id,
      datos.estado || 'pendiente',
      datos.observacion ?? null,
    ],
  );
  return obtenerPorId(result.insertId);
}

/**
 * Actualiza solo los campos que llegan en `datos` (ya filtrados por el modelo).
 * Devuelve la reserva actualizada o null si el ID no existe o fue dada de baja.
 */
async function actualizar(id, datos) {
  const campos = Object.keys(datos);
  if (campos.length === 0) return obtenerPorId(id);

  const set = campos.map((c) => `${c} = ?`).join(', ');
  const valores = campos.map((c) => datos[c]);

  const [result] = await pool.query(
    `UPDATE reservas SET ${set} WHERE id = ? AND activo = 1`,
    [...valores, id],
  );
  if (result.affectedRows === 0) return null;
  return obtenerPorId(id);
}

/** Borrado lógico: la fila se conserva con activo = 0. Devuelve true si estaba activa. */
async function eliminar(id) {
  const [result] = await pool.query(
    'UPDATE reservas SET activo = 0 WHERE id = ? AND activo = 1',
    [id],
  );
  return result.affectedRows > 0;
}

// columna es una constante de este archivo, nunca un dato del usuario
async function existeVigente(columna, valor, fecha, hora, idExcluir) {
  let sql = `SELECT id FROM reservas
             WHERE ${columna} = ? AND fecha = ? AND hora = ?
               AND activo = 1
               AND estado IN ('pendiente', 'confirmada')`;
  const valores = [valor, fecha, hora];
  if (idExcluir) { sql += ' AND id <> ?'; valores.push(idExcluir); }

  const [rows] = await pool.query(`${sql} LIMIT 1`, valores);
  return rows.length > 0;
}

/**
 * Verifica si ya hay una reserva vigente (activa, pendiente o confirmada)
 * en la misma sede, fecha y hora. `idExcluir` sirve en el PUT para no chocar con la misma reserva.
 */
async function existeChoque({ sede_id, fecha, hora }, idExcluir = null) {
  return existeVigente('sede_id', sede_id, fecha, hora, idExcluir);
}

/** Verifica si el vehículo ya tiene una reserva vigente en esa fecha y hora, en cualquier sede. */
async function existeChoqueVehiculo({ vehiculo_id, fecha, hora }, idExcluir = null) {
  return existeVigente('vehiculo_id', vehiculo_id, fecha, hora, idExcluir);
}

// columna es una constante de este archivo, nunca un dato del usuario
async function contarCitasPendientes(columna, id, desde) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM reservas
     WHERE ${columna} = ? AND fecha >= ?
       AND activo = 1
       AND estado IN ('pendiente', 'confirmada')`,
    [id, desde],
  );
  return rows[0].total;
}

/** Cuenta las citas vigentes de una sede o servicio desde una fecha AAAA-MM-DD. */
const contarCitasPendientesDeSede = (id, desde) => contarCitasPendientes('sede_id', id, desde);
const contarCitasPendientesDeServicio = (id, desde) => contarCitasPendientes('servicio_id', id, desde);

module.exports = {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
  existeChoque,
  existeChoqueVehiculo,
  contarCitasPendientesDeSede,
  contarCitasPendientesDeServicio,
};
