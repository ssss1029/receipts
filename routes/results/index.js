var express = require('express');
var router = express.Router();
var debug = require('debug')('receipt:results');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');
var WritableStream = require('stream').Writable;

/**
 * Current implementation is inefficient because im piping to save to the server 
 * and then re-reading the saved file and sending that to google.
 * 
 * When i try to save and send the file simultaneously, something goes wrong with the 
 * encoding, idk what is wrong yet. 
 */

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

	var imageTopY = textAnnotations[0].boundingPoly.vertices[0].y;
	var imageBottomY = textAnnotations[0].boundingPoly.vertices[2].y;
	var imageLeftX = textAnnotations[0].boundingPoly.vertices[0].x;
	var imageRightX = textAnnotations[0].boundingPoly.vertices[2].x;

	var imageWidth = imageRightX - imageLeftX;
	var imageHeight = imageBottomY - imageTopY;

	var arrayOfLines = new Array();

	// Skip the first block (was for the entire image)
	// Make the Image();
	var previousMidY;
	var bufferWidth;
	var currLine; // Array of Block objects, not a Line object
	var lineList = new Array();
	for (var i = 1; i < textAnnotations.length; i++) {
		let unprocessedBlock = textAnnotations[i];
		let currString = unprocessedBlock.description;
		let blockTopY = unprocessedBlock.vertices[0].y;
		let blockLeftX = unprocessedBlock.vertices[0].x;
		let blockRightX = unprocessedBlock.vertices[2].x;
		let blockBottomY = unprocessedBlock.vertices[2].y;

		// Averages
		let blockMidX = (blockLeftX + blockRightX) / 2;
		let blockMidY = (blockTopY + blockBottomY) / 2;

		// W&H
		let blockWidth = blockRightX - blockLeftX;
		let blockHeight = blockBottomY = blockTopY;

		var block = new Block(currString, blockMidX, blockMidY, blockTopY, blockBottomY, blockLeftX, blockRightX, blockWidth, blockHeight);

		// Just starting out
		if (previousMidY == undefined) {
			currLine.push(block);
			previousMidY = blockMidY;
			bufferWidth = blockHeight / 2;
		} else {
			// Add current Line to lineList if that Line is finished, and make a new Line with the current Block
			// Otherwise, add the current Block to the lineList
			if (block.midY < previousMidY + bufferWidth && block.midY > previousMidY - bufferWidth ) {
				// line is not finished
				currLine.push(block);
				previousMidY = blockMidY;
				bufferWidth = blockHeight / 2;
			} else {
				var completedLine = new Line(currLine);
				lineList.push(completedLine);
				currLine = new Array();
				currLine.push(block);
				previousMidY = blockMidY;
				bufferWidth = blockHeight / 2;
			}
		}
	}

	var image = new Image(lineList, imageTopY, imageBottomY, imageLeftX, imageRightX);

	return image.toString();
}

class Image {
	constructor(arrayOfLines, topY, bottomY, leftX, rightX) {
		this._arrayOfLines = arrayOfLines;
		this._topY = topY;
		this._bottomY = bottomY;
		this._leftX = leftX;
		this._rightX = rightX;
	}

	// mainly for testing purpouses
	toString() {
		var returnString = "";
		for (var l = 0; l < this._arrayOfLines.length; l++) {
			returnString += "New Line: ";
			for (var b = 0; b < this._arrayOfLines[l]._arrayOfBlocks.length; b++) {
				returnString += this._arrayOfLines[l]._arrayOfBlocks[b]._contents + " ";
			}

			returnString += "\n";
		}

		return returnString;
	}
}

class Line {
	constructor(arrayOfBlocks) {
		this._arrayOfBlocks = arrayOfBlocks;
	}
}

// A block is one of the basic building blocks that google gives back

class Block {
	 constructor(contentString, midX, midY, topY, bottomY, leftX, rightX, width, height) {
		 this._contents = contentString;
		 this._midX = midX;
		 this._midY = midY;
		 this._topY = topY;
		 this._bottomY = bottomY;
		 this._leftX = leftX;
		 this._rightX = rightX;
		 this._height = height;
	 }
}

class TextBlock extends Block{
	// Will implement later	
}

class PriceBlock extends Block{
	// Will implement later
}

// Is a test endpoint to see what we can do using the data that was
// received from a particular file (safeway_08_06_10.jpg)
router.get('/testUsing-safeway_08_06_10-contents', function(req, res, next) {
	res.render('results', { 
		dataReceived : processResponse(fs.readFileSync("uploads/safeway_08_06_10.jpg.json"))
	});
});

module.exports = router;
