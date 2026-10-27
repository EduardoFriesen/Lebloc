export const ERROR_MESSAGES = {
  INVALID_AMOUNT: 'El monto tiene que ser mayor a cero.',
  PAYMENT_EXCEEDS_DEBT: 'El pago supera la deuda de la venta.',
  PAYOUT_EXCEEDS_BALANCE: 'La liquidación supera el saldo del profesor.',
  ONLY_LAST_PAYMENT_VOIDABLE: 'Solo se puede anular el último pago activo de la venta.',
  SALE_HAS_ACTIVE_PAYMENTS: 'La venta tiene pagos activos. Anulalos primero.',
  SALE_HAS_ACTIVE_CONSUMPTIONS: 'La venta tiene consumos activos. Anulalos primero.',
  SALE_VOIDED: 'La venta está anulada.',
  EXPIRY_BEFORE_SALE: 'El vencimiento no puede ser anterior a la venta.',
  NO_PASSES_AVAILABLE: 'El cliente no tiene pases disponibles de ese tipo.',
  MINOR_REQUIRES_GUARDIAN: 'Un cliente menor de edad necesita al menos un tutor.',
  TEACHER_REQUIRED: 'Este plan incluye clases con profesor: elegí un profesor.',
  TEACHER_NOT_ALLOWED: 'Este plan no incluye clases con profesor.',
  INACTIVE_PLAN: 'El plan está inactivo.',
  INACTIVE_TEACHER: 'El profesor está inactivo.',
  TEACHER_AMOUNT_MISSING: 'Cargá el monto para el profesor en Planes.',
  ALREADY_VOIDED: 'El registro ya está anulado.',
  CLIENT_ARCHIVED: 'El cliente está archivado.',
  CLIENT_NOT_ARCHIVED: 'Solo se puede anonimizar un cliente archivado.',
  CLIENT_ANONYMIZED: 'El cliente fue anonimizado y no se puede modificar.',
  INVALID_BACKUP: 'El archivo no es un backup válido de Lebloc.',
  RESTORE_IN_PROGRESS: 'Ya hay una restauración en curso.',
  WAIVER_DATE_IN_FUTURE: 'La fecha de firma no puede ser posterior a hoy.',
  PRODUCT_INACTIVE: 'El producto está inactivo.',
  PRODUCT_NAME_TAKEN: 'Ya hay un producto con ese nombre.',
  PRICE_NOT_SET: 'Configurá el precio en Planes.',
  DATE_IN_FUTURE: 'La fecha no puede ser posterior a hoy.',
  EMPLOYEE_INACTIVE: 'El empleado está inactivo.',
  NOTHING_TO_PAY: 'No hay turnos sin pagar en ese rango.',
  SHIFT_PAID: 'El turno ya está liquidado. Anulá la liquidación primero.',
  INVALID_SPREADSHEET: 'El archivo no es una planilla .xlsx que se pueda leer.',
  MISSING_PASES_SHEET: 'La planilla no tiene la hoja "PASES".',
  NO_PENDING_IMPORT: 'Elegí la planilla de nuevo antes de importar.',
  IMPORT_NOT_EMPTY: 'Ya hay clientes cargados: la planilla solo se importa en una base vacía. Restaurá un backup sin clientes para importarla.',
  DRIVE_UNAVAILABLE: 'Google Drive no está disponible en esta versión de Lebloc o en esta PC.',
  DRIVE_CONNECT_FAILED: 'No se pudo conectar con Google. Probá de nuevo.',
  NOT_FOUND: 'No se encontró el registro.',
} as const;

export type DomainErrorCode = keyof typeof ERROR_MESSAGES;

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
  }
}
