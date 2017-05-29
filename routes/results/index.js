var express = require('express');
var router = express.Router();
var debug = require('debug')('receipt:results');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');
var WritableStream = require('stream').Writable;



/* Post from the form on /process */
router.post('/', function(req, res, next) {
	if (req.busboy) {
		debug("BusBoy detected");
		req.busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
			debug("fieldname: " + fieldname);
			debug("file: " + file);
			debug("filename: " + filename);
			debug("encoding: " + encoding);
			debug("mimetype: " + mimetype);

			var savedFileName = "uploads/" + filename;
			
			file.pipe(fs.createWriteStream(savedFileName));

			var fileContents = "";

			file.on('data', function(buffer) {
				fileContents += buffer.toString('base64');
			});

			file.on('end', function() {
		    	debug('File [' + fieldname + '] Finished');
		    	processFile(filename, req, res, next);
		    });
		});
	}
});

function processFile(savedFileName, req, res, next) {
	sendToGoogle(savedFileName, req, res, next);
	res.render('results', {dataReceived : savedFileName});
}


function sendToGoogle(savedFileName, req, res, next) {

	function callback(response) {
		var str = '';

		// Save it into a file to debug
		response.pipe(fs.createWriteStream("uploads/" + savedFileName + ".json"));

		//another chunk of data has been recieved, so append it to `str`
		response.on('data', function (chunk) {
			str += chunk;
		});

		//the whole response has been recieved, so we just print it out here
		response.on('end', function () {
			debug("Data Received from Google. Beginning Processing.");
			processResponse(str);
		});
	}

	// If i dont wanna send to google for testing purpouses

	var body = {
		"requests":[{
			"image":{
				"content": fs.readFileSync( "uploads\\" + savedFileName, 'base64')
			},
			
			"features":[{
				"type":"TEXT_DETECTION",
				"maxResults":1
			}]
		}]
	}

	body = JSON.stringify(body);

	var options = {
		method: 'POST',
		host: 'vision.googleapis.com',
		path: '/v1/images:annotate?key=' + process.env.VISION_API_KEY,
		headers: {
			'Content-Type' : "application/json",
			'Content-Length' : Buffer.byteLength(body)
		}
	};

	var request = https.request(options, callback);
	request.write(body);
}

/**
 * Takes in the string of data from Google and analyzes it
 * See /uploads for exmaple return data from google
 **/
function processResponse(str) {
	var data = JSON.parse(str);
	
	// We only use this portion of the return from google
	// Need to figure out how to tell google to not send us the 
	// rest of it
	var textAnnotations = data.responses.textAnnotations;

	for (var i = 0; i < textAnnotations.length; i++) {

	}

	return str;
}

class Line {
	constructor() {
		// Make an empty line
	}

	// Array has to be an array of nodes
	constructor(array) {

	}
}

// A block is one of the basic building blocks that google gives back

class TextBlock {
	
}

class PriceBlock {
	
}

// Is a test endpoint to see what we can do using the data that was
// received from a particular file (safeway_08_06_10.jpg)
router.get('/testUsing-safeway_08_06_10-contents', function(req, res, next) {
	res.render('results', { 
		dataReceived : processResponse(fs.readFileSync("uploads/safeway_08_06_10.jpg.json"))
	});
});

module.exports = router;
