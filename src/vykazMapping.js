// ─────────────────────────────────────────────
// Mapovani polozek na presne bunky oficialniho vykazu EKO-KOM
// (verze formulare v2.75). Souradnice overeny proti realnemu souboru.
//
// Predpoklad: dovozce -> vse ZPOPLATNENE, importovane do CR.
// Neni-li u polozky urcena surovina, bereme PRIMARNI (konzervativni).
// ─────────────────────────────────────────────

// Radky materialu pro OBCHODNI listy (J1-1A prodejni, J1-1B skup/prepr)
// a PRUMYSLOVY list (J1-3). Cislo = radek ve formulari.
// POZOR: O1-1A ma v sekci sklo/papir/drevo radky POSUNUTE o -1 oproti J1-1A
// (sklo zacina na R40 misto R41, papir R43 misto R44). O1-1B a O1-3 se s J shoduji.
// Klic OA = radky pro list O1-1A.
// formMaterial id -> { A, OA, B, P, plastic }
var FM_ROWS = {
  // Plasty (horni sekce, vyzaduji tvrdost) - shodne na J i O listech
  pet_trans:        { A: 10, OA: 10, B: 11, P: 11, plastic: true },
  pet_pruhl_bar:    { A: 11, OA: 11, B: 12, P: 12, plastic: true },
  pet_nepruhl_bar:  { A: 12, OA: 12, B: 12, P: 12, plastic: true },
  pe_trans:         { A: 13, OA: 13, B: 13, P: 13, plastic: true },
  pe_bar:           { A: 14, OA: 14, B: 14, P: 14, plastic: true },
  pp_trans:         { A: 15, OA: 15, B: 15, P: 15, plastic: true },
  pp_bar:           { A: 16, OA: 16, B: 16, P: 16, plastic: true },
  ps_trans:         { A: 17, OA: 17, B: 17, P: 17, plastic: true },
  ps_bar:           { A: 18, OA: 18, B: 18, P: 18, plastic: true },
  eps_trans:        { A: 21, OA: 21, B: 21, P: 21, plastic: true },
  eps_bar:          { A: 22, OA: 22, B: 22, P: 22, plastic: true },
  pvc_trans:        { A: 23, OA: 23, B: 23, P: 23, plastic: true },
  pvc_bar:          { A: 24, OA: 24, B: 24, P: 24, plastic: true },
  plast_jine_trans: { A: 25, OA: 25, B: 25, P: 25, plastic: true },
  plast_jine_bar:   { A: 26, OA: 26, B: 26, P: 26, plastic: true },
  // Kovy (horni sekce, plastova sirka sloupcu)
  kov_al:           { A: 31, OA: 31, B: 31, P: 31, plastic: true },
  kov_fe:           { A: 32, OA: 32, B: 32, P: 32, plastic: true },
  // Napojovy karton je jen na J1-1A (na O1-1A je zde Kompozitni material)
  napojovy_karton:  { A: 35, OA: null, B: null, P: null, plastic: true },
  // Sklo (dolni sekce, uzke sloupce)
  sklo_trans:       { A: 41, OA: 40, B: null, P: 42, plastic: false },
  sklo_bar:         { A: 42, OA: 41, B: null, P: 43, plastic: false },
  // Papir (dolni sekce)
  papir:            { A: 44, OA: 43, B: 42, P: 45, plastic: false },
  hladka_lepenka:   { A: 45, OA: 44, B: 43, P: 46, plastic: false },
  vlnita_lepenka:   { A: 46, OA: 45, B: 44, P: 47, plastic: false },
  nasavana_kartonaz:{ A: 47, OA: 46, B: 45, P: 48, plastic: false },
  // Drevo (dolni sekce)
  drevo:            { A: 49, OA: 48, B: 47, P: 50, plastic: false },
  // Textil / jine (dolni sekce)
  textil:           { A: 51, OA: 50, B: 49, P: 52, plastic: false },
  jine:             { A: 52, OA: 51, B: 50, P: 53, plastic: false },
}

// Sloupce pro PRIMARNI + IMPORTOVANE do CR.
// Plasty (siroke sloupce, dle tvrdosti a typu obalu):
//   J1-1A prodejni:   mekke=F, pevne3=J, pevneNad3=N
//   J1-1B skupinove:  mekke=F, pevne3=J   (prepravni: mekke=N, pevne3=R)
//   J1-3 prumyslove:  neobsahuji: mekke=F, pevne3=J  (obsahuji napoje: mekke=N, pevne3=R)
// Neuvedena tvrdost => bereme pevne3 (nejbeznejsi).
function plasticCol(sheetKind, packType, rigidity) {
  var rig = rigidity || "pevne3"
  if (sheetKind === "A") { // J1-1A prodejni
    if (rig === "mekke") return "F"
    if (rig === "pevneNad3") return "N"
    return "J"
  }
  if (sheetKind === "B") { // J1-1B skupinove nebo prepravni
    if (packType === "prepravni") { return rig === "mekke" ? "N" : "R" }
    return rig === "mekke" ? "F" : "J" // skupinove
  }
  if (sheetKind === "P") { // J1-3 prumyslove (neobsahuji napoje)
    return rig === "mekke" ? "F" : "J"
  }
  return "J"
}

// Sklo/papir/drevo (uzke sloupce): primarni importovane
//   J1-1A: import = G
//   J1-1B skupinove: import = G ; prepravni: import = O
//   J1-3: import = G
function nonPlasticCol(sheetKind, packType) {
  if (sheetKind === "B" && packType === "prepravni") return "O"
  return "G"
}

// Nazev sloupce slovne (pro navod)
function colDesc(sheetKind, packType, isPlastic, rigidity) {
  if (isPlastic) {
    // Neni-li tvrdost urcena, dosazuje se "pevne do 3L" - to je nutne oznacit,
    // aby uzivatel poznal, ze hodnota neni potvrzena (folie/sacky patri do "mekke").
    var assumed = !rigidity
    var rigTxt = rigidity === "mekke" ? "mekke/flexibilni" : rigidity === "pevneNad3" ? "pevne dute nad 3L" : "pevne dute do 3L"
    if (assumed) rigTxt = rigTxt + " (!NEURCENO)"
    var grp = ""
    if (sheetKind === "B") grp = (packType === "prepravni" ? "Prepravni / " : "Skupinove / ")
    if (sheetKind === "P") grp = "Neobsahuji napoje / "
    return grp + rigTxt + " / primarni / importovane do CR"
  }
  var g2 = ""
  if (sheetKind === "B") g2 = (packType === "prepravni" ? "Prepravni / " : "Skupinove / ")
  return g2 + "primarni / importovane do CR"
}

// Urci list podle typu obalu a opakovatelnosti.
// rowKind = ktera mapa radku se pouzije, colKind = ktera mapa sloupcu.
// O1-1A ma vlastni radky (OA), ale sloupce shodne s J1-1A (A).
function sheetFor(packType, reusable) {
  if (reusable) {
    if (packType === "prodejni") return { sheet: "O1-1A", rowKind: "OA", colKind: "A" }
    if (packType === "prumyslove") return { sheet: "O1-3", rowKind: "P", colKind: "P" }
    return { sheet: "O1-1B", rowKind: "B", colKind: "B" } // skupinove/prepravni
  }
  if (packType === "prodejni") return { sheet: "J1-1A", rowKind: "A", colKind: "A" }
  if (packType === "prumyslove") return { sheet: "J1-3", rowKind: "P", colKind: "P" }
  return { sheet: "J1-1B", rowKind: "B", colKind: "B" } // skupinove/prepravni
}

// Littering list L - radky (sloupec F = celkova hmotnost v t)
var L_ROWS = {
  nadoby_napoje: 6,
  sacky: 7,
  kelimky_plast: 8,
  kelimky_castecne: 9,
  nadoby_potraviny_plast: 10,
  nadoby_potraviny_castecne: 11,
  taska_15_50: 12,
  taska_pod15: 13,
}
var L_LABELS = {
  nadoby_napoje: "Nadoby na napoje (do 3 L)",
  sacky: "Sacky a baleni na potraviny",
  kelimky_plast: "Napojove kelimky z plastu",
  kelimky_castecne: "Napojove kelimky castecne z plastu",
  nadoby_potraviny_plast: "Nadoby na potraviny z plastu",
  nadoby_potraviny_castecne: "Nadoby na potraviny castecne z plastu",
  taska_15_50: "Plastova taska 15-50 mikronu",
  taska_pod15: "Plastova taska pod 15 mikronu",
}

// Hlavni funkce: z jedne polozky urci cilovou bunku (nebo null pokud chybi klasifikace)
function itemTarget(item) {
  var fm = item.formMaterial
  if (!fm || !FM_ROWS[fm]) return null

  var sf = sheetFor(item.packType, item.reusable)
  var rowMap = FM_ROWS[fm]
  var row = rowMap[sf.rowKind]
  if (row == null) return null // napr. sklo nema skupinovy/prepravni radek na J1-1B

  var isPlastic = rowMap.plastic
  var col = isPlastic
    ? plasticCol(sf.colKind, item.packType, item.rigidity)
    : nonPlasticCol(sf.colKind, item.packType)

  return {
    sheet: sf.sheet,
    cell: col + row,
    col: col,
    row: row,
    colDesc: colDesc(sf.colKind, item.packType, isPlastic, item.rigidity),
  }
}

// Sestavi kompletni navod k opisu ze vsech prijmu daneho obdobi.
// Vraci: { sheets: { sheetName: [ {cell, rowLabel, colDesc, tonnage, kg} ] }, littering: [...], missing: [...] }
export function buildGuide(receipts, formMaterialLabel, packLabel) {
  var cells = {}      // "sheet|cell" -> akumulace
  var littering = {}  // L radek -> tuny
  var missing = []    // polozky bez klasifikace
  var kgTotal = 0

  receipts.forEach(function(rec) {
    (rec.items || []).forEach(function(it) {
      var kg = it.totalWeight || 0
      if (!kg) return
      kgTotal += kg

      // Littering (samostatny list L, jen jednorazove plasty s kategorii)
      if (it.littering && it.material === "plastic" && it.litteringCategory && L_ROWS[it.litteringCategory]) {
        var lr = it.litteringCategory
        var share = it.plasticShare || 1
        littering[lr] = (littering[lr] || 0) + kg * share
      }

      var t = itemTarget(it)
      if (!t) {
        missing.push({ name: it.name, kg: kg, receiptId: rec.id, itemId: it.id,
          date: rec.date, supplierName: rec.supplierName, packType: it.packType })
        return
      }
      var key = t.sheet + "|" + t.cell
      if (!cells[key]) {
        cells[key] = { sheet: t.sheet, cell: t.cell, col: t.col, row: t.row,
          colDesc: t.colDesc, rowLabel: formMaterialLabel(it.formMaterial), kg: 0, items: [] }
      }
      cells[key].kg += kg
      cells[key].items.push({
        receiptId: rec.id, itemId: it.id, name: it.name,
        date: rec.date, supplierName: rec.supplierName, note: rec.note,
        qty: it.quantity || 0, kg: kg, packType: it.packType,
        material: it.material, reusable: !!it.reusable,
        formMaterial: it.formMaterial || "", rigidity: it.rigidity || "",
      })
    })
  })

  // Seskup podle listu
  var sheets = {}
  Object.keys(cells).forEach(function(k) {
    var c = cells[k]
    if (!sheets[c.sheet]) sheets[c.sheet] = []
    sheets[c.sheet].push({
      cell: c.cell, col: c.col, row: c.row, rowLabel: c.rowLabel,
      colDesc: c.colDesc, kg: c.kg, tonnage: c.kg / 1000,
      items: c.items.sort(function(a, b) { return b.kg - a.kg }),
    })
  })
  // Seradit radky v ramci listu podle cisla radku
  Object.keys(sheets).forEach(function(s) {
    sheets[s].sort(function(a, b) { return a.row - b.row })
  })

  var litterList = Object.keys(littering).map(function(lr) {
    return { row: L_ROWS[lr], cell: "F" + L_ROWS[lr], label: L_LABELS[lr], kg: littering[lr], tonnage: littering[lr] / 1000 }
  }).sort(function(a, b) { return a.row - b.row })

  return { sheets: sheets, littering: litterList, missing: missing, kgTotal: kgTotal }
}

// Popis listu pro navod
export var SHEET_TITLES = {
  "J1-1A": "J1-1A - Obchodni obaly PRODEJNI (jednorazove, zpoplatnene)",
  "J1-1B": "J1-1B - Obchodni obaly SKUPINOVE a PREPRAVNI (jednorazove, zpoplatnene)",
  "J1-3":  "J1-3 - PRUMYSLOVE obaly (jednorazove, zpoplatnene)",
  "O1-1A": "O1-1A - Obchodni obaly PRODEJNI (opakovane pouzitelne)",
  "O1-1B": "O1-1B - Obchodni obaly SKUPINOVE a PREPRAVNI (opakovane pouzitelne)",
  "O1-3":  "O1-3 - PRUMYSLOVE obaly (opakovane pouzitelne)",
  "L":     "L - Litteringove obaly (jednorazove plasty na potraviny/napoje)",
}
