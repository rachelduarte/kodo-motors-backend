// Formato de los campos de una reserva. Las reglas que consultan la BD están en reserva.service.js
const { body, query } = require('express-validator');
const { ESTADOS } = require('../models/reserva.model');
const { ENTERO_MAXIMO, enteroPositivo, fechaISO, horaHHMM, textoOpcional } = require('./common');

const reglasComunes = (parcial) => [
  body('id').not().exists().withMessage('El id no se puede enviar'),

  fechaISO('fecha', 'La fecha', parcial),

  horaHHMM('hora', 'La hora', parcial)
    .matches(/:(00|30)$/).withMessage('Las citas se agendan cada 30 minutos (:00 o :30)'),

  enteroPositivo('sede_id', parcial),
  enteroPositivo('servicio_id', parcial),
  enteroPositivo('vehiculo_id', parcial),

  textoOpcional('observacion', 255),

  body('activo').not().exists().withMessage('Activo no se puede enviar; para dar de baja usa DELETE'),
];

const reglasCrearReserva = () => [
  ...reglasComunes(false),

  body('estado').optional()
    .equals('pendiente').withMessage('Una reserva nueva solo puede estar pendiente'),
];

// PUT parcial: los cambios de estado permitidos se revisan en el servicio.
const reglasActualizarReserva = () => [
  ...reglasComunes(true),

  body('estado').optional()
    .isString().withMessage('El estado debe ser texto').bail()
    .isIn(ESTADOS).withMessage(`El estado debe ser uno de: ${ESTADOS.join(', ')}`),
];

// Un parámetro repetido llega como arreglo: isString lo rechaza.
const reglasFiltrosReserva = () => [
  query('estado').optional()
    .isString().withMessage('El filtro estado debe ser un solo valor').bail()
    .isIn(ESTADOS).withMessage(`El estado debe ser uno de: ${ESTADOS.join(', ')}`),

  query('fecha').optional()
    .isString().withMessage('El filtro fecha debe ser un solo valor').bail()
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('La fecha debe tener formato AAAA-MM-DD').bail()
    .isISO8601({ strict: true }).withMessage('La fecha no existe en el calendario'),

  query('sede_id').optional()
    .isString().withMessage('El filtro sede_id debe ser un solo valor').bail()
    .isInt({ min: 1, max: ENTERO_MAXIMO }).withMessage('sede_id debe ser un entero positivo'),
];

module.exports = { reglasCrearReserva, reglasActualizarReserva, reglasFiltrosReserva };
