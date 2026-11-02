// Piezas reutilizables entre validadores.
const { body, param } = require('express-validator');

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENTERO_MAXIMO = 2147483647; // límite de una columna INT
// Conserva tabulaciones y saltos de línea: son válidos en un texto libre.
const CARACTERES_PROHIBIDOS = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

// Descarta booleanos, arreglos y objetos antes de una validación numérica.
const esTextoONumero = (valor) => typeof valor === 'string' || typeof valor === 'number';

// Parámetro de ruta :id → entero positivo (y ya convertido a número).
const idParam = (nombre = 'id') =>
  param(nombre).isInt({ min: 1 }).withMessage('El id debe ser un entero positivo').toInt();

// En PATCH (actualización parcial) los campos son opcionales; en POST/PUT son obligatorios.
const campo = (nombre, parcial = false) => (parcial ? body(nombre).optional() : body(nombre));

// Valida que el valor exista en un repositorio (llave foránea).
const existeEn = (repo, etiqueta) => (valor) => {
  if (!repo.findById(valor)) throw new Error(`${etiqueta} indicado no existe`);
  return true;
};

// Campo que referencia a otra tabla: obligatorio, entero positivo y existente.
const idRelacion = (nombre, repo, etiqueta) =>
  body(nombre)
    .notEmpty().withMessage(`${nombre} es obligatorio`).bail()
    .isInt({ min: 1 }).withMessage(`${nombre} debe ser un entero positivo`).bail()
    .toInt()
    .custom(existeEn(repo, etiqueta));

// Fecha de hoy en formato AAAA-MM-DD (zona horaria de la máquina).
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Fecha AAAA-MM-DD obligatoria y real (rechaza 2026-02-30).
const fechaISO = (nombre, etiqueta, parcial = false) =>
  campo(nombre, parcial)
    .notEmpty({ ignore_whitespace: true }).withMessage(`${etiqueta} es obligatoria`).bail()
    .isString().withMessage(`${etiqueta} debe ser texto`).bail()
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`${etiqueta} debe tener formato AAAA-MM-DD`).bail()
    .isISO8601({ strict: true }).withMessage(`${etiqueta} no existe en el calendario`);

// Hora HH:MM obligatoria.
const horaHHMM = (nombre, etiqueta, parcial = false) =>
  campo(nombre, parcial)
    .notEmpty({ ignore_whitespace: true }).withMessage(`${etiqueta} es obligatoria`).bail()
    .isString().withMessage(`${etiqueta} debe ser texto`).bail()
    .trim()
    .matches(FORMATO_HORA).withMessage(`${etiqueta} debe tener formato HH:MM`);

// Texto obligatorio con espacios normalizados. isString va primero porque
// express-validator revisa los arreglos elemento por elemento.
const textoObligatorio = (nombre, mensajeObligatorio, parcial = false) =>
  campo(nombre, parcial)
    .notEmpty({ ignore_whitespace: true }).withMessage(mensajeObligatorio).bail()
    .isString().withMessage(`${nombre} debe ser texto`).bail()
    .trim()
    .customSanitizer((valor) => valor.replace(/\s+/g, ' '));

// Texto libre opcional: acepta null, y el texto vacío se guarda como null.
const textoOpcional = (nombre, maximo) =>
  body(nombre).optional({ values: 'null' })
    .isString().withMessage(`${nombre} debe ser texto`).bail()
    .trim()
    .isLength({ max: maximo }).withMessage(`${nombre} admite máximo ${maximo} caracteres`)
    .not().matches(CARACTERES_PROHIBIDOS).withMessage(`${nombre} no admite < > ni caracteres de control`)
    .customSanitizer((valor) => valor || null);

// Entero positivo que referencia a otra tabla; su existencia se revisa en el servicio.
const enteroPositivo = (nombre, parcial = false) =>
  campo(nombre, parcial)
    .notEmpty().withMessage(`${nombre} es obligatorio`).bail()
    .custom(esTextoONumero).withMessage(`${nombre} debe ser un entero positivo`).bail()
    .isInt({ min: 1, max: ENTERO_MAXIMO }).withMessage(`${nombre} debe ser un entero positivo`)
    .toInt();

module.exports = {
  idParam, campo, existeEn, idRelacion, hoyISO, fechaISO, horaHHMM,
  textoObligatorio, textoOpcional, enteroPositivo, esTextoONumero, ENTERO_MAXIMO, FORMATO_HORA,
};