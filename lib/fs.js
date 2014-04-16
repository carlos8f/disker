var fs = require('graceful-fs')
  , stringify = require('json-stable-stringify')

Object.keys(fs).forEach(function (k) {
  module.exports[k] = exports[k] = fs[k];
});

exports.mkdirp = require('mkdirp');
exports.rimraf = require('rimraf');
