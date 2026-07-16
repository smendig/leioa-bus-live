const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function createAesCbcCipher(keyText: string, ivText: string) {
  const keyBytes = textEncoder.encode(keyText)
  const iv = textEncoder.encode(ivText)

  if (![16, 24, 32].includes(keyBytes.byteLength)) {
    throw new Error('AES key must contain 16, 24, or 32 UTF-8 bytes')
  }
  if (iv.byteLength !== 16) {
    throw new Error('AES-CBC initialization vector must contain 16 UTF-8 bytes')
  }

  const keyPromise = crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, [
    'encrypt',
    'decrypt',
  ])

  return {
    ivBase64: bytesToBase64(iv),

    async encrypt(plainText: string): Promise<string> {
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        await keyPromise,
        textEncoder.encode(plainText),
      )
      return bytesToBase64(new Uint8Array(encrypted))
    },

    async decrypt(encryptedBase64: string): Promise<string> {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        await keyPromise,
        base64ToBytes(encryptedBase64),
      )
      return textDecoder.decode(decrypted)
    },
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)).buffer
}
