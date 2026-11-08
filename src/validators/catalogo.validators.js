const { body } = require('express-validator');

const MODELOS = ['Mazda2', 'Mazda3', 'CX-3', 'CX-30', 'CX-5', 'CX-50', 'CX-90', 'BT-50', 'MX-5'];
const COMBUSTIBLES = ['gasolina', 'hibrido', 'diesel'];
const TRANSMISIONES = ['mecanica', 'automatica'];
const PRECIO_MAXIMO = 99999999.99;

const reglasCatalogo = () => [
  body('id').not().exists().withMessage('El id no se puede enviar'),

  // Acepta precioUsd (como lo devuelve el GET) y lo convierte a precio_usd
  body().customSanitizer((cuerpo) => {
    if (cuerpo && typeof cuerpo === 'object'
      && cuerpo.precioUsd !== undefined && cuerpo.precio_usd === undefined) {
      cuerpo.precio_usd = cuerpo.precioUsd;
      delete cuerpo.precioUsd;
    }
    return cuerpo;
  }),


  body('modelo').trim()
    .notEmpty().withMessage('El modelo es obligatorio').bail()
    .isIn(MODELOS).withMessage(`El modelo debe ser uno de: ${MODELOS.join(', ')}`),

  body('version').trim()
    .notEmpty().withMessage('La versión es obligatoria').bail()
    .isLength({ max: 60 }).withMessage('La versión admite máximo 60 caracteres'),

  body('anio')
    .notEmpty().withMessage('El año es obligatorio').bail()
    .isInt({ min: 1900 }).withMessage('El año debe ser un entero mayor o igual a 1900')
    .toInt(),

  body('precio_usd')
    .notEmpty().withMessage('El precio es obligatorio').bail()
    .isFloat({ gt: 0, max: PRECIO_MAXIMO }).withMessage(`El precio debe ser mayor a 0 y máximo ${PRECIO_MAXIMO}`)
    .toFloat(),

  body('stock').optional()
    .isInt({ min: 0 }).withMessage('El stock debe ser un entero mayor o igual a 0')
    .toInt(),

  body('combustible')
    .notEmpty().withMessage('El combustible es obligatorio').bail()
    .isIn(COMBUSTIBLES).withMessage(`El combustible debe ser uno de: ${COMBUSTIBLES.join(', ')}`),

  body('transmision')
    .notEmpty().withMessage('La transmisión es obligatoria').bail()
    .isIn(TRANSMISIONES).withMessage(`La transmisión debe ser una de: ${TRANSMISIONES.join(', ')}`),

  body('destacado').optional()
    .isBoolean({ strict: true }).withMessage('Destacado debe ser true o false')
    .toBoolean(),

  body('activo').not().exists().withMessage('Activo no se puede enviar; para dar de baja usa DELETE'),
];

module.exports = { reglasCatalogo };
