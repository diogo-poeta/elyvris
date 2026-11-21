const CHECKS = ['check-studio-code', 'check-studio-py', 'check-studio-gds', 'check-studio-ui'];
const LIMIT_S = 45;
const results = globalThis.ElyvrisCheckResults = [];
for (const name of CHECKS) {
  globalThis.ElyvrisCheckRunning = name;
  let timer;
  const limit = new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), LIMIT_S * 1000); });
  try {
    const outcome = await Promise.race([import(`./${name}.mjs?run=${Date.now()}`).then(module => ({ value: module.default })), limit]);
    if (outcome.timeout) results.push({ name, ok: false, timeout: true, detail: `did not finish within ${LIMIT_S} s` });
    else results.push({ name, ok: true, detail: typeof outcome.value === 'string' ? outcome.value : JSON.stringify(outcome.value) });
  } catch (error) {
    results.push({ name, ok: false, detail: String((error && error.message) || error) });
  }
  clearTimeout(timer);
}
globalThis.ElyvrisCheckRunning = null;
globalThis.ElyvrisCheckCount = CHECKS.length;
globalThis.ElyvrisChecksDone = true;
