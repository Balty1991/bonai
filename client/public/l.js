/* Lista partajată din BonAI: datele vin din fragmentul adresei (#…), bifele stau în localStorage. */
/* global atob, TextDecoder, location, document, localStorage, window */
(function () {
  "use strict";
  function decode(fragment) {
    try {
      var b64 = fragment.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var list = JSON.parse(new TextDecoder().decode(bytes));
      if (!list || list.v !== 1 || !Array.isArray(list.items)) return null;
      return { title: typeof list.title === "string" ? list.title.slice(0, 60) : "", items: list.items.filter(function (x) { return typeof x === "string"; }).map(function (x) { return x.slice(0, 80); }).slice(0, 60) };
    } catch { return null; }
  }
  var list = decode(location.hash || "");
  var itemsEl = document.getElementById("items");
  if (!list || !list.items.length) { document.getElementById("empty").hidden = false; return; }
  if (list.title) document.getElementById("title").textContent = list.title;
  var key = "bonut-list:" + (location.hash || "").slice(1, 80);
  var done = {};
  try { done = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { done = {}; }
  function save() { try { localStorage.setItem(key, JSON.stringify(done)); } catch { /* fără stocare */ } }
  function count() {
    var n = list.items.filter(function (_, i) { return done[i]; }).length;
    document.getElementById("count").textContent = n + " din " + list.items.length + " luate";
    document.getElementById("send").hidden = n === 0;
  }
  list.items.forEach(function (text, i) {
    var li = document.createElement("li");
    var label = document.createElement("label");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!done[i];
    box.addEventListener("change", function () { done[i] = box.checked; save(); count(); });
    var span = document.createElement("span");
    span.textContent = text;
    label.appendChild(box); label.appendChild(span); li.appendChild(label); itemsEl.appendChild(li);
  });
  document.getElementById("send").addEventListener("click", function () {
    var got = list.items.filter(function (_, i) { return done[i]; });
    var text = "Am luat:\n" + got.map(function (x) { return "✓ " + x; }).join("\n");
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  });
  count();
})();
