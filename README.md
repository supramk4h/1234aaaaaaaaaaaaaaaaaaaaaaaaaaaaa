# ✦ PromptVault — Offline + GitHub Pages Ready

Works **completely offline** out of the box. No server, no Supabase, no npm.
Just double-click `index.html`.

---

## ✦ One-line summary

| Mode | How to activate | What works |
|------|----------------|------------|
| **Offline / Local** | `USE_LOCAL_DATA: true` ← default | Gallery, search, filters, lightbox, copy |
| **Live / Supabase** | `USE_LOCAL_DATA: false` + fill keys | Everything above + admin upload/edit/delete + realtime |

---

## ✦ Running Offline (right now)

Just open `index.html` in any browser.

> **If images don't show** (they come from picsum.photos which needs internet),
> you're still 100% offline — the card layout, animations, copy button etc. all work.
> To add real offline images, put them in an `images/` folder and update `data/prompts.json`.

---

## ✦ Adding Your Own Prompts (Offline)

Edit `data/prompts.json`. Each entry looks like this:

```json
{
  "id": "my-1",
  "image_url": "images/my-photo.jpg",
  "prompt_text": "Your full prompt text here…",
  "category": "Landscape",
  "created_at": "2025-03-10T10:00:00Z"
}
```

Valid categories: `Portrait`, `Landscape`, `Abstract`, `Architecture`, `Fantasy`, `Sci-Fi`, `Character`, `Product`, `General`

Put your images in an `images/` folder next to `index.html` and reference them as `"images/filename.jpg"`.

---

## ✦ File Structure

```
promptvault/
├── index.html              ← Public gallery (open this)
├── admin.html              ← Admin panel (needs Supabase)
├── data/
│   └── prompts.json        ← Your local prompts (edit freely)
├── images/                 ← Put your local images here (optional)
├── css/
│   ├── style.css           ← Gallery styles
│   └── admin.css           ← Admin styles
├── js/
│   ├── config.js           ← ← ← THE MAIN TOGGLE IS HERE
│   ├── app.js              ← Gallery logic
│   └── admin.js            ← Admin logic
└── README.md
```

---

## ✦ Deploying to GitHub Pages

### Step 1 — Create a GitHub repo

1. Go to github.com → **New repository**
2. Name it e.g. `promptvault`
3. Set it to **Public** (required for free GitHub Pages)
4. Click **Create repository**

### Step 2 — Upload your files

**Option A — GitHub web UI (easiest, no Git needed):**
1. Open your new repo
2. Click **Add file → Upload files**
3. Drag the entire `promptvault/` folder contents in
4. Click **Commit changes**

**Option B — Git CLI:**
```bash
cd promptvault
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/promptvault.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages

1. In your repo → **Settings → Pages**
2. Under **Source** → select `Deploy from a branch`
3. Branch: `main` · Folder: `/ (root)`
4. Click **Save**
5. Wait ~60 seconds → your site is live at `https://YOUR_USERNAME.github.io/promptvault/`

> Note: When deployed to GitHub Pages (a real server), `data/prompts.json` loads perfectly via fetch. The XHR fallback is only needed when opening `index.html` directly from a file manager.

---

## ✦ Switching to Supabase (when you're ready)

### 1. Create Supabase project at supabase.com

### 2. Run this SQL in Supabase → SQL Editor:

```sql
CREATE TABLE public.prompts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url   TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  category    TEXT DEFAULT 'General',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.prompts FOR SELECT USING (true);
CREATE POLICY "Auth insert"  ON public.prompts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update"  ON public.prompts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete"  ON public.prompts FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE prompts;
```

### 3. Create Storage bucket

Supabase → Storage → New bucket → name: `prompt-images` → Public: ✅

```sql
CREATE POLICY "Public read images"   ON storage.objects FOR SELECT  USING (bucket_id = 'prompt-images');
CREATE POLICY "Auth upload images"   ON storage.objects FOR INSERT  TO authenticated WITH CHECK (bucket_id = 'prompt-images');
CREATE POLICY "Auth delete images"   ON storage.objects FOR DELETE  TO authenticated USING (bucket_id = 'prompt-images');
```

### 4. Create admin user

Supabase → Authentication → Users → Add User

### 5. Update js/config.js

```js
var PV_CONFIG = {
  USE_LOCAL_DATA: false,   // ← Change this
  SUPABASE_URL:   'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_PUBLIC_KEY',
  // ... rest stays the same
};
```

That's it — the gallery now pulls from Supabase and the admin panel is fully functional.

---

## ✦ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + K` | Focus search |
| `Esc` | Close lightbox / modal |

---

## ✦ Customising Prompts JSON

You can add as many entries as you want to `data/prompts.json`.
To use your own local images, place them in an `images/` folder:

```
promptvault/
└── images/
    ├── my-landscape.jpg
    └── my-portrait.png
```

Then in prompts.json:
```json
"image_url": "images/my-landscape.jpg"
```

---

## ✦ Security

- The `anon` Supabase key is safe to commit — it only has the permissions your RLS policies grant
- The admin page has `<meta name="robots" content="noindex">` so search engines skip it
- Never commit your Supabase `service_role` key to public repos
