# MLB Streak Tracker

A GitHub Pages website that shows current MLB hit streaks and home run streaks.

## Setup
1. Upload all files to a new GitHub repo.
2. Go to **Settings > Pages**.
3. Set source to **Deploy from branch** and choose `main` / root.
4. Go to **Actions** and run **Update MLB streak data** once.

The site loads `data/streaks.json`. If it has not been generated yet, it shows `data/sample.json`.

## Sources
- Hit streaks: Baseball Musings Current Hit Streaks page.
- Home run streaks: calculated from MLB Stats API game logs.
