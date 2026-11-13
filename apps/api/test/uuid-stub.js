// uuid v12+ is ESM-only; Jest runs CommonJS, so tests use a stand-in for v7().
const { randomUUID } = require('crypto');
module.exports = { v7: () => randomUUID(), v4: () => randomUUID() };
