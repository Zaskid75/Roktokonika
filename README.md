# RoktoKonika — Setup & Deployment Guide

## Project Files
```
roktokonika/
├── index.html     ← Main app (all screens)
├── style.css      ← Styling
├── app.js         ← All JS logic + Supabase calls
├── schema.sql     ← Database setup (run once in Supabase)
└── logo.png       ← Your logo (rename your file to this)
```

---

## Step 1 — Add Your Logo
Rename your logo image file to **`logo.png`** and place it in the same folder as `index.html`.

---

## Step 2 — Set Up Supabase Database

1. Go to → [supabase.com](https://supabase.com) → Your project
2. Click **SQL Editor** in the left sidebar
3. Paste the entire contents of `schema.sql`
4. Click **Run**

> ✅ This creates 3 tables: `profiles`, `blood_requests`, `donations`

### Disable Email Confirmation (Recommended for now)
1. Supabase → **Authentication** → **Email**
2. Toggle OFF **"Enable email confirmations"**

This lets users log in immediately after signing up.

---

## Step 3 — Push to GitHub

Open your terminal in the project folder and run:

```bash
git init
git add .
git commit -m "Initial commit — RoktoKonika"
git branch -M main
git remote add origin https://github.com/Zaskid75/Roktokonika.git
git push -u origin main
```

---

## Step 4 — Deploy to Vercel

1. Go to → [vercel.com](https://vercel.com)
2. Click **Add New → Project**
3. Import your GitHub repo: **Zaskid75/Roktokonika**
4. Keep all settings as default (Framework: None / Other)
5. Click **Deploy**

✅ Your site will be live at `https://roktokonika.vercel.app` (or similar)

---

## How the App Works

| Feature | How |
|---|---|
| Login / Signup | Supabase Auth (email + password) |
| First login | User fills profile (name, blood group, phone, location) |
| Post blood request | Logged-in user fills form → saved to `blood_requests` |
| I Can Donate | Creates a row in `donations` table with donor's contact |
| View Volunteers | Only the requester sees volunteer names & phone numbers |
| Find Donors | Filters by blood group & location — only shows available donors |
| Availability | Donors become available 4 months (120 days) after last donation |
| Mark Fulfilled | Requester removes the request from active list |
| I Donated Today | Updates `last_donation_date` to today in the user's profile |
