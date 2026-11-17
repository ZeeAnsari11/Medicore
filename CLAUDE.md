# Working rules

## Tests
- Do not create temporary or probe test files to explore behavior. Read the code to find out how it works.
- Only add real, permanent tests.
- If you need to run tests, run only the relevant spec file, not the whole suite, until the final check.

# Mobile parity rule
- The Android app lives at /Users/mac-16/Desktop/MedicoreApp and uses this same API and database.
- Any feature added or changed in apps/web or apps/api must also be added or changed in the Android app, and the Android repo's docs/FEATURE_PARITY.md (/Users/mac-16/Desktop/MedicoreApp/docs/FEATURE_PARITY.md) updated. Don't break existing API contracts: installed Android builds can't be force-updated.
- Keep @medicore/shared-types the single source for types, and tell me whenever an API change requires an Android update (e.g. new required fields in a DTO).

## Known API bugs (2026-11-17; delete each when fixed)
- Partial PATCH wipes fields: `Object.assign(doc, dto)` copies the DTO's undefined fields. `PATCH /platform/plans/:id` (apps/api/src/modules/plans/plans.service.ts:32) and `PATCH /permissions/:id` (apps/api/src/modules/permissions/permissions.service.ts:61) return 500 when a required field is omitted and silently clear omitted optional fields (plan maxUsers -> null, permission description). Fix as in customers.service.ts (apply only defined fields) with a spec. The Android live suite asserts a partial permission PATCH fails; update that test when fixing.
