// ─────────────────────────────────────────────
// Export / import prijmu za ctvrtleti do CSV
// Format: strednikem oddeleny (otevre se spravne v ceskem Excelu),
// jeden radek = jedna polozka obalu, udaje o prijmu se opakuji.
// ─────────────────────────────────────────────

export var CSV_COLUMNS = [
  "prijem_id", "datum", "dodavatel_id", "dodavatel", "dodaci_list", "cislo_dokumentu", "datum_dokladu",
  "polozka", "material", "typ_obalu", "opakovane", "littering",
  "material_vykaz", "tvrdost", "littering_kategorie", "podil_plastu_pct",
  "pocet_ks", "hmotnost_ks_kg", "celkem_kg", "sablona_id",
]

function esc(v) {
  if (v == null) return ""
  var s = String(v)
  // Pokud obsahuje strednik, uvozovky nebo konec radku -> obalit uvozovkami
  if (s.indexOf(";") >= 0 || s.indexOf("\"") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
    return "\"" + s.replace(/"/g, "\"\"") + "\""
  }
  return s
}

// ─── EXPORT ───
export function buildQuarterCSV(receipts) {
  var lines = [CSV_COLUMNS.join(";")]
  receipts.forEach(function (rec) {
    var items = rec.items || []
    if (items.length === 0) return
    items.forEach(function (it) {
      var row = [
        rec.id,
        rec.date,
        rec.supplierId || "",
        rec.supplierName || "",
        rec.note || "",
        rec.docNumber || "",
        rec.docDate || "",
        it.name || "",
        it.material || "",
        it.packType || "",
        it.reusable ? "ano" : "ne",
        it.littering ? "ano" : "ne",
        it.formMaterial || "",
        it.rigidity || "",
        it.litteringCategory || "",
        it.plasticShare != null ? Math.round(it.plasticShare * 100) : "",
        it.quantity != null ? it.quantity : 0,
        it.unitWeight != null ? it.unitWeight : 0,
        it.totalWeight != null ? it.totalWeight : 0,
        it.fromTemplate || "",
      ]
      lines.push(row.map(esc).join(";"))
    })
  })
  return lines.join("\r\n")
}

export function downloadQuarterCSV(receipts, year, quarter) {
  var csv = buildQuarterCSV(receipts)
  var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
  var a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "ekokom-prijmy-" + year + "-Q" + (quarter + 1) + ".csv"
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── IMPORT ───

// Rozparsuje jeden CSV radek s ohledem na uvozovky
function parseLine(line) {
  var out = []
  var cur = ""
  var inQ = false
  for (var i = 0; i < line.length; i++) {
    var ch = line[i]
    if (inQ) {
      if (ch === "\"") {
        if (line[i + 1] === "\"") { cur += "\""; i++ }
        else inQ = false
      } else cur += ch
    } else {
      if (ch === "\"") inQ = true
      else if (ch === ";") { out.push(cur); cur = "" }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function splitRows(text) {
  // Odstranit BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  var rows = []
  var cur = ""
  var inQ = false
  for (var i = 0; i < text.length; i++) {
    var ch = text[i]
    if (ch === "\"") { inQ = !inQ; cur += ch; continue }
    if (!inQ && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++
      if (cur.trim() !== "") rows.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  if (cur.trim() !== "") rows.push(cur)
  return rows
}

var num = function (v) {
  if (v == null || v === "") return 0
  var n = parseFloat(String(v).replace(",", "."))
  return isNaN(n) ? 0 : n
}
var yes = function (v) {
  var s = String(v || "").trim().toLowerCase()
  return s === "ano" || s === "1" || s === "true" || s === "ano."
}

// Vraci { receipts: [...], errors: [...], stats: {...} }
// suppliers slouzi k dohledani supplierId podle nazvu.
export function parseQuarterCSV(text, suppliers) {
  var rows = splitRows(text)
  if (rows.length < 2) {
    return { receipts: [], errors: ["Soubor je prazdny nebo neobsahuje data."], stats: { rows: 0 } }
  }

  var header = parseLine(rows[0]).map(function (h) { return h.trim().toLowerCase() })
  var idx = {}
  CSV_COLUMNS.forEach(function (c) { idx[c] = header.indexOf(c) })

  var required = ["datum", "polozka", "pocet_ks", "hmotnost_ks_kg"]
  var missing = required.filter(function (c) { return idx[c] < 0 })
  if (missing.length > 0) {
    return { receipts: [], errors: ["V souboru chybi sloupce: " + missing.join(", ")], stats: { rows: 0 } }
  }

  var errors = []
  var groups = {}
  var order = []

  for (var r = 1; r < rows.length; r++) {
    var cols = parseLine(rows[r])
    var get = function (name) { return idx[name] >= 0 ? (cols[idx[name]] || "").trim() : "" }

    var date = get("datum")
    if (!date) { errors.push("Radek " + (r + 1) + ": chybi datum, preskoceno."); continue }
    // Normalizace datumu (podpora DD.MM.YYYY i YYYY-MM-DD)
    if (date.indexOf(".") >= 0) {
      var p = date.split(".").map(function (x) { return x.trim() })
      if (p.length === 3) {
        date = p[2] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[0]).slice(-2)
      }
    }
    if (isNaN(new Date(date).getTime())) {
      errors.push("Radek " + (r + 1) + ": nerozpoznane datum '" + get("datum") + "', preskoceno.")
      continue
    }

    var supName = get("dodavatel")
    var note = get("dodaci_list")
    // Klic pro seskupeni do jednoho prijmu
    var key = get("prijem_id") || (date + "|" + supName + "|" + note)

    if (!groups[key]) {
      // Dodavatele parujeme primarne podle ID (spolehlive i pri prejmenovani),
      // teprve pak podle nazvu.
      var supId = get("dodavatel_id")
      var sup = null
      if (supId) sup = (suppliers || []).find(function (s) { return s.id === supId })
      if (!sup && supName) sup = (suppliers || []).find(function (s) { return s.name === supName })
      groups[key] = {
        date: date,
        supplierId: sup ? sup.id : null,
        supplierName: sup ? sup.name : (supName || "Neuvedeno"),
        supplierMatched: !!sup,
        note: note,
        docNumber: get("cislo_dokumentu") || "",
        docDate: (function() {
          var dd = get("datum_dokladu")
          if (!dd) return ""
          if (dd.indexOf(".") >= 0) {
            var pp = dd.split(".").map(function(x) { return x.trim() })
            if (pp.length === 3) return pp[2] + "-" + ("0" + pp[1]).slice(-2) + "-" + ("0" + pp[0]).slice(-2)
          }
          return dd
        })(),
        items: [],
      }
      order.push(key)
    }

    var qty = Math.max(0, Math.round(num(get("pocet_ks"))))
    var uw = num(get("hmotnost_ks_kg"))
    var share = get("podil_plastu_pct")

    groups[key].items.push({
      name: get("polozka") || "(bez nazvu)",
      material: get("material") || "other",
      packType: get("typ_obalu") || "prepravni",
      reusable: yes(get("opakovane")),
      littering: yes(get("littering")),
      formMaterial: get("material_vykaz") || "",
      rigidity: get("tvrdost") || null,
      litteringCategory: get("littering_kategorie") || null,
      plasticShare: share === "" ? null : num(share) / 100,
      quantity: qty,
      unitWeight: uw,
      totalWeight: Math.round(uw * qty * 1000) / 1000,
      fromTemplate: get("sablona_id") || null,
    })
  }

  var receipts = order.map(function (k) { return groups[k] })
  var unmatched = receipts.filter(function (r) { return !r.supplierMatched && r.supplierName !== "Neuvedeno" })
  if (unmatched.length > 0) {
    var names = {}
    unmatched.forEach(function (r) { names[r.supplierName] = true })
    errors.push("Nenalezeni dodavatele (prijmy se ulozi bez vazby): " + Object.keys(names).join(", "))
  }

  return {
    receipts: receipts,
    errors: errors,
    stats: {
      receipts: receipts.length,
      items: receipts.reduce(function (s, r) { return s + r.items.length }, 0),
      kg: receipts.reduce(function (s, r) {
        return s + r.items.reduce(function (a, i) { return a + (i.totalWeight || 0) }, 0)
      }, 0),
    },
  }
}
