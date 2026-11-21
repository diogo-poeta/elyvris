const assert = require('node:assert/strict');
const test = require('node:test');
const optics = require('../grid-optics.js');
const coating = require('../grid-coating.js');
const reference = require('./fixtures/grid-optics-reference.json');
const buildChecks = require('./grid-optics-checks.js');

for (const [name, run] of buildChecks({ optics, coating, reference, assert })) test(name, run);
