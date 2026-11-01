// Loads the browser scripts into Node for testing tools.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
module.exports = function load(...names) {
  for (const n of names) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', n + '.js'), 'utf8'), { filename: n + '.js' });
  return globalThis;
};
