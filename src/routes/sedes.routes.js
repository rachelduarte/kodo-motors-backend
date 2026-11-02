// Rutas de sedes: se montan en /api/sedes
const { Router } = require('express');
const controladorSedes = require('../controllers/sedes.controller');
const { idParam } = require('../validators/common');
const validar = require('../validators/validar');
const { reglasSede } = require('../validators/sedes.validators');

const enrutador = Router();

enrutador.get('/', controladorSedes.obtenerSedes);
enrutador.get('/:id', idParam(), validar, controladorSedes.obtenerSedePorId);
enrutador.post('/', reglasSede(), validar, controladorSedes.registrarSede);
enrutador.put('/:id', idParam(), reglasSede(true), validar, controladorSedes.modificarSede);
enrutador.delete('/:id', idParam(), validar, controladorSedes.borrarSede);

module.exports = enrutador;
