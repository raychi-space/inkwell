export function passwordValidation(
  current: string,
  next: string,
  confirmation: string,
): string | null {
  const bytes = (value: string) => new TextEncoder().encode(value).length
  if (!current || bytes(current) > 72) return '请输入当前密码，最多 72 个 UTF-8 字节。'
  if (!next.trim() || Array.from(next).length < 12 || bytes(next) > 72)
    return '新密码至少 12 个字符，最多 72 个 UTF-8 字节。'
  if (next !== confirmation) return '两次输入的新密码不一致。'
  if (current === next) return '新密码不能与当前密码相同。'
  return null
}
