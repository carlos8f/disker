var path = require('path')
  , meta = require('../meta')
  , EventEmitter = require('events').EventEmitter

var load = module.exports = function (p, opts, cb, keyring) {
  var debug = require('debug')('kafs:volume:load');
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  opts || (opts = {});

  if (typeof opts.keyring === 'string' && !keyring) {
    // load keyring volume
    debug('loading keyring', opts.keyring);
    load(opts.keyring, function (err, vol) {
      if (err) return cb(err);
      load(p, opts, cb, vol);
    });
    return;
  }
  debug('load', p);

  meta.read(path.join(p, 'kafs'), function (err, volume) {
    if (err) return cb(err);
    debug('read meta', volume);
    if (!volume) return cb(new Error('volume info could not be loaded'));

    volume.volPath = p;
    volume.metaPath = path.join(p, 'kafs');

    // if this volume has a keypair, and no keyring is specified, use itself
    // as the keyring.
    if (!keyring && !opts.keyring && volume.pubkey) keyring = volume;
    if (keyring) volume.keyring = keyring;

    // methods
    [
      'crypto',
      'export',
      'fs',
      'import',
      'journal',
      'mount',
      'path',
      'read',
      'readdir',
      'stat',
      'toJSON',
      'unlink',
      'write'
    ].forEach(function (method) {
      volume[method] = require('./' + method).bind(volume);
      if (method === 'crypto' || method === 'fs') {
        volume[method] = volume[method]();
      }
    });

    // make it an event emitter
    volume.__proto__ = EventEmitter.prototype;
    EventEmitter.call(volume);

    debug('returning volume', volume);
    cb(null, volume);
  });
};
