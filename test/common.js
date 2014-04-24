assert = require('assert');
kafs = require('../');
debug = function (pattern) {
  pattern || (pattern = '*');
  require('debug').enable(pattern);
  process.env.DEBUG = pattern;
};
