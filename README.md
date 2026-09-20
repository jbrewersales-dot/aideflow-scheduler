# AideFlow

AideFlow helps **Ashley Brewer** (and any resource / special education teacher) assign classroom aides to students for a school day.

It will **only keep a schedule when every hard safety rule is met**. If no legal combination exists, you get a plain-language “No valid schedule” report — never a half-finished or unsafe roster.

Everything stays **on this computer** (browser storage). There is no account and no school-data login.

---

## Get the app (no technical setup)

There are three ways to use AideFlow. Pick whichever is easiest.

### 1. Desktop app (Windows / Mac / Linux)

1. Go to the **Releases** page of this repository on GitHub (right-hand side of the repo home page).
2. Download the file for your computer:
   - **Windows:** `AideFlow-Setup-x.y.z.exe` (installs like a normal program) or `AideFlow-Portable-x.y.z.exe` (runs without installing).
   - **Mac:** `AideFlow-x.y.z-mac-arm64.dmg` (newer Macs with an Apple chip) or `AideFlow-x.y.z-mac-x64.dmg` (older Intel Macs).
   - **Linux:** `AideFlow-x.y.z-linux.AppImage`.
3. Open it. The app is not code-signed, so the first launch shows a warning:
   - Windows: click **More info → Run anyway**.
   - Mac: right-click the app → **Open** → **Open**.

Your data stays inside the app on that computer.

### 2. Web version (nothing to install)

**This repository is private, and GitHub Pages is only available on a private
repository for paid accounts.** The Pages workflow therefore builds and tests
the app but skips publishing, and says so in its log rather than failing. You do
not need it — the desktop app above is the same program.

To turn the web version on later, either make the repository public or upgrade
the account, then:

1. Open the repository on github.com and click **Settings**.
2. Click **Pages** in the left sidebar.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions → Deploy to GitHub Pages → Run workflow**.

The address then appears under Settings → Pages.

### 3. Run from source

See "Run it" below. This needs Node.js installed.

---

## Building the desktop app yourself

```bash
npm install
npm run desktop          # opens the desktop app on this computer
npm run desktop:win      # makes Windows installers in release/
npm run desktop:mac      # makes Mac .dmg files (must run on a Mac)
npm run desktop:linux    # makes a Linux AppImage
```

To publish installers for everyone: create a tag like `v1.0.1` and push it, or open **Actions → Build desktop installers → Run workflow**. GitHub builds all three platforms and attaches them to a Release.

To use your own app icon, replace `build/icon.png` with a square PNG at least 512×512 pixels.

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
| **Students** | Start here. Each child's own day: arrival time, what class they are in each block, which room, and whether an adult must be with them. |
| **Day grid** | Time down the side, adults across the top. Drag a name to another adult, or tap **Move**. |
| **Student days** | One strip per child showing where they are and who is with them. |
| **If someone is out** | Complete backup schedules for each staff absence, built before you need them. |
| **Conflicts** | Hard problems and the plain-language impossibility report. |
| **Staff** | Ashley and the aides. Tick **out today** for anyone absent. |
| **Rooms** | Every place a student can be. |
| **Timeline** | Bell schedule, recess, lunch, bus windows. |
| **Rules** | Keep-apart pairs and trait-vs-trait conflicts. |
| **Parameters** | Group sizes, whether "elopes" requires 1:1, and soft scoring weights. |
| **Data** | CSV upload and download, JSON backup, sample reset. |
| **Print** | Day grid, one sheet per student, or one sheet per adult. Locked if the schedule is illegal. |

---

## Building the day around each student

AideFlow is built student-first. You describe each child's day, and the grid is
assembled from those rows rather than the other way round.

For every block a student can have:

- **Here?** whether they are in the building, which normally comes from their
  arrival and departure times
- **What they are doing** the label that prints on the schedule, e.g. "Gen-ed ELA"
- **Where** the room. This matters: one adult cannot be in two rooms at once
- **Needs an adult?** some students are independent for specials or lunch
- **Adult goes with them** the assigned adult leaves the classroom, so they are
  unavailable to everyone else that period

Anything left blank follows that student's normal pattern, so you only fill in
what is different.

### Arrival and departure

Set an **arrival time** for a student who comes in at midday, and a **departure
time** for a shortened day. Blocks outside that window are skipped
automatically, so an afternoon-only student never appears in the morning.

### Ashley is on the schedule

Ashley is a staff member like anyone else, with one difference: she is marked as
unable to leave the room. She can hold the main group in the resource room, but a
student who goes to speech or a gen-ed class needs an aide to go with them. You
can change this on the **Staff** tab, and add a co-teacher or substitute the same way.

### When an aide is out

Tick **out today** on the Staff tab and press Auto-Schedule for a day that works
without them. To prepare in advance, open **If someone is out** and build a backup
plan for every person at once. Changed placements are shaded so you can see who
moves. If there is no safe way to cover the day without someone, AideFlow says so
and names the reason rather than guessing.

---

## Sample classroom (no upload needed)

AideFlow opens with a realistic demo you can press **Auto-Schedule** on straight away:

- 11 students: full day, shortened day, and one who arrives at 11:30
- Ashley plus 4 aides (Denise, Keisha, Tom, Priya)
- Lily pushes into a gen-ed class with an aide; Ava has a speech pull-out
- Maya does specials independently, with no adult assigned
- Keep-apart: Marcus + Ethan, Lily + Sofia
- Trait rules: two aggressive students cannot share an adult; elopes x aggressive cannot share

---

## Upload your lists (CSV)

There are two uploads on the **Data** tab. Do them in this order.

### 1. The students

1. Click **Download template CSV**.
2. Open it in Excel or Google Sheets and keep the header row.
3. One row per student. Lists use a **semicolon**: `aggressive;wheelchair`.
4. Save as CSV and click **Upload student CSV**.

| Column | Notes |
| --- | --- |
| `name` | Required |
| `dayType` | `full` or `shortened` |
| `arrivalTime` / `departureTime` | When they are in the building, e.g. `11:30` or `1:05 PM`. Beats the day type |
| `busPickup` / `busDropoff` | Times such as `07:45` |
| `needTags` / `traits` | Semicolon-separated |
| `needsNotes` | Free text |
| `requiresOneToOne` | `true` or `false` |
| `coverageMode` | `always` (default), `listed`, or `none` |
| `preferredAides` | Staff names, semicolon-separated |

### 2. Their daily schedule

One row per student per block. Click **Download day-plan template**, fill it in,
then **Upload day plan**.

| Column | Notes |
| --- | --- |
| `student` / `block` | Required. Must match names you already have |
| `activity` | What prints on the schedule, e.g. "Gen-ed ELA" |
| `location` | A room name from the Rooms tab |
| `attends` / `needsAide` | `yes` or `no`. Blank follows the student's normal pattern |
| `aideAccompanies` | `yes` when an adult must leave the room with them |
| `note` | Free text that prints on the student's sheet |

Rows that do not match a student or block are reported, never guessed at.
You can also edit all of this by hand on the **Students** tab.

---

## How Auto-Schedule works

1. For each part of the day, AideFlow lists the students who are present and
   must have an adult, working from each student's own plan.
2. It checks cheap impossibility tests first, so a day that cannot work is
   reported in a fraction of a second with the reason.
3. Otherwise it searches assignments of those students to available staff.
   Blocks that overlap in time are searched together, so an early choice can
   never quietly make a later block unsolvable.
4. **Hard rules** are checked at every step:
   - An adult cannot be in two places, or two overlapping blocks, at once
   - An adult can only take students who are in the same room
   - Staff who cannot leave the room are never sent out with a student
   - Students needing 1:1 never share an adult
   - Keep-apart pairs never share an adult
   - Trait-conflict rules marked hard are never broken
   - Nobody exceeds their group limit, and absent staff are never used
5. Among the legal schedules it finds, soft weights pick a nicer one:
   preferred adults, trained-tag matches, fewer adult changes, balanced groups.
6. **If no legal schedule exists, nothing is saved.** You get a report naming
   the block, the students and the rule that blocked it. AideFlow never prints
   or exports a roster that breaks a hard rule.


## Privacy

- Data is stored in this browser’s `localStorage` only.
- Use **Data → Export JSON backup** before clearing the browser or switching computers.
- Do not put this file on a shared public drive if it contains real student names.

---

## Tests

```bash
npm test
```

36 tests in `src/scheduler/solver.test.ts` cover:

- The demo classroom produces a complete legal schedule
- An overconstrained classroom returns **no** schedule, with reasons
- Keep-apart, trait conflicts, 1:1 and group limits are honored
- One adult is never placed in two rooms, or two overlapping blocks, at once
- A teacher who cannot leave the room is never sent out with a student
- Arrival and departure times decide who is present, including PM arrivals
- Backup schedules are built correctly when a staff member is out
- CSV import reads times as teachers write them, and reports unknown names
- An older saved classroom file is upgraded without losing data
