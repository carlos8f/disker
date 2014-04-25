var prompt = require('cli-prompt')
  , spawn = require('child_process').spawn
  , kafs = require('./kafs')
  , path = require('path')
  , rimraf = require('rimraf')
  , fs = require('graceful-fs')

module.exports = exports = {};

exports.path = path.join(__dirname, '..', 'bin', 'kafs');

exports.setup = function (cb) {
  return function () {
    var args = arguments
      , opts = args[args.length - 1]

    if (opts.parent && typeof opts.parent.volume === 'string') process.env.KAFS_VOLUME = opts.parent.volume;
    if (opts.parent && typeof opts.parent.keyring === 'string') process.env.KAFS_KEYRING = opts.parent.keyring;

    if (!process.env.KAFS_KEYRING) process.env.KAFS_KEYRING = process.env.HOME
        ? path.join(process.env.HOME, '.kafs', '_keyring')
        : path.join(process.cwd(), '.kafs_keyring');

    if (!process.env.KAFS_VOLUME) process.env.KAFS_VOLUME = process.env.HOME
      ? path.join(process.env.HOME, '.kafs', 'default')
      : path.join(process.cwd(), '.kafs_volume');

    switch (opts._name) {
      case 'init':
        // init a new volume
        action();
        break;
      case 'add-key': case 'check-key':
        // check keys volume
        process.env.KAFS_VOLUME = process.env.KAFS_KEYRING;
      default:
        // load volume
        kafs(process.env.KAFS_VOLUME, {keyring: process.env.KAFS_KEYRING}, function (err, vol) {
          if (err && err.path && err.path.match(/keyring/)) {
            prompt("Looks like you haven't set up a keyring yet. Set one up now? (y) ", function (resp) {
              if (resp.match(/^(y.*|$)/i)) {
                var args = ['init', process.env.KAFS_KEYRING, '--keypair'];
                prompt('Encrypt keyring with passphrase? (y): ', function (resp) {
                  if (resp.match(/^(y.*|$)/i)) args.push('--passphrase');
                  spawn(exports.path, args, {stdio: 'inherit'})
                    .on('exit', function () {
                      spawn(exports.path, ['init', process.env.KAFS_VOLUME], {stdio: 'inherit'});
                    });
                });
              }
              else action();
            });
            return;
          }
          else if (err) {
            console.error('Error reading volume: ' + err.message);
            process.exit(1);
          }
          opts.volume = vol;
          action();
        });
    }

    function action () {
      cb.apply(null, args);
    }
  };
}

exports.init = function (p, opts, cb) {
  if (opts.passphrase) {
    (function reConfirm () {
      prompt.password('Create a passphrase: ', function (passphrase) {
        prompt.password('Confirm passphrase: ', function (passphrase2) {
          if (passphrase !== passphrase2) return reConfirm();
          opts.passphrase = passphrase;
          opts.keypair = true;
          doInit();
        });
      });
    })();
  }
  else doInit();

  function doInit () {
    kafs.init(p || process.cwd(), opts, cb);
  }
};

exports.info = function (opts, cb) {
  cb(null, opts.volume);
};

exports.mount = function (dest, opts, cb) {
  opts.volume.keyring.crypto.initPrivate(function (err) {
    if (err) return cb(err);
    opts.volume.mount(dest, opts, function (err, s) {
      if (err) return cb(err);
      s.on('+', function (stat) {
        if (stat.type === 'file') console.log('+', stat.path);
      });
      s.on('-', function (stat) {
        if (stat.type === 'file') console.log('-', stat.path);
      });
      process.on('SIGTERM', s.unmount);
      process.on('SIGINT', s.unmount);
      process.on('exit', s.unmount);
      cb();
    });
  });
};
