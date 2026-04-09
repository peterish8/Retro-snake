# Retro Snake Arcade

A modernization of the classic Snake arcade game, upgraded into a competitive global experience using React, Vite, and Convex.

## Features
- **Global High Scores:** Real-time synced global top-10 leaderboard powered by a Convex backend database. 
- **Retro Sound Engine:** Built-in Web Audio API synthesizer for completely dynamic 8-bit arcade SFX alongside custom meme audio limits for wall crashes!
- **Dual Audio Controls:** Precise and completely decoupled toggles for silencing background music/effects and UI synthesizers independently.
- **Responsive Layout:** Automatically scaling Neo-Brutalist green CRT terminal aesthetic, engineered specifically to prevent horizontal text overflow and screen clipping on strictly narrow mobile devices. 
- **Swipe Support:** Full-window touch tracking to let players play single-handed on any phone.

## Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start the Convex backend (Terminal 1)
npx convex dev

# 3. Start the Frontend (Terminal 2)
npm run dev
```
