// extract-invoice
// Vstup:  { file_base64, media_type, file_name }
// Vystup: navrh prijmu (dodavatel, cislo faktury, datum, radky faktury,
//         obalove polozky ze sablon s navrzenymi pocty)
// Krok 1: AI precte fakturu a urci dodavatele.
// Krok 2: AI podle navodu dodavatele a jeho sablon navrhne pocty obalu.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function callClaude(apiKey: string, system: string, content: unknown[], tool: Record<string, unknown>, maxTokens = 8000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("AI chyba: " + (data?.error?.message || res.status));
  const block = (data.content || []).find((b: { type: string }) => b.type === "tool_use");
  if (!block) throw new Error("AI nevratila strukturovanou odpoved");
  return { result: block.input, usage: data.usage };
}

// ─── Krok 1: precist fakturu ───
const INVOICE_TOOL = {
  name: "invoice",
  description: "Udaje prectene z faktury / dokladu o prijmu zbozi.",
  input_schema: {
    type: "object",
    properties: {
      supplier_id: { type: ["string", "null"], description: "ID dodavatele ze seznamu, nebo null kdyz zadny neodpovida" },
      supplier_name_on_invoice: { type: "string" },
      supplier_vat: { type: "string", description: "DIC/VAT dodavatele, pokud je uvedeno" },
      invoice_number: { type: "string" },
      invoice_number_source: { type: "string", enum: ["interni_cislo_dokladu", "cislo_faktury_dodavatele", "jine"] },
      invoice_date: { type: "string", description: "Datum vystaveni YYYY-MM-DD" },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string", description: "Katalogove cislo / kod presne jak je uvedeno" },
            name: { type: "string" },
            quantity: { type: "number", description: "Pocet MJ" },
            unit: { type: "string", description: "MJ, napr. ks, 1m, 10m, bal" },
          },
          required: ["code", "name", "quantity", "unit"],
        },
      },
      notes: { type: "string", description: "Nejasnosti, necitelna mista, cokoli k overeni" },
    },
    required: ["supplier_id", "supplier_name_on_invoice", "invoice_number", "invoice_number_source", "invoice_date", "lines", "notes"],
  },
};

const INVOICE_SYSTEM = `Ctes doklady o nakupu zbozi ze zahranici (screenshot z ERP nebo PDF faktura dodavatele) pro ceskou firmu.
Pravidla:
- Cislo faktury: pouzij INTERNI cislo dokladu z ERP (pole "Cislo dokladu", napr. 32600328). Pokud doklad interni cislo nema (PDF od dodavatele), pouzij cislo faktury dodavatele a nastav invoice_number_source = "cislo_faktury_dodavatele".
- Datum: datum VYSTAVENI dokladu, format YYYY-MM-DD.
- Poradi polozek ignoruj.
- Polozky prepis presne: kod znak po znaku, mnozstvi (Pocet MJ) a MJ. Nic si nedomyslej; co neprectes, uved v notes.
- Dodavatele vyber ze seznamu podle nazvu, aliasu, DIC nebo zeme. Nazvy v seznamu mohou mit ciselnou predponu (napr. "11 RDL" = RDL S.A.). Kdyz si nejsi jisty, vrat null.`;

// ─── Krok 2: navrh obalu ───
const PACK_TOOL = {
  name: "packaging",
  description: "Navrh poctu obalovych polozek ze sablon dodavatele.",
  input_schema: {
    type: "object",
    properties: {
      quantities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            template_id: { type: "string" },
            item_name: { type: "string", description: "Presny nazev polozky ze sablony" },
            quantity: { type: "integer", minimum: 0 },
            reason: { type: "string", description: "Strucne: z ktere polozky faktury a podle jakeho pravidla" },
          },
          required: ["template_id", "item_name", "quantity", "reason"],
        },
      },
      notes: { type: "string", description: "Co neslo podle navodu urcit, co overit" },
    },
    required: ["quantities", "notes"],
  },
};

const PACK_SYSTEM = `Urcujes pocty obalu k dovezenemu zbozi pro evidenci EKO-KOM.
Mas radky faktury, navod dodavatele a sablony (seznam moznych obalovych polozek).
- Navrhuj JEN polozky, ktere v sablonach existuji, s presnym nazvem a template_id.
- Ridej se navodem dodavatele. Kde navod chybi, odhadni podle nazvu polozek sablony a v reason i notes to oznac jako ODHAD.
- Polozky, ktere neprisly, vynech (pocet 0 se doplni sam).
- Pocty jsou cela cisla.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Chybi ANTHROPIC_API_KEY v Secrets projektu." }, 500);

    const { file_base64, media_type, file_name } = await req.json();
    if (!file_base64 || !media_type) return json({ error: "Chybi soubor." }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const [{ data: suppliers, error: e1 }, { data: templates, error: e2 }] = await Promise.all([
      sb.from("suppliers").select("id,name,country,aliases,ai_guide"),
      sb.from("templates").select("id,name,supplier_id,items"),
    ]);
    if (e1 || e2) return json({ error: "Nelze nacist data: " + (e1?.message || e2?.message) }, 401);

    // ── Krok 1
    const supList = (suppliers || []).map((s) =>
      `${s.id} | ${s.name} | ${s.country || ""} | ${s.aliases || ""}`).join("\n");
    const fileBlock = media_type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type, data: file_base64 } }
      : { type: "image", source: { type: "base64", media_type, data: file_base64 } };
    const step1 = await callClaude(apiKey, INVOICE_SYSTEM, [
      fileBlock,
      { type: "text", text: `Seznam dodavatelu (id | nazev | zeme | aliasy):\n${supList}\n\nPrecti doklad.` },
    ], INVOICE_TOOL);
    const inv = step1.result as Record<string, any>;

    const supplier = (suppliers || []).find((s) => s.id === inv.supplier_id) || null;
    let items: any[] = [];
    let packNotes = "";
    let usage2 = null;

    // ── Krok 2 (jen kdyz je dodavatel)
    if (supplier) {
      const offered = (templates || []).filter((t) => t.supplier_id === supplier.id || t.supplier_id === "__global__");
      if (offered.length > 0) {
        const tplText = offered.map((t) =>
          `TEMPLATE ${t.id} "${t.name}" (${t.supplier_id === "__global__" ? "spolecna" : "dodavatele"}):\n` +
          (t.items || []).map((it: any) => `  - ${it.name} [${it.material}, ${it.packType}, ${it.unitWeight} kg/ks]`).join("\n")
        ).join("\n\n");
        const linesText = (inv.lines || []).map((l: any) => `- ${l.code} | ${l.name} | ${l.quantity} x ${l.unit}`).join("\n");
        const step2 = await callClaude(apiKey, PACK_SYSTEM, [{
          type: "text",
          text: `DODAVATEL: ${supplier.name}\n\nNAVOD DODAVATELE:\n${supplier.ai_guide || "(navod zatim neni vyplnen)"}\n\nRADKY FAKTURY:\n${linesText}\n\nSABLONY:\n${tplText}`,
        }], PACK_TOOL, 4000);
        usage2 = step2.usage;
        const pk = step2.result as Record<string, any>;
        packNotes = pk.notes || "";
        const qMap = new Map<string, { q: number; reason: string }>();
        for (const q of pk.quantities || []) qMap.set(q.template_id + "|" + q.item_name, { q: q.quantity, reason: q.reason });
        // Pouzite sablony = ty, kde AI navrhla aspon 1 kus; jejich polozky vlozime cele (0 = neprislo)
        const usedIds = new Set((pk.quantities || []).filter((q: any) => q.quantity > 0).map((q: any) => q.template_id));
        for (const t of offered) {
          if (!usedIds.has(t.id)) continue;
          for (const it of t.items || []) {
            const hit = qMap.get(t.id + "|" + it.name);
            const qty = hit ? hit.q : 0;
            items.push({
              ...it,
              id: crypto.randomUUID().replace(/-/g, "").slice(0, 13),
              quantity: qty,
              totalWeight: Math.round((it.unitWeight || 0) * qty * 1000) / 1000,
              fromTemplate: t.id,
              aiReason: hit ? hit.reason : "",
            });
          }
        }
      }
    }

    return json({
      file_name: file_name || "",
      supplier_id: supplier ? supplier.id : null,
      supplier_name: supplier ? supplier.name : (inv.supplier_name_on_invoice || ""),
      supplier_name_on_invoice: inv.supplier_name_on_invoice || "",
      supplier_vat: inv.supplier_vat || "",
      supplier_has_guide: !!(supplier && supplier.ai_guide),
      invoice_number: inv.invoice_number || "",
      invoice_number_source: inv.invoice_number_source || "",
      invoice_date: inv.invoice_date || "",
      lines: inv.lines || [],
      items,
      notes: [inv.notes, packNotes].filter(Boolean).join("\n"),
      usage: { step1: step1.usage, step2: usage2 },
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
