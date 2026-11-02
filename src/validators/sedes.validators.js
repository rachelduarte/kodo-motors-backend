const { body } = require('express-validator');
const { horaHHMM, textoObligatorio } = require('./common');

const FORMATO_NOMBRE = /^[\p{L}\d][\p{L}\d .,'’()-]*$/u;
const FORMATO_DISTRITO = /^\p{L}[\p{L} .'’-]*$/u;
const FORMATO_DIRECCION = /^[\p{L}\d][\p{L}\d .,'’()#°º/-]*$/u;
// Fijo (01 + 7 dígitos, o código de provincia + 6) o celular (9 + 8 dígitos).
const FORMATO_TELEFONO = /^[09]\d{8}$/;

// parcial = true en PUT: solo se validan los campos enviados.
// La regla apertura < cierre vive en el modelo, que compara también contra los datos guardados.
const reglasSede = (parcial = false) => [
  body('id').not().exists().withMessage('El id no se puede enviar'),

  textoObligatorio('nombre', 'El nombre es obligatorio', parcial)
    .isLength({ min: 3, max: 80 }).withMessage('El nombre debe tener entre 3 y 80 caracteres')
    .matches(FORMATO_NOMBRE).withMessage('El nombre solo admite letras, números y . , \' - ( )'),

  textoObligatorio('distrito', 'El distrito es obligatorio', parcial)
    .isLength({ min: 3, max: 60 }).withMessage('El distrito debe tener entre 3 y 60 caracteres')
    .matches(FORMATO_DISTRITO).withMessage('El distrito solo admite letras, espacios y . \' -'),

  textoObligatorio('direccion', 'La dirección es obligatoria', parcial)
    .isLength({ min: 5, max: 150 }).withMessage('La dirección debe tener entre 5 y 150 caracteres')
    .matches(FORMATO_DIRECCION).withMessage('La dirección solo admite letras, números y . , \' - ( ) # ° /'),

  textoObligatorio('telefono', 'El teléfono es obligatorio', parcial)
    .matches(FORMATO_TELEFONO).withMessage('El teléfono debe tener 9 dígitos y empezar en 0 (fijo) o 9 (celular)'),

  horaHHMM('hora_apertura', 'La hora de apertura', parcial),
  horaHHMM('hora_cierre', 'La hora de cierre', parcial),

  body('atiende_domingo').optional()
    .custom((valor) => typeof valor === 'boolean').withMessage('atiende_domingo debe ser true o false'),

  body('activa').not().exists().withMessage('Activa no se puede enviar; para dar de baja usa DELETE'),
];

module.exports = { reglasSede };
