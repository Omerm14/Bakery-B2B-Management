// OTP generation/hashing helpers shared by send-customer-otp and
// verify-customer-otp. Codes are never stored in plaintext — only a
// peppered SHA-256 hash, so a database read alone can't reveal a valid
// code.

export function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

export async function hashOtpCode(code: string): Promise<string> {
  const pepper = Deno.env.get('OTP_PEPPER') || ''
  const data = new TextEncoder().encode(code + pepper)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  return (await hashOtpCode(code)) === hash
}
