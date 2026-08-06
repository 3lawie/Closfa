import { describe, expect, it } from 'vitest'
import { createCommentValidation } from '../comment.validation'

describe('createCommentValidation', () => {
  it('rejects an empty comment body', () => {
    const result = createCommentValidation.safeParse({
      postId: 'post_1',
      comment: '',
    })

    expect(result.success).toBe(false)
  })

  it('accepts a valid text comment', () => {
    const result = createCommentValidation.safeParse({
      postId: 'post_1',
      comment: 'nice post',
      type: 'text',
    })

    expect(result.success).toBe(true)
  })
})
