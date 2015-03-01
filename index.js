#! /usr/bin/env node

var commands = require('./cfwrapper')
var argv = require('yargs').argv

var func = commands[argv._[0]];
if (typeof func == 'function') {
  try {
    func(argv)
      .then(function() { 
      	process.exit(0); 
      })
      .catch(function(error) { 
      	console.log(error.stack); 
      	process.exit(1); 
      })
  } catch (error) {
    console.log(error.stack); 
    process.exit(1);
  }
} else {
  console.log("Unknown command: " +  argv._[0]);
  console.log("Must be one of: " + Object.keys(commands).filter(function(item) { return item !== '__esModule' }).join(","));
}
