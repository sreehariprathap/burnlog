// lib/username.selftest.ts
export {};

async function main() {
  const { generateUsername, isValidUsername } = await import('./username');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  const u1 = generateUsername('Sree');
  assert(/^[a-z0-9]+_[a-z0-9]{4}$/.test(u1), `generated username matches slug_suffix shape (got "${u1}")`);
  assert(u1.startsWith('sree_'), `slug preserves lowercased first name (got "${u1}")`);

  const u2 = generateUsername('Sree');
  assert(u1 !== u2, 'two calls produce different suffixes (random collision extremely unlikely)');

  const u3 = generateUsername("O'Brien-Smith 2nd");
  assert(/^[a-z0-9]+_[a-z0-9]{4}$/.test(u3), `non-alphanumeric characters are stripped (got "${u3}")`);

  const u4 = generateUsername('');
  assert(u4.startsWith('user_'), `empty first name falls back to "user" (got "${u4}")`);

  assert(isValidUsername('sree_x7k2') === true, 'valid username accepted');
  assert(isValidUsername('ab') === false, 'too short is rejected');
  assert(isValidUsername('a'.repeat(21)) === false, 'too long is rejected');
  assert(isValidUsername('Sree_X7k2') === false, 'uppercase is rejected');
  assert(isValidUsername('sree x7k2') === false, 'spaces are rejected');
  assert(isValidUsername('sree.x7k2') === false, 'dots are rejected');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll username assertions passed');
}

main();
