export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}
