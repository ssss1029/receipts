var express = require('express');
var router = express.Router();
var debug = require('debug')('receipt:results');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');


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
			console.log(str);
		});
	}

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

module.exports = router;
