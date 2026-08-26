import { describe, it, expect } from 'vitest'
import PocketBase from 'pocketbase'
import pb from '../client'

describe('PocketBase client bootstrap & validation', () => {
  it('1. Cliente default exportado é uma instância válida do PocketBase', () => {
    expect(pb).toBeInstanceOf(PocketBase)
    expect(pb.baseUrl).toBeDefined()
  })
})
