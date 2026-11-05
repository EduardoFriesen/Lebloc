/** Lowercase without accents, so "Lucía González" and "lucia gonzalez" compare equal. */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

/** Products named in a delivery's row (Gastos, Kiosco → Entregas); the row opens the delivery with all of them. */
export const SHOWN_PRODUCTS = 3;

/** The first products, already joined, and how many were left out: "1 × Agua, 2 × Barrita, 3 × Chicle y 2 más". */
export const withMore = (shown: string, total: number) => (total > SHOWN_PRODUCTS ? `${shown} y ${total - SHOWN_PRODUCTS} más` : shown);
