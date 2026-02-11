

# AYVO 7-Layer Cognitive Architecture - Clean Implementation

## Current State

The edge function `ai-free-chat` has ~860 lines in `index.ts` where all layers are mixed together. `analyzeCore.ts` exists as Layer 1 but the prompt needs hardening. There's no Layer 0 (input normalization), and Layers 2-6 are tangled in the main handler. `llm.ts` is a legacy duplicate that creates confusion.

## Architecture Overview

```text
USER MESSAGE
     |
     v
+---------------------------+
| LAYER 0: NORMALIZE        |  <-- NEW file: normalizer.ts
| - Clean text              |      Pure code, no LLM
| - Resolve relative dates  |
| - Extract time hints      |
+---------------------------+
     |
     v
+---------------------------+
| LAYER 1: ANALYZE (LLM)   |  <-- EXISTING: analyzeCore.ts
| - Segment multi-intent    |      Hardened prompt
| - Extract atomic items    |      max_tokens: 2500
| - JSON output only        |
+---------------------------+
     |
     v
+---------------------------+
| LAYER 2: VALIDATE         |  <-- Move from index.ts to validator.ts
| - Check missing fields    |      Pure code, no LLM
| - Flag incomplete items   |
+---------------------------+
     |
     v
+---------------------------+
| LAYER 3: CONFIRM          |  <-- Move from index.ts to confirmer.ts
| - Build confirmation msg  |      Template-based (no LLM)
| - Set pending actions     |
+---------------------------+
     |
     v
+---------------------------+
| LAYER 4: STATE MERGE      |  <-- EXISTING: state.ts
| - Safe merge, no overwrite|      Already correct
| - Anti-loop protection    |
+---------------------------+
     |
     v
+---------------------------+
| LAYER 5: EXECUTE          |  <-- EXISTING: executor.ts
| - CRUD operations         |      Already correct
| - Zero LLM               |
+---------------------------+
     |
     v
+---------------------------+
| LAYER 6: RESPOND          |  <-- NEW: responder.ts
| - Natural language reply  |      Template-based for now
| - Language-aware          |
+---------------------------+
```

## What Changes

### Phase 1: Harden Layer 1 (analyzeCore.ts) -- PRIORITY

This is the one thing that must work perfectly before anything else.

**Changes to `analyzeCore.ts`:**

1. Replace the system prompt with the hardened version:
   - Explicit negative examples ("DO NOT concatenate titles")
   - Explicit positive examples with expected output for 5+ test phrases
   - Stricter JSON schema enforcement
   - Remove ambiguous instructions
   - Add: "If a phrase implies a future action, it MUST produce an item. If it doesn't, the system is broken."

2. The hardened prompt will include these test cases IN the prompt:
   - "sabato spesa, domani lavoro alle 10 e dopodomani vado a sciare e spendo 50" -> 4 items
   - "domani lavoro, venerdi ho padel e sabato ho il dottore" -> 3 items (events)
   - "ciao" -> 0 items
   - "ricordami di comprare il latte" -> 1 item (task)

3. Keep fallback models as-is (already fixed: deepseek-r1-0528, deepseek-chat-v3-0324, gemini-2.0-flash)

### Phase 2: Add Layer 0 (normalizer.ts) -- NEW FILE

Create `supabase/functions/ai-free-chat/normalizer.ts`:

- `normalizeInput(rawMessage: string)` returns `{ normalizedText, timeHints, amountHints, isGreeting }`
- Detects greetings BEFORE calling the LLM (saves API calls)
- Normalizes comma decimals ("5,5" -> "5.5")
- Extracts temporal hints for the LLM context
- Does NOT interpret -- just cleans and hints

### Phase 3: Refactor index.ts -- SIMPLIFY

Reduce `index.ts` from 860 lines to ~200 lines. The main handler becomes:

```text
1. Auth check
2. UI Actions (bypass)
3. Cancel detection
4. Layer 0: normalize(message)
5. If greeting -> respond immediately (no LLM)
6. If pending action -> handle confirmation/slot-fill
7. Layer 1: analyze(normalizedMessage)
8. Layer 2: validate(analyzedItems)
9. Layer 3: confirm(validatedItems) -> set pending
10. Layer 6: respond(confirmation)
```

Move extracted code to:
- `validator.ts` -- validateAnalyzedItem, buildMissingFieldQuestion
- `confirmer.ts` -- analyzedItemToAction, buildConfirmation, setPendingActions
- `responder.ts` -- buildReply, getTranslatedReply, handleQueryIntent

### Phase 4: Remove legacy llm.ts dependency

The `llm.ts` module (`buildSystemPrompt` + `callOpenRouterAI`) is only used in ONE place: cancel-with-continuation fallback (line 404). Replace that with a simpler fallback to the deterministic router or analyzeCore. Then `llm.ts` becomes dead code and can be removed.

## What Does NOT Change

- `state.ts` (Layer 4) -- already correct
- `executor.ts` (Layer 5) -- already correct
- `parser.ts` -- utility functions, stays as-is
- `types.ts` -- stays as-is
- No UI changes
- No new features
- No premium logic
- No schema changes

## Files Modified/Created

| File | Action |
|------|--------|
| `analyzeCore.ts` | MODIFY -- hardened prompt with examples |
| `normalizer.ts` | CREATE -- Layer 0 input normalization |
| `validator.ts` | CREATE -- Layer 2 validation (extracted from index.ts) |
| `confirmer.ts` | CREATE -- Layer 3 confirmation (extracted from index.ts) |
| `responder.ts` | CREATE -- Layer 6 response (extracted from index.ts) |
| `index.ts` | MODIFY -- simplified to ~200 lines orchestrator |
| `llm.ts` | MODIFY -- remove dependency, mark for removal |

## Execution Order

1. First: harden `analyzeCore.ts` prompt and test with edge function logs
2. Then: create Layer 0 (`normalizer.ts`)
3. Then: extract Layers 2, 3, 6 into separate files
4. Then: simplify `index.ts`
5. Last: remove `llm.ts` dependency

## Success Criteria

The phrase "sabato spesa, domani lavoro alle 10 e dopodomani vado a sciare e spendo 50" must produce exactly 4 items:
1. task: "Spesa" (date: saturday)
2. event: "Lavoro" (date: tomorrow, time: 10:00)
3. event: "Sciare" (date: day after tomorrow)
4. expense: amount 50, category "sci"

No "How can I help you?" responses for actionable messages. No undefined values. No state loss.

