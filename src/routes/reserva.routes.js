/**
 * Rutas del recurso Reservas. Se montan en /api/reservas desde src/routes/index.js.
 *
 *   GET    /api/reservas          lista (filtros: ?estado=&fecha=&sede_id=&incluir_inactivos=true)
 *   GET    /api/reservas/:id      una reserva
 *   POST   /api/reservas          crea
 *   PUT    /api/reservas/:id      actualiza
 *   DELETE /api/reservas/:id      da de baja (borrado lógico)
 */
const { Router } = require('express');
const controlador = require('../controllers/reserva.controller');
const { idParam } = require('../validators/common');
const validar = require('../validators/validar');
const {
  reglasCrearReserva,
  reglasActualizarReserva,
  reglasFiltrosReserva,
} = require('../validators/reservas.validators');

const router = Router();

router.get('/', reglasFiltrosReserva(), validar, controlador.listar);
router.get('/:id', idParam(), validar, controlador.obtenerPorId);
router.post('/', reglasCrearReserva(), validar, controlador.crear);
router.put('/:id', idParam(), reglasActualizarReserva(), validar, controlador.actualizar);
router.delete('/:id', idParam(), validar, controlador.eliminar);

module.exports = router;
