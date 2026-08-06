# Good and Bad Tests

## Good Tests

Test through the real exported interface, not mocks of internal parts.

```typescript
// GOOD: tests the validation seam's observable behavior
test('createCommentValidation rejects an empty comment body', () => {
  const result = createCommentValidation.safeParse({ postId: 'post_1', comment: '' })
  expect(result.success).toBe(false)
})
```

Characteristics:

- Tests behavior callers care about (what a server function or schema accepts/returns)
- Uses the public export only — no reaching into private helpers
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests** — coupled to internal structure:

```typescript
// BAD: asserts on an internal call instead of the outcome
test('createComment calls db.insert', async () => {
  const spy = vi.spyOn(db, 'insert')
  await createComment(input, session)
  expect(spy).toHaveBeenCalled()
})
```

Red flags:

- Mocking your own internal collaborators (not a real system boundary)
- Asserting on call counts/order instead of the result
- Test breaks when refactoring without a behavior change
- Verifying through a side channel instead of the interface:

```typescript
// BAD: bypasses the interface, reaches into the DB to verify
test('createComment persists the comment', async () => {
  await createComment(input, session)
  const row = await db.select().from(comments).where(eq(comments.id, input.id))
  expect(row).toBeDefined()
})

// GOOD: verifies through the interface the caller actually uses
test('createComment makes the comment retrievable', async () => {
  const created = await createComment(input, session)
  expect(created.ok).toBe(true)
})
```

**Tautological tests** — the expected value restates the implementation:

```typescript
// BAD: expected value computed the same way the code computes it
test('validation trims and re-checks length', () => {
  const input = '  hello  '
  const expected = input.trim().length
  expect(normalize(input).length).toBe(expected)
})

// GOOD: expected value is an independent, known literal
test('normalize trims surrounding whitespace', () => {
  expect(normalize('  hello  ')).toBe('hello')
})
```
