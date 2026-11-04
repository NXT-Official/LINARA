import { intlLocale } from "./instance";
import { readLocale } from "./locale-cookie";

/** The Intl tag for dates shown now, in the reader's language ("en-PH", "fil", "ja"...). */
export const dateLocale = () => intlLocale(readLocale());
