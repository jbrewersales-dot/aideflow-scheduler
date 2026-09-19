# AideFlow

AideFlow helps **Ashley Brewer** (and any resource / special education teacher) assign classroom aides to students for a school day.

It will **only keep a schedule when every hard safety rule is met**. If no legal combination exists, you get a plain-language “No valid schedule” report — never a half-finished or unsafe roster.

Everything stays **on this computer** (browser storage). There is no account and no school-data login.

---

## Run it (one command after install)

You need [Node.js](https://nodejs.org/) 20 or newer (the LTS installer is fine).

1. Open a terminal in this folder.
2. Install once, then start:

```bash
npm install
npm run dev
```

3. When it says something like `Local: http://localhost:5173/`, open that address in Chrome or Edge.
4. Press **Auto-Schedule**. The sample classroom is already loaded so you can try it immediately.

To stop the app, click the terminal and press `Ctrl+C`.

### Other useful commands

```bash
npm test          # scheduler safety tests
npm run build     # production build
npm run preview   # view the production build locally
```

---

## What you will see

| Tab | What it is for |
| --- | --- |
| **Day grid** | Time down the side, aides across the top. Drag a student to another aide, or tap **Move**. |
| **Student days** | One strip per child. |
| **Conflicts** | Hard problems and the impossibility report. |
| **Students / Aides** | Add, edit, delete people. Four aides are included; you can add more. |
| **Timeline** | Bell schedule, recess, lunch, bus windows. Full-day vs shortened-day patterns. |
| **Rules** | Keep-apart pairs and trait-vs-trait conflicts (for example two “aggressive” students). |
| **Parameters** | Group size, whether “elopes” requires 1:1, and soft scoring weights. |
| **Data** | CSV upload, JSON backup, sample reset. |
| **Print** | Clean print / Save as PDF, plus schedule CSV. Locked if the schedule is illegal. |

---

## Sample classroom (no upload needed)

AideFlow opens with a realistic demo:

- 10 students (mix of full day and shortened day)
- 4 aides (Denise, Keisha, Tom, Priya)
- Bus arrival / midday shortened-day bus / PM dismissal
- Keep-apart: Marcus + Ethan; Lily + Sofia
- Trait rules: two aggressive students cannot share an aide; elopes × aggressive cannot share

Press **Auto-Schedule** on a fresh install to see a legal day.

---

## Upload a student list (CSV)

1. Open **Data**.
2. Click **Download template CSV** (or use `public/aideflow-students-template.csv`).
3. Open it in Excel or Google Sheets. Keep the header row.
4. Fill one row per student. Lists use a **semicolon**: `aggressive;wheelchair`.
5. Save as CSV and click **Upload student CSV**.

| Column | Notes |
| --- | --- |
| `name` | Required |
| `dayType` | `full` or `shortened` |
| `blocks` | Optional period names. Leave blank to follow the day-type timeline |
| `busPickup` / `busDropoff` | Times like `07:45` |
| `needTags` / `traits` | Semicolon-separated |
| `needsNotes` | Free text |
| `requiresOneToOne` | `true` or `false` |
| `coverageMode` | `always` (default), `listed`, or `none` |
| `preferredAides` | Aide names, semicolon-separated |

You can also add students by hand on the **Students** tab.

---

## How Auto-Schedule works

1. For each time block, AideFlow lists students who are present and **must** have coverage.
2. It searches assignments of those students to available aides (backtracking).
3. **Hard rules** are checked at every step:
   - An aide cannot work two places (or two overlapping blocks) at once
   - Caseload / max group size
   - 1:1 students (and “elopes” when that setting is on) cannot share an adult
   - Keep-apart pairs
   - Trait conflict rules marked **hard**
   - Aide availability
4. Soft scores (preferred matches, balanced groups, fewer aide switches) only choose among **legal** options.
5. If the search finishes with **zero** hard violations for the whole day, that schedule is saved.
6. If nothing works, **no schedule is stored**. The **Conflicts** tab lists why.

Changing students, aides, rules, or parameters **clears** the current schedule so you cannot keep a stale roster by accident. Run Auto-Schedule again after you tweak things.

### Manual overrides

After a valid auto schedule, you may drag or tap-to-move students. Broken hard rules light up in red. **Print and schedule export stay locked** until the grid is legal again (or you re-run Auto-Schedule).

---

## Privacy

- Data is stored in this browser’s `localStorage` only.
- Use **Data → Export JSON backup** before clearing the browser or switching computers.
- Do not put this file on a shared public drive if it contains real student names.

---

## Tests

Scheduler tests live in `src/scheduler/solver.test.ts`:

- The demo classroom produces a complete legal schedule
- An overconstrained classroom returns **no** schedule, with reasons
- Keep-apart and trait conflicts are honored
- An aide cannot be double-booked on overlapping blocks

```bash
npm test
```
