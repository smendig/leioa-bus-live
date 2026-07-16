import { describe, expect, it } from 'vitest'

import { createAesCbcCipher } from './aes'

describe('AES-CBC compatibility', () => {
  it('matches the previous CryptoJS ciphertext and decrypts it', async () => {
    const cipher = createAesCbcCipher('1234567890123456', '6543210987654321')
    const encrypted = await cipher.encrypt('{"hello":"Leioa"}')

    expect(encrypted).toBe('o1YW0mTaCzQHMiSE3m4TH5jFyfPzxLCKWqdd05IWL78=')
    await expect(cipher.decrypt(encrypted)).resolves.toBe('{"hello":"Leioa"}')
    expect(cipher.ivBase64).toBe('NjU0MzIxMDk4NzY1NDMyMQ==')
  })
})
