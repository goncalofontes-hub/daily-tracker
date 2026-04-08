# Daily Tracker

A personal mobile-first Progressive Web App (PWA) for daily health and habit tracking.

## Features

- **Daily checklist** — checkboxes, text fields, and blood pressure sessions
- **Blood pressure tracking** — up to 2 sessions per day, each with 3 readings (systolic / diastolic / heart rate) and a timestamp
- **Steps counter** — log your daily step count
- **Weekly weight** — appears only on Saturdays
- **History** — browse past days with a date range filter, see completion per day
- **Analytics** — habit completion rates, steps stats, average tension (morning vs evening), weight history
- **Customizable** — add, edit, reorder, or delete any item; supports checkbox, text, and blood pressure types; daily or weekly scheduling
- **Data backup** — export and import your data as JSON
- **Offline support** — works without internet once loaded (service worker)
- **Installable** — add to home screen on Android via Chrome for a native app feel

## Default items

| Item | Type | Schedule |
|---|---|---|
| Supplementation | Checkbox | Daily |
| Fasting | Checkbox | Daily |
| Treadmill walking | Checkbox | Daily |
| Night walk | Checkbox | Daily |
| 3L of water | Checkbox | Daily |
| Tension | Blood Pressure | Daily |
| Steps | Text | Daily |
| Weight | Text | Saturdays only |

## How to use on Android

1. Deploy to any HTTPS host (GitHub Pages, Netlify, Vercel, etc.)
2. Open in Chrome on your Android phone
3. Tap the browser menu → **Add to Home Screen**
4. The app will behave like a native app and work offline

## Local development

No build step required. Just serve the folder with any static HTTP server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Data

All data is stored locally in the browser's `localStorage`. Use **Settings → Export Data** to back up your data as a JSON file, and **Import Data** to restore it.
