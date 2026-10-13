/** Lowercase without accents, so "Lucía González" and "lucia gonzalez" compare equal. */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
