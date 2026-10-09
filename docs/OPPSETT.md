# Oppsett

Det meste er allerede gjort. Status per 9. oktober 2026:

| Hva | Status |
|---|---|
| Vercel-prosjekt `familiesamarbeid` koblet til GitHub, region Frankfurt | ✅ Gjort |
| Adresse: https://familiesamarbeid.vercel.app | ✅ Gjort |
| Vercel Blob (privat lagring for dokumenter), koblet til prosjektet | ✅ Gjort |
| Miljøvariabler: `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`, `ALLOWED_EMAILS`, VAPID-nøkler (push) | ✅ Gjort |
| **Neon-database** | ⏳ Eieren (ett klikk, se under) |
| **Samboerens e-post i `ALLOWED_EMAILS`** | ⏳ Eieren |
| **`ANTHROPIC_API_KEY`** (AI-sortering og «Fra tekst») | ⏳ Eieren (valgfritt) |

## 1. Koble til Neon (ca. 1 minutt)

1. vercel.com → prosjektet **familiesamarbeid** → **Storage** → **Create Database** → **Neon**.
2. Region: **Frankfurt (fra1)**. Plan: **Free** holder.
3. **Auth: skru AV** (vi bruker vår egen innlogging i samme database).
4. Koble til prosjektet for alle miljøer. Vercel legger da inn `DATABASE_URL` og `DATABASE_URL_UNPOOLED` automatisk.
5. **Deployments → … → Redeploy** på siste deploy. Tabellene opprettes automatisk under bygget.

## 2. Miljøvariabler du må legge inn selv

Vercel → **Settings → Environment Variables**. Redeploy etterpå.

| Navn | Verdi |
|---|---|
| `ALLOWED_EMAILS` | Er satt til din e-post. Legg til samboerens, kommaseparert: `din@gmail.com,samboer@gmail.com` |
| `ANTHROPIC_API_KEY` | Samme nøkkel som i Hyttekompis (console.anthropic.com → API Keys) |

`OPENAI_API_KEY` trengs ikke. Blir det aktuelt, heter variabelen `OPENAI_API_KEY`.

## 3. Ta appen i bruk

1. Åpne https://familiesamarbeid.vercel.app i Safari på iPhone → **Første gang** → lag konto med e-posten din.
2. Skriv navnet ditt og barnas navn.
3. **Del → Legg til på Hjem-skjerm**, og åpne appen derfra.
4. Innstillinger → **Slå på Face ID** og **Push-varsler**.
5. Innstillinger → **Tilgang** → del lenken med samboeren.

## Lokal utvikling

```bash
npm install
vercel link && vercel env pull .env.local
npm run dev
```

Migrasjoner kjøres med `npm run db:migrate` (og automatisk i hver Vercel-build).
