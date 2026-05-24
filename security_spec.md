# Security Specification & Test-Driven Design (TDD) for Firestore Rules

## 1. Data Invariants
- **PortfolioItem Integrity**: Any document inside `/portfolio/{itemId}` must have strict properties: `id` (string), `part` (string), `title` (string), `category` (string), `time` (string), `image` (string), `description` (string), `tags` (array of strings), and `subProjects` (array of maps).
- **Relational Identity / Ownership**: Only authenticated administrator users can perform create, update, and delete actions on `/portfolio/*` or `/image_overrides/*`.
- **Public Read Access**: Anonymous and authenticated public visitors have standard `read` (get, list) access to portfolio content to browse the web portfolio.
- **Timestamp Integrity**: Updates to a portfolio item must keep the structure valid and record changes chronologically.

---

## 2. The "Dirty Dozen" Malicious Payloads
The following payloads attempt to break Zero-Trust boundaries and must be blocked with `PERMISSION_DENIED`.

1. **Identity Spoofing - Portfolio Document Creation Without Auth**
   - Payload: Create `portfolio/graphic` representing a new project category.
   - Status: `request.auth == null`
   - Target Result: `PERMISSION_DENIED`

2. **Null-Bypass Write - Empty Identifier Image Overrides**
   - Payload: Create `/image_overrides/invalid_id` with empty URL values.
   - Target Result: `PERMISSION_DENIED`

3. **Value Poisoning - Injection of 2MB base64 string on arbitrary document fields**
   - Payload: Update `portfolio/space` with field `tags` set to a huge non-string array.
   - Target Result: `PERMISSION_DENIED`

4. **Shadow Update - Bypassing Allowed Properties on Portfolio**
   - Payload: Update `portfolio/space` including a shadow variable `{ isSystemVerified: true, hackerField: "injected" }`.
   - Target Result: `PERMISSION_DENIED`

5. **State Shortcut / Modification of Category Key**
   - Payload: Update `portfolio/graphic` attempting to modify its immutable `id` field.
   - Target Result: `PERMISSION_DENIED`

6. **ID Poisoning / Massive Junk String ID Injection**
   - Payload: Create `portfolio/` with document ID `this_is_a_very_long_poisons_string_id_designed_to_cause_resource_exhaustion_and_denial_of_wallet_attacks_xxxxxxxxxx...`
   - Target Result: `PERMISSION_DENIED`

7. **PII Blanket Leak - Read Private User Scopes as Guest**
   - Payload: Perform recursive scan on billing scopes or developer user subcollections.
   - Target Result: `PERMISSION_DENIED`

8. **Admin Claim Mocking**
   - Payload: Authenticate as guest and attempt to write role assignment claims to simulated directories.
   - Target Result: `PERMISSION_DENIED`

9. **Terminal State Lockdown Crack**
   - Payload: Perform post-completion write overriding finalized tags.
   - Target Result: `PERMISSION_DENIED`

10. **Array Injection Overdose**
    - Payload: Update `portfolio/graphic` with tags size exceeding maximum boundary limit.
    - Target Result: `PERMISSION_DENIED`

11. **Guest Delete Operation**
    - Payload: Send `deleteDoc` command from guest client on `/portfolio/video`.
    - Target Result: `PERMISSION_DENIED`

12. **Malformed Document Type Overrides**
    - Payload: Create `image_overrides/mapping_doc` where `uploadedUrl` is set to an array instead of a string.
    - Target Result: `PERMISSION_DENIED`

---

## 3. The Test Runner Spec
A mock test script mapping the assertions for standard Firestore simulator runners testing our production policy. All 12 test payloads listed above assert `assertFails()`.
