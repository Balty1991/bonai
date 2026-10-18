"""Bonuri fiscale românești sintetice (text + poză) pentru măsurarea scanării offline.
Sumele sunt construite pentru test, NU sunt prețuri observate. Variante: curat, decolorat,
strâmb (3-5°), încrețit/zgomot și bon lung în 2 poze suprapuse. Adevărul e în truth.json.
Rulare: python3 scripts/make-synth-receipts.py  → e2e/receipts-synth/"""
import json, random, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

random.seed(7)
OUT = os.path.join(os.path.dirname(__file__), "..", "e2e", "receipts-synth")
os.makedirs(OUT, exist_ok=True)
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
W = 42  # caractere pe rând, ca la casele de marcat

STORES = {
  "Lidl": ("LIDL DISCOUNT S.C.S.", "CIF: RO22891860"), "Kaufland": ("KAUFLAND ROMANIA SCS", "CIF: RO15991149"),
  "Carrefour": ("CARREFOUR ROMANIA SA", "CIF: RO11588780"), "Auchan": ("AUCHAN ROMANIA SA", "CIF: RO17233051"),
  "Profi": ("PROFI ROM FOOD SRL", "CIF: RO11871240"), "Penny": ("REWE (ROMANIA) SRL PENNY", "CIF: RO13348610"),
  "Mega Image": ("MEGA IMAGE SRL", "CIF: RO6719278"), "Catena": ("FARMACIA CATENA SRL", "CIF: RO1590120"),
  "Dr. Max": ("DR. MAX SRL FARMACIE", "CIF: RO7837340"), "OMV": ("OMV PETROM MARKETING SRL", "CIF: RO11201891"),
  "Petrom": ("PETROM STATIE PECO", "CIF: RO1590082"),
}
GOODS = {
  "food": [("LAPTE ZUZU 1,5% 1L", 7.49), ("PAINE ALBA FELIATA 500G", 4.99), ("OUA M 10 BUC", 13.9), ("UNT PRESIDENT 200G", 11.49), ("IAURT DANONE 140G", 2.39), ("CASCAVAL HOCHLAND 300G", 17.9), ("PIEPT PUI CAROLI 1KG", 26.9), ("MAZARE BONDUELLE 400G", 6.79), ("PASTE BARILLA 500G", 6.49), ("CAFEA JACOBS 250G", 21.9), ("ULEI SPORNIC 1L", 9.49), ("ZAHAR MARGARITAR 1KG", 4.59), ("APA BORSEC 2L", 3.79), ("BERE URSUS 0,5L", 4.29), ("CIOCOLATA MILKA 100G", 5.99)],
  "weighed": [("BANANE", 5.99), ("MERE GOLDEN", 4.49), ("ROSII CIORCHINE", 9.99), ("CARTOFI ALBI", 2.79), ("PORTOCALE", 6.49)],
  "pharma": [("PARACETAMOL 500MG 20CPR", 8.5), ("NUROFEN 200MG 12CPR", 19.9), ("VITAMINA C 1000MG", 24.5), ("STREPSILS MIERE 24", 27.3), ("SER FIZIOLOGIC 5ML", 12.0)],
}
n2 = lambda v: f"{v:.2f}".replace(".", ",")
def row(left, right): return left[: W - len(right) - 1].ljust(W - len(right)) + right

def receipt(i, store):
  head, cif = STORES[store]
  day = f"{random.randint(1, 17):02d}.10.2026"
  lines = [head.center(W), cif.center(W), "STR. EXEMPLU NR. 1, BUCURESTI".center(W), "-" * W]
  items, discount = [], 0.0
  fuel = store in ("OMV", "Petrom")
  if fuel:
    litres = round(random.uniform(20, 45), 2); price = random.choice([7.29, 7.49, 7.65])
    amount = round(litres * price, 2)
    lines += ["MOTORINA EVO DIESEL", row(f"{n2(litres)} L X {n2(price)}", f"{n2(amount)} A")]
    items.append(amount)
    if random.random() < .5:
      lines += ["CAFEA ESPRESSO MARE", row("1 BUC X 9,90", "9,90 B")]; items.append(9.9)
  else:
    pool = GOODS["pharma"] if store in ("Catena", "Dr. Max") else GOODS["food"]
    for name, price in random.sample(pool, k=min(len(pool), random.randint(3, 9))):
      q = random.choice([1, 1, 1, 2, 3]); gross = round(q * price, 2)
      lines += [name, row(f"{q} BUC X {n2(price)}", f"{n2(gross)} B")]
      net = gross
      if random.random() < .25:
        d = round(gross * random.choice([.1, .2, .3]), 2)
        lines.append(row("REDUCERE" if store != "Lidl" else "REDUCERE LIDL PLUS", f"-{n2(d)} B")); net = round(gross - d, 2); discount += d
      items.append(net)
    if pool is GOODS["food"]:
      for name, price in random.sample(GOODS["weighed"], k=random.randint(0, 2)):
        kg = round(random.uniform(.3, 2.2), 3); amount = round(kg * price, 2)
        lines += [name, row(f"{str(kg).replace('.', ',')} KG X {n2(price)}", f"{n2(amount)} B")]; items.append(amount)
      if random.random() < .5:
        q = random.randint(1, 6); lines += ["GARANTIE SGR", row(f"{q} BUC X 0,50", f"{n2(q * .5)} D")]; items.append(q * .5)
  total = round(sum(items), 2)
  lines += ["-" * W, row("SUBTOTAL", n2(total)), row("TOTAL LEI", n2(total)), row("CARD", n2(total)), row("TOTAL TVA A - 21%", n2(round(total * .1, 2))), row("TOTAL TVA BON", n2(round(total * .12, 2))), f"{day} {random.randint(8, 21):02d}:{random.randint(0, 59):02d}", f"NR. BON: {1000 + i}", "BON FISCAL".center(W)]
  return lines, {"store": store, "date": "-".join(reversed(day.split("."))), "total": total, "items": len(items), "discount": round(discount, 2)}

def render(lines):
  lh = 30; img = Image.new("L", (W * 13 + 60, lh * len(lines) + 60), 250); d = ImageDraw.Draw(img)
  for k, line in enumerate(lines): d.text((30, 30 + k * lh), line, font=FONT, fill=25)
  return img

def photo(img, kind):
  if kind == "faded": img = ImageEnhance.Contrast(img).enhance(.35); img = ImageEnhance.Brightness(img).enhance(1.15)
  if kind == "crooked": img = img.rotate(random.choice([-5, -3, 3, 4]), expand=True, fillcolor=200)
  if kind == "crumpled":
    img = img.filter(ImageFilter.GaussianBlur(1.1))
    px = img.load()
    for _ in range(img.width * img.height // 60): px[random.randrange(img.width), random.randrange(img.height)] = random.randint(120, 220)
  bg = Image.new("L", (img.width + 80, img.height + 80), 90); bg.paste(img, (40, 40))
  return bg.convert("RGB")

truth = []
stores = list(STORES)
kinds = ["clean", "faded", "crooked", "crumpled", "multi"]
for i in range(40):
  store = stores[i % len(stores)]; kind = kinds[i % len(kinds)]
  lines, t = receipt(i, store)
  name = f"{i:02d}-{store.lower().replace(' ', '').replace('.', '')}-{kind}"
  if kind == "multi":
    cut = len(lines) // 2; parts = [lines[: cut + 3], lines[cut:]]
    files = []
    for k, part in enumerate(parts):
      f = f"{name}-{k + 1}.jpg"; photo(render(part), "clean").save(os.path.join(OUT, f), quality=82); files.append(f)
  else:
    files = [f"{name}.jpg"]; photo(render(lines), kind).save(os.path.join(OUT, files[0]), quality=82)
  truth.append({"id": name, "kind": kind, "files": files, **t, "text": "\n".join(lines)})
json.dump(truth, open(os.path.join(OUT, "truth.json"), "w"), ensure_ascii=False, indent=1)
print(len(truth), "bonuri")
