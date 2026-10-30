# LOOPBACK — MVP 0.1

A local-first, installable Progressive Web App prototype.

## Features in this first version
- Capture notes, tasks, links, images/screenshots and voice transcriptions (where browser speech recognition is supported).
- Add a reminder date/time and mark an item important.
- Search and filter the inbox.
- Today, Upcoming, Inbox and Completed views.
- Complete, reopen and delete items.
- IndexedDB persistence on the current device.
- Export and import a JSON backup.
- Basic offline app shell using a service worker.
- Install prompt on supported browsers.

## Run locally
Service workers and PWA installation require localhost or HTTPS.

Option A — Python:
```bash
python3 -m http.server 8000
```
Then open http://localhost:8000

Option B — Node:
```bash
npx serve .
```

## Important MVP limitations
1. This version stores data only in the current browser/device. There is no cloud account or cross-device sync yet.
2. Browser notifications are checked while the app is open, focused, or reopened. They are not guaranteed at an exact time while the app is closed. Reliable scheduled notifications need a push/notification backend or native mobile implementation.
3. Voice transcription depends on browser support and may require network access or microphone permission. Safari/iOS support differs from Chromium browsers.
4. Images are stored locally. Keep images under 5 MB each; browser storage quotas vary.
5. Do not store highly sensitive documents or credentials in this prototype.

## Planned architecture for cloud sync
Keep the UI dependent on a repository interface, not directly on a cloud vendor:
- `LocalRepository`: IndexedDB source of truth and offline queue.
- `SyncEngine`: pushes local changes and pulls remote changes.
- `RemoteRepository`: authenticated API/database adapter.
- Each record should gain `ownerId`, `createdAt`, `updatedAt`, `deletedAt`, `syncStatus`, and a monotonically increasing revision.
- Use stable UUIDs and server-side authorization. Never expose service-role keys in client code.
- Conflict policy for the first cloud version: last-write-wins by `updatedAt`, with a recoverable conflict copy for edits made on two devices.

## Suggested production evolution
1. Validate capture and daily-return behavior with a small beta.
2. Add authentication and encrypted transport.
3. Add a managed database and sync API with row-level authorization.
4. Add reliable push notifications.
5. Wrap or rebuild for native Android/iOS distribution and add platform billing.
6. Add privacy policy, terms, account deletion and data export before public launch.
