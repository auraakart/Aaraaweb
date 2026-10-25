/** Forward-compatible release floors for historical regression contracts. */
export function releaseAtLeast(value, major, minor, patch = 0) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return false;
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) return false;
  const minimum = [major, minor, patch];
  for (let index = 0; index < 3; index++) {
    if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
  }
  return true;
}
