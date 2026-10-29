import type { Balance, MoneySource, SourceTotals } from '../domain/finance';
import type { ImportSummary, ImportWarning } from '../domain/legacyImport';
import type { PassKind, PassStatus } from '../domain/passes';
import type { DateRange, Granularity } from '../domain/periods';
import type { SplitRule } from '../domain/sale';
import type { WaiverState, WaiverStatus } from '../domain/waiver';

export type { Balance, DateRange, Granularity, ImportSummary, ImportWarning, MoneySource, PassStatus, SourceTotals, WaiverState, WaiverStatus };

export type PaymentMethod = 'cash' | 'transfer';

export interface Guardian {
  id: number;
  clientId: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  phone: string | null;
  relation: string | null;
}

export interface Client {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  dni: string | null;
  notes: string | null;
  address: string | null;
  phone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  enrolledAt: string;
  updatedAt: string;
  archivedAt: string | null;
  anonymizedAt: string | null;
  guardians: Guardian[];
}

export interface ClientSummary {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  dni: string | null;
  archivedAt: string | null;
  activeSales: number;
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
  /** Days since the oldest sale that still has debt; null when the client owes nothing. */
  debtDays: number | null;
  /** Last day any of the passes left can be used; null without passes left. */
  expiresAt: string | null;
  passStatus: PassStatus;
  waiver: WaiverStatus;
}

export interface Social {
  network: string;
  handle: string;
}

export interface TeacherSchedule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
  address: string | null;
  phone: string | null;
  socials: Social[];
  active: boolean;
  schedules: TeacherSchedule[];
}

export interface Plan {
  id: number;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  /** What the teacher gets for all the plan's teacher passes, charged on top of the price. */
  teacherAmountCents: number;
  active: boolean;
}

export interface Sale {
  id: number;
  clientId: number;
  soldAt: string;
  planId: number;
  planName: string;
  freePasses: number;
  teacherPasses: number;
  localPriceCents: number;
  teacherId: number | null;
  teacherName: string | null;
  teacherSurchargeCents: number;
  totalCents: number;
  splitRule: SplitRule;
  voidedAt: string | null;
  /** Last day the passes can be used; after it the ones left are lost (remaining shows 0). */
  expiresAt: string;
  expired: boolean;
  paidCents: number;
  debtCents: number;
  remainingFree: number;
  remainingTeacher: number;
}

export interface Payment {
  id: number;
  saleId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  localCents: number;
  teacherCents: number;
  voidedAt: string | null;
}

export interface Consumption {
  id: number;
  saleId: number;
  kind: PassKind;
  consumedAt: string;
  note: string | null;
  voidedAt: string | null;
}

export interface ClientAccount {
  client: Client;
  sales: Sale[];
  payments: Payment[];
  consumptions: Consumption[];
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
  /** Last day any of the passes left can be used; null without passes left. */
  expiresAt: string | null;
  /** Few passes left, or they all expire within the warning days. */
  lowOnPasses: boolean;
  waivers: WaiverSignature[];
  waiver: WaiverStatus;
}

export interface WaiverSignature {
  id: number;
  clientId: number;
  signedAt: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface WaiverAlert {
  clientId: number;
  clientName: string;
  state: WaiverState;
  expiresAt: string | null;
}

export interface TeacherPayout {
  id: number;
  teacherId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  note: string | null;
  voidedAt: string | null;
}

export interface TeacherShare {
  paymentId: number;
  saleId: number;
  paidAt: string;
  clientName: string;
  planName: string;
  teacherCents: number;
}

export interface TeacherBalance {
  teacherId: number;
  teacherName: string;
  earnedCents: number;
  paidOutCents: number;
  balanceCents: number;
  /** Classes sold to active clients and not given yet. */
  pendingClasses: number;
}

export interface TeacherAccount extends TeacherBalance {
  teacher: Teacher;
  payouts: TeacherPayout[];
  shares: TeacherShare[];
  /** This month's sales with this teacher. */
  enrollments: Enrollment[];
}

/** A sale made this month: who enrolled, in what, and what's left of that sale. */
export interface Enrollment {
  saleId: number;
  clientId: number;
  clientName: string;
  planName: string;
  teacherName: string | null;
  soldAt: string;
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
  expiresAt: string;
  passStatus: PassStatus;
}

/** A non-voided plan sale: when, to whom, and what is still owed on it. */
export interface PlanSale {
  saleId: number;
  soldAt: string;
  clientId: number;
  clientName: string;
  /** As the plan was named when it was sold. */
  planName: string;
  teacherName: string | null;
  totalCents: number;
  debtCents: number;
}

export interface DashboardSummary {
  /** Active clients with at least one pass left. */
  activeClients: number;
  debtorCount: number;
  debtTotalCents: number;
  /** Active clients whose waiver is missing or expired. */
  pendingWaivers: number;
  /** Sum of every teacher's balance (negative when the local is owed). */
  teacherBalanceCents: number;
  /** Kiosk tickets sold today that are not voided. */
  kioskTodayCount: number;
  kioskTodayCents: number;
  /** The last copy out of the PC failed: the pendrive is not plugged in, or there was no internet for Google Drive. */
  externalBackupFailed: boolean;
}

/** Headline numbers beside the client list. "Active" means not archived. */
export interface ClientStats {
  active: number;
  archived: number;
  /** Active clients with at least one pass left. */
  withPasses: number;
  withoutPasses: number;
  debtorCount: number;
  debtTotalCents: number;
  /** Active clients whose waiver is missing or expired. */
  pendingWaivers: number;
  /** Active clients under 18. */
  minors: number;
  /** Active clients enrolled this calendar month. */
  newThisMonth: number;
}

/** Headline numbers beside the teacher list. */
export interface TeacherStats {
  active: number;
  inactive: number;
  /** What the local owes its teachers: positive balances only. */
  owedCents: number;
  owedTeachers: number;
  /** Teacher passes sold to active clients and not yet given. */
  pendingClasses: number;
}

/** Headline numbers beside the plan list. */
export interface PlanStats {
  active: number;
  inactive: number;
  /** Non-voided sales this calendar month. */
  monthSales: number;
  /** Local price of those sales; the teacher surcharge is not the local's income. */
  monthLocalCents: number;
}

export interface Dashboard {
  summary: DashboardSummary;
  /** Low or no passes and came in the last 30 days. */
  renewals: ClientSummary[];
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  /** Set by the last supplier delivery, or by hand. */
  unitCostCents: number;
  markupPercent: number;
  priceCents: number;
  active: boolean;
  /** Derived from the unit cost and the markup: never stored. */
  suggestedPriceCents: number;
}

export interface KioskSaleItem {
  id: number;
  productId: number;
  /** Snapshots taken when the ticket was sold. */
  productName: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
}

export interface KioskSale {
  id: number;
  soldAt: string;
  recordedAt: string;
  method: PaymentMethod;
  voidedAt: string | null;
  items: KioskSaleItem[];
  /** Derived from the items: never stored. */
  totalCents: number;
}

export type CounterSaleKind = 'day_pass' | 'shoe_rental';

/** A walk-in day pass or a shoe rental, charged at the counter without a client. */
export interface CounterSale {
  id: number;
  kind: CounterSaleKind;
  priceCents: number;
  method: PaymentMethod;
  soldAt: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface KioskStats {
  activeProducts: number;
  inactiveProducts: number;
  todayCount: number;
  todayCents: number;
  todayProfitCents: number;
}

export interface CounterPrices {
  dayPassCents: number;
  shoeRentalCents: number;
}

export type DayMovement =
  | { kind: 'kiosk'; sale: KioskSale }
  | { kind: 'counter'; sale: CounterSale }
  | {
      kind: 'plan';
      paymentId: number;
      clientId: number;
      clientName: string;
      planName: string;
      method: PaymentMethod;
      amountCents: number;
      saleTotalCents: number;
      debtCents: number;
      /** When it was registered; null for payments recorded before times were kept. */
      recordedAt: string | null;
    };

/** Today's cash in: plan payments first (they carry no time), then kiosk tickets. Totals are derived. */
/** Who came in today: a client's pass (with what's left) or a walk-in day pass. */
export type DayEntry =
  | {
      kind: 'pass';
      consumptionId: number;
      clientId: number;
      clientName: string;
      passKind: PassKind;
      recordedAt: string;
      remainingFree: number;
      remainingTeacher: number;
      expiresAt: string | null;
      passStatus: PassStatus;
    }
  | { kind: 'walk_in'; sale: CounterSale };

export interface DayMovements {
  rows: DayMovement[];
  kioskCents: number;
  plansCents: number;
  counterCents: number;
  totalCents: number;
}

export interface Settings {
  lowPassesThreshold: number;
  /** Warn this many days before the passes left expire. */
  expiryWarningDays: number;
  waiverValidityMonths: number;
}

export type BackupOutcome = { status: 'done'; path: string } | { status: 'cancelled' };

/** The automatic copies of every backup out of this PC: into an external folder (a pendrive) and up to Google Drive. */
export interface BackupStatus {
  mirrorDir: string | null;
  /** Last successful external copy. */
  mirrorAt: string | null;
  /** Why the last external copy failed; null when it worked. */
  mirrorError: string | null;
  /** The Google account every backup is uploaded to; null when Drive is not connected. */
  driveEmail: string | null;
  /** Last successful upload to Drive. */
  driveAt: string | null;
  /** Why the last upload failed; null when it worked. */
  driveError: string | null;
}

export type AuditAction = 'client_anonymized' | 'backup_exported' | 'backup_restored' | 'data_imported' | 'drive_connected' | 'drive_disconnected';

/** One traced operation on personal data (Ley 25.326). Never edited or deleted. */
export interface AuditEntry {
  id: number;
  at: string;
  action: AuditAction;
  /** The client, for an anonymization. */
  subjectId: number | null;
  /** The file, for a backup export or restore; what came in, for an import. */
  detail: string | null;
}

export type ExpenseCategory = 'rent' | 'electricity' | 'gas' | 'water' | 'internet' | 'taxes' | 'maintenance' | 'other';

/** A fixed cost of the local (rent, utilities, ...). Kiosk stock is not an expense: its cost goes with each sale. */
export interface Expense {
  id: number;
  category: ExpenseCategory;
  description: string | null;
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface ExpenseMonth {
  /** Voided ones included, newest first. */
  expenses: Expense[];
  /** Non-voided only. */
  totalCents: number;
  /** Non-voided only, largest first. */
  byCategory: { category: ExpenseCategory; cents: number }[];
}

/** Every employee is paid by the hour; staff/casual is only a label. */
export type EmployeeKind = 'staff' | 'casual';

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  phone: string | null;
  address: string | null;
  kind: EmployeeKind;
  hourlyRateCents: number;
  active: boolean;
}

export interface EmployeeSummary extends Employee {
  /** Non-voided shifts of the requested month. */
  monthMinutes: number;
  monthCostCents: number;
  /** Non-voided shifts not settled yet, of any month, and the oldest one's date. */
  pendingCents: number;
  pendingSince: string | null;
}

export interface WorkShift {
  id: number;
  employeeId: number;
  employeeName: string;
  workedOn: string;
  minutes: number;
  /** Snapshots taken when the shift was recorded. */
  hourlyRateCents: number;
  costCents: number;
  note: string | null;
  recordedAt: string;
  voidedAt: string | null;
  /** The settlement that paid it; null while it is owed. */
  payoutId: number | null;
}

/** One settlement: the unpaid shifts of a range, paid together. */
export interface StaffPayout {
  id: number;
  employeeId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  voidedAt: string | null;
}

/** What an employee is owed between two dates, for a pay receipt, and the settlements so far. */
export interface Payslip {
  employee: Employee;
  /** Non-voided, unpaid shifts of the range, oldest first. */
  shifts: WorkShift[];
  totalMinutes: number;
  totalCents: number;
  /** Every settlement of the employee, voided ones included, newest first. */
  payouts: StaffPayout[];
}

export interface StaffStats {
  /** Active employees, and how many of them are staff or casual. */
  active: number;
  staff: number;
  casual: number;
  /** Non-voided shifts of the month, any employee. */
  monthMinutes: number;
  monthCostCents: number;
  /** Unpaid shifts of any month and employee. */
  pendingCents: number;
}

export interface FinanceSeriesPoint {
  bucket: string;
  plans: number;
  kiosk: number;
  day_pass: number;
  shoe_rental: number;
  /** Expenses, staff and kiosk stock sold, together. */
  outflow: number;
}

export interface FinanceSummary {
  range: DateRange;
  previous: DateRange;
  granularity: Granularity;
  current: Balance;
  before: Balance;
  /** Current range, by source; `teacher` is collected for teachers and is not income. */
  totals: SourceTotals;
  expensesByCategory: { category: ExpenseCategory; cents: number }[];
  series: FinanceSeriesPoint[];
}

export interface PlanRanking {
  planId: number;
  planName: string;
  withTeacher: boolean;
  count: number;
  /** Plan price without the teacher surcharge. */
  localCents: number;
}

export interface ProductRanking {
  productId: number;
  name: string;
  active: boolean;
  units: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
}

export interface FinanceSales {
  /** Plans sold in the range (by sale date), most sold first. */
  plans: PlanRanking[];
  walkIns: Record<CounterSaleKind, { count: number; cents: number }>;
  /** Products sold in the range, most units first. */
  products: ProductRanking[];
  /** Active products that sold nothing in the range. */
  unsold: { productId: number; name: string }[];
  tickets: number;
  averageTicketCents: number;
}

export type VisitKind = 'free' | 'teacher' | 'day_pass';

export interface FinanceTraffic {
  granularity: Granularity;
  /** Pass consumptions and walk-in day passes. */
  total: number;
  byKind: Record<VisitKind, number>;
  /** Visits by [weekday, 0 = Sunday][local hour 0-23]. */
  heatmap: number[][];
  byWeekday: number[];
  series: { bucket: string; visits: number }[];
}

export interface TeacherActivity {
  teacherId: number;
  name: string;
  active: boolean;
  /** Teacher passes consumed in the range, and by how many different clients. */
  classes: number;
  students: number;
  /** Teacher share of the plan payments collected in the range: the teacher's money, not the local's. */
  earnedCents: number;
  paidOutCents: number;
  /** What the local owes the teacher today, whatever the range. */
  balanceCents: number;
  /** Classes left to give today, whatever the range. */
  pendingClasses: number;
}

export interface LapsedClient {
  clientId: number;
  name: string;
  /** Last visit within the period before. */
  lastVisit: string;
}

export interface FinanceClients {
  granularity: Granularity;
  previous: DateRange;
  /** Enrolled in the range. */
  newClients: number;
  /** Different clients who used a pass in the range. */
  visitors: number;
  firstPurchases: number;
  renewals: number;
  series: { bucket: string; first: number; renewal: number }[];
  /** Came in the period before and not in this one. */
  lapsed: LapsedClient[];
  /** Today, whatever the range. */
  debtorCount: number;
  debtTotalCents: number;
}

/** What a spreadsheet would bring in, before importing it. */
export type ImportPreview = ImportSummary & { file: string };

export type ImportPick = { status: 'cancelled' } | { status: 'ready'; preview: ImportPreview };
