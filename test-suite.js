/**
 * Suite de Pruebas de Verificación Automatizada (Kodo Motors) — npm test
 * No necesita la base de datos: los repositorios se reemplazan por funciones de prueba.
 * Valida:
 * 1. Cero sentencias "DELETE FROM" en src/ (borrado lógico garantizado)
 * 2. Ninguna contraseña en db.js, docker-compose.yml ni .env.example
 * 3. Reglas de negocio de repuestos (no dar de baja con stock > 0)
 * 4. Reglas de negocio de encuestas (solo órdenes entregadas, una por orden)
 * 5. Borrado lógico en los seis recursos (404 si ya estaba dado de baja)
 * 6. Validaciones de los modelos (la bandera activo/activa no se acepta en el body)
 * 7. Contrato común: validarId y manejarErrores
 * 8. Validadores de sedes, servicios y reservas
 * 9. Reglas de negocio de reservas y bajas con citas pendientes
 */

const fs = require('fs');
const path = require('path');
const HttpError = require('./src/utils/http-error');
const Repuesto = require('./src/models/repuesto.model');
const Encuesta = require('./src/models/encuesta.model');
const Catalogo = require('./src/models/catalogo.model');
const reservaModelo = require('./src/models/reserva.model');
const sedeModelo = require('./src/models/sede.model');
const servicioModelo = require('./src/models/servicio.model');
const repuestosService = require('./src/services/repuestos.service');
const encuestasService = require('./src/services/encuestas.service');
const sedesService = require('./src/services/sedes.service');
const serviciosService = require('./src/services/servicios.service');
const catalogoService = require('./src/services/catalogo.service');
const reservaService = require('./src/services/reserva.service');
const repuestosRepository = require('./src/repositories/repuestos.repository');
const encuestasRepository = require('./src/repositories/encuestas.repository');
const sedesRepository = require('./src/repositories/sedes.repository');
const serviciosRepository = require('./src/repositories/servicios.repository');
const catalogoRepository = require('./src/repositories/catalogo.repository');
const reservaRepository = require('./src/repositories/reserva.repository');
const lookupsRepository = require('./src/repositories/lookups.repository');
const validarId = require('./src/middlewares/validarId');
const { manejarErrores } = require('./src/middlewares/manejarErrores');
const { pool } = require('./src/config/db');
const { validationResult } = require('express-validator');
const { reglasSede } = require('./src/validators/sedes.validators');
const { reglasServicio } = require('./src/validators/servicios.validators');
const {
  reglasCrearReserva,
  reglasActualizarReserva,
  reglasFiltrosReserva,
} = require('./src/validators/reservas.validators');

const resultados = [];

function registrarPrueba(codigo, descripcion, paso, esperado, obtenido) {
  resultados.push({ codigo, descripcion, paso, esperado, obtenido });
  const icono = paso ? '✅ PASS' : '❌ FAIL';
  console.log(`${icono} [${codigo}] ${descripcion}`);
  if (!paso) {
    console.error(`   Esperado: ${esperado}`);
    console.error(`   Obtenido: ${obtenido}`);
  }
}

// Ejecuta fn y devuelve el error lanzado (o null si no lanzó nada)
async function capturarError(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

function leer(rutaRelativa) {
  return fs.readFileSync(path.join(__dirname, rutaRelativa), 'utf8');
}

// Ejecuta las reglas de express-validator y devuelve los campos con error
async function camposConError(reglas, peticion) {
  const req = { body: {}, query: {}, params: {}, ...peticion };
  for (const regla of reglas) await regla.run(req);
  return [...new Set(validationResult(req).array().map((e) => e.path))];
}

// Fecha AAAA-MM-DD a n días de hoy, opcionalmente movida al siguiente día de la semana indicado
function fechaEnDias(dias, diaSemana = null) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  while (diaSemana !== null && fecha.getDay() !== diaSemana) fecha.setDate(fecha.getDate() + 1);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

// Respuesta falsa de Express para probar el manejador de errores
function respuestaFalsa() {
  return {
    codigo: null,
    cuerpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(cuerpo) { this.cuerpo = cuerpo; return this; },
  };
}

async function ejecutarSuite() {
  console.log('===============================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE CALIDAD (QA) - KODO MOTORS');
  console.log('===============================================================\n');

  // --- SECCIÓN 1: NINGÚN "DELETE FROM" EN EL CÓDIGO ---
  console.log('🔍 1. Verificación de Código Fuente (Auditoría Anti-Hard Delete)...');

  function scanDirForHardDelete(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let hallazgos = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        hallazgos = hallazgos.concat(scanDirForHardDelete(fullPath));
      } else if (entry.name.endsWith('.js')) {
        const text = fs.readFileSync(fullPath, 'utf8');
        const matches = text.match(/DELETE\s+FROM/gi);
        if (matches) {
          hallazgos.push({ file: fullPath, matches });
        }
      }
    }
    return hallazgos;
  }

  const hardDeletes = scanDirForHardDelete(path.join(__dirname, 'src'));
  registrarPrueba(
    'CP-01',
    'Ausencia total de sentencias SQL "DELETE FROM" en src/',
    hardDeletes.length === 0,
    '0 sentencias DELETE FROM en el backend',
    `${hardDeletes.length} sentencias encontradas: ${hardDeletes.map((h) => h.file).join(', ')}`
  );

  // --- SECCIÓN 2: SIN CREDENCIALES EN EL REPOSITORIO ---
  console.log('\n🔒 2. Auditoría de Seguridad de Credenciales...');

  const dbJs = leer('src/config/db.js');
  const dbConValorPorDefecto = /process\.env\.DB_(PASSWORD|USER)\s*\|\|/.test(dbJs);
  registrarPrueba(
    'CP-02',
    'db.js no define usuario ni contraseña por defecto',
    !dbConValorPorDefecto,
    'Credenciales solo desde el .env',
    dbConValorPorDefecto ? 'Valor por defecto encontrado' : 'Limpio'
  );

  const compose = leer('docker-compose.yml');
  const composeConValorPorDefecto = /\$\{[A-Z_]*(PASSWORD|USER)[A-Z_]*:-/.test(compose);
  registrarPrueba(
    'CP-03',
    'docker-compose.yml no trae credenciales por defecto (${VAR:-valor})',
    !composeConValorPorDefecto,
    'Variables exigidas con ${VAR:?mensaje}',
    composeConValorPorDefecto ? 'Valor por defecto encontrado' : 'Limpio'
  );

  // Cada contraseña del .env.example debe ser texto que describe qué va, no un valor
  const clavesEjemplo = leer('.env.example')
    .split(/\r?\n/)
    .filter((linea) => /^[A-Z_]*PASSWORD[A-Z_]*=/.test(linea))
    .map((linea) => linea.split('=').slice(1).join('='));
  const todasDescriptivas = clavesEjemplo.length > 0 && clavesEjemplo.every((valor) => valor.startsWith('contraseña_'));
  registrarPrueba(
    'CP-04',
    '.env.example solo describe las contraseñas, no las incluye',
    todasDescriptivas,
    'Cada *_PASSWORD con un texto "contraseña_..."',
    `Valores: ${clavesEjemplo.length} revisados, descriptivos=${todasDescriptivas}`
  );

  // --- SECCIÓN 3: REGLAS DE NEGOCIO - REPUESTOS ---
  console.log('\n📦 3. Reglas de Negocio de Repuestos (Borrado lógico)...');

  const origRep = { ...repuestosRepository };
  const origEnc = { ...encuestasRepository };
  const origSedes = { ...sedesRepository };
  const origServicios = { ...serviciosRepository };
  const origCatalogo = { ...catalogoRepository };
  const origReserva = { ...reservaRepository };
  const origLookups = { ...lookupsRepository };

  repuestosRepository.findById = async () => new Repuesto({
    id: 10, codigo: 'TST-001', nombre: 'Filtro Test', modelo_compatible: 'CX-5',
    stock: 4, stock_minimo: 2, precio: 80, activo: 1
  });
  let error = await capturarError(() => repuestosService.eliminar(10));
  registrarPrueba(
    'CP-05',
    'Bloquear baja de repuesto si aún cuenta con stock > 0',
    error instanceof HttpError && error.status === 400 && error.message.includes('stock disponible'),
    'HTTP 400 con advertencia de stock',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió eliminar'
  );

  repuestosRepository.findById = async () => new Repuesto({
    id: 11, codigo: 'TST-002', nombre: 'Bujía Test', modelo_compatible: 'Mazda3',
    stock: 0, stock_minimo: 2, precio: 35, activo: 1
  });
  let llamadoBajaRepuesto = false;
  repuestosRepository.remove = async () => { llamadoBajaRepuesto = true; return true; };
  error = await capturarError(() => repuestosService.eliminar(11));
  registrarPrueba(
    'CP-06',
    'Borrado lógico de repuesto con stock 0',
    !error && llamadoBajaRepuesto,
    'Sin error y llamada a remove() (UPDATE activo = 0)',
    `error=${error && error.message}, remove llamado=${llamadoBajaRepuesto}`
  );

  repuestosRepository.findByCodigo = async () => new Repuesto({
    id: 12, codigo: 'TST-003', nombre: 'Pastilla', modelo_compatible: 'CX-30', precio: 50, activo: 0
  });
  error = await capturarError(() => repuestosService.crear({
    codigo: 'TST-003', nombre: 'Pastilla nueva', modelo_compatible: 'CX-30', precio: 55
  }));
  registrarPrueba(
    'CP-07',
    'Código de repuesto que pertenece a uno dado de baja → 409',
    error instanceof HttpError && error.status === 409 && error.message.includes('dado de baja'),
    'HTTP 409 aclarando que está dado de baja',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió crear'
  );

  // --- SECCIÓN 4: REGLAS DE NEGOCIO - ENCUESTAS ---
  console.log('\n📋 4. Reglas de Negocio de Encuestas (Orden Entregada)...');

  encuestasRepository.findByOrdenId = async () => null;

  for (const [codigo, estado] of [['CP-08', 'en_proceso'], ['CP-09', 'listo']]) {
    encuestasRepository.findOrdenServicioById = async () => ({ id: 20, estado });
    error = await capturarError(() => encuestasService.crear({ orden_id: 20, puntuacion: 5, recomendaria: true }));
    registrarPrueba(
      codigo,
      `Rechazar encuesta para orden en estado "${estado}"`,
      error instanceof HttpError && error.status === 400 && error.message.includes('entregado'),
      'HTTP 400 indicando orden no entregada',
      error ? `HTTP ${error.status}: ${error.message}` : 'Permitió crear'
    );
  }

  encuestasRepository.findOrdenServicioById = async () => null;
  error = await capturarError(() => encuestasService.crear({ orden_id: 999, puntuacion: 5, recomendaria: true }));
  registrarPrueba(
    'CP-10',
    'Rechazar encuesta para orden inexistente (404)',
    error instanceof HttpError && error.status === 404,
    'HTTP 404',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió crear'
  );

  encuestasRepository.findOrdenServicioById = async () => ({ id: 22, estado: 'entregado' });
  encuestasRepository.findByOrdenId = async () => null;
  encuestasRepository.create = async (datos) => new Encuesta({
    id: 1, orden_id: datos.orden_id, puntuacion: datos.puntuacion,
    recomendaria: datos.recomendaria, comentario: datos.comentario || null, activo: 1
  });
  const nuevaEncuesta = await encuestasService.crear({ orden_id: 22, puntuacion: 5, recomendaria: true, comentario: 'Excelente' });
  registrarPrueba(
    'CP-11',
    'Aceptar encuesta cuando la orden está en estado "entregado"',
    nuevaEncuesta && nuevaEncuesta.ordenId === 22 && nuevaEncuesta.activo === true,
    'Encuesta creada con orden 22 y activo=true',
    `Creada ordenId=${nuevaEncuesta?.ordenId}, activo=${nuevaEncuesta?.activo}`
  );

  encuestasRepository.findByOrdenId = async () => new Encuesta({ id: 1, orden_id: 22, puntuacion: 5, recomendaria: true, activo: 1 });
  error = await capturarError(() => encuestasService.crear({ orden_id: 22, puntuacion: 5, recomendaria: true }));
  registrarPrueba(
    'CP-12',
    'Rechazar una segunda encuesta para la misma orden (409)',
    error instanceof HttpError && error.status === 409 && error.message.includes('ya cuenta con una encuesta'),
    'HTTP 409 por duplicidad',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió duplicar'
  );

  // --- SECCIÓN 5: BORRADO LÓGICO EN LOS SEIS RECURSOS ---
  console.log('\n🗑️ 5. Borrado lógico en los seis recursos...');

  encuestasRepository.findById = async () => new Encuesta({ id: 30, orden_id: 22, puntuacion: 5, recomendaria: true, activo: 1 });
  let llamadoBajaEncuesta = false;
  encuestasRepository.remove = async () => { llamadoBajaEncuesta = true; return true; };
  error = await capturarError(() => encuestasService.eliminar(30));
  registrarPrueba(
    'CP-13',
    'Borrado lógico de encuesta (remove() en lugar de DELETE físico)',
    !error && llamadoBajaEncuesta,
    'Sin error y llamada a remove()',
    `error=${error && error.message}, remove llamado=${llamadoBajaEncuesta}`
  );

  // Si el repositorio no encuentra una fila activa que dar de baja, el servicio responde 404
  repuestosRepository.findById = async () => null;
  encuestasRepository.findById = async () => null;
  sedesRepository.eliminar = async () => false;
  serviciosRepository.eliminar = async () => false;
  catalogoRepository.remove = async () => false;
  reservaRepository.eliminar = async () => false;
  reservaRepository.contarCitasPendientesDeSede = async () => 0;
  reservaRepository.contarCitasPendientesDeServicio = async () => 0;

  const recursos = [
    ['CP-14', 'una sede', () => sedesService.eliminarSede(5)],
    ['CP-15', 'un servicio', () => serviciosService.eliminarServicio(5)],
    ['CP-16', 'un vehículo del catálogo', () => catalogoService.eliminar(5)],
    ['CP-17', 'una reserva', () => reservaService.eliminar(5)],
    ['CP-18', 'un repuesto', () => repuestosService.eliminar(5)],
    ['CP-19', 'una encuesta', () => encuestasService.eliminar(5)],
  ];
  for (const [codigo, nombre, eliminar] of recursos) {
    error = await capturarError(eliminar);
    registrarPrueba(
      codigo,
      `Dar de baja ${nombre} que no existe o ya está de baja → 404`,
      error instanceof HttpError && error.status === 404,
      'HTTP 404',
      error ? `HTTP ${error.status}: ${error.message}` : 'No lanzó error'
    );
  }

  sedesRepository.buscarPorNombre = async () => ({ id: 3, activa: false });
  error = await capturarError(() => sedesService.crearSede({
    nombre: 'Kodo San Miguel', distrito: 'San Miguel', direccion: 'Av. La Marina 2300',
    telefono: '015661122', hora_apertura: '09:00', hora_cierre: '18:00'
  }));
  registrarPrueba(
    'CP-20',
    'Nombre de sede que pertenece a una sede dada de baja → 409',
    error instanceof HttpError && error.status === 409 && error.message.includes('dada de baja'),
    'HTTP 409 aclarando que está dada de baja',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió crear'
  );

  // --- SECCIÓN 6: VALIDACIONES DE LOS MODELOS ---
  console.log('\n🧾 6. Validaciones de los modelos...');

  error = await capturarError(() => sedeModelo.revisarCampos({ nombre: 'X', activa: false }));
  registrarPrueba(
    'CP-21',
    'Sedes: activa no se acepta en el body',
    error instanceof HttpError && error.status === 400 && error.errores.some((e) => e.includes('activa')),
    'HTTP 400 con "activa no es un campo permitido"',
    error ? `HTTP ${error.status}: ${JSON.stringify(error.errores)}` : 'Lo aceptó'
  );

  error = await capturarError(() => servicioModelo.revisarCampos({ nombre: 'X', activo: true }));
  registrarPrueba(
    'CP-22',
    'Servicios: activo no se acepta en el body',
    error instanceof HttpError && error.status === 400 && error.errores.some((e) => e.includes('activo')),
    'HTTP 400 con "activo no es un campo permitido"',
    error ? `HTTP ${error.status}: ${JSON.stringify(error.errores)}` : 'Lo aceptó'
  );

  error = await capturarError(() => sedeModelo.validarSede({ nombre: '', telefono: '123' }));
  registrarPrueba(
    'CP-23',
    'Sedes: datos incompletos devuelven la lista de errores',
    error instanceof HttpError && error.status === 400 && error.errores.length >= 4,
    'HTTP 400 con un error por campo',
    error ? `HTTP ${error.status}: ${error.errores.length} errores` : 'Lo aceptó'
  );

  const erroresCatalogo = Catalogo.validar({
    modelo: 'CX-5', version: 'Grand Touring', anio: 2026, precio_usd: 38990,
    combustible: 'gasolina', transmision: 'automatica', activo: false
  });
  registrarPrueba(
    'CP-24',
    'Catálogo: activo no se acepta en el body',
    erroresCatalogo.length === 1 && erroresCatalogo[0].includes('activo'),
    'Un error sobre activo',
    JSON.stringify(erroresCatalogo)
  );

  const erroresReservaVacia = reservaModelo.validar({});
  const erroresReservaActivo = reservaModelo.validar({ activo: false }, { parcial: true });
  registrarPrueba(
    'CP-25',
    'Reservas: campos obligatorios y activo rechazado',
    erroresReservaVacia.length === 5 && erroresReservaActivo.length === 1,
    '5 obligatorios faltantes; 1 error por activo',
    `obligatorios=${erroresReservaVacia.length}, activo=${erroresReservaActivo.length}`
  );

  const erroresRepuesto = Repuesto.validar({ activo: 0 }, true);
  const erroresEncuesta = Encuesta.validar({ activo: 0 }, true);
  registrarPrueba(
    'CP-26',
    'Repuestos y encuestas: activo rechazado en la actualización',
    erroresRepuesto.length === 1 && erroresEncuesta.length === 1,
    'Un error por modelo',
    `repuesto=${erroresRepuesto.length}, encuesta=${erroresEncuesta.length}`
  );

  // --- SECCIÓN 7: CONTRATO COMÚN ---
  console.log('\n🧩 7. Contrato común (validarId y manejarErrores)...');

  let errorRecibido = null;
  validarId({ params: { id: 'abc' } }, {}, (err) => { errorRecibido = err; });
  let siguienteSinError = false;
  validarId({ params: { id: '7' } }, {}, (err) => { siguienteSinError = err === undefined; });
  registrarPrueba(
    'CP-27',
    'validarId: "abc" → 400; "7" → continúa',
    errorRecibido instanceof HttpError && errorRecibido.status === 400 && siguienteSinError,
    'HttpError 400 y luego next() sin error',
    `abc=${errorRecibido && errorRecibido.status}, 7 continúa=${siguienteSinError}`
  );

  let res = respuestaFalsa();
  manejarErrores(new HttpError(400, 'Datos inválidos', ['nombre es obligatorio']), {}, res, () => {});
  registrarPrueba(
    'CP-28',
    'manejarErrores: HttpError → { mensaje, errores }',
    res.codigo === 400 && res.cuerpo.mensaje === 'Datos inválidos' && res.cuerpo.errores.length === 1,
    '400 { mensaje, errores }',
    `${res.codigo} ${JSON.stringify(res.cuerpo)}`
  );

  res = respuestaFalsa();
  manejarErrores(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }), {}, res, () => {});
  registrarPrueba(
    'CP-29',
    'manejarErrores: ER_DUP_ENTRY de MySQL → 409',
    res.codigo === 409 && typeof res.cuerpo.mensaje === 'string',
    '409 { mensaje }',
    `${res.codigo} ${JSON.stringify(res.cuerpo)}`
  );

  res = respuestaFalsa();
  const errorConsola = console.error;
  console.error = () => {};
  manejarErrores(new Error('detalle interno que no debe salir'), {}, res, () => {});
  console.error = errorConsola;
  registrarPrueba(
    'CP-30',
    'manejarErrores: error inesperado → 500 sin detalles internos',
    res.codigo === 500 && !JSON.stringify(res.cuerpo).includes('detalle interno'),
    '500 { mensaje: "Error interno del servidor" }',
    `${res.codigo} ${JSON.stringify(res.cuerpo)}`
  );

  // --- SECCIÓN 8: VALIDADORES ---
  console.log('\n🛡️ 8. Validadores de sedes, servicios y reservas...');

  const sedeValida = {
    nombre: 'Kodo San Isidro', distrito: 'San Isidro', direccion: 'Av. Javier Prado Este 1234, Of. 2',
    telefono: '014445566', hora_apertura: '08:00', hora_cierre: '18:00', atiende_domingo: false,
  };
  const sinErroresSede = await camposConError(reglasSede(), { body: sedeValida });
  const erroresSede = await camposConError(reglasSede(), {
    body: {
      ...sedeValida, nombre: '<script>alert(1)</script>', distrito: 'Lima 1', direccion: ['Av. Larco 100'],
      telefono: '123456789', hora_apertura: '8:00', atiende_domingo: 'quizá',
    },
  });
  registrarPrueba(
    'CP-31',
    'Sedes: acepta datos reales y rechaza HTML, arreglos y formatos inválidos',
    sinErroresSede.length === 0 && erroresSede.length === 6,
    '0 errores con datos válidos y 6 campos rechazados',
    `válidos=${JSON.stringify(sinErroresSede)}, inválidos=${JSON.stringify(erroresSede)}`
  );

  const parcialSede = await camposConError(reglasSede(true), { body: { direccion: 'Av. Larco 200' } });
  const reqEspacios = { body: { ...sedeValida, nombre: '  Kodo   Miraflores ' } };
  await camposConError(reglasSede(), reqEspacios);
  const sedeConActiva = await camposConError(reglasSede(true), { body: { activa: true } });
  registrarPrueba(
    'CP-32',
    'Sedes: PUT parcial, espacios normalizados y activa rechazada',
    parcialSede.length === 0 && reqEspacios.body.nombre === 'Kodo Miraflores' && sedeConActiva.includes('activa'),
    'PUT parcial válido, nombre limpio y activa con error',
    `parcial=${JSON.stringify(parcialSede)}, nombre="${reqEspacios.body.nombre}", activa=${JSON.stringify(sedeConActiva)}`
  );

  const servicioValido = {
    nombre: 'Alineamiento 3D', categoria: 'neumaticos', descripcion: 'Incluye balanceo', precio: 99.9, duracion_min: 45,
  };
  const sinErroresServicio = await camposConError(reglasServicio(), { body: servicioValido });
  const erroresServicio = await camposConError(reglasServicio(), {
    body: {
      nombre: 'AB', categoria: 'otra', descripcion: '<b>oferta</b>', precio: 10.999, duracion_min: 10,
    },
  });
  const precioArreglo = await camposConError(reglasServicio(true), { body: { precio: [100] } });
  registrarPrueba(
    'CP-33',
    'Servicios: valida texto, categoría, precio con 2 decimales y duración',
    sinErroresServicio.length === 0 && erroresServicio.length === 5 && precioArreglo.includes('precio'),
    '0 errores con datos válidos, 5 campos rechazados y arreglo en precio rechazado',
    `válidos=${JSON.stringify(sinErroresServicio)}, inválidos=${JSON.stringify(erroresServicio)}, arreglo=${JSON.stringify(precioArreglo)}`
  );

  const reservaValida = {
    fecha: '2026-12-21', hora: '09:30', sede_id: 1, servicio_id: 1, vehiculo_id: 1, observacion: 'Primera visita',
  };
  const sinErroresReserva = await camposConError(reglasCrearReserva(), { body: reservaValida });
  const erroresReserva = await camposConError(reglasCrearReserva(), {
    body: {
      fecha: '2026-02-30', hora: '09:15', sede_id: true, servicio_id: [1], vehiculo_id: 0,
      estado: 'atendida', observacion: '<img src=x>',
    },
  });
  registrarPrueba(
    'CP-34',
    'Reservas: rechaza fecha imposible, hora fuera de intervalo, ids no enteros y estado inicial',
    sinErroresReserva.length === 0 && erroresReserva.length === 7,
    '0 errores con datos válidos y 7 campos rechazados',
    `válidos=${JSON.stringify(sinErroresReserva)}, inválidos=${JSON.stringify(erroresReserva)}`
  );

  const parcialReserva = await camposConError(reglasActualizarReserva(), { body: { observacion: null } });
  const estadoReserva = await camposConError(reglasActualizarReserva(), { body: { estado: 'perdida' } });
  registrarPrueba(
    'CP-35',
    'Reservas: PUT parcial acepta observacion null y rechaza un estado inexistente',
    parcialReserva.length === 0 && estadoReserva.includes('estado'),
    'Sin errores en el parcial y error en estado',
    `parcial=${JSON.stringify(parcialReserva)}, estado=${JSON.stringify(estadoReserva)}`
  );

  const filtrosValidos = await camposConError(reglasFiltrosReserva(), {
    query: { estado: 'pendiente', fecha: '2026-11-20', sede_id: '1' },
  });
  const filtrosInvalidos = await camposConError(reglasFiltrosReserva(), {
    query: { estado: ['pendiente', 'atendida'], fecha: 'ayer', sede_id: 'abc' },
  });
  registrarPrueba(
    'CP-36',
    'Reservas: filtros inválidos o repetidos se rechazan',
    filtrosValidos.length === 0 && filtrosInvalidos.length === 3,
    '0 errores con filtros válidos y 3 rechazados',
    `válidos=${JSON.stringify(filtrosValidos)}, inválidos=${JSON.stringify(filtrosInvalidos)}`
  );

  // --- SECCIÓN 9: REGLAS DE RESERVAS Y BAJAS ---
  console.log('\n📅 9. Reglas de negocio de reservas y bajas con citas pendientes...');

  lookupsRepository.existeSede = async () => true;
  lookupsRepository.existeServicio = async () => true;
  lookupsRepository.existeVehiculo = async () => true;
  sedesRepository.buscarPorId = async () => ({
    id: 1, nombre: 'Kodo Surquillo', hora_apertura: '08:00:00', hora_cierre: '18:00:00', atiende_domingo: false,
  });
  serviciosRepository.buscarPorId = async () => ({ id: 1, duracion_min: 120 });
  reservaRepository.existeChoque = async () => false;
  reservaRepository.existeChoqueVehiculo = async () => false;
  reservaRepository.crear = async (datos) => datos;
  reservaRepository.actualizar = async (id, datos) => ({ id, ...datos });

  const lunes = fechaEnDias(1, 1);
  const cita = { hora: '09:30', sede_id: 1, servicio_id: 1, vehiculo_id: 1 };

  const casosAgenda = [
    ['CP-37', 'Cita en el pasado', { ...cita, fecha: '2020-01-06' }, 'pasada'],
    ['CP-38', 'Cita a más de 30 días', { ...cita, fecha: fechaEnDias(31) }, '30 días'],
    ['CP-39', 'Cita en domingo en sede que no atiende', { ...cita, fecha: fechaEnDias(1, 0) }, 'domingos'],
    ['CP-40', 'Cita antes de la apertura', { ...cita, fecha: lunes, hora: '07:30' }, 'horario'],
    ['CP-41', 'Servicio que termina después del cierre', { ...cita, fecha: lunes, hora: '16:30' }, 'horario'],
  ];
  for (const [codigo, descripcion, datos, texto] of casosAgenda) {
    error = await capturarError(() => reservaService.crear(datos));
    registrarPrueba(
      codigo,
      `${descripcion} → 400`,
      error instanceof HttpError && error.status === 400 && error.message.includes(texto),
      `HTTP 400 con "${texto}"`,
      error ? `HTTP ${error.status}: ${error.message}` : 'Permitió crear'
    );
  }

  const creada = await reservaService.crear({ ...cita, fecha: lunes, hora: '16:00' });
  registrarPrueba(
    'CP-42',
    'Servicio que termina justo al cierre se acepta',
    creada && creada.hora === '16:00',
    'Reserva creada',
    JSON.stringify(creada)
  );

  error = await capturarError(() => reservaService.crear({ ...cita, fecha: lunes, placa: 'ABC123' }));
  registrarPrueba(
    'CP-43',
    'Reservas: un campo desconocido se rechaza',
    error instanceof HttpError && error.status === 400 && error.errores.some((e) => e.includes('placa')),
    'HTTP 400 con "placa no es un campo permitido"',
    error ? `HTTP ${error.status}: ${JSON.stringify(error.errores)}` : 'Lo aceptó'
  );

  reservaRepository.existeChoqueVehiculo = async () => true;
  error = await capturarError(() => reservaService.crear({ ...cita, fecha: lunes }));
  reservaRepository.existeChoqueVehiculo = async () => false;
  registrarPrueba(
    'CP-44',
    'Mismo vehículo en la misma fecha y hora → 409',
    error instanceof HttpError && error.status === 409 && error.message.includes('vehículo'),
    'HTTP 409 por el vehículo',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió crear'
  );

  const reservaGuardada = (estado, fecha = lunes) => ({
    id: 8, fecha, hora: '09:30', estado, sede: { id: 1 }, servicio: { id: 1 }, vehiculo: { id: 1 },
  });

  reservaRepository.obtenerPorId = async () => reservaGuardada('pendiente');
  error = await capturarError(() => reservaService.actualizar(8, { estado: 'atendida' }));
  registrarPrueba(
    'CP-45',
    'Una reserva pendiente no pasa directo a atendida → 409',
    error instanceof HttpError && error.status === 409 && error.message.includes('confirmada'),
    'HTTP 409 con los estados permitidos',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió cambiar'
  );

  reservaRepository.obtenerPorId = async () => reservaGuardada('cancelada');
  error = await capturarError(() => reservaService.actualizar(8, { observacion: 'Reabrir' }));
  registrarPrueba(
    'CP-46',
    'Una reserva cancelada ya no se puede editar → 409',
    error instanceof HttpError && error.status === 409 && error.message.includes('ya no se puede modificar'),
    'HTTP 409',
    error ? `HTTP ${error.status}: ${error.message}` : 'Permitió editar'
  );

  reservaRepository.obtenerPorId = async () => reservaGuardada('confirmada', '2026-10-20');
  const atendida = await reservaService.actualizar(8, { estado: 'atendida' });
  registrarPrueba(
    'CP-47',
    'Una cita pasada confirmada se puede marcar como atendida',
    atendida && atendida.estado === 'atendida',
    'Reserva actualizada',
    JSON.stringify(atendida)
  );

  reservaRepository.contarCitasPendientesDeSede = async () => 2;
  reservaRepository.contarCitasPendientesDeServicio = async () => 3;
  let llamadoBajaConCitas = false;
  sedesRepository.eliminar = async () => { llamadoBajaConCitas = true; return true; };
  serviciosRepository.eliminar = async () => { llamadoBajaConCitas = true; return true; };

  const bajasConCitas = [
    ['CP-48', 'una sede', () => sedesService.eliminarSede(1)],
    ['CP-49', 'un servicio', () => serviciosService.eliminarServicio(1)],
  ];
  for (const [codigo, nombre, eliminar] of bajasConCitas) {
    error = await capturarError(eliminar);
    registrarPrueba(
      codigo,
      `Dar de baja ${nombre} con citas pendientes → 409`,
      error instanceof HttpError && error.status === 409
        && error.message.includes('citas generadas pendientes') && !llamadoBajaConCitas,
      'HTTP 409 indicando las citas pendientes y sin dar de baja',
      error ? `HTTP ${error.status}: ${error.message}` : 'Permitió dar de baja'
    );
  }

  // Restaurar repositorios originales
  Object.assign(lookupsRepository, origLookups);
  Object.assign(repuestosRepository, origRep);
  Object.assign(encuestasRepository, origEnc);
  Object.assign(sedesRepository, origSedes);
  Object.assign(serviciosRepository, origServicios);
  Object.assign(catalogoRepository, origCatalogo);
  Object.assign(reservaRepository, origReserva);

  // Resumen final
  console.log('\n===============================================================');
  const aprobadas = resultados.filter((r) => r.paso).length;
  const fallidas = resultados.filter((r) => !r.paso).length;
  console.log(`📊 RESUMEN: ${aprobadas} Aprobadas, ${fallidas} Fallidas de un total de ${resultados.length} pruebas.`);
  if (fallidas === 0) {
    console.log('🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
  } else {
    console.error('⚠️ Se detectaron fallas en las pruebas.');
  }
  console.log('===============================================================\n');

  // npm test falla si alguna prueba falla
  process.exitCode = fallidas === 0 ? 0 : 1;
}

ejecutarSuite()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
