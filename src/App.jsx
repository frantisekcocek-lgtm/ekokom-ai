import { useState, useEffect, useMemo, useCallback, Fragment } from "react"
import * as db from "./supabase.js"
import { buildGuide, SHEET_TITLES } from "./vykazMapping.js"
import { downloadQuarterCSV, parseQuarterCSV } from "./csvIO.js"
import AiReceiptView from "./AiReceipt.jsx"
import { signIn, signOut, getSession, onAuthChange } from "./supabase.js"

// ═══════════════════════════════════════
// AUTH WRAPPER
// ═══════════════════════════════════════
export default function App() {
  var [session, setSession] = useState(null)
  var [authLoading, setAuthLoading] = useState(true)

  useEffect(function() {
    getSession().then(function(s) {
      setSession(s)
      setAuthLoading(false)
    })
    var unsub = onAuthChange(function(s) {
      setSession(s)
    })
    return unsub
  }, [])

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F8FAFB" }}>
        <p style={{ color: "#6B7280" }}>Nacitam...</p>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return <MainApp userEmail={session.user.email} />
}

function LoginScreen() {
  var [email, setEmail] = useState("")
  var [password, setPassword] = useState("")
  var [error, setError] = useState(null)
  var [loading, setLoading] = useState(false)

  var handleLogin = async function() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    var result = await signIn(email, password)
    if (result.error) {
      setError(result.error.message === "Invalid login credentials" ? "Nespravny email nebo heslo" : result.error.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F8FAFB", padding: 20 }}>
      <div style={{ background: "#FFF", borderRadius: 16, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,.08)", maxWidth: 380, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{"\u267B\uFE0F"}</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#15803D", margin: "0 0 4px" }}>EKO-KOM Evidence</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Prihlaste se pro pristup</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Email</label>
            <input type="email" value={email} onChange={function(e) { setEmail(e.target.value) }}
              onKeyDown={function(e) { if (e.key === "Enter") handleLogin() }}
              placeholder="vas@email.cz"
              style={{ padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Heslo</label>
            <input type="password" value={password} onChange={function(e) { setPassword(e.target.value) }}
              onKeyDown={function(e) { if (e.key === "Enter") handleLogin() }}
              placeholder="vase heslo"
              style={{ padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
          </div>
          {error && <p style={{ color: "#DC2626", fontSize: 13, margin: 0, padding: "8px 12px", background: "#FEF2F2", borderRadius: 8 }}>{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            style={{ padding: "11px 18px", background: "#16A34A", color: "#FFF", border: "none", borderRadius: 8,
              fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, marginTop: 4 }}>
            {loading ? "Prihlasovani..." : "Prihlasit se"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Constants ───
var MATERIALS = [
  { id: "paper", label: "Papir/karton", color: "#D4A843", icon: "\u{1F4E6}" },
  { id: "plastic", label: "Plasty", color: "#E8672C", icon: "\u{1F6CD}" },
  { id: "wood", label: "Drevo", color: "#8B6F47", icon: "\u{1FAB5}" },
  { id: "glass", label: "Sklo", color: "#5BA68A", icon: "\u{1FAD9}" },
  { id: "metal", label: "Kovy", color: "#7A8B99", icon: "\u{1F96B}" },
  { id: "other", label: "Ostatni", color: "#9B7DB8", icon: "\u{1F4CB}" },
]
var PACK_TYPES = [
  { id: "prodejni", label: "Prodejni" },
  { id: "skupinove", label: "Skupinove" },
  { id: "prepravni", label: "Prepravni" },
  { id: "prumyslove", label: "Prumyslove" },
]

// Oficialni klasifikace dle vykazu EKO-KOM (urcuje radek ve vykazu)
var FORM_MATERIALS = [
  { id: "", label: "-- vyberte pro vykaz --", group: "" },
  // Plasty (horni sekce - vyzaduji tvrdost)
  { id: "pet_trans", label: "PET transparentni", group: "plastic", upper: true },
  { id: "pet_pruhl_bar", label: "PET pruhledne barevne", group: "plastic", upper: true },
  { id: "pet_nepruhl_bar", label: "PET nepruhledne barevne", group: "plastic", upper: true },
  { id: "pe_trans", label: "PE transparentni (folie, sacky)", group: "plastic", upper: true },
  { id: "pe_bar", label: "PE barevne", group: "plastic", upper: true },
  { id: "pp_trans", label: "PP transparentni", group: "plastic", upper: true },
  { id: "pp_bar", label: "PP barevne", group: "plastic", upper: true },
  { id: "ps_trans", label: "PS transparentni", group: "plastic", upper: true },
  { id: "ps_bar", label: "PS barevne", group: "plastic", upper: true },
  { id: "eps_trans", label: "EPS (polystyren) transparentni", group: "plastic", upper: true },
  { id: "eps_bar", label: "EPS (polystyren) barevne", group: "plastic", upper: true },
  { id: "pvc_trans", label: "PVC transparentni", group: "plastic", upper: true },
  { id: "pvc_bar", label: "PVC barevne", group: "plastic", upper: true },
  { id: "plast_jine_trans", label: "Plast jiny - transparentni", group: "plastic", upper: true },
  { id: "plast_jine_bar", label: "Plast jiny - barevny", group: "plastic", upper: true },
  // Kovy (horni sekce)
  { id: "kov_al", label: "Hlinik (Al)", group: "metal", upper: true },
  { id: "kov_fe", label: "Zelezo (Fe)", group: "metal", upper: true },
  { id: "napojovy_karton", label: "Napojovy karton", group: "other", upper: true },
  // Papir (dolni sekce)
  { id: "papir", label: "Papir", group: "paper" },
  { id: "hladka_lepenka", label: "Hladka lepenka", group: "paper" },
  { id: "vlnita_lepenka", label: "Vlnita lepenka (kartony, krabice)", group: "paper" },
  { id: "nasavana_kartonaz", label: "Nasavana kartonaz", group: "paper" },
  // Ostatni dolni
  { id: "sklo_trans", label: "Sklo transparentni", group: "glass" },
  { id: "sklo_bar", label: "Sklo barevne", group: "glass" },
  { id: "drevo", label: "Drevo a drevotriska (palety)", group: "wood" },
  { id: "textil", label: "Textil", group: "other" },
  { id: "jine", label: "Jine materialy", group: "other" },
]

var RIGIDITY = [
  { id: "mekke", label: "Mekke, flexibilni (folie, sacky)" },
  { id: "pevne3", label: "Pevne, dute do 3 L" },
  { id: "pevneNad3", label: "Pevne, dute nad 3 L" },
]

var LITTERING_CATS = [
  { id: "", label: "-- vyberte kategorii --" },
  { id: "nadoby_napoje", label: "Nadoby na napoje (do 3 L)" },
  { id: "sacky", label: "Sacky a baleni na potraviny" },
  { id: "kelimky_plast", label: "Napojove kelimky - z plastu" },
  { id: "kelimky_castecne", label: "Napojove kelimky - castecne z plastu" },
  { id: "nadoby_potraviny_plast", label: "Nadoby na potraviny - z plastu" },
  { id: "nadoby_potraviny_castecne", label: "Nadoby na potraviny - castecne z plastu" },
  { id: "taska_15_50", label: "Plastova taska 15-50 mikronu" },
  { id: "taska_pod15", label: "Plastova taska pod 15 mikronu" },
]

var fmOf = function(id) { return FORM_MATERIALS.find(function(f) { return f.id === id }) }
var QUARTERS = ["Q1 (leden-brezen)", "Q2 (duben-cerven)", "Q3 (cervenec-zari)", "Q4 (rijen-prosinec)"]
var NOW = new Date()
var CUR_YEAR = NOW.getFullYear()
var CUR_Q = Math.floor(NOW.getMonth() / 3)

var uid = function() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
var fmtKg = function(v) {
  if (!v) return "0"
  if (v < 1) return v.toFixed(3)
  if (v < 100) return v.toFixed(2)
  return v.toFixed(1)
}
var matOf = function(id) { return MATERIALS.find(function(m) { return m.id === id }) || MATERIALS[5] }
var ptOf = function(id) { return PACK_TYPES.find(function(p) { return p.id === id }) || PACK_TYPES[2] }

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
function MainApp({ userEmail }) {
  var [view, setView] = useState("dashboard")
  var [suppliers, setSuppliers] = useState([])
  var [templates, setTemplates] = useState([])
  var [receipts, setReceipts] = useState([])
  var [toast, setToast] = useState(null)
  var [selYear, setSelYear] = useState(CUR_YEAR)
  var [selQ, setSelQ] = useState(CUR_Q)
  var [loading, setLoading] = useState(true)
  var [dbOk, setDbOk] = useState(false)

  var notify = function(msg) { setToast(msg); setTimeout(function() { setToast(null) }, 2200) }

  // Load all data on mount
  useEffect(function() {
    (async function() {
      try {
        var s = await db.loadSuppliers()
        var t = await db.loadTemplates()
        var r = await db.loadReceipts()
        setSuppliers(s)
        setTemplates(t)
        setReceipts(r)
        setDbOk(true)
      } catch (e) {
        console.error("DB load failed:", e)
      }
      setLoading(false)
    })()
  }, [])

  // ─── CRUD handlers ───
  var addSupplier = async function(s) {
    var saved = await db.saveSupplier({ name: s.name, country: s.country, note: s.note })
    if (saved) { setSuppliers(function(p) { return [].concat(p, [saved]) }); notify("Dodavatel pridan") }
  }
  var delSupplier = async function(id) {
    await db.deleteSupplier(id)
    setSuppliers(function(p) { return p.filter(function(x) { return x.id !== id }) })
  }
  var updSupplier = async function(s) {
    await db.updateSupplier({ id: s.id, name: s.name, country: s.country, note: s.note, aliases: s.aliases, ai_guide: s.ai_guide })
    setSuppliers(function(p) { return p.map(function(x) {
      return x.id === s.id ? { ...x, name: s.name, country: s.country, note: s.note, aliases: s.aliases, ai_guide: s.ai_guide } : x
    }) })
    // Promitnout novy nazev do vsech prijmu tohoto dodavatele
    await db.renameReceiptsSupplier(s.id, s.name)
    setReceipts(function(p) { return p.map(function(r) {
      return r.supplierId === s.id ? { ...r, supplierName: s.name } : r
    }) })
    notify("Dodavatel upraven")
  }
  var addTemplate = async function(t) {
    var saved = await db.saveTemplate({ name: t.name, supplier_id: t.supplierId, items: t.items })
    if (saved) {
      setTemplates(function(p) { return [].concat(p, [saved]) })
      notify("Sablona ulozena")
    }
  }
  var delTemplate = async function(id) {
    await db.deleteTemplate(id)
    setTemplates(function(p) { return p.filter(function(x) { return x.id !== id }) })
  }
  var updTemplate = async function(t) {
    var payload = { id: t.id, name: t.name, supplier_id: t.supplierId, items: t.items }
    await db.updateTemplate(payload)
    setTemplates(function(p) { return p.map(function(x) {
      return x.id === t.id ? { ...x, name: t.name, supplier_id: t.supplierId, items: t.items } : x
    }) })
    notify("Sablona upravena")
  }
  var addReceipt = async function(r) {
    var saved = await db.saveReceipt(r)
    if (saved) {
      setReceipts(function(p) { return [saved].concat(p) })
      notify("Prijem ulozen")
    }
    return saved
  }
  var updReceipt = async function(updated) {
    await db.updateReceipt(updated)
    setReceipts(function(p) { return p.map(function(r) { return r.id === updated.id ? updated : r }) })
  }
  // Hromadny import prijmu z CSV.
  // replaceQuarters = pole klicu "YYYY-Q" (0-3); prijmy v techto ctvrtletich
  // se pred importem smazou (rezim nahrazeni). Prazdne = pouze pridat.
  var importReceipts = async function(list, replaceQuarters) {
    var deleted = 0
    if (replaceQuarters && replaceQuarters.length > 0) {
      var toDelete = receipts.filter(function(r) {
        var d = new Date(r.date)
        var key = d.getFullYear() + "-" + Math.floor(d.getMonth() / 3)
        return replaceQuarters.indexOf(key) >= 0
      })
      for (var j = 0; j < toDelete.length; j++) {
        await db.deleteReceipt(toDelete[j].id)
        deleted++
      }
      if (deleted > 0) {
        var delIds = toDelete.map(function(r) { return r.id })
        setReceipts(function(p) { return p.filter(function(r) { return delIds.indexOf(r.id) < 0 }) })
      }
    }
    var okCount = 0
    var saved = []
    for (var i = 0; i < list.length; i++) {
      var payload = {
        date: list[i].date,
        supplierId: list[i].supplierId,
        supplierName: list[i].supplierName,
        note: list[i].note,
        docNumber: list[i].docNumber || "",
        docDate: list[i].docDate || "",
        items: list[i].items.map(function(it) { return { ...it, id: uid() } }),
      }
      var res = await db.saveReceipt(payload)
      if (res) { saved.push(res); okCount++ }
    }
    if (saved.length > 0) setReceipts(function(p) { return saved.concat(p) })
    notify(deleted > 0
      ? "Nahrazeno: smazano " + deleted + ", naimportovano " + okCount + " prijmu"
      : "Naimportovano " + okCount + " prijmu")
    return okCount
  }
  var delReceipt = async function(id) {
    await db.deleteReceipt(id)
    setReceipts(function(p) { return p.filter(function(r) { return r.id !== id }) })
    notify("Prijem smazan")
  }
  var delReceiptsBulk = async function(ids) {
    var done = []
    for (var i = 0; i < ids.length; i++) {
      var ok = await db.deleteReceipt(ids[i])
      if (ok) done.push(ids[i])
    }
    setReceipts(function(p) { return p.filter(function(r) { return done.indexOf(r.id) < 0 }) })
    notify("Smazano " + done.length + " prijmu" + (done.length < ids.length ? " (" + (ids.length - done.length) + " se nepodarilo)" : ""))
  }

  var filtered = useMemo(function() {
    return receipts.filter(function(r) {
      var d = new Date(r.date)
      return d.getFullYear() === selYear && Math.floor(d.getMonth() / 3) === selQ
    })
  }, [receipts, selYear, selQ])

  var agg = useMemo(function() {
    var d = {}
    MATERIALS.forEach(function(m) { d[m.id] = {}; PACK_TYPES.forEach(function(p) { d[m.id][p.id] = { w: 0, r: 0 } }) })
    var litter = 0
    filtered.forEach(function(rec) {
      (rec.items || []).forEach(function(it) {
        if (d[it.material] && d[it.material][it.packType]) {
          d[it.material][it.packType].w += it.totalWeight || 0
          if (it.reusable) d[it.material][it.packType].r += it.totalWeight || 0
          if (it.littering && it.material === "plastic") litter += it.totalWeight || 0
        }
      })
    })
    var total = 0
    Object.values(d).forEach(function(m) { Object.values(m).forEach(function(v) { total += v.w }) })
    return { d: d, litter: litter, total: total }
  }, [filtered])

  var navItems = [
    { id: "dashboard", icon: "\u{1F4CA}", label: "Prehled" },
    { id: "ai", icon: "\u2728", label: "AI prijem" },
    { id: "receipt", icon: "\u{1F4E6}", label: "Prijem" },
    { id: "history", icon: "\u{1F553}", label: "Historie" },
    { id: "suppliers", icon: "\u{1F3ED}", label: "Dodavatele" },
    { id: "templates", icon: "\u{1F4CB}", label: "Sablony" },
    { id: "report", icon: "\u{1F4C4}", label: "Vykaz" },
  ]

  var qSelect = (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={selYear} onChange={function(e) { setSelYear(+e.target.value) }} style={S.sel}>
        {[CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1].map(function(y) { return <option key={y} value={y}>{y}</option> })}
      </select>
      <select value={selQ} onChange={function(e) { setSelQ(+e.target.value) }} style={S.sel}>
        {QUARTERS.map(function(q, i) { return <option key={i} value={i}>{q}</option> })}
      </select>
    </div>
  )

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "#6B7280" }}>Nacitam data...</p>
    </div>
  )

  return (
    <div>
      <header style={S.header}>
        <div style={S.headerIn}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.logoBox}>{"\u267B\uFE0F"}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#15803D" }}>EKO-KOM Evidence</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#6B7280" }}>Vykaznictvi obalu</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px",
                  borderRadius: 12, fontSize: 10, fontWeight: 700,
                  background: dbOk ? "#ECFDF5" : "#FEF2F2", color: dbOk ? "#059669" : "#DC2626",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dbOk ? "#10B981" : "#EF4444" }} />
                  {dbOk ? "Supabase OK" : "Offline"}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {navItems.map(function(n) { return (
                <button key={n.id} onClick={function() { setView(n.id) }}
                  style={{ ...S.navBtn, ...(view === n.id ? S.navAct : {}) }}>
                  <span style={{ fontSize: 16 }}>{n.icon}</span> {n.label}
                </button>
              ) })}
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: "1px solid #E5E7EB", paddingLeft: 8 }}>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>{userEmail}</span>
              <button onClick={function() { signOut() }}
                style={{ padding: "4px 10px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA",
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Odhlasit</button>
            </div>
          </div>
        </div>
      </header>

      <main style={S.main}>
        {view === "dashboard" && <Dashboard f={filtered} agg={agg} qSelect={qSelect} templates={templates} suppliers={suppliers}
          selYear={selYear} selQ={selQ} onImport={importReceipts} allReceipts={receipts}
          onUpdateReceipt={updReceipt} onDeleteReceipt={delReceipt} onDeleteBulk={delReceiptsBulk} />}
        {view === "ai" && <AiReceiptView suppliers={suppliers} templates={templates} allReceipts={receipts} onSave={addReceipt}
          S={S} Field={Field} ItemEditor={ItemEditor} fmtKg={fmtKg} matOf={matOf} />}
        {view === "receipt" && <ReceiptView suppliers={suppliers} templates={templates} onSave={addReceipt} allReceipts={receipts} />}
        {view === "history" && <HistoryView receipts={receipts} suppliers={suppliers} onDeleteReceipt={delReceipt} />}
        {view === "suppliers" && <SuppliersView data={suppliers} onAdd={addSupplier} onDel={delSupplier} onUpdate={updSupplier} />}
        {view === "templates" && <TemplatesView data={templates} suppliers={suppliers} onAdd={addTemplate} onDel={delTemplate} onUpdate={updTemplate} />}
        {view === "report" && <ReportView agg={agg} f={filtered} selYear={selYear} selQ={selQ} qSelect={qSelect} onUpdateReceipt={updReceipt} />}
      </main>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
function Dashboard({ f, agg, qSelect, templates, suppliers, selYear, selQ, onImport, allReceipts, onUpdateReceipt, onDeleteReceipt, onDeleteBulk }) {
  var [selected, setSelected] = useState([])
  var [importPreview, setImportPreview] = useState(null)
  var [importing, setImporting] = useState(false)
  var [importMode, setImportMode] = useState("add")
  var [expandedId, setExpandedId] = useState(null)
  var [editItemKey, setEditItemKey] = useState(null)
  var [expandedMat, setExpandedMat] = useState(null)
  var [filterSupplier, setFilterSupplier] = useState("")
  var [filterNote, setFilterNote] = useState("")
  var [sortDir, setSortDir] = useState("desc") // desc = nejnovejsi prvni, asc = nejstarsi prvni
  var fmtDT = function(iso) {
    if (!iso) return "-"
    var d = new Date(iso)
    return d.toLocaleDateString("cs-CZ") + " " + d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
  }
  var matTotals = MATERIALS.map(function(m) {
    var t = 0; Object.values(agg.d[m.id]).forEach(function(v) { t += v.w }); return { id: m.id, label: m.label, color: m.color, t: t }
  }).filter(function(m) { return m.t > 0 })

  // Rozpad materialu na jednotlive polozky (agregovano podle nazvu polozky)
  var materialBreakdown = function(matId) {
    var byName = {}
    f.forEach(function(rec) {
      (rec.items || []).forEach(function(it) {
        if (it.material !== matId) return
        var w = it.totalWeight || 0
        if (!w) return
        var key = it.name || "(bez nazvu)"
        if (!byName[key]) byName[key] = { name: key, qty: 0, weight: 0 }
        byName[key].qty += (it.quantity || 0)
        byName[key].weight += w
      })
    })
    return Object.keys(byName).map(function(k) { return byName[k] })
      .sort(function(a, b) { return b.weight - a.weight })
  }

  var filtered = f.filter(function(r) {
    if (filterSupplier && r.supplierId !== filterSupplier) return false
    if (filterNote && (r.note || "").toLowerCase().indexOf(filterNote.toLowerCase()) < 0) return false
    return true
  })
  var sorted = [].concat(filtered).sort(function(a, b) {
    var diff = new Date(a.date) - new Date(b.date)
    return sortDir === "desc" ? -diff : diff
  })
  // Dodavatele, kteri maji aspon jeden prijem v obdobi (pro rozbalovaci filtr)
  var supplierOpts = (suppliers || []).filter(function(s) {
    return f.some(function(r) { return r.supplierId === s.id })
  })
  var hasFilter = filterSupplier || filterNote

  var updateItemQty = function(receiptId, itemId, newQty) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    onUpdateReceipt({
      id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName, note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt,
      items: rec.items.map(function(it) {
        if (it.id !== itemId) return it
        var q = Math.max(0, newQty)
        return { ...it, quantity: q, totalWeight: Math.round(it.unitWeight * q * 1000) / 1000 }
      }),
    })
  }
  var deleteItem = function(receiptId, itemId) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    var ni = rec.items.filter(function(it) { return it.id !== itemId })
    if (ni.length === 0) { onDeleteReceipt(receiptId); setExpandedId(null) }
    else onUpdateReceipt({ id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName, note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt, items: ni })
  }
  var addItemsToReceipt = function(receiptId, newItems) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    onUpdateReceipt({ id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName, note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt,
      items: [].concat(rec.items, newItems) })
  }
  var updateReceiptMeta = function(receiptId, patch) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    onUpdateReceipt({ id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName,
      note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt, items: rec.items, ...patch })
  }
  var updateItemFields = function(receiptId, itemId, patch) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    onUpdateReceipt({ id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName, note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt,
      items: rec.items.map(function(it) {
        if (it.id !== itemId) return it
        var merged = { ...it, ...patch }
        merged.totalWeight = Math.round((merged.unitWeight || 0) * (merged.quantity || 1) * 1000) / 1000
        return merged
      }) })
  }
  // Ktere sablony jsou v prijmu pouzity (podle fromTemplate na polozkach)
  var receiptTemplateIds = function(rec) {
    var ids = {}
    ;(rec.items || []).forEach(function(it) { if (it.fromTemplate) ids[it.fromTemplate] = true })
    return Object.keys(ids)
  }
  // Zjisti, zda se nektera pouzita sablona lisi od polozek v prijmu
  var receiptOutOfSync = function(rec) {
    var tids = receiptTemplateIds(rec)
    if (tids.length === 0) return false
    return tids.some(function(tid) {
      var tpl = (templates || []).find(function(t) { return t.id === tid })
      if (!tpl) return false
      // Polozky prijmu z teto sablony
      var recItems = (rec.items || []).filter(function(it) { return it.fromTemplate === tid })
      var tplItems = tpl.items || []
      if (recItems.length !== tplItems.length) return true
      // Porovnej definice (nazev, material, typ, hmotnost, klasifikace) - NE mnozstvi
      // Parovani podle nazvu polozky
      return tplItems.some(function(ti) {
        var ri = recItems.find(function(r) { return r.name === ti.name })
        if (!ri) return true
        return ri.material !== ti.material || ri.packType !== ti.packType ||
          ri.unitWeight !== ti.unitWeight || (ri.formMaterial || "") !== (ti.formMaterial || "") ||
          (ri.rigidity || null) !== (ti.rigidity || null)
      })
    })
  }
  // Pregeneruje polozky prijmu podle aktualnich sablon.
  // Zachova zadane mnozstvi (quantity) parovanim podle nazvu polozky.
  // Rucne pridane polozky (bez fromTemplate) zustanou beze zmeny.
  var resyncFromTemplates = function(receiptId) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    var tids = receiptTemplateIds(rec)
    if (tids.length === 0) return
    // Rucne pridane polozky zachovame
    var manualItems = (rec.items || []).filter(function(it) { return !it.fromTemplate })
    var newItems = []
    tids.forEach(function(tid) {
      var tpl = (templates || []).find(function(t) { return t.id === tid })
      if (!tpl) {
        // Sablona byla smazana - ponechame puvodni polozky z ni
        var kept = (rec.items || []).filter(function(it) { return it.fromTemplate === tid })
        newItems = newItems.concat(kept)
        return
      }
      var oldFromTpl = (rec.items || []).filter(function(it) { return it.fromTemplate === tid })
      ;(tpl.items || []).forEach(function(ti) {
        // Zachovat mnozstvi z odpovidajici stare polozky - parovani podle NAZVU
        // Nova polozka (bez shody) prijde s poctem 0 (checklist k vyplneni)
        var match = oldFromTpl.find(function(o) { return o.name === ti.name })
        var q = match ? match.quantity : 0
        newItems.push({ id: uid(), name: ti.name, material: ti.material, packType: ti.packType,
          unitWeight: ti.unitWeight, quantity: q, totalWeight: Math.round(ti.unitWeight * q * 1000) / 1000,
          reusable: !!ti.reusable, littering: !!ti.littering,
          formMaterial: ti.formMaterial || "", rigidity: ti.rigidity || null,
          litteringCategory: ti.litteringCategory || null, plasticShare: ti.plasticShare || null,
          fromTemplate: tid })
      })
    })
    onUpdateReceipt({ id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName,
      note: rec.note, items: newItems.concat(manualItems) })
  }

  return (
    <div>
      <div style={S.secHead}><h2 style={S.secTitle}>Prehled ctvrtleti</h2>{qSelect}</div>
      <div style={S.kpiRow}>
        {[
          { l: "Celkova hmotnost", v: fmtKg(agg.total), u: "kg obalu" },
          { l: "Pocet prijmu", v: f.length, u: "za ctvrtleti" },
          { l: "Littering", v: fmtKg(agg.litter), u: "kg jednorazovych plastu" },
          { l: "Materialu", v: matTotals.length, u: "typu evidovano" },
        ].map(function(k, i) { return (
          <div key={i} style={S.kpi}><span style={S.kpiL}>{k.l}</span><span style={S.kpiV}>{k.v}</span><span style={S.kpiU}>{k.u}</span></div>
        ) })}
      </div>
      {matTotals.length > 0 && (
        <div style={S.card}>
          <h3 style={S.cardT}>Rozlozeni podle materialu</h3>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "-6px 0 12px" }}>Kliknutim na material zobrazite jednotlive polozky.</p>
          {matTotals.map(function(m) {
            var isOpen = expandedMat === m.id
            var breakdown = isOpen ? materialBreakdown(m.id) : []
            return (
              <div key={m.id} style={{ marginBottom: 8 }}>
                <div onClick={function() { setExpandedMat(isOpen ? null : m.id) }}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 6px", borderRadius: 6, background: isOpen ? "#F9FAFB" : "transparent" }}>
                  <span style={{ fontSize: 11, color: isOpen ? m.color : "#9CA3AF", fontWeight: 700, width: 14 }}>{isOpen ? "\u25BC" : "\u25B6"}</span>
                  <span style={{ width: 90, fontSize: 13, color: "#4B5563" }}>{m.label}</span>
                  <div style={{ flex: 1, height: 26, background: "#F3F4F6", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: Math.max((m.t / agg.total) * 100, 3) + "%", background: m.color, borderRadius: 6 }} />
                  </div>
                  <span style={{ width: 85, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{fmtKg(m.t)} kg</span>
                </div>
                {isOpen && (
                  <div style={{ marginLeft: 24, marginTop: 6, marginBottom: 4, borderLeft: "2px solid " + m.color, paddingLeft: 12 }}>
                    {breakdown.length === 0 ? (
                      <p style={{ ...S.empty, margin: "4px 0" }}>Zadne polozky.</p>
                    ) : breakdown.map(function(b, i) {
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13, borderBottom: i < breakdown.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                          <span style={{ flex: 1, color: "#374151" }}>{b.name}</span>
                          <span style={{ width: 70, textAlign: "right", color: "#9CA3AF", fontSize: 12 }}>{b.qty} ks</span>
                          <span style={{ width: 85, textAlign: "right", fontWeight: 600 }}>{fmtKg(b.weight)} kg</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h3 style={{ ...S.cardT, margin: 0 }}>Prijmy ({sorted.length}{hasFilter ? " z " + f.length : ""})</h3>
          {sorted.length > 0 && (function() {
            var visIds = sorted.map(function(r) { return r.id })
            var selVis = selected.filter(function(id) { return visIds.indexOf(id) >= 0 })
            var allOn = selVis.length === visIds.length
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ ...S.chk, fontSize: 12 }}>
                  <input type="checkbox" checked={allOn} onChange={function() { setSelected(allOn ? [] : visIds) }} />
                  Vybrat vse ({visIds.length})
                </label>
                {selVis.length > 0 && (
                  <button onClick={async function() {
                    var kg = sorted.filter(function(r) { return selVis.indexOf(r.id) >= 0 })
                      .reduce(function(s, r) { return s + r.items.reduce(function(a, i) { return a + (i.totalWeight || 0) }, 0) }, 0)
                    if (!confirm("Smazat " + selVis.length + " prijmu (" + fmtKg(kg) + " kg)?\n\nTuto akci nelze vratit.")) return
                    await onDeleteBulk(selVis)
                    setSelected([]); setExpandedId(null)
                  }} style={{ ...S.btn2, color: "#DC2626", borderColor: "#FECACA", background: "#FEF2F2", padding: "5px 12px" }}>
                    Smazat vybrane ({selVis.length})
                  </button>
                )}
              </div>
            )
          })()}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14, padding: "12px", background: "#F9FAFB", borderRadius: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Dodavatel</label>
            <select value={filterSupplier} onChange={function(e) { setFilterSupplier(e.target.value) }} style={S.inp}>
              <option value="">Vsichni dodavatele</option>
              {supplierOpts.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option> })}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Cislo faktury</label>
            <input value={filterNote} onChange={function(e) { setFilterNote(e.target.value) }} placeholder="hledat..." style={S.inp} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Razeni dle data</label>
            <button onClick={function() { setSortDir(sortDir === "desc" ? "asc" : "desc") }}
              style={{ ...S.btn2, height: 37 }}>
              {sortDir === "desc" ? "Nejnovejsi prvni v" : "Nejstarsi prvni ^"}
            </button>
          </div>
          {hasFilter && (
            <button onClick={function() { setFilterSupplier(""); setFilterNote("") }}
              style={{ ...S.btn2, height: 37, color: "#DC2626", borderColor: "#FECACA", background: "#FEF2F2" }}>
              Zrusit filtr
            </button>
          )}
        </div>
        {sorted.length === 0 ? <p style={S.empty}>{hasFilter ? "Zadny prijem neodpovida filtru." : "Zatim zadne prijmy."}</p> : sorted.map(function(rec) {
          var isOpen = expandedId === rec.id
          var recTotal = rec.items.reduce(function(s, i) { return s + (i.totalWeight || 0) }, 0)
          return (
            <div key={rec.id} style={{ marginBottom: 6 }}>
              <div onClick={function() { setExpandedId(isOpen ? null : rec.id) }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: isOpen ? "#F0FDF4" : "#FAFBFC", borderRadius: isOpen ? "8px 8px 0 0" : 8,
                  border: isOpen ? "1px solid #BBF7D0" : "1px solid #F3F4F6",
                  borderBottom: isOpen ? "none" : undefined, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={selected.indexOf(rec.id) >= 0}
                  onClick={function(e) { e.stopPropagation() }}
                  onChange={function() { setSelected(function(p) { return p.indexOf(rec.id) >= 0 ? p.filter(function(x) { return x !== rec.id }) : p.concat([rec.id]) }) }} />
                <span style={{ fontSize: 12, color: isOpen ? "#15803D" : "#9CA3AF", fontWeight: 700, width: 20 }}>{isOpen ? "\u25BC" : "\u25B6"}</span>
                <span style={{ fontSize: 13, color: "#6B7280", width: 80 }}>{new Date(rec.date).toLocaleDateString("cs-CZ")}</span>
                <span style={{ fontWeight: 600, flex: 1 }}>{rec.supplierName}</span>
                {rec.note && <span title="Cislo faktury" style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", padding: "2px 8px", borderRadius: 10 }}>Faktura: {rec.note}</span>}
                <span title="Kdy zadano do aplikace" style={{ fontSize: 11, color: "#9CA3AF", width: 118, textAlign: "right" }}>{fmtDT(rec.createdAt)}</span>
                <span style={{ fontSize: 13, color: "#9CA3AF", width: 55 }}>{rec.items.length} pol.</span>
                <span style={{ fontWeight: 700, width: 80, textAlign: "right" }}>{fmtKg(recTotal)} kg</span>
                <button onClick={function(e) { e.stopPropagation(); if (confirm("Smazat cely prijem?")) { onDeleteReceipt(rec.id); setExpandedId(null) } }}
                  style={{ ...S.delBtn, fontSize: 12, opacity: 0.6 }}>x</button>
              </div>
              {isOpen && (
                <div style={{ border: "1px solid #BBF7D0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px", background: "#FAFFFE" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, padding: 10, background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 6 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 150 }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Cislo faktury</label>
                      <input value={rec.note || ""} onChange={function(e) { updateReceiptMeta(rec.id, { note: e.target.value }) }}
                        placeholder="FA-..." style={{ ...S.inp, fontSize: 13, padding: "5px 8px" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, justifyContent: "flex-end" }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Zadano do aplikace</label>
                      <span style={{ fontSize: 13, color: "#4B5563", padding: "5px 0" }}>{fmtDT(rec.createdAt)}</span>
                    </div>
                  </div>
                  {rec.items.map(function(it) {
                    var itemKey = rec.id + "|" + it.id
                    var isEditing = editItemKey === itemKey
                    return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
                      background: "#FFF", borderRadius: 6, marginBottom: 4, border: "1px solid #E5E7EB", fontSize: 13, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15 }}>{matOf(it.material).icon}</span>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input value={it.name} onChange={function(e) { updateItemFields(rec.id, it.id, { name: e.target.value }) }}
                              placeholder="Nazev polozky" style={{ ...S.inp, fontSize: 13, padding: "5px 8px" }} />
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <select value={it.material} onChange={function(e) { updateItemFields(rec.id, it.id, { material: e.target.value }) }}
                                style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: "auto" }}>
                                {MATERIALS.map(function(m) { return <option key={m.id} value={m.id}>{m.label}</option> })}
                              </select>
                              <select value={it.packType} onChange={function(e) { updateItemFields(rec.id, it.id, { packType: e.target.value }) }}
                                style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: "auto" }}>
                                {PACK_TYPES.map(function(p) { return <option key={p.id} value={p.id}>{p.label}</option> })}
                              </select>
                              <input type="number" step="0.001" value={it.unitWeight}
                                onChange={function(e) { updateItemFields(rec.id, it.id, { unitWeight: parseFloat(e.target.value) || 0 }) }}
                                title="kg/ks" style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: 80 }} />
                            </div>
                            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                              <label style={{ ...S.chk, fontSize: 12 }}>
                                <input type="checkbox" checked={!!it.reusable}
                                  onChange={function(e) { updateItemFields(rec.id, it.id, { reusable: e.target.checked }) }} /> Opakovane pouzitelne
                              </label>
                              {it.material === "plastic" && (
                                <label style={{ ...S.chk, fontSize: 12 }}>
                                  <input type="checkbox" checked={!!it.littering}
                                    onChange={function(e) { updateItemFields(rec.id, it.id, { littering: e.target.checked }) }} /> Littering
                                </label>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                            <div style={{ fontSize: 11, color: "#6B7280" }}>
                              {matOf(it.material).label} / {ptOf(it.packType).label}
                              {it.reusable ? " / opak." : ""}{it.littering ? " / litter" : ""}
                              {" | " + it.unitWeight + " kg/ks"}</div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button onClick={function() { setEditItemKey(isEditing ? null : itemKey) }}
                          style={{ padding: "3px 8px", background: isEditing ? "#DBEAFE" : "#EFF6FF", color: "#2563EB",
                            border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          {isEditing ? "hotovo" : "upravit"}</button>
                        <QtyStepper value={it.quantity} minVal={0} onChange={function(q) { updateItemQty(rec.id, it.id, q) }} />
                        <span style={{ width: 65, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtKg(it.totalWeight)} kg</span>
                        <button onClick={function() { deleteItem(rec.id, it.id) }} style={{ ...S.delBtn, fontSize: 12 }}>x</button>
                      </div>
                    </div>
                    )
                  })}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <ReceiptItemAdder onAdd={function(newItems) { addItemsToReceipt(rec.id, newItems) }} />
                    {receiptTemplateIds(rec).length > 0 && (
                      <button onClick={function() {
                        if (confirm("Pregenerovat polozky z aktualnich sablon? Zadane pocty kusu se pokusime zachovat, rucne pridane polozky zustanou.")) resyncFromTemplates(rec.id)
                      }}
                        style={{ marginTop: 6, padding: "6px 12px",
                          background: receiptOutOfSync(rec) ? "#FEF3C7" : "#F3F4F6",
                          color: receiptOutOfSync(rec) ? "#92400E" : "#6B7280",
                          border: "1px solid " + (receiptOutOfSync(rec) ? "#FDE68A" : "#E5E7EB"),
                          borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {receiptOutOfSync(rec) ? "! Aktualizovat dle sablony" : "Aktualizovat dle sablony"}
                      </button>
                    )}
                  </div>
                  {receiptOutOfSync(rec) && (
                    <div style={{ fontSize: 11, color: "#92400E", marginTop: 6 }}>
                      Sablona pouzita v tomto prijmu byla zmenena. Tlacitkem vyse promitnete zmeny.
                    </div>
                  )}
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#15803D", marginTop: 6, paddingTop: 6, borderTop: "1px solid #E5E7EB" }}>
                    Celkem: {fmtKg(recTotal)} kg</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Export / import ctvrtleti */}
      <div style={S.card}>
        <h3 style={S.cardT}>Zaloha ctvrtleti (CSV)</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button onClick={function() { downloadQuarterCSV(f, selYear, selQ) }} disabled={f.length === 0}
            style={{ ...S.btn1, opacity: f.length === 0 ? 0.5 : 1 }}>
            Exportovat {QUARTERS[selQ]} {selYear} ({f.length} prijmu)
          </button>
          <label style={{ ...S.btn2, display: "inline-block", cursor: "pointer" }}>
            Nacist CSV k importu
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
              onChange={function(e) {
                var file = e.target.files && e.target.files[0]
                if (!file) return
                var reader = new FileReader()
                reader.onload = function(ev) {
                  setImportPreview(parseQuarterCSV(String(ev.target.result), suppliers))
                }
                reader.readAsText(file, "UTF-8")
                e.target.value = ""
              }} />
          </label>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>
          Export ulozi vsechny prijmy vybraneho ctvrtleti vcetne klasifikace pro vykaz.
          Pri importu si zvolite, zda data <strong>pridat</strong>, nebo <strong>nahradit</strong> obsah ctvrtleti (obnova zalohy).
        </p>

        {importPreview && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 8,
            background: importPreview.receipts.length > 0 ? "#EFF6FF" : "#FEF2F2",
            border: "1px solid " + (importPreview.receipts.length > 0 ? "#BFDBFE" : "#FECACA") }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: importPreview.receipts.length > 0 ? "#2563EB" : "#DC2626" }}>
              Nahled importu
            </h4>
            {importPreview.receipts.length > 0 && (
              <p style={{ fontSize: 13, margin: "0 0 8px", color: "#1F2937" }}>
                K importu: <strong>{importPreview.stats.receipts} prijmu</strong>, {importPreview.stats.items} polozek, celkem {fmtKg(importPreview.stats.kg)} kg
              </p>
            )}
            {importPreview.errors.length > 0 && (
              <div style={{ fontSize: 12, color: "#B45309", marginBottom: 8 }}>
                {importPreview.errors.slice(0, 6).map(function(er, i) { return <div key={i}>! {er}</div> })}
                {importPreview.errors.length > 6 && <div>... a dalsich {importPreview.errors.length - 6}</div>}
              </div>
            )}
            {importPreview.receipts.length > 0 && (
              <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 10 }}>
                {importPreview.receipts.slice(0, 20).map(function(r, i) {
                  var ikg = r.items.reduce(function(s, x) { return s + (x.totalWeight || 0) }, 0)
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid #E5E7EB" }}>
                      <span style={{ color: "#6B7280", width: 78 }}>{new Date(r.date).toLocaleDateString("cs-CZ")}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{r.supplierName}{r.supplierMatched ? "" : " (nenalezen)"}</span>
                      <span style={{ color: "#9CA3AF", width: 55 }}>{r.items.length} pol.</span>
                      <span style={{ fontWeight: 700, width: 75, textAlign: "right" }}>{fmtKg(ikg)} kg</span>
                    </div>
                  )
                })}
                {importPreview.receipts.length > 20 && (
                  <div style={{ fontSize: 11, color: "#6B7280", paddingTop: 4 }}>... a dalsich {importPreview.receipts.length - 20} prijmu</div>
                )}
              </div>
            )}
            {importPreview.receipts.length > 0 && (function() {
              // Ktera ctvrtleti jsou v souboru zastoupena
              var qKeys = {}
              importPreview.receipts.forEach(function(r) {
                var d = new Date(r.date)
                qKeys[d.getFullYear() + "-" + Math.floor(d.getMonth() / 3)] = true
              })
              var keys = Object.keys(qKeys)
              var qLabels = keys.map(function(k) {
                var p = k.split("-")
                return "Q" + (parseInt(p[1]) + 1) + "/" + p[0]
              })
              var wouldDelete = (allReceipts || []).filter(function(r) {
                var d = new Date(r.date)
                return keys.indexOf(d.getFullYear() + "-" + Math.floor(d.getMonth() / 3)) >= 0
              })
              return (
                <div style={{ marginBottom: 10, padding: 10, background: "#FFF", borderRadius: 8, border: "1px solid #E5E7EB" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                    Rezim importu (soubor obsahuje: {qLabels.join(", ")})
                  </div>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                    <input type="radio" name="impmode" checked={importMode === "add"} onChange={function() { setImportMode("add") }} style={{ marginTop: 3 }} />
                    <span style={{ fontSize: 12 }}>
                      <strong>Pridat</strong> ke stavajicim datum
                      <span style={{ color: "#6B7280" }}> - nic se nemaze. Pozor: pokud uz tato data mate, vzniknou duplicity.</span>
                    </span>
                  </label>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                    <input type="radio" name="impmode" checked={importMode === "replace"} onChange={function() { setImportMode("replace") }} style={{ marginTop: 3 }} />
                    <span style={{ fontSize: 12 }}>
                      <strong style={{ color: "#DC2626" }}>Nahradit</strong> obsah techto ctvrtleti
                      <span style={{ color: "#6B7280" }}> - vhodne pro obnovu zalohy.</span>
                      {wouldDelete.length > 0 && (
                        <span style={{ display: "block", color: "#DC2626", fontWeight: 700, marginTop: 3 }}>
                          Smaze se {wouldDelete.length} stavajicich prijmu
                          ({fmtKg(wouldDelete.reduce(function(s, r) {
                            return s + (r.items || []).reduce(function(a, i) { return a + (i.totalWeight || 0) }, 0)
                          }, 0))} kg)
                        </span>
                      )}
                      {wouldDelete.length === 0 && (
                        <span style={{ display: "block", color: "#6B7280", marginTop: 3 }}>V techto ctvrtletich zatim zadna data nemate.</span>
                      )}
                    </span>
                  </label>
                </div>
              )
            })()}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {importPreview.receipts.length > 0 && (
                <button onClick={async function() {
                  var qKeys = {}
                  importPreview.receipts.forEach(function(r) {
                    var d = new Date(r.date)
                    qKeys[d.getFullYear() + "-" + Math.floor(d.getMonth() / 3)] = true
                  })
                  var keys = Object.keys(qKeys)
                  var wouldDelete = (allReceipts || []).filter(function(r) {
                    var d = new Date(r.date)
                    return keys.indexOf(d.getFullYear() + "-" + Math.floor(d.getMonth() / 3)) >= 0
                  })
                  var msg
                  if (importMode === "replace") {
                    msg = "NAHRADIT: smaze se " + wouldDelete.length + " stavajicich prijmu a naimportuje "
                      + importPreview.stats.receipts + " novych.\n\nTuto akci nelze vratit zpet. Pokracovat?"
                  } else {
                    msg = "PRIDAT " + importPreview.stats.receipts + " prijmu ke stavajicim datum?"
                  }
                  if (!confirm(msg)) return
                  setImporting(true)
                  await onImport(importPreview.receipts, importMode === "replace" ? keys : null)
                  setImporting(false)
                  setImportPreview(null)
                  setImportMode("add")
                }} disabled={importing}
                  style={{ ...S.btn1, opacity: importing ? 0.6 : 1,
                    background: importMode === "replace" ? "#DC2626" : "#16A34A" }}>
                  {importing ? "Importuji..." : (importMode === "replace" ? "Nahradit a importovat" : "Potvrdit import")}
                </button>
              )}
              <button onClick={function() { setImportPreview(null); setImportMode("add") }} style={S.btn2}>Zrusit</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// RECEIPT ITEM ADDER (add items into existing receipt from dashboard)
// ═══════════════════════════════════════
function ReceiptItemAdder({ onAdd }) {
  var [open, setOpen] = useState(false)
  var [buf, setBuf] = useState([])

  var confirm = function() {
    if (buf.length === 0) return
    onAdd(buf)
    setBuf([])
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={function() { setOpen(true) }}
        style={{ marginTop: 6, padding: "6px 12px", background: "#EFF6FF", color: "#2563EB",
          border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        + Pridat polozku do prijmu
      </button>
    )
  }

  return (
    <div style={{ marginTop: 8, padding: 12, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#2563EB" }}>Nove polozky ({buf.length})</h4>
      <ItemEditor items={buf} setItems={setBuf} addLabel="Pridat obal" qtyMin={0} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={confirm} disabled={buf.length === 0}
          style={{ ...S.btn1, padding: "7px 14px", fontSize: 13, opacity: buf.length === 0 ? 0.5 : 1 }}>
          Ulozit do prijmu</button>
        <button onClick={function() { setBuf([]); setOpen(false) }} style={S.btn2}>Zrusit</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ITEM EDITOR (shared)
// ═══════════════════════════════════════
function ItemEditor({ items, setItems, addLabel, qtyMin }) {
  var [showForm, setShowForm] = useState(false)
  var [name, setName] = useState("")
  var [material, setMaterial] = useState("paper")
  var [packType, setPackType] = useState("prepravni")
  var [uw, setUw] = useState("")
  var [qty, setQty] = useState(1)
  var [reusable, setReusable] = useState(false)
  var [littering, setLittering] = useState(false)
  var [formMaterial, setFormMaterial] = useState("")
  var [rigidity, setRigidity] = useState("mekke")
  var [litteringCategory, setLitteringCategory] = useState("")
  var [plasticShare, setPlasticShare] = useState("100")
  var [editingItemId, setEditingItemId] = useState(null)
  var reset = function() { setName(""); setUw(""); setQty(1); setReusable(false); setLittering(false); setMaterial("paper"); setPackType("prepravni"); setFormMaterial(""); setRigidity("mekke"); setLitteringCategory(""); setPlasticShare("100") }

  var updItem = function(id, patch) {
    setItems(function(prev) { return prev.map(function(it) {
      if (it.id !== id) return it
      var merged = { ...it, ...patch }
      var q = (merged.quantity == null) ? 0 : merged.quantity
      merged.totalWeight = Math.round((merged.unitWeight || 0) * q * 1000) / 1000
      return merged
    }) })
  }

  var fmInfo = fmOf(formMaterial)
  var needsRigidity = fmInfo && fmInfo.upper

  // Nabidka formMaterial filtrovana podle zvoleneho zakladniho materialu
  var fmOptions = FORM_MATERIALS.filter(function(f) { return f.id === "" || f.group === material || material === "other" })

  var add = function() {
    if (!name.trim() || !uw) return
    var u = parseFloat(uw); if (isNaN(u) || u <= 0) return
    setItems(function(prev) { return [].concat(prev, [{ id: uid(), name: name.trim(), material: material, packType: packType,
      unitWeight: u, quantity: qty, totalWeight: Math.round(u * qty * 1000) / 1000, reusable: reusable, littering: littering,
      formMaterial: formMaterial, rigidity: needsRigidity ? rigidity : null,
      litteringCategory: littering ? litteringCategory : null,
      plasticShare: littering ? (parseFloat(plasticShare) || 100) / 100 : null }]) })
    reset(); setShowForm(false)
  }
  var updQty = function(id, q) {
    setItems(function(prev) { return prev.map(function(it) {
      return it.id === id ? { ...it, quantity: q, totalWeight: Math.round(it.unitWeight * q * 1000) / 1000 } : it
    }) })
  }

  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {items.map(function(it) {
            if (editingItemId === it.id) {
              var itFm = fmOf(it.formMaterial)
              var itNeedsRigidity = itFm && itFm.upper
              var itFmOptions = FORM_MATERIALS.filter(function(fm) { return fm.id === "" || fm.group === it.material || it.material === "other" })
              return (
                <div key={it.id} style={{ background: "#EFF6FF", borderRadius: 10, padding: 12, border: "1px solid #BFDBFE" }}>
                  <div style={S.grid3}>
                    <Field l="Nazev"><input value={it.name} onChange={function(e) { updItem(it.id, { name: e.target.value }) }} style={S.inp} /></Field>
                    <Field l="Material"><select value={it.material} onChange={function(e) { updItem(it.id, { material: e.target.value, formMaterial: "" }) }} style={S.inp}>
                      {MATERIALS.map(function(m) { return <option key={m.id} value={m.id}>{m.label}</option> })}</select></Field>
                    <Field l="Typ obalu"><select value={it.packType} onChange={function(e) { updItem(it.id, { packType: e.target.value }) }} style={S.inp}>
                      {PACK_TYPES.map(function(p) { return <option key={p.id} value={p.id}>{p.label}</option> })}</select></Field>
                  </div>
                  <div style={S.grid3}>
                    <Field l="Hmotnost 1 ks (kg)"><input type="number" step="0.001" value={it.unitWeight}
                      onChange={function(e) { updItem(it.id, { unitWeight: parseFloat(e.target.value) || 0 }) }} style={S.inp} /></Field>
                    <Field l="Pocet ks"><input type="number" min={1} value={it.quantity}
                      onChange={function(e) { updItem(it.id, { quantity: Math.max(1, +e.target.value || 1) }) }} style={S.inp} /></Field>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, paddingBottom: 2 }}>
                      <label style={S.chk}><input type="checkbox" checked={!!it.reusable} onChange={function(e) { updItem(it.id, { reusable: e.target.checked }) }} /> Opak. pouzitelny</label>
                      {it.material === "plastic" && <label style={S.chk}><input type="checkbox" checked={!!it.littering} onChange={function(e) { updItem(it.id, { littering: e.target.checked }) }} /> Littering</label>}
                    </div>
                  </div>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 8, textTransform: "uppercase" }}>Klasifikace pro oficialni vykaz</div>
                    <div style={S.grid3}>
                      <Field l="Material dle vykazu *">
                        <select value={it.formMaterial || ""} onChange={function(e) { updItem(it.id, { formMaterial: e.target.value }) }} style={S.inp}>
                          {itFmOptions.map(function(fm) { return <option key={fm.id} value={fm.id}>{fm.label}</option> })}
                        </select>
                      </Field>
                      {itNeedsRigidity && (
                        <Field l="Tvrdost obalu *">
                          <select value={it.rigidity || "mekke"} onChange={function(e) { updItem(it.id, { rigidity: e.target.value }) }} style={S.inp}>
                            {RIGIDITY.map(function(r) { return <option key={r.id} value={r.id}>{r.label}</option> })}
                          </select>
                        </Field>
                      )}
                    </div>
                    {it.littering && (
                      <div style={S.grid3}>
                        <Field l="Littering kategorie *">
                          <select value={it.litteringCategory || ""} onChange={function(e) { updItem(it.id, { litteringCategory: e.target.value }) }} style={S.inp}>
                            {LITTERING_CATS.map(function(c) { return <option key={c.id} value={c.id}>{c.label}</option> })}
                          </select>
                        </Field>
                        <Field l="Podil plastu (%)">
                          <input type="number" min={1} max={100} value={it.plasticShare ? Math.round(it.plasticShare * 100) : 100}
                            onChange={function(e) { updItem(it.id, { plasticShare: (parseFloat(e.target.value) || 100) / 100 }) }} style={S.inp} />
                        </Field>
                      </div>
                    )}
                  </div>
                  <button onClick={function() { setEditingItemId(null) }} style={S.btn1}>Hotovo</button>
                </div>
              )
            }
            return (
            <div key={it.id} style={S.row}>
              <span style={{ fontSize: 16 }}>{matOf(it.material).icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>
                  {matOf(it.material).label} / {ptOf(it.packType).label}
                  {it.formMaterial && fmOf(it.formMaterial) ? " / " + fmOf(it.formMaterial).label : ""}
                  {it.reusable ? " / opak." : ""}{it.littering ? " / litter" : ""}</div>
                {!it.formMaterial && (
                  <div style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>! Chybi klasifikace pro oficialni vykaz</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={function() { setEditingItemId(it.id) }}
                  style={{ padding: "3px 8px", background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>upravit</button>
                <QtyStepper value={it.quantity} minVal={qtyMin} onChange={function(q) { updQty(it.id, q) }} />
                <span style={{ width: 70, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtKg(it.totalWeight)} kg</span>
                <button onClick={function() { setItems(function(p) { return p.filter(function(x) { return x.id !== it.id }) }) }} style={S.delBtn}>x</button>
              </div>
            </div>
            )
          })}
        </div>
      )}
      {showForm ? (
        <div style={{ background: "#F9FAFB", borderRadius: 10, padding: 14, border: "1px solid #E5E7EB", marginBottom: 8 }}>
          <div style={S.grid3}>
            <Field l="Nazev"><input value={name} onChange={function(e) { setName(e.target.value) }} placeholder="Karton 40x30" style={S.inp} /></Field>
            <Field l="Material"><select value={material} onChange={function(e) { setMaterial(e.target.value) }} style={S.inp}>
              {MATERIALS.map(function(m) { return <option key={m.id} value={m.id}>{m.label}</option> })}</select></Field>
            <Field l="Typ obalu"><select value={packType} onChange={function(e) { setPackType(e.target.value) }} style={S.inp}>
              {PACK_TYPES.map(function(p) { return <option key={p.id} value={p.id}>{p.label}</option> })}</select></Field>
          </div>
          <div style={S.grid3}>
            <Field l="Hmotnost 1 ks (kg)"><input type="number" step="0.001" value={uw} onChange={function(e) { setUw(e.target.value) }} placeholder="0.350" style={S.inp} /></Field>
            <Field l="Pocet ks"><input type="number" min={1} value={qty} onChange={function(e) { setQty(Math.max(1, +e.target.value || 1)) }} style={S.inp} /></Field>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, paddingBottom: 2 }}>
              <label style={S.chk}><input type="checkbox" checked={reusable} onChange={function(e) { setReusable(e.target.checked) }} /> Opak. pouzitelny</label>
              {material === "plastic" && <label style={S.chk}><input type="checkbox" checked={littering} onChange={function(e) { setLittering(e.target.checked) }} /> Littering</label>}
            </div>
          </div>
          {/* Oficialni klasifikace pro vykaz */}
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 8, textTransform: "uppercase" }}>Klasifikace pro oficialni vykaz EKO-KOM</div>
            <div style={S.grid3}>
              <Field l="Material dle vykazu *">
                <select value={formMaterial} onChange={function(e) { setFormMaterial(e.target.value) }} style={S.inp}>
                  {fmOptions.map(function(f) { return <option key={f.id} value={f.id}>{f.label}</option> })}
                </select>
              </Field>
              {needsRigidity && (
                <Field l="Tvrdost obalu *">
                  <select value={rigidity} onChange={function(e) { setRigidity(e.target.value) }} style={S.inp}>
                    {RIGIDITY.map(function(r) { return <option key={r.id} value={r.id}>{r.label}</option> })}
                  </select>
                </Field>
              )}
            </div>
            {littering && (
              <div style={S.grid3}>
                <Field l="Littering kategorie *">
                  <select value={litteringCategory} onChange={function(e) { setLitteringCategory(e.target.value) }} style={S.inp}>
                    {LITTERING_CATS.map(function(c) { return <option key={c.id} value={c.id}>{c.label}</option> })}
                  </select>
                </Field>
                <Field l="Podil plastu (%)">
                  <input type="number" min={1} max={100} value={plasticShare} onChange={function(e) { setPlasticShare(e.target.value) }} style={S.inp} />
                </Field>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={add} style={S.btn1}>Pridat</button>
            <button onClick={function() { setShowForm(false); reset() }} style={S.btn2}>Zrusit</button>
          </div>
        </div>
      ) : (
        <button onClick={function() { setShowForm(true) }} style={S.btn2}>+ {addLabel || "Pridat polozku"}</button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// RECEIPT
// ═══════════════════════════════════════
function ReceiptView({ suppliers, templates, onSave, allReceipts }) {
  var [supId, setSupId] = useState("")
  var [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  var [note, setNote] = useState("")
  var [items, setItems] = useState([])
  var tplWeight = function(t) { return (t.items || []).reduce(function(s, i) { return s + i.unitWeight * (i.quantity || 1) }, 0) }
  var byWeightDesc = function(a, b) { return tplWeight(b) - tplWeight(a) }
  var supplierTpls = supId ? templates.filter(function(t) { return (t.supplier_id || t.supplierId) === supId }).sort(byWeightDesc) : []
  var commonTpls = supId ? templates.filter(function(t) { return (t.supplier_id || t.supplierId) === "__global__" }).sort(byWeightDesc) : []
  var hasAnyTpl = supplierTpls.length > 0 || commonTpls.length > 0

  // Kontrola unikatnosti cisla faktury napric vsemi prijmy
  var invDuplicate = note.trim()
    ? (allReceipts || []).find(function(r) {
        return (r.note || "").trim().toLowerCase() === note.trim().toLowerCase()
      })
    : null

  var addFromTpl = function(tpl) {
    var ni = (tpl.items || []).map(function(it) {
      return { id: uid(), name: it.name, material: it.material, packType: it.packType,
        unitWeight: it.unitWeight, quantity: 0,
        totalWeight: 0,
        reusable: !!it.reusable, littering: !!it.littering,
        formMaterial: it.formMaterial || "", rigidity: it.rigidity || null,
        litteringCategory: it.litteringCategory || null, plasticShare: it.plasticShare || null,
        fromTemplate: tpl.id }
    })
    setItems(function(prev) { return [].concat(prev, ni) })
  }
  var save = function() {
    if (!items.length) return
    if (invDuplicate) {
      var d = new Date(invDuplicate.date).toLocaleDateString("cs-CZ")
      if (!confirm("Cislo faktury '" + note.trim() + "' uz existuje u prijmu ze dne " + d
        + " (" + (invDuplicate.supplierName || "") + ").\n\nPresto ulozit?")) return
    }
    var sup = suppliers.find(function(s) { return s.id === supId })
    onSave({ id: uid(), date: date, supplierId: supId, supplierName: sup ? sup.name : "Neuvedeno",
      note: note, items: items })
    setItems([]); setNote("")
  }
  var totalW = items.reduce(function(s, i) { return s + (i.totalWeight || 0) }, 0)

  return (
    <div>
      <h2 style={S.secTitle}>Novy prijem</h2>
      <div style={S.card}>
        <div style={S.grid3}>
          <Field l="Datum prijmu"><input type="date" value={date} onChange={function(e) { setDate(e.target.value) }} style={S.inp} /></Field>
          <Field l="Dodavatel"><select value={supId} onChange={function(e) { setSupId(e.target.value) }} style={S.inp}>
            <option value="">-- vyberte --</option>
            {suppliers.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option> })}</select></Field>
          <Field l="Cislo faktury">
            <input value={note} onChange={function(e) { setNote(e.target.value) }} placeholder="napr. FA-2026-001"
              style={{ ...S.inp, borderColor: invDuplicate ? "#F59E0B" : "#D1D5DB", background: invDuplicate ? "#FFFBEB" : "#FAFBFC" }} />
            {invDuplicate && (
              <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600, marginTop: 3 }}>
                Toto cislo uz existuje ({new Date(invDuplicate.date).toLocaleDateString("cs-CZ")}, {invDuplicate.supplierName || "?"})
              </span>
            )}
          </Field>
        </div>
      </div>
      <div style={S.card}>
        <h3 style={S.cardT}>Ze sablon</h3>
        {!supId ? (
          <p style={S.empty}>Nejdrive vyberte dodavatele.</p>
        ) : !hasAnyTpl ? (
          <p style={S.empty}>Pro tohoto dodavatele ani spolecne nejsou zadne sablony.</p>
        ) : (
          <div>
            {supplierTpls.length > 0 && (
              <div style={{ marginBottom: commonTpls.length > 0 ? 16 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                  Sablony dodavatele ({supplierTpls.length})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
                  {supplierTpls.map(function(tpl) {
                    var ic = (tpl.items || []).length
                    var tw = tplWeight(tpl)
                    return (
                      <button key={tpl.id} onClick={function() { addFromTpl(tpl) }} style={{ ...S.tplBtn, borderColor: "#BBF7D0", background: "#F0FDF4" }}>
                        <span style={{ fontSize: 22 }}>{"\u{1F4E6}"}</span>
                        <span style={{ fontWeight: 700, fontSize: 12, textAlign: "center", lineHeight: 1.3 }}>{tpl.name}</span>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{ic} pol. / {fmtKg(tw)} kg</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {commonTpls.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
                  Spolecne sablony ({commonTpls.length})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
                  {commonTpls.map(function(tpl) {
                    var ic = (tpl.items || []).length
                    var tw = tplWeight(tpl)
                    return (
                      <button key={tpl.id} onClick={function() { addFromTpl(tpl) }} style={S.tplBtn}>
                        <span style={{ fontSize: 22 }}>{"\u{1F4E6}"}</span>
                        <span style={{ fontWeight: 700, fontSize: 12, textAlign: "center", lineHeight: 1.3 }}>{tpl.name}</span>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{ic} pol. / {fmtKg(tw)} kg</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={S.card}>
        <h3 style={S.cardT}>Polozky ({items.length})</h3>
        <ItemEditor items={items} setItems={setItems} addLabel="Pridat rucne" qtyMin={0} />
        {items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid #E5E7EB", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 16 }}>Celkem: <strong>{fmtKg(totalW)} kg</strong></span>
            <button onClick={save} style={S.btn1}>Ulozit prijem</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// HISTORY (vsechny prijmy napric obdobimi)
// ═══════════════════════════════════════
function HistoryView({ receipts, suppliers, onDeleteReceipt }) {
  var [expandedId, setExpandedId] = useState(null)
  var [fSupplier, setFSupplier] = useState("")
  var [fNote, setFNote] = useState("")
  var [fFrom, setFFrom] = useState("")
  var [fTo, setFTo] = useState("")
  var [sortDir, setSortDir] = useState("desc")
  var [sortBy, setSortBy] = useState("date") // date = datum prijmu, created = kdy zadano
  var [addedSince, setAddedSince] = useState("")
  var [dupOnly, setDupOnly] = useState(false)
  var [limit, setLimit] = useState(25)

  var recTotal = function(r) { return (r.items || []).reduce(function(s, i) { return s + (i.totalWeight || 0) }, 0) }
  var qOf = function(dateStr) {
    var d = new Date(dateStr)
    return "Q" + (Math.floor(d.getMonth() / 3) + 1) + "/" + d.getFullYear()
  }
  var fmtDT = function(iso) {
    if (!iso) return "-"
    var d = new Date(iso)
    return d.toLocaleDateString("cs-CZ") + " " + d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
  }

  // Detekce duplicit: stejne datum prijmu + dodavatel + celkova hmotnost (na 3 des. mista) + pocet polozek
  var dupKey = function(r) {
    return r.date + "|" + (r.supplierId || r.supplierName) + "|" + recTotal(r).toFixed(3) + "|" + (r.items || []).length
  }
  var dupCounts = {}
  ;(receipts || []).forEach(function(r) { var k = dupKey(r); dupCounts[k] = (dupCounts[k] || 0) + 1 })
  var isDup = function(r) { return dupCounts[dupKey(r)] > 1 }
  var dupTotal = (receipts || []).filter(isDup).length

  var filtered = (receipts || []).filter(function(r) {
    if (fSupplier && r.supplierId !== fSupplier) return false
    if (fNote && (r.note || "").toLowerCase().indexOf(fNote.toLowerCase()) < 0) return false
    if (fFrom && new Date(r.date) < new Date(fFrom)) return false
    if (fTo && new Date(r.date) > new Date(fTo)) return false
    if (addedSince && (!r.createdAt || new Date(r.createdAt) < new Date(addedSince))) return false
    if (dupOnly && !isDup(r)) return false
    return true
  })
  var sortVal = function(r) { return sortBy === "created" ? new Date(r.createdAt || 0) : new Date(r.date) }
  var sorted = [].concat(filtered).sort(function(a, b) {
    var diff = sortVal(a) - sortVal(b)
    return sortDir === "desc" ? -diff : diff
  })
  var shown = sorted.slice(0, limit)
  var hasFilter = fSupplier || fNote || fFrom || fTo || addedSince || dupOnly

  var sumKg = filtered.reduce(function(s, r) { return s + recTotal(r) }, 0)
  var supplierOpts = (suppliers || []).filter(function(s) {
    return (receipts || []).some(function(r) { return r.supplierId === s.id })
  })
  var lastDate = sorted.length > 0 ? [].concat(sorted).sort(function(a, b) { return new Date(b.date) - new Date(a.date) })[0].date : null

  return (
    <div>
      <h2 style={S.secTitle}>Historie prijmu</h2>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 16, marginTop: 0 }}>
        Vsechny prijmy napric obdobimi. Kliknutim na prijem zobrazite jeho detail.
      </p>

      {dupTotal > 0 && (
        <div style={{ ...S.card, background: "#FFFBEB", border: "1px solid #FDE68A", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#92400E" }}>
            Nalezeno <strong>{dupTotal} prijmu</strong>, ktere vypadaji jako duplicity (shodne datum, dodavatel, hmotnost i pocet polozek).
          </span>
          <button onClick={function() { setDupOnly(!dupOnly); setLimit(25) }}
            style={{ ...S.btn2, borderColor: "#FDE68A", background: dupOnly ? "#FDE68A" : "#FFF", color: "#92400E" }}>
            {dupOnly ? "Zobrazit vse" : "Zobrazit jen duplicity"}
          </button>
        </div>
      )}

      <div style={S.kpiRow}>
        {[
          { l: "Prijmu celkem", v: (receipts || []).length, u: "za celou historii" },
          { l: "Zobrazeno", v: filtered.length, u: hasFilter ? "po filtru" : "vsechny" },
          { l: "Hmotnost", v: fmtKg(sumKg), u: "kg ve vyberu" },
          { l: "Posledni prijem", v: lastDate ? new Date(lastDate).toLocaleDateString("cs-CZ") : "-", u: lastDate ? qOf(lastDate) : "" },
        ].map(function(k, i) {
          return (
            <div key={i} style={S.kpi}>
              <span style={S.kpiL}>{k.l}</span>
              <span style={{ ...S.kpiV, fontSize: String(k.v).length > 8 ? 18 : 26 }}>{k.v}</span>
              <span style={S.kpiU}>{k.u}</span>
            </div>
          )
        })}
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14, padding: 12, background: "#F9FAFB", borderRadius: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Dodavatel</label>
            <select value={fSupplier} onChange={function(e) { setFSupplier(e.target.value) }} style={S.inp}>
              <option value="">Vsichni</option>
              {supplierOpts.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option> })}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 130 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Cislo faktury</label>
            <input value={fNote} onChange={function(e) { setFNote(e.target.value) }} placeholder="hledat..." style={S.inp} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Od data</label>
            <input type="date" value={fFrom} onChange={function(e) { setFFrom(e.target.value) }} style={S.inp} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Do data</label>
            <input type="date" value={fTo} onChange={function(e) { setFTo(e.target.value) }} style={S.inp} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Zadano do aplikace od</label>
            <input type="date" value={addedSince} onChange={function(e) { setAddedSince(e.target.value); setLimit(25) }} style={S.inp} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase" }}>Radit dle</label>
            <select value={sortBy} onChange={function(e) { setSortBy(e.target.value) }} style={S.inp}>
              <option value="date">Data prijmu</option>
              <option value="created">Kdy zadano</option>
            </select>
          </div>
          <button onClick={function() { setSortDir(sortDir === "desc" ? "asc" : "desc") }} style={{ ...S.btn2, height: 37 }}>
            {sortDir === "desc" ? "Nejnovejsi prvni v" : "Nejstarsi prvni ^"}
          </button>
          {hasFilter && (
            <button onClick={function() { setFSupplier(""); setFNote(""); setFFrom(""); setFTo(""); setAddedSince(""); setDupOnly(false) }}
              style={{ ...S.btn2, height: 37, color: "#DC2626", borderColor: "#FECACA", background: "#FEF2F2" }}>Zrusit filtr</button>
          )}
        </div>

        {shown.length === 0 ? (
          <p style={S.empty}>{hasFilter ? "Zadny prijem neodpovida filtru." : "Zatim zadne prijmy."}</p>
        ) : shown.map(function(rec) {
          var isOpen = expandedId === rec.id
          var total = recTotal(rec)
          return (
            <div key={rec.id} style={{ marginBottom: 6 }}>
              <div onClick={function() { setExpandedId(isOpen ? null : rec.id) }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: isOpen ? "#F0FDF4" : (isDup(rec) ? "#FFFBEB" : "#FAFBFC"),
                  borderRadius: isOpen ? "8px 8px 0 0" : 8,
                  border: isOpen ? "1px solid #BBF7D0" : (isDup(rec) ? "1px solid #FDE68A" : "1px solid #F3F4F6"),
                  borderBottom: isOpen ? "none" : undefined, cursor: "pointer", fontSize: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: isOpen ? "#15803D" : "#9CA3AF", fontWeight: 700, width: 16 }}>{isOpen ? "\u25BC" : "\u25B6"}</span>
                {isDup(rec) && <span title="Mozna duplicita" style={{ fontSize: 11, color: "#92400E", background: "#FDE68A", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>dup</span>}
                <span style={{ fontSize: 13, color: "#6B7280", width: 80 }}>{new Date(rec.date).toLocaleDateString("cs-CZ")}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF", width: 52 }}>{qOf(rec.date)}</span>
                <span style={{ fontWeight: 600, flex: 1, minWidth: 110 }}>{rec.supplierName}</span>
                {rec.note && <span title="Cislo faktury" style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", padding: "2px 8px", borderRadius: 10 }}>Faktura: {rec.note}</span>}
                <span title="Kdy zadano do aplikace" style={{ fontSize: 11, color: "#9CA3AF", width: 118, textAlign: "right" }}>{fmtDT(rec.createdAt)}</span>
                <span style={{ fontSize: 13, color: "#9CA3AF", width: 52 }}>{(rec.items || []).length} pol.</span>
                <span style={{ fontWeight: 700, width: 82, textAlign: "right" }}>{fmtKg(total)} kg</span>
              </div>
              {isOpen && (
                <div style={{ border: "1px solid #BBF7D0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px", background: "#FAFFFE" }}>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: "#4B5563" }}>
                    <span>Datum prijmu: <strong>{new Date(rec.date).toLocaleDateString("cs-CZ")}</strong></span>
                    <span>Zadano do aplikace: <strong>{fmtDT(rec.createdAt)}</strong></span>
                    <span>Cislo faktury: <strong>{rec.note || "-"}</strong></span>
                  </div>
                  {(rec.items || []).length === 0 ? (
                    <p style={S.empty}>Prijem neobsahuje zadne polozky.</p>
                  ) : (
                    <table>
                      <thead><tr>
                        <th style={S.th}>Polozka</th>
                        <th style={S.th}>Material / typ</th>
                        <th style={{ ...S.th, textAlign: "right", width: 60 }}>Ks</th>
                        <th style={{ ...S.th, textAlign: "right", width: 80 }}>kg/ks</th>
                        <th style={{ ...S.th, textAlign: "right", width: 90 }}>Celkem</th>
                      </tr></thead>
                      <tbody>
                        {rec.items.map(function(it, i) {
                          var zero = !it.quantity
                          return (
                            <tr key={i} style={{ opacity: zero ? 0.5 : 1 }}>
                              <td style={S.td}>
                                <span style={{ marginRight: 6 }}>{matOf(it.material).icon}</span>{it.name}
                                {zero && <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>(nedorazilo)</span>}
                              </td>
                              <td style={{ ...S.td, fontSize: 12, color: "#6B7280" }}>
                                {matOf(it.material).label} / {ptOf(it.packType).label}
                                {it.reusable ? " / opak." : ""}{it.littering ? " / litter" : ""}
                              </td>
                              <td style={S.tdR}>{it.quantity || 0}</td>
                              <td style={S.tdR}>{it.unitWeight}</td>
                              <td style={{ ...S.tdR, fontWeight: 700 }}>{fmtKg(it.totalWeight || 0)} kg</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>
                      Upravy provedete v zalozce Prehled (v prislusnem ctvrtleti).
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>Celkem: {fmtKg(total)} kg</span>
                      <button onClick={function() { if (confirm("Opravdu smazat cely prijem?")) { onDeleteReceipt(rec.id); setExpandedId(null) } }}
                        style={{ padding: "4px 10px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Smazat prijem</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {sorted.length > shown.length && (
          <button onClick={function() { setLimit(limit + 25) }} style={{ ...S.btn2, marginTop: 10 }}>
            Zobrazit dalsich 25 (zbyva {sorted.length - shown.length})
          </button>
        )}
      </div>
    </div>
  )
}

function SuppliersView({ data, onAdd, onDel, onUpdate }) {
  var [name, setName] = useState("")
  var [country, setCountry] = useState("")
  var [sNote, setSNote] = useState("")
  var [editId, setEditId] = useState(null)
  var [eName, setEName] = useState("")
  var [eCountry, setECountry] = useState("")
  var [eNote, setENote] = useState("")
  var [eAliases, setEAliases] = useState("")
  var [eGuide, setEGuide] = useState("")

  var startEdit = function(s) {
    setEditId(s.id); setEName(s.name); setECountry(s.country || ""); setENote(s.note || "")
    setEAliases(s.aliases || ""); setEGuide(s.ai_guide || "")
  }
  var saveEdit = function() {
    if (!eName.trim()) return
    onUpdate({ id: editId, name: eName.trim(), country: eCountry, note: eNote, aliases: eAliases, ai_guide: eGuide })
    setEditId(null)
  }

  return (
    <div>
      <h2 style={S.secTitle}>Dodavatele</h2>
      <div style={S.card}>
        <h3 style={S.cardT}>Pridat</h3>
        <div style={S.grid3}>
          <Field l="Nazev *"><input value={name} onChange={function(e) { setName(e.target.value) }} placeholder="XYZ GmbH" style={S.inp} /></Field>
          <Field l="Zeme"><input value={country} onChange={function(e) { setCountry(e.target.value) }} placeholder="DE, CN..." style={S.inp} /></Field>
          <Field l="Poznamka"><input value={sNote} onChange={function(e) { setSNote(e.target.value) }} placeholder="Typ zbozi" style={S.inp} /></Field>
        </div>
        <button onClick={function() { if (!name.trim()) return; onAdd({ name: name.trim(), country: country, note: sNote }); setName(""); setCountry(""); setSNote("") }} style={S.btn1}>+ Pridat</button>
      </div>
      <div style={S.card}>
        <h3 style={S.cardT}>Seznam ({data.length})</h3>
        {data.length === 0 ? <p style={S.empty}>Zatim zadni.</p> : data.map(function(s) {
          if (editId === s.id) {
            return (
              <div key={s.id} style={{ ...S.row, background: "#EFF6FF", border: "1px solid #BFDBFE", flexWrap: "wrap", alignItems: "flex-end" }}>
                <Field l="Nazev *"><input value={eName} onChange={function(e) { setEName(e.target.value) }} style={{ ...S.inp, minWidth: 160 }} /></Field>
                <Field l="Zeme"><input value={eCountry} onChange={function(e) { setECountry(e.target.value) }} style={{ ...S.inp, width: 90 }} /></Field>
                <Field l="Poznamka"><input value={eNote} onChange={function(e) { setENote(e.target.value) }} style={{ ...S.inp, minWidth: 140 }} /></Field>
                <div style={{ flexBasis: "100%" }}>
                  <Field l="Aliasy pro AI (nazev na fakture, DIC...)">
                    <input value={eAliases} onChange={function(e) { setEAliases(e.target.value) }}
                      placeholder="napr. RDL S.A.; PL8430000202" style={S.inp} />
                  </Field>
                </div>
                <div style={{ flexBasis: "100%" }}>
                  <Field l="Navod pro AI - jak z polozek faktury urcit obaly">
                    <textarea value={eGuide} onChange={function(e) { setEGuide(e.target.value) }} rows={7}
                      placeholder={"Napr.:\n- kazda polozka RCK = 1 Prodejni RCK na kazdou MJ\n- PBF 4,8/2,4 a mensi = Pytlicek PBF 4/1 equivalent, 1 na 10 MJ\n- kazda faktura = 1 Velka krabice + 1 Paleta ne-euro"}
                      style={{ ...S.inp, fontFamily: "inherit", resize: "vertical" }} />
                  </Field>
                </div>
                <button onClick={saveEdit} style={{ ...S.btn1, padding: "8px 14px" }}>Ulozit</button>
                <button onClick={function() { setEditId(null) }} style={S.btn2}>Zrusit</button>
              </div>
            )
          }
          return (
          <div key={s.id} style={S.row}>
            <span style={{ fontWeight: 600, flex: 1 }}>{s.name}</span>
            <span style={{ color: "#6B7280", fontSize: 13, width: 50 }}>{s.country}</span>
            <span style={{ color: "#9CA3AF", fontSize: 13, flex: 1 }}>{s.note}</span>
            <span title={s.ai_guide ? "Navod pro AI je vyplnen" : "Navod pro AI chybi"}
              style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                background: s.ai_guide ? "#ECFDF5" : "#FEF3C7", color: s.ai_guide ? "#047857" : "#92400E" }}>
              {s.ai_guide ? "AI navod" : "bez navodu"}</span>
            <button onClick={function() { startEdit(s) }}
              style={{ padding: "4px 12px", background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Upravit</button>
            <button onClick={function() { if (confirm("Smazat dodavatele?")) onDel(s.id) }} style={S.delBtn}>x</button>
          </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════
function TemplatesView({ data, suppliers, onAdd, onDel, onUpdate }) {
  var [name, setName] = useState("")
  var [supId, setSupId] = useState("__global__")
  var [tplItems, setTplItems] = useState([])
  var [editingId, setEditingId] = useState(null)

  var duplicateTemplate = function(tpl) {
    onAdd({
      name: (tpl.name || "Sablona") + " (kopie)",
      supplierId: tpl.supplier_id || tpl.supplierId || "__global__",
      items: (tpl.items || []).map(function(it) {
        return { name: it.name, material: it.material, packType: it.packType,
          unitWeight: it.unitWeight, quantity: it.quantity, reusable: it.reusable, littering: it.littering,
          formMaterial: it.formMaterial || "", rigidity: it.rigidity || null,
          litteringCategory: it.litteringCategory || null, plasticShare: it.plasticShare || null }
      }),
    })
  }

  return (
    <div>
      <h2 style={S.secTitle}>Sablony obalu</h2>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 16, marginTop: 0 }}>
        Kazda sablona = vice polozek. Pri prijmu jednim klikem vlozite celou zasilku.</p>
      <div style={S.card}>
        <h3 style={S.cardT}>Nova sablona</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Field l="Nazev *"><input value={name} onChange={function(e) { setName(e.target.value) }} placeholder="Typicka zasilka od XYZ" style={S.inp} /></Field>
          <Field l="Dodavatel"><select value={supId} onChange={function(e) { setSupId(e.target.value) }} style={S.inp}>
            <option value="__global__">Spolecna (vsichni)</option>
            {suppliers.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option> })}</select></Field>
        </div>
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#166534" }}>Polozky ({tplItems.length})</h4>
          <ItemEditor items={tplItems} setItems={setTplItems} addLabel="Pridat obal do sablony" />
        </div>
        <button onClick={function() {
          if (!name.trim() || tplItems.length === 0) return
          onAdd({ name: name.trim(), supplierId: supId, items: tplItems.map(function(it) {
            return { name: it.name, material: it.material, packType: it.packType, unitWeight: it.unitWeight, quantity: it.quantity, reusable: it.reusable, littering: it.littering, formMaterial: it.formMaterial || "", rigidity: it.rigidity || null, litteringCategory: it.litteringCategory || null, plasticShare: it.plasticShare || null }
          }) })
          setName(""); setTplItems([]); setSupId("__global__")
        }} disabled={!name.trim() || tplItems.length === 0}
          style={{ ...S.btn1, opacity: (!name.trim() || tplItems.length === 0) ? 0.5 : 1 }}>
          Ulozit sablonu ({tplItems.length} pol.)</button>
      </div>
      <div style={S.card}>
        <h3 style={S.cardT}>Existujici ({data.length})</h3>
        {data.length === 0 ? <p style={S.empty}>Zatim zadne.</p> : data.map(function(tpl) {
          if (editingId === tpl.id) {
            return <TemplateEditor key={tpl.id} tpl={tpl} suppliers={suppliers}
              onSave={function(updated) { onUpdate(updated); setEditingId(null) }}
              onCancel={function() { setEditingId(null) }} />
          }
          var sup = suppliers.find(function(s) { return s.id === (tpl.supplier_id || tpl.supplierId) })
          var ti = tpl.items || []; var tw = ti.reduce(function(s, i) { return s + i.unitWeight * (i.quantity || 1) }, 0)
          return (
            <div key={tpl.id} style={{ ...S.card, marginBottom: 8, padding: "12px 14px", background: "#FAFBFC" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{tpl.name}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{sup ? sup.name : "Spolecna"} | {ti.length} pol. | {fmtKg(tw)} kg</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={function() { setEditingId(tpl.id) }}
                    style={{ padding: "4px 12px", background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Upravit</button>
                  <button onClick={function() { duplicateTemplate(tpl) }}
                    style={{ padding: "4px 12px", background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Kopirovat</button>
                  <button onClick={function() { if (confirm("Smazat sablonu?")) onDel(tpl.id) }} style={S.delBtn}>x</button>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ti.map(function(it, idx) { return (
                  <div key={idx} style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{matOf(it.material).icon}</span><span style={{ fontWeight: 600 }}>{it.name}</span>
                    <span style={{ color: "#9CA3AF" }}>{it.quantity || 1}x {it.unitWeight}kg</span>
                  </div>
                ) })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// TEMPLATE EDITOR (inline edit existing template)
// ═══════════════════════════════════════
function TemplateEditor({ tpl, suppliers, onSave, onCancel }) {
  var [name, setName] = useState(tpl.name)
  var [supId, setSupId] = useState(tpl.supplier_id || tpl.supplierId || "__global__")
  // Add local ids so ItemEditor can track items
  var [items, setItems] = useState(function() {
    return (tpl.items || []).map(function(it) {
      return { id: uid(), name: it.name, material: it.material, packType: it.packType,
        unitWeight: it.unitWeight, quantity: it.quantity || 1,
        totalWeight: Math.round(it.unitWeight * (it.quantity || 1) * 1000) / 1000,
        reusable: !!it.reusable, littering: !!it.littering,
        formMaterial: it.formMaterial || "", rigidity: it.rigidity || null,
        litteringCategory: it.litteringCategory || null, plasticShare: it.plasticShare || null }
    })
  })

  return (
    <div style={{ ...S.card, marginBottom: 8, padding: "14px 16px", background: "#FFF", border: "2px solid #2563EB" }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#2563EB" }}>Uprava sablony</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <Field l="Nazev *"><input value={name} onChange={function(e) { setName(e.target.value) }} style={S.inp} /></Field>
        <Field l="Dodavatel"><select value={supId} onChange={function(e) { setSupId(e.target.value) }} style={S.inp}>
          <option value="__global__">Spolecna (vsichni)</option>
          {suppliers.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option> })}</select></Field>
      </div>
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#166534" }}>Polozky ({items.length})</h4>
        <ItemEditor items={items} setItems={setItems} addLabel="Pridat obal do sablony" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={function() {
          if (!name.trim() || items.length === 0) return
          onSave({ id: tpl.id, name: name.trim(), supplierId: supId, items: items.map(function(it) {
            return { name: it.name, material: it.material, packType: it.packType, unitWeight: it.unitWeight, quantity: it.quantity, reusable: it.reusable, littering: it.littering, formMaterial: it.formMaterial || "", rigidity: it.rigidity || null, litteringCategory: it.litteringCategory || null, plasticShare: it.plasticShare || null }
          }) })
        }} disabled={!name.trim() || items.length === 0}
          style={{ ...S.btn1, opacity: (!name.trim() || items.length === 0) ? 0.5 : 1 }}>Ulozit zmeny</button>
        <button onClick={onCancel} style={S.btn2}>Zrusit</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// REPORT
// ═══════════════════════════════════════
function ReportView({ agg, f, selYear, selQ, qSelect, onUpdateReceipt }) {
  var [expandedCell, setExpandedCell] = useState(null)
  var [bulkTarget, setBulkTarget] = useState("")
  var [bulkReuse, setBulkReuse] = useState("")
  var [bulkRigidity, setBulkRigidity] = useState("")
  var [bulkFormMat, setBulkFormMat] = useState("")
  var fmLabel = function(id) { var x = fmOf(id); return x ? x.label : id }
  var guide = buildGuide(f, fmLabel, ptOf)
  var sheetNames = Object.keys(guide.sheets)

  var fmtT = function(t) {
    if (!t) return "0"
    return t.toFixed(3)
  }

  // Zmeni typ obalu u jedne polozky
  // Zmeni libovolna pole u jedne polozky
  var changeItemFields = function(receiptId, itemId, patch) {
    var rec = f.find(function(r) { return r.id === receiptId })
    if (!rec) return
    onUpdateReceipt({
      id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName, note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt,
      items: rec.items.map(function(it) {
        return it.id === itemId ? { ...it, ...patch } : it
      }),
    })
  }

  // Hromadna zmena libovolnych poli u vsech polozek v jedne bunce vykazu
  var bulkChangeFields = function(items, patch) {
    // Seskupit podle prijmu, aby se kazdy prijem updatoval jednou
    var byReceipt = {}
    items.forEach(function(si) {
      if (!byReceipt[si.receiptId]) byReceipt[si.receiptId] = []
      byReceipt[si.receiptId].push(si.itemId)
    })
    Object.keys(byReceipt).forEach(function(rid) {
      var rec = f.find(function(r) { return r.id === rid })
      if (!rec) return
      var ids = byReceipt[rid]
      onUpdateReceipt({
        id: rec.id, date: rec.date, supplierId: rec.supplierId, supplierName: rec.supplierName, note: rec.note, docNumber: rec.docNumber, docDate: rec.docDate, createdAt: rec.createdAt,
        items: rec.items.map(function(it) {
          return ids.indexOf(it.id) >= 0 ? { ...it, ...patch } : it
        }),
      })
    })
    setBulkTarget("")
    setBulkReuse("")
    setBulkRigidity("")
    setBulkFormMat("")
  }

  var copyText = function() {
    var lines = ["EKO-KOM vykaz - navod k opisu, " + QUARTERS[selQ] + " " + selYear, ""]
    sheetNames.forEach(function(sn) {
      lines.push("=== LIST " + sn + " ===")
      guide.sheets[sn].forEach(function(row) {
        lines.push("  Bunka " + row.cell + " (" + row.rowLabel + " / " + row.colDesc + "): " + fmtT(row.tonnage) + " t")
      })
      lines.push("")
    })
    if (guide.littering.length > 0) {
      lines.push("=== LIST L (littering) ===")
      guide.littering.forEach(function(r) {
        lines.push("  Bunka " + r.cell + " (" + r.label + "): " + fmtT(r.tonnage) + " t")
      })
    }
    navigator.clipboard.writeText(lines.join("\n"))
  }

  return (
    <div>
      <div style={S.secHead}><h2 style={S.secTitle}>Navod k opisu do vykazu</h2>{qSelect}</div>

      <div style={{ ...S.card, background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#065F46", lineHeight: 1.6 }}>
          Nize jsou hodnoty pripravene k rucnimu opsani do oficialniho formulare "Vykaz o produkci obalu".
          U kazde hodnoty je uveden <strong>list, presna bunka</strong> a slovni popis kam patri.
          Hodnoty jsou v <strong>tunach</strong>. Predpoklad: vse zpoplatnene, primarni surovina, importovane do CR.
        </p>
      </div>

      {guide.missing.length > 0 && (
        <div style={{ ...S.card, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <h3 style={{ ...S.cardT, color: "#DC2626" }}>Pozor: {guide.missing.length} polozek bez klasifikace</h3>
          <p style={{ fontSize: 13, color: "#991B1B", margin: "0 0 8px" }}>
            Tyto polozky nemaji vyplneny "Material dle vykazu" a nejsou zahrnuty. Doplnte klasifikaci v prijmech/sablonach.
          </p>
          <div style={{ fontSize: 12, color: "#7F1D1D" }}>
            {guide.missing.slice(0, 10).map(function(m, i) {
              return <div key={i}>- {m.name} ({fmtKg(m.kg)} kg)</div>
            })}
            {guide.missing.length > 10 && <div>... a dalsich {guide.missing.length - 10}</div>}
          </div>
        </div>
      )}

      {sheetNames.length === 0 && guide.littering.length === 0 ? (
        <div style={S.card}><p style={S.empty}>Zadna data k vykazu za toto ctvrtleti.</p></div>
      ) : (
        <div>
          {sheetNames.map(function(sn) {
            return (
              <div key={sn} style={S.card}>
                <h3 style={{ ...S.cardT, color: "#15803D" }}>{SHEET_TITLES[sn] || sn}</h3>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "-6px 0 10px" }}>Kliknutim na radek zobrazite polozky, ze kterych se hodnota sklada.</p>
                <table>
                  <thead><tr>
                    <th style={{ ...S.th, width: 26 }}></th>
                    <th style={{ ...S.th, width: 70 }}>Bunka</th>
                    <th style={S.th}>Radek (material)</th>
                    <th style={S.th}>Sloupec</th>
                    <th style={{ ...S.th, textAlign: "right", width: 90 }}>Hodnota (t)</th>
                  </tr></thead>
                  <tbody>
                    {guide.sheets[sn].map(function(row, i) {
                      var cellKey = sn + "!" + row.cell
                      var isOpen = expandedCell === cellKey
                      return (
                        <Fragment key={i}>
                        <tr onClick={function() { setExpandedCell(isOpen ? null : cellKey); setBulkTarget(""); setBulkReuse(""); setBulkRigidity(""); setBulkFormMat("") }}
                          style={{ cursor: "pointer", background: isOpen ? "#F0FDF4" : "transparent" }}>
                          <td style={{ ...S.td, color: isOpen ? "#15803D" : "#9CA3AF", fontWeight: 700, fontSize: 11 }}>{isOpen ? "\u25BC" : "\u25B6"}</td>
                          <td style={{ ...S.td, fontWeight: 800, color: "#2563EB", fontFamily: "monospace" }}>{row.cell}</td>
                          <td style={S.td}>{row.rowLabel}</td>
                          <td style={{ ...S.td, fontSize: 12, color: row.colDesc.indexOf("!NEURCENO") >= 0 ? "#B45309" : "#6B7280",
                            fontWeight: row.colDesc.indexOf("!NEURCENO") >= 0 ? 600 : 400 }}>{row.colDesc}</td>
                          <td style={{ ...S.tdR, fontWeight: 700 }}>{fmtT(row.tonnage)}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={5} style={{ padding: "10px 12px", background: "#FAFFFE", borderBottom: "1px solid #E5E7EB" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>
                                  Polozky ({row.items.length}) - celkem {fmtKg(row.kg)} kg
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#6B7280" }}>Hromadne: typ obalu na</span>
                                    <select value={bulkTarget} onChange={function(e) { setBulkTarget(e.target.value) }}
                                      style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: "auto" }}>
                                      <option value="">-- vyberte --</option>
                                      {PACK_TYPES.map(function(p) { return <option key={p.id} value={p.id}>{p.label}</option> })}
                                    </select>
                                    <button onClick={function() {
                                      if (!bulkTarget) return
                                      if (confirm("Zmenit typ obalu u vsech " + row.items.length + " polozek v teto bunce?")) bulkChangeFields(row.items, { packType: bulkTarget })
                                    }} disabled={!bulkTarget}
                                      style={{ ...S.btn2, padding: "4px 10px", fontSize: 12, opacity: bulkTarget ? 1 : 0.5 }}>Pouzit</button>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#6B7280" }}>Hromadne: pouziti na</span>
                                    <select value={bulkReuse} onChange={function(e) { setBulkReuse(e.target.value) }}
                                      style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: "auto" }}>
                                      <option value="">-- vyberte --</option>
                                      <option value="single">Jednorazove (listy J)</option>
                                      <option value="reuse">Opakovane pouzitelne (listy O)</option>
                                    </select>
                                    <button onClick={function() {
                                      if (!bulkReuse) return
                                      if (confirm("Zmenit pouziti u vsech " + row.items.length + " polozek v teto bunce?")) bulkChangeFields(row.items, { reusable: bulkReuse === "reuse" })
                                    }} disabled={!bulkReuse}
                                      style={{ ...S.btn2, padding: "4px 10px", fontSize: 12, opacity: bulkReuse ? 1 : 0.5 }}>Pouzit</button>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#6B7280" }}>Hromadne: tvrdost na</span>
                                    <select value={bulkRigidity} onChange={function(e) { setBulkRigidity(e.target.value) }}
                                      style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: "auto" }}>
                                      <option value="">-- vyberte --</option>
                                      {RIGIDITY.map(function(r) { return <option key={r.id} value={r.id}>{r.label}</option> })}
                                    </select>
                                    <button onClick={function() {
                                      if (!bulkRigidity) return
                                      if (confirm("Zmenit tvrdost u vsech " + row.items.length + " polozek v teto bunce?")) bulkChangeFields(row.items, { rigidity: bulkRigidity })
                                    }} disabled={!bulkRigidity}
                                      style={{ ...S.btn2, padding: "4px 10px", fontSize: 12, opacity: bulkRigidity ? 1 : 0.5 }}>Pouzit</button>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#6B7280" }}>Hromadne: material dle vykazu na</span>
                                    <select value={bulkFormMat} onChange={function(e) { setBulkFormMat(e.target.value) }}
                                      style={{ ...S.inp, fontSize: 12, padding: "4px 6px", width: "auto", maxWidth: 190 }}>
                                      <option value="">-- vyberte --</option>
                                      {FORM_MATERIALS.filter(function(fm) { return fm.id }).map(function(fm) {
                                        return <option key={fm.id} value={fm.id}>{fm.label}</option>
                                      })}
                                    </select>
                                    <button onClick={function() {
                                      if (!bulkFormMat) return
                                      if (confirm("Zmenit material dle vykazu u vsech " + row.items.length + " polozek v teto bunce?")) bulkChangeFields(row.items, { formMaterial: bulkFormMat })
                                    }} disabled={!bulkFormMat}
                                      style={{ ...S.btn2, padding: "4px 10px", fontSize: 12, opacity: bulkFormMat ? 1 : 0.5 }}>Pouzit</button>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {row.items.map(function(si, j) {
                                  return (
                                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                                      background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, flexWrap: "wrap" }}>
                                      <span style={{ color: "#6B7280", width: 72 }}>{new Date(si.date).toLocaleDateString("cs-CZ")}</span>
                                      <span style={{ color: "#9CA3AF", width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{si.supplierName}</span>
                                      <span style={{ flex: 1, fontWeight: 600, minWidth: 100 }}>{si.name}</span>
                                      <select value={si.packType} onChange={function(e) { changeItemFields(si.receiptId, si.itemId, { packType: e.target.value }) }}
                                        title="Typ obalu"
                                        style={{ ...S.inp, fontSize: 11, padding: "3px 5px", width: "auto" }}>
                                        {PACK_TYPES.map(function(p) { return <option key={p.id} value={p.id}>{p.label}</option> })}
                                      </select>
                                      <select value={si.reusable ? "reuse" : "single"}
                                        onChange={function(e) { changeItemFields(si.receiptId, si.itemId, { reusable: e.target.value === "reuse" }) }}
                                        title="Jednorazove / opakovane pouzitelne"
                                        style={{ ...S.inp, fontSize: 11, padding: "3px 5px", width: "auto",
                                          background: si.reusable ? "#F0FDF4" : "#FAFBFC", color: si.reusable ? "#15803D" : "#1F2937" }}>
                                        <option value="single">Jednorazove</option>
                                        <option value="reuse">Opakovane</option>
                                      </select>
                                      <select value={si.formMaterial || ""}
                                        onChange={function(e) { changeItemFields(si.receiptId, si.itemId, { formMaterial: e.target.value }) }}
                                        title="Material dle vykazu"
                                        style={{ ...S.inp, fontSize: 11, padding: "3px 5px", width: "auto", maxWidth: 150 }}>
                                        {FORM_MATERIALS.map(function(fm) { return <option key={fm.id} value={fm.id}>{fm.label}</option> })}
                                      </select>
                                      {si.material === "plastic" && (
                                        <select value={si.rigidity || ""}
                                          onChange={function(e) { changeItemFields(si.receiptId, si.itemId, { rigidity: e.target.value }) }}
                                          title="Tvrdost obalu"
                                          style={{ ...S.inp, fontSize: 11, padding: "3px 5px", width: "auto", maxWidth: 140,
                                            background: si.rigidity ? "#FAFBFC" : "#FEF3C7",
                                            borderColor: si.rigidity ? "#D1D5DB" : "#FDE68A" }}>
                                          <option value="">! neurceno</option>
                                          {RIGIDITY.map(function(r) { return <option key={r.id} value={r.id}>{r.label}</option> })}
                                        </select>
                                      )}
                                      <span style={{ color: "#9CA3AF", width: 50, textAlign: "right" }}>{si.qty} ks</span>
                                      <span style={{ fontWeight: 700, width: 80, textAlign: "right" }}>{fmtKg(si.kg)} kg</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}

          {guide.littering.length > 0 && (
            <div style={{ ...S.card, border: "1px solid #FDE68A", background: "#FFFBEB" }}>
              <h3 style={{ ...S.cardT, color: "#92400E" }}>{SHEET_TITLES["L"]}</h3>
              <table>
                <thead><tr>
                  <th style={{ ...S.th, width: 70 }}>Bunka</th>
                  <th style={S.th}>Kategorie</th>
                  <th style={{ ...S.th, textAlign: "right", width: 90 }}>Hodnota (t)</th>
                </tr></thead>
                <tbody>
                  {guide.littering.map(function(r, i) {
                    return (
                      <tr key={i}>
                        <td style={{ ...S.td, fontWeight: 800, color: "#92400E", fontFamily: "monospace" }}>{r.cell}</td>
                        <td style={S.td}>{r.label}</td>
                        <td style={{ ...S.tdR, fontWeight: 700 }}>{fmtT(r.tonnage)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "#92400E", margin: "10px 0 0" }}>
                Pozn.: Littering se vykazuje NAVIC vedle bezne struktury (list L, sloupec F = celkova hmotnost).
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ ...S.card, background: "#F0FDF4" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, color: "#166534" }}>Celkem za {QUARTERS[selQ]} {selYear}</p>
            <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800, color: "#15803D" }}>{fmtKg(agg.total)} kg = {fmtT(agg.total / 1000)} t</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280" }}>{f.length} prijmu</p>
          </div>
          <button onClick={copyText} style={S.btn1}>Kopirovat navod jako text</button>
        </div>
      </div>

      <div style={{ ...S.card, background: "#F9FAFB" }}>
        <h3 style={S.cardT}>Jak postupovat</h3>
        <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.7, margin: 0 }}>
          Otevrete oficialni formular EKO-KOM. Podle tabulek vyse opiste kazdou hodnotu do uvedene bunky na danem listu.
          Formular si soucty a odhad fakturace spocita sam. Nezapomente na hlavicku (ICO, EKOKOM-ID, ctvrtleti) na listu Uvod.
          Hotovy vykaz posilejte na vykazy@ekokom.cz.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// FIELD + STYLES
// ═══════════════════════════════════════
function Field({ l, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.4px" }}>{l}</label>
      {children}
    </div>
  )
}

// Pocitadlo mnozstvi s rychlymi tlacitky +1/+10/+20/+100 a vetsim polem
function QtyStepper({ value, onChange, minVal }) {
  var lo = (minVal == null) ? 1 : minVal
  var steps = [1, 5, 10, 20, 100]
  var isZero = value === 0
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
      <button onClick={function() { onChange(Math.max(lo, value - 1)) }} style={S.qBtnLg}>-</button>
      <input type="number" value={value} min={lo}
        onChange={function(e) { var n = parseInt(e.target.value); onChange(isNaN(n) ? lo : Math.max(lo, n)) }}
        style={{ ...S.qInpLg, ...(isZero ? { color: "#9CA3AF", background: "#F9FAFB" } : {}) }} />
      {steps.map(function(s) {
        return (
          <button key={s} onClick={function() { onChange(value + s) }} style={S.qStep}>+{s}</button>
        )
      })}
    </div>
  )
}

var S = {
  header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 0, zIndex: 50 },
  headerIn: { maxWidth: 960, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  logoBox: { fontSize: 24, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: "#ECFDF5", borderRadius: 10 },
  navBtn: { display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", background: "none", border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#6B7280", cursor: "pointer" },
  navAct: { background: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D", fontWeight: 700 },
  main: { maxWidth: 960, margin: "0 auto", padding: "20px 16px" },
  secHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 },
  secTitle: { fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 },
  card: { background: "#FFF", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,.05)", marginBottom: 14, border: "1px solid #F3F4F6" },
  cardT: { fontSize: 14, fontWeight: 700, color: "#374151", margin: "0 0 12px" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 18 },
  kpi: { background: "#FFF", borderRadius: 12, padding: 14, border: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: 1 },
  kpiL: { fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" },
  kpiV: { fontSize: 26, fontWeight: 800, color: "#111827" },
  kpiU: { fontSize: 11, color: "#6B7280" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 10 },
  inp: { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, color: "#1F2937", background: "#FAFBFC", width: "100%", boxSizing: "border-box" },
  sel: { padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, background: "#FFF", cursor: "pointer" },
  btn1: { padding: "9px 18px", background: "#16A34A", color: "#FFF", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  btn2: { padding: "7px 14px", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tplBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 10px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, cursor: "pointer", minWidth: 0 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", background: "#FAFBFC", borderRadius: 8, marginBottom: 4, fontSize: 14, flexWrap: "wrap" },
  qBtn: { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "#E5E7EB", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15, fontWeight: 700 },
  qInp: { width: 48, textAlign: "center", padding: "4px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14 },
  qBtnLg: { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#E5E7EB", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 18, fontWeight: 700 },
  qInpLg: { width: 72, height: 34, textAlign: "center", padding: "4px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 17, fontWeight: 700, boxSizing: "border-box" },
  qStep: { height: 34, padding: "0 10px", background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  delBtn: { background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 4 },
  chk: { display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" },
  empty: { color: "#9CA3AF", fontSize: 14, fontStyle: "italic", margin: "6px 0" },
  th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", borderBottom: "2px solid #E5E7EB", background: "#F9FAFB" },
  td: { padding: "8px 10px", borderBottom: "1px solid #F3F4F6" },
  tdR: { padding: "8px 10px", borderBottom: "1px solid #F3F4F6", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#15803D", color: "#FFF", padding: "9px 22px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,.15)", zIndex: 999, animation: "ek-fade .25s ease" },
}

export { S, Field, ItemEditor, fmtKg, matOf }
