# Attendance Management (Next.js)
npm install && npm run dev  → http://localhost:3000
Structure: lib/attendance.ts (processing), lib/pdf.ts (PDF), app/page.tsx (UI), app/globals.css (styles).
Data is stored in browser localStorage (see persist() in app/page.tsx) — swap for API routes + Prisma/PostgreSQL for multi-user storage.
