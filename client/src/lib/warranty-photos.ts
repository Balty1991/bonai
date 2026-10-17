/**
 * Poza bonului unei garanții: hârtia termică se șterge în câteva luni, poza rămâne.
 * Micșorată la cel mult 1280 px și salvată ca JPEG (~100–200 KB), doar pe telefonul care a
 * făcut-o, într-o bază IndexedDB separată. Nu intră în pachetul de sync (are limită de mărime);
 * pe celălalt telefon garanția apare cu „poza e pe telefonul care a făcut-o”.
 */
const DATABASE = "buget-familie-warranty-photos";
const STORE = "photos";
const MAX_SIDE = 1280;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-indexeddb")); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Fișierul ales (cameră sau galerie), micșorat și comprimat ca data URL JPEG. */
export async function compressPhoto(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image"));
      element.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const saveWarrantyPhoto = (id: string, dataUrl: string) => run<IDBValidKey>("readwrite", (store) => store.put(dataUrl, id)).then(() => undefined);
export const loadWarrantyPhoto = (id: string) => run<string | undefined>("readonly", (store) => store.get(id)).catch(() => undefined);
export const deleteWarrantyPhoto = (id: string) => run<undefined>("readwrite", (store) => store.delete(id)).catch(() => undefined);
