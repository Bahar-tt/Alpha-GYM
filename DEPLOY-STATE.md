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
- repo src/ (Oct 26) does NOT match the deployed bundle's source. Before the
  next frontend deployment, the freshest source tree must be located and added
  to the repo; otherwise rebuilding from src/ will LOSE Nov 6-7 UI changes.

## Backups on server
- Repo backup before this sync: /var/backups/alpha-gym/repo-before-sync-20261107_120208.tar.gz
- Multiple frontend-before-* dir backups exist in /var/www/alphagym/
