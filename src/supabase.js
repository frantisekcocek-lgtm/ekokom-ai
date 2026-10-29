import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null

// ─── Auth ───

export async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Supabase not configured' } }
  var result = await supabase.auth.signInWithPassword({ email: email, password: password })
  return result
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getSession() {
  if (!supabase) return null
  var result = await supabase.auth.getSession()
  return result.data.session
}

export function onAuthChange(callback) {
  if (!supabase) return function() {}
  var sub = supabase.auth.onAuthStateChange(function(_event, session) {
    callback(session)
  })
  return function() { sub.data.subscription.unsubscribe() }
}

// ─── Database operations ───

export async function loadSuppliers() {
  if (!supabase) return []
  var result = await supabase.from('suppliers').select('*').order('created_at', { ascending: true })
  if (result.error) { console.error('Load suppliers:', result.error); return [] }
  return result.data || []
}

export async function saveSupplier(supplier) {
  if (!supabase) return null
  var result = await supabase.from('suppliers').insert(supplier).select().single()
  if (result.error) { console.error('Save supplier:', result.error); return null }
  return result.data
}

export async function deleteSupplier(id) {
  if (!supabase) return false
  var result = await supabase.from('suppliers').delete().eq('id', id)
  if (result.error) { console.error('Delete supplier:', result.error); return false }
  return true
}

export async function updateSupplier(supplier) {
  if (!supabase) return false
  var result = await supabase.from('suppliers')
    .update({ name: supplier.name, country: supplier.country, note: supplier.note,
      aliases: supplier.aliases || '', ai_guide: supplier.ai_guide || '' })
    .eq('id', supplier.id)
  if (result.error) { console.error('Update supplier:', result.error); return false }
  return true
}

// Aktualizuje supplier_name ve vsech prijmech daneho dodavatele
export async function renameReceiptsSupplier(supplierId, newName) {
  if (!supabase) return false
  var result = await supabase.from('receipts')
    .update({ supplier_name: newName })
    .eq('supplier_id', supplierId)
  if (result.error) { console.error('Rename receipts supplier:', result.error); return false }
  return true
}

export async function loadTemplates() {
  if (!supabase) return []
  var result = await supabase.from('templates').select('*').order('created_at', { ascending: true })
  if (result.error) { console.error('Load templates:', result.error); return [] }
  return result.data || []
}

export async function saveTemplate(template) {
  if (!supabase) return null
  var result = await supabase.from('templates').insert(template).select().single()
  if (result.error) { console.error('Save template:', result.error); return null }
  return result.data
}

export async function deleteTemplate(id) {
  if (!supabase) return false
  var result = await supabase.from('templates').delete().eq('id', id)
  if (result.error) { console.error('Delete template:', result.error); return false }
  return true
}

export async function updateTemplate(template) {
  if (!supabase) return false
  var result = await supabase.from('templates')
    .update({ name: template.name, supplier_id: template.supplier_id, items: template.items })
    .eq('id', template.id)
  if (result.error) { console.error('Update template:', result.error); return false }
  return true
}

export async function loadReceipts() {
  if (!supabase) return []
  var result = await supabase.from('receipts').select('*').order('receipt_date', { ascending: false })
  if (result.error) { console.error('Load receipts:', result.error); return [] }
  return (result.data || []).map(function(r) {
    return {
      id: r.id, date: r.receipt_date, supplierId: r.supplier_id,
      supplierName: r.supplier_name, note: r.note,
      docNumber: r.doc_number || "", docDate: r.doc_date || "",
      createdAt: r.created_at || null,
      invoiceLines: r.invoice_lines || [], sourceFile: r.source_file || "", aiMeta: r.ai_meta || null,
      items: r.items || []
    }
  })
}

export async function saveReceipt(receipt) {
  if (!supabase) return null
  var row = {
    receipt_date: receipt.date, supplier_id: receipt.supplierId || null,
    supplier_name: receipt.supplierName, note: receipt.note,
    doc_number: receipt.docNumber || null, doc_date: receipt.docDate || null,
    items: receipt.items,
    invoice_lines: receipt.invoiceLines || [],
    source_file: receipt.sourceFile || '',
    ai_meta: receipt.aiMeta || null
  }
  var result = await supabase.from('receipts').insert(row).select().single()
  if (result.error) { console.error('Save receipt:', result.error); return null }
  return { ...receipt, id: result.data.id, createdAt: result.data.created_at || null }
}

export async function updateReceipt(receipt) {
  if (!supabase) return false
  var result = await supabase.from('receipts').update({
    items: receipt.items, note: receipt.note,
    doc_number: receipt.docNumber || null, doc_date: receipt.docDate || null
  }).eq('id', receipt.id)
  if (result.error) { console.error('Update receipt:', result.error); return false }
  return true
}

export async function deleteReceipt(id) {
  if (!supabase) return false
  var result = await supabase.from('receipts').delete().eq('id', id)
  if (result.error) { console.error('Delete receipt:', result.error); return false }
  return true
}

// ─── AI: vycteni faktury (edge function extract-invoice) ───
export async function extractInvoice(fileBase64, mediaType, fileName) {
  if (!supabase) return { error: 'Supabase neni nastaven' }
  var result = await supabase.functions.invoke('extract-invoice', {
    body: { file_base64: fileBase64, media_type: mediaType, file_name: fileName }
  })
  if (result.error) {
    var msg = result.error.message
    try { var ctx = await result.error.context.json(); if (ctx && ctx.error) msg = ctx.error } catch (e) {}
    return { error: msg }
  }
  return result.data
}
