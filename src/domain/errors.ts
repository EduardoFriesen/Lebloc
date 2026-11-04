export const ERROR_MESSAGES = {
  INVALID_AMOUNT: 'El monto tiene que ser mayor a cero.',
  PAYMENT_EXCEEDS_DEBT: 'El pago supera lo que se debe.',
  PAYOUT_EXCEEDS_BALANCE: 'La liquidación supera el saldo del profesor.',
  ONLY_LAST_PAYMENT_VOIDABLE: 'Solo se puede anular el último pago activo de la venta.',
  SALE_HAS_ACTIVE_PAYMENTS: 'La venta tiene pagos activos. Anulalos primero.',
  SALE_HAS_ACTIVE_CONSUMPTIONS: 'La venta tiene consumos activos. Anulalos primero.',
  SALE_HAS_ACTIVE_CANCELLATIONS: 'La venta tiene la deuda cancelada. Anulá la cancelación primero.',
  NO_DEBT_TO_CANCEL: 'La venta no tiene deuda para cancelar.',
  NOT_FULLY_PAID: 'Solo se facturan las ventas pagadas por completo.',
  SALE_INVOICED: 'La venta está facturada. Desmarcala en Planes primero.',
  NOT_PAID_BY_TRANSFER: 'Solo se facturan las ventas con algún pago por transferencia.',
  DEBT_CANCELLED: 'La venta tiene la deuda cancelada. Anulá la cancelación antes de extenderla.',
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
  WAIVER_DATE_IN_FUTURE: 'La fecha de entrega no puede ser posterior a hoy.',
  PURCHASE_VOIDED: 'La entrega está anulada.',
  PURCHASE_HAS_ACTIVE_PAYMENTS: 'La entrega tiene pagos activos. Anulalos primero.',
  PAID_EXCEEDS_PURCHASE: 'Lo pagado supera el total de la entrega.',
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
  SALE_EXPIRED: 'La venta está vencida: no se puede extender.',
  SAME_PLAN: 'La venta ya es de ese plan.',
  TEACHER_CHANGE_NOT_ALLOWED: 'El profesor de la venta no se puede cambiar.',
  EXTENSION_NEEDS_TEACHER_PLAN: 'Una venta con profesor solo se extiende a un plan con clases con profesor.',
  EXTENSION_NEEDS_FREE_PASSES: 'Una venta libre solo se extiende a un plan con clases libres.',
  USED_PASSES_DONT_FIT: 'Las clases que ya usó no entran en el plan nuevo.',
  PAID_EXCEEDS_PLAN: 'Lo que ya pagó supera el precio del plan nuevo.',
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
