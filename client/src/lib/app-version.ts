/** Versiunea afișată în aplicație, pe Play Console și în politica de confidențialitate. */
export const APP_VERSION = "1.1.212";
export const APP_VERSION_CODE = 213;
export const APP_ID = "ro.balty1991.bugetfamilie";
export const APP_SUPPORT_EMAIL = "contact.vanzo@gmail.com";
export const APP_PRIVACY_PATH = "privacy.html";
export const APP_TERMS_PATH = "terms.html";
export const APP_DELETE_PATH = "delete-data.html";

export const publicLegalUrl = (file: string) => {
  const base = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : "/";
  return `${base}${file}`.replace(/\/{2,}/g, "/").replace(":/", "://");
};
