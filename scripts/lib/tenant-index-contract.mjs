// Prisma primary and unique keys already supply an index; avoid redundant ones.
export function hasSocietyLeadingKey(body) {
  const declarations = body.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  return /@@(?:index|unique|id)\s*\(\s*\[\s*societyId\b/.test(declarations)
    || /^\s*societyId\s+String\??[^\n]*\s@(?:id|unique)\b/m.test(declarations);
}
