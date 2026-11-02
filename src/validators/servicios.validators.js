const { body } = require('express-validator');
const { CATEGORIAS_PERMITIDAS, PRECIO_MAXIMO } = require('../models/servicio.model');
const { campo, esTextoONumero, textoObligatorio, textoOpcional } = require('./common');

const FORMATO_NOMBRE = /^[\p{L}\d][\p{L}\d .,'’()-]*$/u;
const DURACION_MINIMA = 15;
const DURACION_MAXIMA = 480; // una jornada de taller

// parcial = true en PUT: solo se validan los campos enviados.
const reglasServicio = (parcial = false) => [
  body('id').not().exists().withMessage('El id no se puede enviar'),

  textoObligatorio('nombre', 'El nombre es obligatorio', parcial)
    .isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres')
    .matches(FORMATO_NOMBRE).withMessage('El nombre solo admite letras, números y . , \' - ( )'),

  campo('categoria', parcial)
    .notEmpty().withMessage('La categoría es obligatoria').bail()
    .isString().withMessage('La categoría debe ser texto').bail()
    .isIn(CATEGORIAS_PERMITIDAS).withMessage(`La categoría debe ser una de: ${CATEGORIAS_PERMITIDAS.join(', ')}`),

  textoOpcional('descripcion', 255),

  campo('precio', parcial)
    .notEmpty().withMessage('El precio es obligatorio').bail()
    .custom(esTextoONumero).withMessage('El precio debe ser un número').bail()
    .isDecimal({ decimal_digits: '0,2' }).withMessage('El precio debe ser un número con máximo 2 decimales').bail()
    .custom((valor) => Number(valor) > 0 && Number(valor) <= PRECIO_MAXIMO)
    .withMessage(`El precio debe ser mayor a 0 y máximo ${PRECIO_MAXIMO}`)
    .toFloat(),

  campo('duracion_min', parcial)
    .notEmpty().withMessage('La duración es obligatoria').bail()
    .custom(esTextoONumero).withMessage('La duración debe ser un número').bail()
    .isInt({ min: DURACION_MINIMA, max: DURACION_MAXIMA })
    .withMessage(`La duración debe ser un entero de ${DURACION_MINIMA} a ${DURACION_MAXIMA} minutos`)
    .toInt(),

  body('activo').not().exists().withMessage('Activo no se puede enviar; para dar de baja usa DELETE'),
];

module.exports = { reglasServicio };
