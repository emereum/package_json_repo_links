// Smoke check: the bundled extension must load in plain Node with 'vscode'
// stubbed, and export activate/deactivate. Catches bundling failures such as
// unresolved runtime require() calls left behind by UMD dependencies.
const Module = require('node:module');
const path = require('node:path');

const vscodeStub = {
  DocumentLink: class {
    constructor(range, target) {
      this.range = range;
      this.target = target;
    }
  },
  Range: class {},
  Uri: { parse: (value) => value },
  workspace: {},
  languages: {},
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.call(this, request, ...rest);
};

const bundlePath = path.resolve(__dirname, '../dist/extension.js');
const extension = require(bundlePath);

if (typeof extension.activate !== 'function' || typeof extension.deactivate !== 'function') {
  console.error('Bundle loaded but does not export activate/deactivate.');
  process.exit(1);
}
console.log('Bundle check OK: dist/extension.js loads and exports activate/deactivate.');
