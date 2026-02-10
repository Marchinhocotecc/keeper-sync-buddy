
# Fix AYVO Cognitive Pipeline - Analyze Core 400 Error

## Problem Diagnosis

The pipeline structure (ANALYZE -> VALIDATE -> EXECUTE -> RESPOND) is already wired correctly in `index.ts`. The `analyzeMessage()` function IS called for every message. However, **every single call fails with a 400 error from OpenRouter**, causing:

- All messages fall back to the deterministic router (regex-based)
- Simple greetings work (matched by regex), but complex multi-intent messages like "sabato spesa, domani lavoro alle 10..." are treated as SMALL_TALK
- The `ANALYZE OUTPUT` log shows empty results with "Analysis failed - API error" every time

The root cause is in `analyzeCore.ts`:
1. The model `deepseek/deepseek-r1-0528:free` may be temporarily down or rate-limited
2. The error response body is never logged (only the status code), so we're debugging blind
3. There is no fallback model when the primary model fails
4. The `llm.ts` module (used for the legacy path) uses the exact same model but logs the error body -- the legacy path also fails silently

## Plan (3 changes, all in edge function)

### 1. Fix `analyzeCore.ts` - Log error body + fallback model + robust request

**What changes:**
- Log the actual response body when the API returns 400 (to understand WHY it fails)
- Add a fallback model chain: try `deepseek/deepseek-r1-0528:free` first, if it fails try `deepseek/deepseek-chat:free`, then `deepseek/deepseek-r1:free`
- Add `response_format` hint if supported
- Reduce the system prompt size slightly (the prompt is 3000+ chars which may hit free-tier limits on some providers)

### 2. Fix `index.ts` - Handle analyze failure gracefully with deterministic fallback

**What changes:**
- When analyze returns 0 items AND has "API error" in uncertainties, fall through to the deterministic router for ALL patterns (not just greetings/queries) before giving up
- This ensures the app still works while the LLM issue is resolved

### 3. Redeploy and test

After the fix, verify with the test phrase that either:
- The LLM call succeeds and returns 3-4 items, OR
- The error body is logged so we can diagnose and fix the exact cause

## Technical Details

### File: `supabase/functions/ai-free-chat/analyzeCore.ts`

Changes:
- Line ~265-267: When `!response.ok`, read and log the response body:
```typescript
const errorBody = await response.text();
console.error(`[ANALYZE-CORE] API error: ${response.status}, body: ${errorBody.substring(0, 500)}`);
```
- Add fallback model logic: if first model returns 400/404, retry with alternative model
- Use `deepseek/deepseek-r1:free` as the default (the currently correct free model name per OpenRouter docs), not `deepseek/deepseek-r1-0528:free`

### File: `supabase/functions/ai-free-chat/llm.ts`

Change the `DEFAULT_MODEL` constant from `"deepseek/deepseek-r1-0528:free"` to `"deepseek/deepseek-r1:free"` to match the current OpenRouter naming.

### File: `supabase/functions/ai-free-chat/index.ts`

No structural changes needed -- the pipeline is already correct. Minor improvement: when analyze fails with API error, try the deterministic router for creation patterns too (not just greetings/queries).

## What this does NOT change

- No UI changes
- No new features
- No premium logic
- No schema changes
- The pipeline architecture stays exactly as-is

## Expected outcome

After this fix:
- The 400 error will be diagnosed (error body logged)
- The model name will be corrected to the currently available free model
- The test phrase "sabato spesa, domani lavoro alle 10 e dopodomani vado a sciare e spendo 50" will produce 3-4 structured items from ANALYZE
