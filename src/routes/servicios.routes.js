// Rutas de servicios: se montan en /api/servicios
const { Router } = require('express');
const controladorServicios = require('../controllers/servicios.controller');
const { idParam } = require('../validators/common');
const validar = require('../validators/validar');
const { reglasServicio } = require('../validators/servicios.validators');

const enrutador = Router();

enrutador.get('/', controladorServicios.obtenerServicios);
enrutador.get('/:id', idParam(), validar, controladorServicios.obtenerServicioPorId);
enrutador.post('/', reglasServicio(), validar, controladorServicios.registrarServicio);
enrutador.put('/:id', idParam(), reglasServicio(true), validar, controladorServicios.modificarServicio);
enrutador.delete('/:id', idParam(), validar, controladorServicios.borrarServicio);

module.exports = enrutador;
