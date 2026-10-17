import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const prepare = readFileSync(new URL('./v5-test-android-smoke.sh', import.meta.url), 'utf8').match(/<<'PY'\n([\s\S]*?)\nPY/)[1];
for (const [name, agp, kotlin, gradle, groovy, expected] of [
  ['minimum Kotlin DSL', '8.12.1', '2.2.0', '8.13', false, 0],
  ['minimum Groovy DSL', '8.12.1', '2.2.0', '8.13', true, 0],
  ['later toolchain', '8.14.0', '2.3.0', '8.14.3', false, 0],
  ['old AGP', '8.12.0', '2.2.0', '8.13', false, 1],
  ['old Kotlin', '8.12.1', '2.1.9', '8.13', false, 1],
  ['old Gradle', '8.12.1', '2.2.0', '8.12.1', false, 1],
  ['unknown plugin version', 'latest', '2.2.0', '8.13', false, 1],
]) {
  test(`actual Android prepare validates ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'aaraagate-android-toolchain-'));
    try {
      const android = join(root, 'android');
      mkdirSync(join(android, 'app'), { recursive: true });
      mkdirSync(join(android, 'gradle', 'wrapper'), { recursive: true });
      const declaration = (id, value) => groovy ? `id '${id}' version '${value}' apply false` : `id("${id}") version "${value}" apply false`;
      writeFileSync(join(android, groovy ? 'settings.gradle' : 'settings.gradle.kts'), `${declaration('com.android.application', agp)}\n${declaration('org.jetbrains.kotlin.android', kotlin)}\n`);
      writeFileSync(join(android, 'gradle', 'wrapper', 'gradle-wrapper.properties'), `distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradle}-all.zip\n`);
      const file = join(android, 'app', groovy ? 'build.gradle' : 'build.gradle.kts');
      writeFileSync(file, 'compileSdk = flutter.compileSdkVersion\nminSdk = flutter.minSdkVersion\ntargetSdk = flutter.targetSdkVersion\n');
      const result = spawnSync('python3', ['-c', prepare, root], { encoding: 'utf8' });
      assert.equal(result.status, expected, result.stdout + result.stderr);
      if (expected === 0) {
        assert.equal(readFileSync(file, 'utf8').trimEnd(), 'compileSdk = 36\nminSdk = 24\ntargetSdk = 36');
      } else {
        assert.match(result.stderr, /minimum|explicit .* version required/);
        assert.match(readFileSync(file, 'utf8'), /flutter\.compileSdkVersion/);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
