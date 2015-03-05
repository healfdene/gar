# gar

"Get and Run"

This is a command line tool, written in node.js, to deploy applications to AWS CloudFormation stacks. 

Use "npm install" to pull the dependencies from the package.json file, the "npm link" set it up as a command line tool.

This is designed to deploy server apps written in node.js, to an AWS CloudFormation stacks. Example CF templates are in the cf directory. These templates would need to be edited to match your actual AWS account.

The base-ami directory contains a "packer.io" packer.json file that can create an pre-baked AMI appropriate for use with this tool. The current base-ami assumes that you use PaperTrailApp.com and NewRelic.com in your EC2 instances. Again, the base-ami scripts would have to be edited to match your actual accounts.

The purpose of this repo is to provide example code for command line tools that use AWS CloudFormation. It will not run "out of the box" because it depends on the user setting up accounts on AWS and other services.

This repos was use for demo at the AWS loft. Here is the slide deck that was used:

https://docs.google.com/a/kixeye.com/presentation/d/1d42OeyFnsbiRF7aHOJ-iYdXkJj0GxR1dc1q730m7TIc/edit#slide=id.p
