var fs = require('fs'),
    os = require('os'),
    path = require('path'),
    util = require('util'),
    child_process = require('child_process'),
	AWS = require('aws-sdk'),
	Promise = require("bluebird"),
	deploy = require('./deploy')
    ;

AWS.config.region = process.env.AWS_DEFAULT_REGION;

var cloudformation = new AWS.CloudFormation();

function describe_stack(stackName,cb) {
	var params = {
	  StackName: stackName,
	};
	cloudformation.describeStacks(params, function(err, data) {
	  if (err) {
	  	console.log(err, err.stack);
	  	return cb(err);
	  }
	  var stackData;
	  for(var i=0;i<data.Stacks.length;i++) {
	  	if(data.Stacks[i].StackName == stackName) {
	  		stackData = data.Stacks[i];
	  		break;
	  	}
	  }
	  console.log(util.inspect(stackData,false,null));
	  cb(null,stackData);
	});
}

function withEnvironmentParams(envName,cftemplate,argv,cb/*(err,paramArr)*/) {
	describe_stack(envName,function(err,envData) {
		if(err) return cb(err);
		var outputParameters = envData.Outputs;
		var inputParameters = cftemplate.Parameters;

		var copiedParameters = [];

		outputParameters.forEach(function(row) {
			if(inputParameters[row.OutputKey]) {
				copiedParameters.push({
					ParameterKey: row.OutputKey,
					ParameterValue: row.OutputValue,
				});
			}
		});
		copiedParameters.push({ParameterKey: 'Environment',ParameterValue: envName});
		copiedParameters.push({ParameterKey: 'BaseAmiId',ParameterValue: argv.ami});

		cb(null,copiedParameters);
	});			
}


function createStack(stackName,cftemplate,paramArr,cb) {
	var params = {
	  StackName: stackName,
	  Capabilities: ['CAPABILITY_IAM'],
	  TemplateBody: JSON.stringify(cftemplate),
	  Parameters: paramArr
	};
	cloudformation.createStack(params, function(err, data) {
	  if (err) {
	  	console.log(err, err.stack);
	  	return cb(err);
	  }
	  console.log("Cloudfront accepted request to create stack " + stackName);
	  console.log(util.inspect(data,false,null));
	  console.log("Use AWS console to monitor progress.")
	  cb();
	});
}

function readJSONsync(file) {
	var svcTemplateDoc = fs.readFileSync(file);
	var svcTemplate;
	try {
		svcTemplate = JSON.parse(svcTemplateDoc);
	} catch(err) {
		console.log("Fatal error parsing JSON doc: " + file,err);
		process.exit(1);
	}
	return svcTemplate;
}

function readTemplate(argv) {
	var fileName = argv.template;
	if(fileName.indexOf('.') === -1) fileName += '.template';
	return readJSONsync(fileName);
}

function create_env(argv) {
  	return new Promise(function (resolve, reject) {
		var cftemplate = readTemplate(argv);
		var envName = deploy.validateEnvironment(argv.env);
		paramArr = [
		    {ParameterKey: 'DBSnapshotIdentifier',ParameterValue: argv.dbsnap || ""},
		];
		if(argv.dbsnap) {
			paramArr.push({ParameterKey: 'DatabaseName',ParameterValue: ''});
		}
		createStack(envName,cftemplate,paramArr,function(err) {
			if(err) reject(err);
			resolve();
		});
	});
}


function create_svc(argv) {
  	return new Promise(function (resolve, reject) {
		var cftemplate = readTemplate(argv)
		var envName = deploy.validateEnvironment(argv.env);
		var svcName = path.basename(argv.template,path.extname(argv.template));
		if(argv.name) svcName = argv.name;
		var stackName = envName + svcName;

		withEnvironmentParams(envName,cftemplate,argv,function(err,paramArr) {
			if(err) reject(err);
			createStack(stackName,cftemplate,paramArr,function(err) {
				if(err) reject(err);
				resolve();
			});
		});
	});
}

function help(args) {
  console.log('gar-deploy <command> --env <env_name> [ more options ]');
  console.log('Commands:');
  console.log(' deploy    uploads app in current director to S3 and marks code as active version');
  console.log(' newenv    create new CloudFormation "environment stack"');
  console.log(' addstack  add another stack to CloudFormation "environment"');
  console.log('\nSome example command lines:\n');
  console.log('gar-deploy deploy --env mt');
  console.log('gar-deploy newenv --env mt --template cf/env');
  console.log('gar-deploy addstack --env mt --template cf/svc --ami ami-46bge72e');
  console.log('gar-deploy addstack --env mt --template cf/svc --ami ami-46bge72e --name nodefault');
  return Promise.resolve();
}


module.exports = {
  newenv: create_env,
  addstack: create_svc,
  help: help,
}

for(name in deploy) {
	if(name.indexOf('validate') === -1) {
		module.exports[name] = deploy[name];
	}
}

