var fs = require('fs'),
    os = require('os'),
    path = require('path'),
    validateApplication,
    child_process = require('child_process')
    ;

var foreverMonitor = require('forever-monitor'),
    rimraf = require('rimraf'),
    AWS = require('aws-sdk'),
    Promise = require('bluebird'),
    _ = require('lodash')
    ;

var s3 = new AWS.S3();
var cf = new AWS.CloudFormation();
var ec = new AWS.ElastiCache();
var md = new AWS.MetadataService({ httpOptions: { timeout: 5000 } });

var BUCKET_SUFFIX = '.yourdomain.com';
var packageJson = JSON.parse(fs.existsSync('package.json') ? fs.readFileSync('package.json', 'utf8') : '{}');

var refreshLastModifiedTime = null;
var monitor;

function validateEnvironment(env) {
  if (env == null || /^[a-zA-z]\w*$/.test(env) === false)
    throw new Error('Illegal environment name: ' + env);
  return env;
}

function validateApplication(app) {
  if (app == null || /^[a-zA-z][\w-]*$/.test(app) === false)
    throw new Error('Illegal application name: ' + app);
  return app;
}

function createBucket(bucketName) {
  return new Promise(function(resolve, reject) {
    console.log('Checking existence of s3://' + bucketName + '...')
    s3.headBucket({ Bucket:bucketName }, function(err, data) {
      if (err) {
        console.log('Creating s3://' + bucketName + '...');
        s3.createBucket({ Bucket:bucketName }, function(err,data) {
          if (err)
            reject(err);
          else
            resolve(bucketName);
          });
      } else {
        resolve(bucketName);
      }
    });
  });
}

function spawn(command, args, options) {
  return new Promise(function(resolve, reject) {
    console.log('Executing \'' + command + ' ' + args.join(' ') + '\'...');
    var cp = child_process.spawn(command, args, options);

    cp.stdout.on('data', function (data) {
        process.stdout.write(data);
    });

    cp.stderr.on('data', function (data) {
        process.stderr.write(data);
    });

    cp.on('exit', function (code) {
      if (code === 0)
        resolve();
      else
        reject(new Error(command + ' exited with code ' + code));
    });
  });
}

function uploadFile(bucketName, file) {
  return new Promise(function (resolve, reject) {
    var name, body;
    if (typeof file == 'string')
    {
      name = file;
      body = fs.createReadStream(file);
    }
    else
    {
      name = file.name;
      body = file.contents;
    }
    console.log('Uploading ' + name + ' to s3://' + bucketName + '/' + path.basename(name) + '...')
    s3.putObject({ Bucket:bucketName, Key:path.basename(name), Body:body }, function(err) {
        if (err)
          reject(err);
        else
          resolve();
    });
  });
}

function openS3Stream(bucketName, file) {
  console.log('Downloading s3://' + bucketName + '/' + path.basename(file) + '...')
  return s3.getObject({ Bucket: bucketName, Key: file }).createReadStream();
}

function readStream(readable) {
  return new Promise(function(resolve, reject) {
    var body = "";
    readable.setEncoding('utf8');
    readable.on('data', function(chunk) {
      body += chunk;
    });
    readable.on('error',function(err) {
      reject(err);
    });
    readable.on('end', function() {
      resolve(body);
    });
  });
}

function saveStream(readable, file) {
  var writable = fs.createWriteStream(file);
  readable.pipe(writable);
  return new Promise(function(resolve, reject) {
    readable.on('error',function(err) {
      reject(err);
    });
    readable.on('end', function() {
      resolve();
    });
  });
}

function npm() {
  var args = [];
  args.push.apply(args, arguments);
  var options = args[args.length - 1];
  if (typeof options !== 'object')
    options = null;
  else
    args.pop();
  return spawn((os.platform() == 'win32') ? 'npm.cmd' : 'npm', args, options);
}

function tarExtract(tar, folder) {
  var cwd = process.cwd();
  return spawn('tar', [ 'xf', tar, '-C', folder, '--strip', '1' ])
    .then(function() {
      process.chdir(cwd);
    })
}

function mkdir(path) {
  console.log('Creating directory \'' + path + '\'...');
  return Promise.promisify(fs.mkdir)(path)
    .catch(function(e) {
      if (e.code != 'EEXIST' && e.code != 'ENOENT')
        throw e;
    })
}

function rename(oldPath, newPath) {
  console.log('Renaming \'' + oldPath + '\' to \'' + newPath + '\'...');
  return Promise.promisify(fs.rename)(oldPath, newPath);
}

function unlink(path) {
  console.log('Unlinking file \'' + path + '\'...');
  return Promise.promisify(fs.unlink)(path)
    .catch(function(e) {
      if (e.code != 'ENOENT')
        throw e;
    })
}

function rmdir(path) {
  console.log('Removing directory \'' + path + '\'...');
  return Promise.promisify(rimraf)(path)
}

function symbolicLink(target, alias) {
  console.log('Removing link \'' + alias + '\'...');
  return Promise.promisify(fs.unlink)(alias)
    .catch(function(e) {
      if (e.code != 'ENOENT')
        throw e;
    })
    .then(function() {
      spawn('ln', [ '-s', target, alias ]);
    });
}

function requestMetadata(path) {
  return new Promise(function(resolve, reject) {
    md.request(path, function(err, data) {
      if (err)
        reject(err);
      else
        resolve(data);
    });
  });
}

function requestUserData(config) {
  console.log('Requesting user data...');
  return requestMetadata('/latest/user-data')
    .then(function(data) {
      data.split('\n').forEach(function(line) {
        if (line.charAt(0) != '#') {
          var tokens = line.split('=');
          if (tokens[0] && tokens[1]) {
            config[tokens[0]] = tokens[1];
          }
        }
      });
      return config;
    })
    .catch(function(e) {
      return config;
    })
}

function requestPlacement(config) {
  console.log('Requesting placement metadata...');
  return requestMetadata('/latest/meta-data/placement/availability-zone')
    .then(function(data) {
      config.AWS_REGION = data.substr(0,data.length-1);
      return config;
    })
    .catch(function(e) {
      return config;
    })
}

function getElastiCacheConfiguration(config) {
  console.log('Retrieving ElastiCache configuration...');

  return new Promise(function(resolve, reject) {
    if (config.REPLICATION_GROUP_ID) {
      //get the Redis connection info from the replication group
      ec.describeReplicationGroups({ ReplicationGroupId:config.REPLICATION_GROUP_ID }, function(err,data) {
        if (err)
          reject(err);
        else
        {
          var endpoint = data.ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint;
          config.REDIS_HOST = endpoint.Address;
          config.REDIS_PORT = endpoint.Port;
          resolve(config);
        }
      });
    } else if (config.CACHE_CLUSTER_ID) {
      //get the Redis connection info from the single node cluster directly
      ec.describeCacheClusters({ ShowCacheNodeInfo:true, CacheClusterId:config.CACHE_CLUSTER_ID }, function(err, data) {
        if (err)
          reject(err);
        else
        {
          var endpoint = data.CacheClusters[0].CacheNodes[0].Endpoint;
          config.REDIS_HOST = endpoint.Address;
          config.REDIS_PORT = endpoint.Port;
          resolve(config);
        }
      });
    }
    else
      resolve(config);
  });
}

function upload(args) {
  var env = validateEnvironment(args['env']);
  var bucketName = env + BUCKET_SUFFIX;

  return npm('install')
    .then(function() {
      return unlink(packageJson.name + '-' + packageJson.version + '.tgz');
    })
    .then(function() {
      return npm('pack');
    })
    .then(function() {
      return createBucket(bucketName);
    })
    .then(function() {
      return uploadFile(bucketName, packageJson.name + '-' + packageJson.version + '.tgz');
    })
}

function deploy(args) {
  var env = validateEnvironment(args['env']);
  var bucketName = env + BUCKET_SUFFIX;

  return upload(args)
    .then(function() {
      return uploadFile(bucketName, { name:packageJson.name + '.txt', contents: packageJson.version });
    });
}

function install(args) {
  var env = validateEnvironment(args['env']);
  var app = validateApplication(args['app']);
  var bucketName = env + BUCKET_SUFFIX;
  var version;
  var installFolder;
  var packageFile;

  return getLastModifiedTime(bucketName, app + '.txt')
    .then(function(lastModifiedTime) {
      installFolder = path.resolve('' + lastModifiedTime);
      packageFile = path.resolve(installFolder, 'package.tgz');
      return rmdir(installFolder);
    }).then(function() {
      return mkdir(installFolder);
    })
    .then(function() {
      return readStream(openS3Stream(bucketName, app + '.txt'))
    })
    .then(function(v) {
      version = v;
      return saveStream(openS3Stream(bucketName, app + '-' + version + '.tgz'), path.resolve(installFolder, packageFile));
    })
    .then(function() {
      return npm('install', packageFile, { cwd:installFolder });
    })
    .then(function() {
      return rename(path.resolve(installFolder, 'node_modules'), path.resolve(installFolder, 'package'))
    })
}

function sleep(intervalMS) {
  return new Promise(function(resolve) {
    setTimeout(resolve, intervalMS);
  })
}

function getLastModifiedTime(bucketName, file) {
  return new Promise(function(resolve, reject) {
    // console.log('Checking last modified time on s3://' + bucketName + '/' + file + '...');
    s3.listObjects({ Bucket: bucketName, Prefix: file }, function(err, data) {
      if (err) {
        reject(err);
      } else if (data.Contents && data.Contents[0]) {
        var date = new Date(data.Contents[0].LastModified);

        // 20150227-012345-123
        var dateFormatted = date.getUTCFullYear() +
          _.padLeft(date.getUTCMonth() + 1, 2, '0') +
          _.padLeft(date.getUTCDate(), 2, '0') +
          '-' + _.padLeft(date.getUTCHours(), 2, '0') +
          _.padLeft(date.getUTCMinutes(), 2, '0') +
          _.padLeft(date.getUTCSeconds(), 2, '0') +
          (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5)
          ;

        resolve(dateFormatted);
      } else {
        console.log("Refresh time not found in bucket, using default of -1");
        resolve(-1);
      }
    });
  });
}

function repeatEvery(intervalMS, fn) {
  var wrapper = function() {
    fn();
    setTimeout(wrapper, intervalMS);
  }
  wrapper();
}

function start(installFolder, app, config) {
  console.log('Starting with env:');
  var log_config = JSON.parse(JSON.stringify(config));
  delete log_config.DB_PASSWORD;
  console.dir(log_config);

  var options = {
    'silent': false,            // Silences the output from stdout and stderr in the parent process
    'max': 3,                   // Sets the maximum number of times a given script should run
    'killTree': false,          // Kills the entire child process tree on `exit`

    'minUptime': 2000,          // Minimum time a child process has to be up. Forever will 'exit' otherwise.
    'spinSleepTime': 1000,      // Interval between restarts if a child is spinning (i.e. alive < minUptime).

    'args': [],
    'sourceDir': path.resolve(installFolder, 'package', app),

    'env': config,
    'cwd': path.resolve(installFolder, 'package', app)
  };
  monitor = new (foreverMonitor.Monitor)('index.js', options);

  monitor.on('error', function (err) {
    console.log('GaR: forever.Monitor emitted an error: ');
    console.dir(err);
  });

  monitor.on('exit', function () {
    console.log('GaR: forever.Monitor has exited.');
  });

  monitor.start();
}

function stop() {
  console.log('Stopping...')
  // shut down old app -- should free up ports
  if (monitor)
    monitor.stop();
  // delay 1000 ms to allow ports to free up
  return sleep(1000);
}

function forever(args) {
  var env = validateEnvironment(args['env']);
  var app = validateApplication(args['app']);
  var bucketName = env + BUCKET_SUFFIX;
  var config = { };

  requestUserData(config)
  .then(function() {
    return requestPlacement(config);
  })
  .then(function() {
    return getElastiCacheConfiguration(config);
  })
  .then(function() {
    var installFolder;

    repeatEvery(15000, function() {
      getLastModifiedTime(bucketName, app + '.txt')
        .then(function(lastModifiedTime) {
          if (lastModifiedTime == refreshLastModifiedTime) {
            const err = new Error('No update to apply.');
            err.name = "no_update";
            throw err;
          }

          console.log('Update available at ' + lastModifiedTime);
          installFolder = path.resolve('' + lastModifiedTime);
          refreshLastModifiedTime = lastModifiedTime;
          return install(args);
        })
        .then(function() {
          return stop();
        })
        .then(function() {
          return start(installFolder, app, config);
        })
        .catch(function(e) {
          if(e.name != "no_update")
            console.log(e.message);
        })
    });

  });

  // never terminate
  return new Promise(function() { });
}

module.exports = {

// These 4 take --env, and get app from package.json
  upload: upload,  // sends code to S3
  deploy: deploy,  // upload +  marks as active version

// these two take --app <packagename from package.json>
  install: install, // run in ec2 instance, download and put in place
  forever: forever, // install + run with restart

  validateEnvironment: validateEnvironment,
  validateApplication: validateApplication
}
