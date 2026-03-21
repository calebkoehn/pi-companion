---
description: "Run through the project security checklist — auth, multi-tenant isolation, input validation, error handling, sessions, rate limiting, XSS, CORS, and audit logging"
argument-hint: "[route, feature, or file to audit]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# Security Checklist

Run through this checklist whenever adding or modifying routes, features, or data access patterns. Every rule comes from a real vulnerability found and fixed in this project.

## 1. Authentication — Every Route Must Be Gated

Every API endpoint MUST have `isAuthenticated` middleware. No exceptions.

```typescript
// CORRECT
app.get("/api/things", isAuthenticated, async (req, res) => { ... });

// WRONG — publicly accessible, anyone can call it
app.get("/api/things", async (req, res) => { ... });
```

**Where to import:** In `server/routes.ts`, it's already imported from `./replit_integrations/auth`. In integration route files under `server/replit_integrations/*/routes.ts`, import from `../auth/replitAuth`.

**Role checks:** Use `requireRole("manager", "hr_admin")` after `isAuthenticated` for restricted endpoints. Note: `requireRole` defaults `null` role to `"manager"`.

## 2. Multi-Tenant Isolation — Every Resource Must Be Company-Scoped

Any route that accesses a resource by ID MUST verify it belongs to the requesting user's company.

### Pattern for single-resource routes (GET/PATCH/DELETE by :id):
```typescript
const user = await storage.getUser(req.session.userId);
const companyName = getCompanyName(user, res);
if (!companyName) return; // getCompanyName sends 400 if null
if (resource.companyName && resource.companyName !== companyName) {
  return res.status(403).json({ message: "Forbidden" });
}
```

### Pattern for list routes:
Always filter by `companyName` or by `managerId` chain. Never return unscoped data.

### Verification helpers available:
- `verifyEmployeeCompany(employee, user)` — checks employee's manager's company
- `verifyMeetingCompany(meeting, user)` — checks meeting's manager's company
- `verifyReviewCompany(review, user)` — checks review's manager's company

### Common mistake:
```typescript
// WRONG — bypassed if either value is null
if (resource.companyName && user?.companyName && resource.companyName !== user.companyName)

// CORRECT — use getCompanyName which handles null safely
const companyName = getCompanyName(user, res);
if (!companyName) return;
if (resource.companyName && resource.companyName !== companyName) { ... }
```

## 3. Input Validation — Validate and Sanitize All User Input

### Zod schemas:
- Every POST/PATCH endpoint MUST validate `req.body` with a Zod schema
- Always `.omit()` auto-generated fields: `id`, `createdAt`, `updatedAt`
- Never pass `req.body` directly to storage — always use parsed output

### URL validation:
Any user-provided URL MUST use `safeUrlSchema` (defined in `server/routes.ts`):
```typescript
const safeUrlSchema = z.string().url().refine(
  (url) => { try { const u = new URL(url); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } },
  { message: "URL must use http or https protocol" }
);
```

### Frontend URL rendering:
Before rendering any user-provided URL as a clickable link, check the protocol:
```tsx
{url && /^https?:\/\//i.test(url) && (
  <a href={url} target="_blank" rel="noopener noreferrer">...</a>
)}
```

## 4. Error Responses — Never Leak Internal Details

```typescript
// WRONG — leaks stack traces, DB table names, library errors
res.status(500).json({ message: error.message });

// CORRECT — generic message to client, full error logged server-side
console.error("Error doing X:", error);
res.status(500).json({ message: "Failed to process request" });
```

### Authentication errors:
Always return the same generic message regardless of whether the account exists, is locked, or the password is wrong:
```typescript
res.status(401).json({ message: "Invalid email or password" });
```

## 5. Session & Login Security

### New login paths:
Any code that creates a session (sets `req.session.userId`) MUST also set `lastActivity`:
```typescript
req.session.userId = user.id;
req.session.lastActivity = Date.now();
```

### User objects in responses:
Always use `sanitizeUser()` before returning user data. This strips `passwordHash`, `failedLoginAttempts`, and `lockedUntil`.

### Password handling:
- Never log passwords or password hashes
- Always hash with bcrypt (12 rounds) before storing
- Password policy: 8+ chars, upper, lower, number, special character

## 6. Rate Limiting

| Endpoint Type | Limiter | Limit |
|---|---|---|
| General API | `generalLimiter` | 100/min |
| Auth (login, signup, Google) | `authLimiter` | 10/min |
| Email-sending (verification, invitations) | `authLimiter` | 10/min |
| AI processing (insights, review gen) | `aiLimiter` | 5/min |

Any new endpoint that sends emails, processes payments, or handles authentication MUST use `authLimiter`, not the general limiter.

## 7. XSS Prevention

- React JSX auto-escapes user data — this is your primary defense
- Never use `dangerouslySetInnerHTML` with user-controlled content
- The `MarkdownContent` component uses `react-markdown` without `rehype-raw` — do NOT add `rehype-raw`
- URLs in `href` attributes are the main XSS vector — always validate protocol (see section 3)

## 8. CORS & Headers

- CORS is configured in `server/index.ts` to allow only Replit domains
- CSP is enabled via Helmet — if adding new external resources (scripts, fonts, APIs), update the CSP directives
- If adding a new external service, add its domain to the appropriate CSP directive (`scriptSrc`, `connectSrc`, `imgSrc`, etc.)

## 9. Audit Logging

Security-sensitive actions MUST be audit-logged:
```typescript
await logAudit(userId, "action_name", "resource_type", resourceId, "details", companyName);
```

Actions that require logging: login, logout, failed login, role changes, data deletion, review status changes, bulk operations.
