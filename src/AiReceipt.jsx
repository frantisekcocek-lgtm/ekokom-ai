// ═══════════════════════════════════════
// AI PRIJEM - vycteni faktur (PDF / screenshot) a navrh prijmu
// Jednotlive i hromadne; navrh ke kontrole nebo ulozit rovnou.
// ═══════════════════════════════════════
import { useState, useEffect, useRef } from "react"
import { extractInvoice } from "./supabase.js"

// Normalizace cisla faktury pro kontrolu duplicit:
// "32600328" se shoduje s "32600328" i "32600328-32"
function invKey(s) { return String(s || "").trim().toLowerCase() }
export function sameInvoice(a, b) {
  var x = invKey(a), y = invKey(b)
  if (!x || !y) return false
  return x === y || x.indexOf(y + "-") === 0 || y.indexOf(x + "-") === 0
}

// Soubor -> { base64, mediaType }. Obrazky se zmensi (max 2400 px), PDF jde beze zmeny.
function fileToPayload(file) {
  return new Promise(function(resolve, reject) {
    if (file.type === "application/pdf") {
      if (file.size > 25 * 1024 * 1024) { reject(new Error("PDF je vetsi nez 25 MB")); return }
      var r = new FileReader()
      r.onload = function() { resolve({ base64: String(r.result).split(",")[1], mediaType: "application/pdf" }) }
      r.onerror = function() { reject(new Error("Soubor nelze precist")) }
      r.readAsDataURL(file)
      return
    }
    if (!/^image\//.test(file.type)) { reject(new Error("Podporovane jsou PDF a obrazky")); return }
    var img = new Image()
    var url = URL.createObjectURL(file)
    img.onload = function() {
      var max = 2400
      var scale = Math.min(1, max / Math.max(img.width, img.height))
      var c = document.createElement("canvas")
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      // Screenshoty jsou ostrejsi v PNG; kdyby byl moc velky, prepnout na JPEG
      var data = c.toDataURL("image/png")
      var mt = "image/png"
      if (data.length > 4.5 * 1024 * 1024) { data = c.toDataURL("image/jpeg", 0.92); mt = "image/jpeg" }
      resolve({ base64: data.split(",")[1], mediaType: mt })
    }
    img.onerror = function() { URL.revokeObjectURL(url); reject(new Error("Obrazek nelze nacist")) }
    img.src = url
  })
}

var rid = function() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

export default function AiReceiptView({ suppliers, templates, allReceipts, onSave, S, Field, ItemEditor, fmtKg, matOf }) {
  var [queue, setQueue] = useState([])
  var [autoSave, setAutoSave] = useState(false)
  var [dragOver, setDragOver] = useState(false)
  var [openKey, setOpenKey] = useState(null)
  var running = useRef(0)
  var started = useRef({})
  var inputRef = useRef(null)
  var queueRef = useRef(queue)
  queueRef.current = queue

  var patch = function(key, p) {
    setQueue(function(q) { return q.map(function(e) { return e.key === key ? { ...e, ...(typeof p === "function" ? p(e) : p) } : e }) })
  }
  var patchDraft = function(key, p) {
    patch(key, function(e) { return { draft: { ...e.draft, ...(typeof p === "function" ? p(e.draft) : p) } } })
  }

  var addFiles = function(files) {
    var list = Array.prototype.slice.call(files || []).filter(function(f) {
      return f.type === "application/pdf" || /^image\//.test(f.type)
    })
    if (!list.length) return
    setQueue(function(q) {
      return q.concat(list.map(function(f) {
        return { key: rid(), file: f, name: f.name || ("screenshot-" + new Date().toLocaleTimeString("cs-CZ") + ".png"), status: "waiting" }
      }))
    })
  }

  // Vlozeni screenshotu ze schranky (Ctrl+V)
  useEffect(function() {
    var onPaste = function(ev) {
      var items = (ev.clipboardData && ev.clipboardData.files) || []
      if (items.length) { addFiles(items); ev.preventDefault() }
    }
    window.addEventListener("paste", onPaste)
    return function() { window.removeEventListener("paste", onPaste) }
  }, [])

  // Kontrola duplicity cisla faktury proti databazi i ostatnim polozkam fronty
  var findDuplicate = function(key, number) {
    if (!number) return null
    var inDb = (allReceipts || []).find(function(r) { return sameInvoice(r.note, number) })
    if (inDb) return "uz je v prijmech (" + new Date(inDb.date).toLocaleDateString("cs-CZ") + ", " + (inDb.supplierName || "") + ")"
    var inQ = queueRef.current.find(function(e) {
      return e.key !== key && e.draft && e.status !== "error" && sameInvoice(e.draft.invoice_number, number)
    })
    if (inQ) return "je i v jinem nahranem souboru (" + inQ.name + ")"
    return null
  }

  // Duvody, proc navrh nelze ulozit (nebo ulozit automaticky)
  var blockers = function(e) {
    var d = e.draft, out = []
    if (!d) return ["neni vycteno"]
    if (!d.supplier_id) out.push("neprirazeny dodavatel")
    if (!d.invoice_number) out.push("chybi cislo faktury")
    if (!d.invoice_date) out.push("chybi datum")
    if (!(d.items || []).some(function(i) { return i.quantity > 0 })) out.push("zadne obaly s poctem > 0")
    var dup = findDuplicate(e.key, d.invoice_number)
    if (dup) out.push("faktura " + dup)
    return out
  }

  var saveEntry = async function(e, force) {
    var d = e.draft
    var b = blockers(e)
    var hard = b.filter(function(x) { return x.indexOf("faktura ") !== 0 })
    if (hard.length) { alert("Nelze ulozit: " + hard.join(", ")); return false }
    if (b.length && !force) {
      if (!confirm("Pozor: " + b.join(", ") + ".\n\nPresto ulozit?")) return false
    }
    var sup = suppliers.find(function(s) { return s.id === d.supplier_id })
    patch(e.key, { status: "saving" })
    var ok = await onSave({
      date: d.invoice_date,
      supplierId: d.supplier_id,
      supplierName: sup ? sup.name : d.supplier_name,
      note: d.invoice_number,
      items: (d.items || []).map(function(i) { var c = { ...i }; delete c.aiReason; return c }),
      invoiceLines: d.lines || [],
      sourceFile: e.name,
      aiMeta: { notes: d.notes || "", invoiceNumberSource: d.invoice_number_source || "", supplierOnInvoice: d.supplier_name_on_invoice || "", auto: !!force },
    })
    patch(e.key, { status: ok ? "saved" : "done", error: ok ? null : "Ulozeni selhalo" })
    return !!ok
  }

  // Zpracovani fronty - max 2 soubory soubezne
  useEffect(function() {
    var waiting = queue.filter(function(e) { return e.status === "waiting" && !started.current[e.key + (e.retry || 0)] })
    waiting.slice(0, Math.max(0, 2 - running.current)).forEach(function(e) {
      started.current[e.key + (e.retry || 0)] = true
      running.current++
      patch(e.key, { status: "reading" })
      fileToPayload(e.file)
        .then(function(p) { return extractInvoice(p.base64, p.mediaType, e.name) })
        .then(function(res) {
          running.current--
          if (!res || res.error) { patch(e.key, { status: "error", error: (res && res.error) || "Neznama chyba" }); return }
          var entry = { ...e, status: "done", draft: res, error: null }
          patch(e.key, { status: "done", draft: res, error: null })
          if (autoSave && blockers(entry).length === 0) saveEntry(entry, true)
        })
        .catch(function(err) { running.current--; patch(e.key, { status: "error", error: err.message }) })
    })
  }, [queue, autoSave])

  var addTemplate = function(key, tplId) {
    var t = templates.find(function(x) { return x.id === tplId })
    if (!t) return
    patchDraft(key, function(d) {
      return { items: (d.items || []).concat((t.items || []).map(function(it) {
        return { ...it, id: rid(), quantity: 0, totalWeight: 0, fromTemplate: t.id }
      })) }
    })
  }

  var counts = { waiting: 0, reading: 0, done: 0, saved: 0, error: 0 }
  queue.forEach(function(e) { counts[e.status === "saving" ? "done" : e.status] = (counts[e.status] || 0) + 1 })
  var reviewable = queue.filter(function(e) { return e.status === "done" && e.draft })

  var statusBadge = function(e) {
    var map = {
      waiting: ["#F3F4F6", "#6B7280", "ceka"], reading: ["#EFF6FF", "#2563EB", "AI cte..."],
      saving: ["#EFF6FF", "#2563EB", "ukladam..."], saved: ["#ECFDF5", "#047857", "ulozeno"],
      error: ["#FEF2F2", "#DC2626", "chyba"],
    }
    var m = map[e.status]
    if (!m) {
      var b = blockers(e)
      m = b.length ? ["#FEF3C7", "#92400E", "ke kontrole"] : ["#ECFDF5", "#047857", "pripraveno"]
    }
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: m[0], color: m[1], whiteSpace: "nowrap" }}>{m[2]}</span>
  }

  return (
    <div>
      <h2 style={S.secTitle}>AI prijem z faktur</h2>
      <p style={{ color: "#6B7280", fontSize: 14, margin: "4px 0 16px" }}>
        Nahrajte PDF nebo screenshoty faktur (i vic najednou), nebo vlozte screenshot pres Ctrl+V. AI precte doklad a navrhne obaly podle sablon a navodu dodavatele.
      </p>

      <div onDragOver={function(ev) { ev.preventDefault(); setDragOver(true) }}
        onDragLeave={function() { setDragOver(false) }}
        onDrop={function(ev) { ev.preventDefault(); setDragOver(false); addFiles(ev.dataTransfer.files) }}
        onClick={function() { inputRef.current && inputRef.current.click() }}
        style={{ ...S.card, textAlign: "center", padding: "34px 16px", cursor: "pointer",
          border: "2px dashed " + (dragOver ? "#16A34A" : "#D1D5DB"), background: dragOver ? "#F0FDF4" : "#FFF" }}>
        <div style={{ fontSize: 30 }}>{"\u{1F4C4}"}</div>
        <div style={{ fontWeight: 700, marginTop: 6 }}>Pretahnete sem soubory nebo kliknete</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>PDF, PNG, JPG - jednotlive i hromadne - nebo Ctrl+V se screenshotem</div>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" style={{ display: "none" }}
          onChange={function(ev) { addFiles(ev.target.files); ev.target.value = "" }} />
      </div>

      <div style={{ ...S.card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <label style={{ ...S.chk, fontSize: 13 }}>
          <input type="checkbox" checked={autoSave} onChange={function(e) { setAutoSave(e.target.checked) }} />
          <span><strong>Ulozit rovnou</strong> - jen kdyz je vse v poradku (dodavatel, cislo, datum, obaly, bez duplicity). Ostatni zustanou ke kontrole.</span>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            {queue.length} souboru: {counts.reading || 0} se cte, {reviewable.length} ke kontrole, {counts.saved || 0} ulozeno{counts.error ? ", " + counts.error + " chyb" : ""}
          </span>
          {reviewable.filter(function(e) { return blockers(e).length === 0 }).length > 1 && (
            <button onClick={async function() {
              var ok = reviewable.filter(function(e) { return blockers(e).length === 0 })
              if (!confirm("Ulozit " + ok.length + " pripravenych navrhu bez vyhrad?")) return
              for (var i = 0; i < ok.length; i++) await saveEntry(ok[i], true)
            }} style={S.btn1}>Ulozit vsechny pripravene</button>
          )}
          {queue.some(function(e) { return e.status === "saved" || e.status === "error" }) && (
            <button onClick={function() { setQueue(function(q) { return q.filter(function(e) { return e.status !== "saved" && e.status !== "error" }) }) }}
              style={S.btn2}>Vycistit hotove</button>
          )}
        </div>
      </div>

      {queue.map(function(e) {
        var d = e.draft
        var isOpen = openKey === e.key && d && e.status !== "saved"
        var b = d ? blockers(e) : []
        var kg = d ? (d.items || []).reduce(function(s, i) { return s + (i.totalWeight || 0) }, 0) : 0
        var supTpls = d && d.supplier_id ? templates.filter(function(t) { return (t.supplier_id || t.supplierId) === d.supplier_id || (t.supplier_id || t.supplierId) === "__global__" }) : templates
        return (
          <div key={e.key} style={{ ...S.card, padding: 0, overflow: "hidden" }}>
            <div onClick={function() { if (d && e.status !== "saved") setOpenKey(isOpen ? null : e.key) }}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", cursor: d ? "pointer" : "default", flexWrap: "wrap" }}>
              {statusBadge(e)}
              <span style={{ fontSize: 13, color: "#6B7280", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              {d && <span style={{ fontWeight: 600, flex: 1, minWidth: 120 }}>{d.supplier_name || d.supplier_name_on_invoice || "?"}</span>}
              {d && <span style={{ fontSize: 12, color: "#6B7280" }}>Faktura: <strong>{d.invoice_number || "-"}</strong></span>}
              {d && <span style={{ fontSize: 12, color: "#6B7280" }}>{d.invoice_date ? new Date(d.invoice_date).toLocaleDateString("cs-CZ") : "-"}</span>}
              {d && <span style={{ fontWeight: 700, width: 80, textAlign: "right" }}>{fmtKg(kg)} kg</span>}
              {e.error && <span style={{ color: "#DC2626", fontSize: 12, flex: 1 }}>{e.error}</span>}
              {e.status === "error" && (
                <button onClick={function(ev) { ev.stopPropagation(); patch(e.key, { status: "waiting", error: null, retry: (e.retry || 0) + 1 }) }} style={S.btn2}>Znovu</button>
              )}
            </div>
            {d && e.status !== "saved" && b.length > 0 && !isOpen && (
              <div style={{ padding: "0 14px 10px", fontSize: 12, color: "#92400E" }}>! {b.join(" | ")}</div>
            )}

            {isOpen && (
              <div style={{ borderTop: "1px solid #E5E7EB", padding: 14, background: "#FAFBFC" }}>
                <div style={S.grid3}>
                  <Field l="Dodavatel">
                    <select value={d.supplier_id || ""} onChange={function(ev) {
                      var s = suppliers.find(function(x) { return x.id === ev.target.value })
                      patchDraft(e.key, { supplier_id: ev.target.value || null, supplier_name: s ? s.name : d.supplier_name })
                    }} style={S.inp}>
                      <option value="">-- vyberte --</option>
                      {suppliers.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option> })}
                    </select>
                    {d.supplier_name_on_invoice && <span style={{ fontSize: 11, color: "#6B7280" }}>Na fakture: {d.supplier_name_on_invoice}{d.supplier_vat ? " (" + d.supplier_vat + ")" : ""}</span>}
                  </Field>
                  <Field l="Cislo faktury">
                    <input value={d.invoice_number || ""} onChange={function(ev) { patchDraft(e.key, { invoice_number: ev.target.value }) }} style={S.inp} />
                    {d.invoice_number_source === "cislo_faktury_dodavatele" && <span style={{ fontSize: 11, color: "#B45309" }}>Interni cislo dokladu chybi - pouzito cislo faktury dodavatele</span>}
                  </Field>
                  <Field l="Datum vystaveni">
                    <input type="date" value={d.invoice_date || ""} onChange={function(ev) { patchDraft(e.key, { invoice_date: ev.target.value }) }} style={S.inp} />
                  </Field>
                </div>

                {d.supplier_id && !d.supplier_has_guide && (
                  <div style={{ fontSize: 12, color: "#92400E", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                    Dodavatel nema vyplneny navod pro AI - pocty obalu jsou jen ODHAD. Navod doplnite v zalozce Dodavatele.
                  </div>
                )}
                {d.notes && (
                  <div style={{ fontSize: 12, color: "#1E40AF", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 10px", marginBottom: 10, whiteSpace: "pre-wrap" }}>
                    <strong>Poznamky AI:</strong> {d.notes}
                  </div>
                )}

                <h4 style={{ margin: "6px 0 6px", fontSize: 13 }}>Radky faktury ({(d.lines || []).length})</h4>
                <table style={{ marginBottom: 12, fontSize: 12 }}>
                  <thead><tr>
                    <th style={S.th}>Kod</th><th style={S.th}>Nazev</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Pocet MJ</th><th style={S.th}>MJ</th>
                  </tr></thead>
                  <tbody>{(d.lines || []).map(function(l, i) {
                    return <tr key={i}>
                      <td style={{ ...S.td, fontFamily: "monospace" }}>{l.code}</td><td style={S.td}>{l.name}</td>
                      <td style={S.tdR}>{l.quantity}</td><td style={S.td}>{l.unit}</td>
                    </tr>
                  })}</tbody>
                </table>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h4 style={{ margin: "6px 0", fontSize: 13 }}>Navrzene obaly - {fmtKg(kg)} kg</h4>
                  <select value="" onChange={function(ev) { if (ev.target.value) addTemplate(e.key, ev.target.value) }}
                    style={{ ...S.inp, width: "auto", fontSize: 12, padding: "4px 6px" }}>
                    <option value="">+ vlozit sablonu...</option>
                    {supTpls.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option> })}
                  </select>
                </div>
                {(d.items || []).some(function(i) { return i.aiReason }) && (
                  <details style={{ fontSize: 12, color: "#4B5563", margin: "4px 0 8px" }}>
                    <summary style={{ cursor: "pointer" }}>Proc AI navrhla tyto pocty</summary>
                    {(d.items || []).filter(function(i) { return i.aiReason && i.quantity > 0 }).map(function(i) {
                      return <div key={i.id} style={{ padding: "2px 0" }}>{matOf(i.material).icon} <strong>{i.name}</strong> {i.quantity}x - {i.aiReason}</div>
                    })}
                  </details>
                )}
                <ItemEditor items={d.items || []} qtyMin={0} addLabel="Pridat obal rucne"
                  setItems={function(u) { patchDraft(e.key, function(dd) { return { items: typeof u === "function" ? u(dd.items || []) : u } }) }} />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid #E5E7EB", alignItems: "center" }}>
                  {b.length > 0 && <span style={{ fontSize: 12, color: "#92400E", flex: 1 }}>! {b.join(" | ")}</span>}
                  <button onClick={async function() { if (await saveEntry(e, false)) setOpenKey(null) }} style={S.btn1}>Ulozit prijem</button>
                  <button onClick={function() { if (confirm("Zahodit tento navrh?")) setQueue(function(q) { return q.filter(function(x) { return x.key !== e.key }) }) }}
                    style={{ ...S.btn2, color: "#DC2626" }}>Zahodit</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
