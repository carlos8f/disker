var prompt = require('cli-prompt')
  , spawn = require('child_process').spawn
  , volume = require('./volume')
  , path = require('./path')

module.exports = exports = {};

exports.path = path.join(__dirname, '..', 'bin', 'kafs');

exports.setup = function (cb) {
  if (!process.env.KAFS_KEYRING) process.env.KAFS_KEYRING = process.env.HOME
      ? path.join(process.env.HOME, '.kafs', '_keyring')
      : path.join(process.cwd(), '.kafs_keyring');

  if (!process.env.KAFS_VOLUME) process.env.KAFS_VOLUME = process.env.HOME
    ? path.join(process.env.HOME, '.kafs', 'default')
    : path.join(process.cwd(), '.kafs_volume');

  return function () {
    var args = arguments
      , opts = args[args.length - 1]

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
        volume.load(process.env.KAFS_VOLUME, {keyring: process.env.KAFS_KEYRING}, function (err, vol) {
          if (err && err.path && err.path.match(/keyring/)) {
            prompt("Looks like you haven't set up a keyring yet. Set one up now? (y) ", function (resp) {
              if (resp.match(/^(y.*|$)/i)) {
                var args = ['init', process.env.KAFS_KEYRING, '--keypair'];
                prompt('Encrypt keyring with password? (y): ', function (resp) {
                  if (resp.match(/^(y.*|$)/i)) args.push('--password');
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
          else if (err) return cb(err);
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
  if (opts.password) {
    (function reConfirm () {
      prompt.password('Create a password: ', function (password) {
        prompt.password('Confirm password: ', function (password2) {
          if (password !== password2) return reConfirm();
          opts.password = password;
          opts.keypair = true;
          doInit();
        });
      });
    })();
  }
  else doInit();

  function doInit () {
    volume.init(p || process.cwd(), opts, function (err, vol) {
      if (err) throw err;
      console.log('+', vol.id, vol.path());
    });
  }
};

exports.info = function (opts, cb) {
  console.log(JSON.stringify(opts.volume, null, 2));
};
