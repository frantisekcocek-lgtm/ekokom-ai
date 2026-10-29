# EKO-KOM Evidence AI (verze 2)

Evidence obalů + AI příjem z faktur (PDF / screenshot, jednotlivě i hromadně).

- Databáze: Supabase projekt **ekokom-ai** (data přenesena ze staré aplikace 29. 10. 2026)
- AI: edge funkce `extract-invoice` (už nasazená) → Claude API
- Hosting: Vercel

## Nasazení (jednou)

1. **API klíč pro AI** – console.anthropic.com → API Keys → vytvořit klíč (a nabít kredit).
   Supabase → projekt *ekokom-ai* → Edge Functions → Secrets → přidat `ANTHROPIC_API_KEY`.
2. **Přihlašovací účet** – Supabase → *ekokom-ai* → Authentication → Add user (staré přihlášení se nepřenáší).
3. **GitHub** – nový repozitář, nahrát obsah tohoto ZIPu (soubory přímo v kořeni).
4. **Vercel** – Add New → Project → vybrat repozitář. Environment Variables zkopírovat z `.env.example`. Deploy.

## Používání

- **Dodavatelé → Upravit**: vyplnit *Aliasy pro AI* (název na faktuře, DIČ) a *Návod pro AI*.
- **AI příjem**: přetáhnout soubory nebo Ctrl+V se screenshotem. Návrh zkontrolovat a uložit,
  nebo zapnout *Uložit rovnou* (uloží jen bezchybné návrhy, zbytek nechá ke kontrole).
- Pravidla čtení: číslo faktury = interní číslo dokladu z ERP, datum = datum vystavení.
