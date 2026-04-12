import type { Lang } from "@/lib/i18n-config";
import { parseI18nJson, resolveI18nField } from "@/lib/localized-records";

export function shapeSiteForAdmin(row: Record<string, unknown>, lang: Lang) {
  const nameI18n = parseI18nJson(row.name_i18n);
  const addressI18n = parseI18nJson(row.address_i18n);
  const notesI18n = parseI18nJson(row.notes_i18n);
  return {
    ...row,
    name: resolveI18nField(nameI18n, lang, row.name as string | null | undefined),
    address:
      row.address == null ? null : resolveI18nField(addressI18n, lang, row.address as string | null | undefined),
    notes: row.notes == null ? null : resolveI18nField(notesI18n, lang, row.notes as string | null | undefined),
    name_i18n: nameI18n,
    address_i18n: addressI18n,
    notes_i18n: notesI18n,
  };
}
