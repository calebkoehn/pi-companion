---
description: "Run through the quality checklist before delivering any feature or fix — data flow tracing, middleware checks, type boundaries, mutation testing, and schema alignment"
argument-hint: "[feature or file to check]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# Quality Checklist

Run through this checklist before delivering any feature or fix. Every item comes from a real bug that shipped to production.

## Before Writing Code

### Trace the Full Data Flow
For every feature, trace the request path end-to-end:
1. **Frontend** → What does `apiRequest` send? What headers, body, method?
2. **Middleware** → What middleware does the request pass through? (CSRF content-type check, `isAuthenticated`, `requireRole`)
3. **Route handler** → What Zod schema validates the body? Does it match the actual shape being sent?
4. **Storage layer** → What types does the storage interface expect?
5. **Database** → What column types store the data? (`jsonb`, `text`, `serial`, etc.)
6. **Response** → What shape does the API return? Does the frontend type match?

### Identify All Middleware in the Path
This project has a CSRF content-type middleware (`server/index.ts`) that rejects non-GET API requests without `Content-Type: application/json` or `application/x-www-form-urlencoded`. The frontend `apiRequest()` now always sends `Content-Type: application/json` for non-GET requests, but be aware of:
- Any new HTTP client code that bypasses `apiRequest`
- Webhook endpoints that receive external requests (exempted via `/api/webhooks/*`)
- SSE/streaming endpoints that may need special handling

## While Writing Code

### Fix Root Causes, Not Symptoms
When you find a bug pattern, fix it globally:
- **Bad**: Add a CSRF exemption for one endpoint → same bug appears on the next endpoint
- **Good**: Fix `apiRequest` to always send headers → all endpoints covered

### Type Boundaries Are Where Bugs Hide
Every time data crosses a boundary, types can silently change:
- **AI responses** → The AI model may return objects/arrays where you expect strings. Always validate and coerce. Use `ensureString()` or equivalent.
- **JSONB columns** → PostgreSQL jsonb stores structured data. Zod schemas validating this data must accept the actual shapes (e.g., `z.record(z.unknown())` not `z.record(z.string())` if the record contains mixed types like citations arrays).
- **URL params** → Always strings from the router. Parse to numbers with `parseInt()` when needed.
- **Query key → URL mapping** → TanStack Query's default fetcher joins query key segments with `/`. Verify `queryKey: ["/api/reviews", id]` produces the correct URL.

### Paginated Endpoints
`/api/employees`, `/api/meetings`, `/api/reviews`, `/api/insights` all return `{ data, total, limit, offset }`. Never use `useQuery<Employee[]>` with the default fetcher — always use `fetchPaginated<T>()` or extract `.data`.

## After Writing Code

### Test All Mutations, Not Just Reads
Most bugs in this project occurred on mutations (POST, PATCH, DELETE), not on page loads. After implementing a feature:
1. Test every button/action on the page, not just that the page renders
2. Specifically test: save, submit, delete, revert, sync — any action that sends a non-GET request
3. Check the network response status codes, not just whether the page loads

### Check for the Same Bug Class Everywhere
When you fix a bug, immediately search for the same pattern across the codebase:
```
# Example: After finding a bodiless POST issue, check all bodiless POSTs
grep -n 'apiRequest("POST"' client/src/ -r | grep -v ', {'
```

### Verify Schema Alignment
After any change to a Zod validation schema, API response shape, or database column:
1. Check that the frontend TypeScript interface matches the API response
2. Check that the Zod schema accepts all valid data shapes (including nested objects, arrays, nulls)
3. Check that the storage interface types align with the Drizzle schema

## Project-Specific Patterns to Remember

### Session & Auth
- `getBaseUrl()` in `server/utils.ts` resolves: `CUSTOM_DOMAIN` → `REPLIT_DOMAINS` → `REPLIT_DEV_DOMAIN`
- `/api/auth/user` has `Cache-Control: no-store` to prevent stale 304s
- Google Sign-In callback: `/api/google/callback`; Google Calendar callback: `/api/google/calendar/callback`
- Google Sign-In auto-verifies email (`emailVerified: true`) for both new and existing users

### Error Handling
- `ErrorBoundary` wraps `AuthenticatedRouter` in `App.tsx` — prevents white screens from rendering crashes
- Always render data defensively: `typeof val === "string" ? val : JSON.stringify(val)` for values that might be objects
- The AI service (`server/ai.ts`) uses `ensureString()` to coerce all review content fields

### Common Mistakes to Avoid
- Don't assume API responses are flat arrays — check if they're paginated `{ data, total, limit, offset }`
- Don't use `z.record(z.string())` for JSONB content that contains mixed types
- Don't forget that HR admin access checks need company verification (`verifyMeetingCompany`, `verifyEmployeeCompany`, `verifyReviewCompany`)
- Don't hardcode redirect URIs — always use `getBaseUrl()`

### Security
Before delivering any new route or feature, also run through the `/security-checklist` command. Key checks: every route has `isAuthenticated`, every resource access verifies company ownership, all user-provided URLs use `safeUrlSchema`, and error responses never leak internal details.
