/**
 * Invitația în camera familiei (testarea cu utilizatori, C4).
 *
 * Camera veche era SHA-256(parolă): două familii cu aceeași parolă ajungeau în aceeași
 * cameră, iar o parolă ghicită deschidea pachetul. Camera nouă are ID aleator și cheie
 * aleatoare de 256 de biți, create pe telefon; al doilea telefon le primește prin invitație.
 * Serverul vede tot doar ID-ul și pachetul criptat, deci regulile Firestore rămân aceleași.
 */

const PREFIX = "bf1";
/** Site-ul public: linkul de invitație deschide aplicația web direct pe pasul de intrare. */
export const PUBLIC_SITE_URL = "https://balty1991.github.io/bonai/";
export const INVITE_HASH_KEY = "alatura";

export type FamilyInvite = { roomId: string; key: string };

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const toBase64Url = (bytes: Uint8Array) => {
  let output = "";
  bytes.forEach((byte) => { output += String.fromCharCode(byte); });
  return btoa(output).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function createFamilyInvite(): FamilyInvite {
  return {
    roomId: toHex(crypto.getRandomValues(new Uint8Array(32))),
    key: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
  };
}

export const formatInvite = ({ roomId, key }: FamilyInvite) => `${PREFIX}.${roomId}.${key}`;

/** Acceptă codul singur, linkul întreg sau un mesaj lipit care le conține. */
export function parseInvite(raw: string): FamilyInvite | undefined {
  const match = /bf1\.([0-9a-f]{64})\.([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(String(raw || "").trim());
  return match ? { roomId: match[1], key: match[2] } : undefined;
}

export const isInviteCode = (raw: string) => Boolean(parseInvite(raw));

export const inviteLink = (invite: FamilyInvite) => `${PUBLIC_SITE_URL}#${INVITE_HASH_KEY}=${formatInvite(invite)}`;

/** Textul trimis partenerului. Fragmentul `#…` nu pleacă la niciun server când se deschide linkul. */
export const inviteMessage = (invite: FamilyInvite) =>
  `Hai în bugetul familiei. Pe Android deschide aplicația. Pe iPhone deschide linkul în browser — nu e nevoie de App Store.\n${inviteLink(invite)}`;

/** Invitația venită prin link (`#alatura=…`), apoi scoasă din adresă ca să nu rămână în istoric. */
export function takeInviteFromLocation(): FamilyInvite | undefined {
  if (typeof window === "undefined") return undefined;
  const hash = window.location.hash || "";
  if (!hash.includes(`${INVITE_HASH_KEY}=`)) return undefined;
  const invite = parseInvite(decodeURIComponent(hash));
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch { /* adresa rămâne; invitația oricum e deja citită */ }
  return invite;
}
