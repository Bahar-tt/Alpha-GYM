# Deploy State (synced 2026-11-07)

This repository was synced from the LIVE server state on 2026-11-07.

## Runtime facts
- VPS: 78.157.51.176, nginx serves /var/www/alphagym/frontend (HTTPS alphaagym.ir)
- API: pm2 process named alphagym-api (runs as root), backend /var/www/alphagym/backend, port 3001
- Backend server.js = 200249 bytes (live) - previously repo had the 2026-10-26 version (171093 bytes)

## Backend changes committed in this sync (from live)
- New modules: personnelAttendance.js, staffAttendance.js, backup.js, import_members.js
- Updated: routes/{accounting,attendanceScan,coreApi,receipts,system}.js,
  services/{coachEarnings,cronManager,eventService,excelExport,smsService}.js,
  server_parts/{p00,p01}.js, utils/date.js and top-level helpers

## Frontend (dist artifact)
- The exact LIVE frontend bundle was deployed from an external build machine on
  Nov 6-7 2026 (modern login + coach portal + unified SMS + scanner + personnel).
- Its source tree is NOT on this server. The deployed artifact is preserved in
  releases/frontend-live-20261107/:
  - assets/index-DrE0iEfM.js (md5 98bedebcd167379cabe3800d9fedd033)
  - assets/index-3tVARCpe.css (md5 ce1315ea3a2f21e218a356ca897b8d29)

## Known divergence (topic for future cleanup)
- The LIVE bundle (index-DrE0iEfM.js, deployed Nov 7) was built from a source
  tree that is NOT on this server; the closest source available is the Nov 5
  release snapshot at /var/www/alphagym-release-48034d0 (== e369c09 == df615f2,
  all three identical, dist index-Do-KK75l.js).
- In the follow-up commit the freshest found source (Nov 5 release) was synced
  into src/ (9 files: AuthContext, Accounting, Coaches, CoachPortal, Members,
  Messaging, Renewals, Users, services/api.ts).
- Therefore src/ may still lag the deployed bundle slightly (Nov 6-7 dist-only
  patches: modern login tweaks, login coach fix, whitefix, coaches fix).
  Locate the true Nov-7 build source before the next full rebuild; otherwise
  rebuilding from src/ can partially regress those Nov 6-7 UI changes.

## Backups on server
- Repo backup before this sync: /var/backups/alpha-gym/repo-before-sync-20261107_120208.tar.gz
- Multiple frontend-before-* dir backups exist in /var/www/alphagym/
