import { describe, expect, it } from 'vitest'
import { createUniquePath } from './folder-compression'

describe('createUniquePath', () => {
  it('keeps every output when source extensions differ', () => {
    const paths = new Set<string>()

    expect(createUniquePath('foo-compressed.webp', paths)).toBe('foo-compressed.webp')
    expect(createUniquePath('foo-compressed.webp', paths)).toBe('foo-compressed-2.webp')
  })

  it('matches paths without case sensitivity', () => {
    const paths = new Set<string>()

    createUniquePath('foo-compressed.webp', paths)
    expect(createUniquePath('FOO-compressed.webp', paths)).toBe('FOO-compressed-2.webp')
  })

  it('only resolves conflicts in the same directory', () => {
    const paths = new Set<string>()

    expect(createUniquePath('a/foo-compressed.webp', paths)).toBe('a/foo-compressed.webp')
    expect(createUniquePath('b/foo-compressed.webp', paths)).toBe('b/foo-compressed.webp')
  })
})
