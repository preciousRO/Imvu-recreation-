# Loft

A classic 3D avatar chat in the spirit of the old desktop IMVU client (the pre 2018 era): make an avatar, dress it up from a
shop with credits, walk into chat rooms, click a spot to sit next to people, chat, whisper, dance, decorate your own room,
add friends, send messages and post on the Pulse.

## Run it

```
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/
npm run build:artifact # same, with the 3D models packed into JSON for hosts that only serve data files
```

## Backend

The app runs out of the box in **local mode**: accounts live in the browser that created them and rooms show only you and the
room's regulars. To get real accounts, friends, inbox and real people in rooms, point it at a Supabase project of its own:

1. Create a Supabase project and run the two migrations in `supabase/migrations/` (schema and functions first, then the item seed).
2. Build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the publishable key) set.

Everything in the database is reached through security definer functions keyed by a session token, so the publishable key
exposes nothing directly. Rooms use Realtime channels for presence, movement, seats, chat and voice signalling.

## Graphics

The renderer runs a full post processing chain on top of physically based materials: multisample anti aliasing, ground truth
ambient occlusion, bloom, vignette and grain, SMAA and filmic tone mapping, with depth of field at Ultra. Shadows are variance
soft shadows. Skin has a light sheen and a faint clearcoat, eyes a wet clearcoat, hair anisotropic highlights, cloth a soft sheen,
furniture is rounded with fabric sheen or leather clearcoat, floors carry normal maps and the glossy ones are true mirrors, windows
and screens are area lights, the club has moving spotlights, the rooftop string lights, the beach a physical sky and animated water.
Quality (Auto, Ultra, High, Low) is in the top bar; Auto picks from the device. Low turns the post chain off for phones.

Honest note: this is as far as a browser engine and the available models go. Film quality humans need scanned heads, strand hair
and 4K textures from a team of artists; the models here are mid detail, so the result is a clear step up, not a GTA 6 frame.

## What is where

- `src/avatar.js` avatars assembled from swappable parts on one skeleton, skin, hair and outfit recolouring, face and body
  sculpting sliders (morph targets), procedural hairstyles, animations, the sit pose and profile photos.
- `src/rooms.js` procedural furniture with seats, public rooms (Lounge, Club, Rooftop, Beach, Cafe) and My Room templates.
- `src/chatroom.js` a room session: seats and poses, chat with bubbles, whispers, actions, regulars, decorating.
- `src/net.js` room presence and broadcast, lobby counts, WebRTC voice.
- `src/app.js` the client: login, home, chat rooms, shop with try on, dress up, friends, inbox, pulse, profiles.
- `src/backend.js` one interface, two implementations (Supabase and local).
- `src/catalog.js` the shop catalogue and prices (also seeded server side).
- `tools/` the asset pipeline (split source avatars, prepare animations, bake morph targets, pack models).

## Credits

Avatar models are Ready Player Me avatars from public open source example repositories (three.js examples and Wawa Sensei
tutorials). Animations come from the Ready Player Me animation library. Ready Player Me's hosted service closed on
31 January 2026, so the models are bundled here.
