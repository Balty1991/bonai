import { describe, expect, it } from "vitest";
import { lookupOfficialPrice, parseStoreOffers } from "./official-prices";

const NS = 'xmlns="http://schemas.datacontract.org/2004/07/pmonsvc.Models.Protos"';
const products = `<ArrayOfCatalogProduct ${NS}><CatalogProduct><Id>101</Id><Name>Lapte 1,5% 1L</Name></CatalogProduct></ArrayOfCatalogProduct>`;
const uats = `<ArrayOfUAT ${NS}><UAT><Id>7</Id><Name>Roșiori de Vede</Name></UAT></ArrayOfUAT>`;
const stores = `<R ${NS}><RetailStore><Name>Magazin A</Name><Retailnetwork><Name>Rețea A</Name></Retailnetwork><Products><Product><Price>7.10</Price><Pricedate>2026-10-15T00:00:00</Pricedate><Catprod><Id>101</Id></Catprod></Product></Products></RetailStore><RetailStore><Name>Magazin B</Name><Products><Product><Price>6.80</Price><Catprod><Id>101</Id></Catprod></Product><Product><Price>1</Price><Catprod><Id>999</Id></Catprod></Product></Products></RetailStore></R>`;

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe("Monitorul Prețurilor, căutare punctuală", () => {
  it("implicit oprit: nu face nicio cerere", async () => {
    let calls = 0;
    expect(await lookupOfficialPrice("lapte", "Roșiori", { fetcher: async () => { calls += 1; return ""; }, storage: memory() })).toBeUndefined();
    expect(calls).toBe(0);
  });
  it("ofertele produsului cerut, de la cel mai ieftin", () => {
    expect(parseStoreOffers(stores, "101")).toEqual([{ store: "Magazin B", price: 6.8 }, { store: "Magazin A", network: "Rețea A", price: 7.1, date: "2026-10-15" }]);
  });
  it("pornit: 3 cereri, apoi cache 24 h", async () => {
    const storage = memory();
    let calls = 0;
    const fetcher = async (url: string) => { calls += 1; return url.includes("GetCatalog") ? products : url.includes("GetUAT") ? uats : stores; };
    const now = Date.parse("2026-10-18T08:00:00Z");
    const first = await lookupOfficialPrice("lapte", "Roșiori", { enabled: true, fetcher, storage, now });
    expect(first?.offers[0].price).toBe(6.8);
    expect(calls).toBe(3);
    await lookupOfficialPrice("lapte", "Roșiori", { enabled: true, fetcher, storage, now: now + 3600_000 });
    expect(calls).toBe(3);
    await lookupOfficialPrice("lapte", "Roșiori", { enabled: true, fetcher, storage, now: now + 25 * 3600_000 });
    expect(calls).toBe(6);
  });
});
