# MINE

MINE is a private, two-person PWA built with React, TypeScript, Vite, Tailwind, and Firebase.

## Phase 1 includes
- Firebase-ready app setup
- login and registration
- pairing code creation and join flow
- private-space ownership
- basic real-time chat
- mobile-first MINE branding
- offline banner and installable PWA settings

## Quick start
1. Open the project folder in a terminal.
2. Copy `.env.example` to `.env` and fill in your Firebase values.
   Use the Web App configuration from the existing Firebase project. Do not add a service-account key.
3. In that same Firebase project, publish the rules from `firestore.rules` to the existing `(default)` Firestore database.
   Pairing codes are looked up by exact document ID in `pairingCodes`; authenticated users cannot list codes or private spaces.
4. Run:

```bash
npm install
npm run dev -- --host 0.0.0.0
```

The app uses Firebase Authentication, Cloud Firestore, and real-time Firestore listeners. Firebase Storage is not initialized.

## Important
This project is intentionally set up for a private two-person app. Firebase rules are included in `firestore.rules` and `storage.rules`.
