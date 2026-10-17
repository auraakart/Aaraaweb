// Declaration checks complement the package manager's resolved peer checks.
// Keep these floors forward-compatible within the reviewed toolchain majors.
export function dependencyCompatibilityErrors(root, admin, api) {
  const errors = [];
  const version = (value) => /^\^?(\d+)\.(\d+)\.(\d+)$/.exec(value ?? '')?.slice(1).map(Number);
  const atLeast = (actual, floor) => {
    for (let i = 0; i < floor.length; i += 1) {
      if (actual[i] !== floor[i]) return actual[i] > floor[i];
    }
    return true;
  };
  const runtime = /^>=(\d+) <(\d+)$/.exec(root.engines?.node ?? '');
  if (!runtime || Number(runtime[2]) !== Number(runtime[1]) + 1) errors.push('Declare one supported Node runtime major.');
  for (const [name, pkg] of [['Admin', admin], ['API', api]]) {
    const types = version(pkg.devDependencies?.['@types/node']);
    if (!types || !runtime || types[0] !== Number(runtime[1])) errors.push(`${name} Node types must match the supported runtime major.`);
    for (const [dependency, floor] of [['eslint', [10, 11, 0]], ['typescript-eslint', [8, 71, 0]]]) {
      const actual = version(pkg.devDependencies?.[dependency]);
      if (!actual || actual[0] !== floor[0] || !atLeast(actual, floor)) errors.push(`${name} ${dependency} must meet its reviewed major and minimum version.`);
      if (admin.devDependencies?.[dependency] !== api.devDependencies?.[dependency]) errors.push(`${dependency} declarations must match across Admin and API.`);
    }
  }
  const react = version(admin.dependencies?.react);
  if (!react || admin.dependencies?.react !== admin.dependencies?.['react-dom']) errors.push('React and React DOM declarations must match.');
  for (const dependency of ['@types/react', '@types/react-dom']) {
    const types = version(admin.devDependencies?.[dependency]);
    if (!react || !types || types[0] !== react[0]) errors.push(`${dependency} must match the React runtime major.`);
  }
  return [...new Set(errors)];
}
