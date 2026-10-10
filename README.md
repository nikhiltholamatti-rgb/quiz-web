# LIVE CAMPUS QUIZ // TECH EVENT ARENA

A real-time, anti-cheat, high-concurrency quiz application designed for live campus tech events. Supports ~80 mobile participants playing simultaneously on smartphones while the main projector displays the host control matrix, live countdown, and victory podium.

Built with **React 18**, **Vite 5**, **Tailwind CSS 3.4**, **Supabase Realtime & Presence**, and **React Three Fiber 8**.

---

## 🚀 1. Supabase Database Setup

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. Navigate to the **SQL Editor** tab.
3. Open or copy the contents of [`schema.sql`](./schema.sql) from this repository and run the query.
4. **Confirm Realtime publication:**
   - Go to **Database** → **Replication** in Supabase.
   - Verify that the `game_state` table is added to the `supabase_realtime` publication. (Our script executes `ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;` automatically).
5. **Get your API Credentials:**
   - Go to **Project Settings** → **API**.
   - Copy **Project URL** and the **`anon` `public` key**.

---

## ⚙️ 2. Environment Configuration

1. In the project root, create a `.env` file based on [`.env.example`](./.env.example):
   ```bash
   cp .env.example .env
   ```
2. Populate the environment variables:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   # Optional: When testing with multiple phones over local Wi-Fi,
   # set your machine's LAN IP address so the projector QR code points to your LAN:
   # Example: VITE_PUBLIC_URL=http://192.168.1.15:5173
   VITE_PUBLIC_URL=
   ```
   > ⚠️ **Note:** If either `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, the app gracefully displays a cybernetic on-screen configuration error screen explaining what to configure.

---

## 📦 3. Installation & Local Development

1. Ensure Node.js 20+ is active:
   ```bash
   node -v   # >= 20.0.0
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. **To test with phones on the same Wi-Fi:**
   Run Vite exposing host network interfaces:
   ```bash
   npm run dev -- --host
   ```
   Vite will display your LAN IP address (e.g. `http://192.168.1.x:5173`).
   Set `VITE_PUBLIC_URL=http://192.168.1.x:5173` in `.env` so that the QR code rendered on the Host Projector view directs phones to that exact address.

5. Test production build and preview locally:
   ```bash
   npm run build
   npm run preview
   ```

---

## ☁️ 4. Deployment to Vercel

1. Push your repository to GitHub or import it into Vercel.
2. In the Vercel Project Import settings:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. In **Project Settings** → **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = `https://<your-id>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-anon-key>`
   - (Optional) `VITE_PUBLIC_URL` = `https://<your-app>.vercel.app`
4. Deploy! The included `vercel.json` and `public/_redirects` guarantee that direct access or browser refreshes on `/play` and `/host` route cleanly through `index.html`.

---

## 🛡️ 5. Pre-Event Checklist

- [ ] Run `schema.sql` in Supabase SQL editor and confirm 20 tech event questions are seeded.
- [ ] Confirm Realtime is enabled for `public.game_state`.
- [ ] Verify test access on laptop: Open `/play` and verify cyber wireframe profile renders smoothly.
- [ ] Verify test access on mobile: Check input focus does not trigger iOS Safari auto-zoom (`16px` font size verified).
- [ ] Connect host laptop to HDMI projector and open `/host` (after authenticating via admin USN `212` or `232`).
- [ ] Have 2–3 team members scan the QR code to ensure LAN / Wi-Fi subnet routing is unobstructed.
- [ ] Confirm room Wi-Fi can accommodate ~80 concurrent devices.

---

## 🧪 6. Comprehensive Manual Test Script

Follow this step-by-step test script to verify full functionality from lobby to podium:

### Step 1: Holding Room & Invalid Input Handling
1. Open `http://localhost:5173/play` on Phone 1 (or Incognito window 1).
2. Type Name: `"Rohan"`.
3. In the USN field, attempt to type letters: `"12a"`.
   - **Expected Result:** Red inline error appears: `Invalid USN: digits only`. The "ENTER ARENA" button remains disabled.
4. Correct the digits to `"042"`.
   - **Expected Result:** Error clears. Submit button enables. Press "ENTER ARENA".
   - Phone 1 displays: **"You're in! Look at the projector. Waiting for host to start..."**

### Step 2: Multi-Phone Lobby Join
1. On Phone 2 (or Incognito window 2): Enter Name `"Ananya"`, USN digits `"088"`. Submit.
2. On Phone 3 (or Incognito window 3): Enter Name `"Dev"`, USN digits `"115"`. Submit.
3. Both phones enter the holding room waiting state.

### Step 3: Admin Shortcut to Projector Host
1. On the Laptop (Host machine), open `http://localhost:5173/play`.
2. Enter Name: `"Admin"`.
3. Enter USN digits: `"212"` (or `"232"`).
4. Click submit.
   - **Expected Result:** The app detects admin USN credentials, saves `adminUsn` in `sessionStorage`, and routes automatically to `/host`.
   - The Host Projector view displays:
     - Large QR code pointing to `/play`
     - Connected device counter showing `3` (Rohan, Ananya, Dev)
     - Animated terminal stream showing the joined names
     - Green dot indicating Supabase connection is active

### Step 4: Starting the Match
1. Host clicks **"⚡ START GAME NOW"**.
   - `start_game('NN25CSE212')` is called.
   - `game_state.phase` transitions from `lobby` to `playing`.
2. **Projector View:** Displays massive synchronized countdown timer (`15:00`).
3. **Phones 1, 2, 3:** Automatically load encrypted questions (with 0–400ms jitter) and display Question 1 with Fisher-Yates shuffled option buttons (min-height 64px).

### Step 5: Anti-Cheat Tab-Switch Detection
1. On Phone 1, switch tabs or minimize the browser during gameplay.
2. Switch back to Phone 1.
   - **Expected Result:** Red high-contrast toast flashes: **"TAB SWITCH DETECTED! Question forfeited."**
   - The current question is automatically marked wrong (`null`) and advances to the next question.
   - Further attempts within the same switch are ignored.

### Step 6: Answering & Timed Submission
1. On Phone 2, tap option answers. Note the 250ms tap lock preventing double taps.
2. Complete all 20 questions or allow the timer to expire.
3. Phone displays: **"Time's Up! Look at the projector."** Neither score nor rank is revealed on the phone.

### Step 7: Podium Choreography
1. When the countdown reaches `00:00` (or `finish_game()` returns true):
   - `game_state.phase` becomes `finished`.
   - Host projector displays `"CALCULATING RESULTS..."` spinner for **exactly 3 seconds**.
   - Host projector smoothly reveals **2nd Place** (Name, USN, Score, Time).
   - Pauses for **2 seconds**.
   - Host projector triggers massive reveal of **1st Place** accompanied by glowing amber halo and **confetti shower** for 8 seconds.

### Step 8: Arena Reset
1. Host clicks **"RESET ARENA"** and confirms the prompt.
   - `reset_game('NN25CSE212')` executes.
   - Submissions are cleared, `phase` returns to `lobby`.
   - All terminals return to lobby readiness.
