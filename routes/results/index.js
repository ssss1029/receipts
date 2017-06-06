var express = require('express');
var router = express.Router();
var debug = require('debug')('receipt:results');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');
var WritableStream = require('stream').Writable;

/**
 * The stores that we support so far
 */
var allowed_stores = ["safeway"];

/**
 * Current implementation is inefficient because im piping to save to the server 
 * and then re-reading the saved file and sending that to google.
 * 
 * When i try to save and send the file simultaneously, something goes wrong with the 
 * encoding, idk what is wrong yet. 
 */

/* Post from the form on /process */
router.post('/', function(req, res, next) {
	debug("beginning processing");
	if (req.busboy) {
		req.busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {

			var savedFileName = "uploads/" + filename;
			
			file.pipe(fs.createWriteStream(savedFileName));

			var fileContents = "";

			file.on('data', function(buffer) {
				fileContents += buffer.toString('base64');
			});

			file.on('end', function() {
				debug("Done saving file on our server.");
		    	processFile(filename, req, res, next);
		    });
		});
	}
});

function processFile(savedFileName, req, res, next) {
	sendToGoogle(savedFileName, req, res, next);
	res.render('results', {dataReceived : savedFileName});
}

/**
 * On end of the HTTP request, calls processResponse(str) with str = the JSON object
 * returned from Google
 */
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

	var imageFileContents = fs.readFileSync( "uploads\\" + savedFileName, 'base64');

	debug("Done reading file from our server");

	var body = {
		"requests":[{
			"image":{
				"content": imageFileContents
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
 * 
 * Creates an Image Object from the given String (str)
 * Calls the appropriate processImage function
 **/
function processResponse(str) {
	var data = JSON.parse(str);
	
	
	// We only use this portion of the return from google
	// Need to figure out how to tell google to not send us the 
	// rest of it
	var textAnnotations = data.responses[0].textAnnotations;

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
	var currLine = new Array(); // Array of Block objects, not a Line object
	var lineList = new Array();

	for (var i = 1; i < textAnnotations.length; i++) {
		let unprocessedBlock = textAnnotations[i];
		let currString = unprocessedBlock.description;
		let blockTopY = unprocessedBlock.boundingPoly.vertices[0].y;
		let blockLeftX = unprocessedBlock.boundingPoly.vertices[0].x;
		let blockRightX = unprocessedBlock.boundingPoly.vertices[2].x;
		let blockBottomY = unprocessedBlock.boundingPoly.vertices[2].y;

		// Averages
		let blockMidX = (blockLeftX + blockRightX) / 2;
		let blockMidY = (blockTopY + blockBottomY) / 2;

		// W&H
		let blockWidth = blockRightX - blockLeftX;
		let blockHeight = blockBottomY - blockTopY;

		var block = new Block(currString, blockMidX, blockMidY, blockTopY, blockBottomY, blockLeftX, blockRightX, blockWidth, blockHeight);

		// Just starting out
		if (previousMidY == undefined) {
			currLine.push(block);
			previousMidY = blockMidY;
			bufferWidth = blockHeight / 2;
		} else {
			// Add current Line to lineList if that Line is finished, and make a new Line with the current Block
			// Otherwise, add the current Block to the lineList
			// console.log(currString + " => block.MidY: " + blockMidY + ", previousMidY: " + previousMidY + ", bufferWidth: " + bufferWidth);
			if (blockMidY < previousMidY + bufferWidth && blockMidY > previousMidY - bufferWidth ) {
				// line is not finished
				currLine.push(block);
				previousMidY = blockMidY;
				bufferWidth = blockHeight / 2;
			} else {
				// Line is finished

				var completedLine = new Line(sortBlocksBasedOnX(currLine));
				lineList.push(completedLine);
				currLine = new Array();
				currLine.push(block);
				previousMidY = blockMidY;
				bufferWidth = blockHeight / 2;
			}
		}
	}

	var image = new Image(lineList, imageTopY, imageBottomY, imageLeftX, imageRightX);
	var returnString = processImageByStoreName(image);

	debug("Done processing");
	console.log(returnString);
}

/**
 * Returns a string representation of the given image object.
 */
function processImageToString(image) {
	return image.toString();
}

/**
 * Checks the first two lines of the Image, trying to find the store name
 * 
 * Then calls the apppropriate function for that store
 */
function processImageByStoreName(image) {
	var line1 = image._arrayOfLines[0]._arrayOfBlocks;
	var line2 = image._arrayOfLines[1]._arrayOfBlocks;
	var allBlocks = line1.concat(line2);
	
	var closestMatch = "";
	var closestDistance = 9999999;
	for (var i = 0; i < allBlocks.length; i++) {
		for (var k = 0; k < allowed_stores.length; k++) {
			var currentDistance = stringDistance(allBlocks[i]._contents.toLowerCase(), allowed_stores[k]);
			if (currentDistance < closestDistance) {
				// found a closer match
				closestMatch = allowed_stores[k];
				closestDistance = currentDistance;
			}
		}
	}

	switch(closestMatch) {
		case "safeway":
			return processImageSafeway(image);
			break;
		default:
			console.log("ERROR: I didnt find a store lol");
	}
}

/**
 * Processing function for receipts that are deemed to be from safeway
 */
function processImageSafeway(image) {
	// Assume this is a safeway receipt
	// Look for the word "bal" which is going to signal the end of the receipt, and total money spent
	console.log("THIS IS A SAFEWAY RECEIPT!");

	var receiptBeginLine = 0;
	var receiptEndLine = 99999;
	for (var i = 0; i < image._arrayOfLines.length; i++) {
		for (var b = 0; b < image._arrayOfLines[i]._arrayOfBlocks.length; b++) {
			var currBlock = image._arrayOfLines[i]._arrayOfBlocks[b];
			if (currBlock._contents.toLowerCase() == "bal" && i < receiptEndLine) {
				// we have the last block. Exit looking at stuff
				receiptEndLine = i + 1;
			}
		}
	}

	image._arrayOfLines = image._arrayOfLines.slice(receiptBeginLine, receiptEndLine);

	return image.toString();
}

/**
 *  ############################### HELPER METHODS ##################################
 */

/**
 * Calculates the distance between two string vectors using the Levenshtein distance
 * https://en.wikipedia.org/wiki/Levenshtein_distance
 * 
 * s1 and s2 are strings
 * 
 * *****THIS IS VERY INEFFICIENT*****
 */
function stringDistance(s1, s2) {
	var cost;
	var len_s1 = s1.length;
	var len_s2 = s2.length;

	// Base cases
	if (len_s1 == 0) {
		return len_s2;
	} else if (len_s2 == 0) {
		return len_s1;
	}

	// Test last characters
	if (s1.charAt(len_s1 - 1) == s2.charAt(len_s2 - 1)) {
		cost = 0;
	} else {
		cost = 1;
	}

	// Recursively return minimum
	return Math.min(stringDistance(s1.substring(0, s1.length-1), s2) + 1,
					stringDistance(s1, s2.substring(0, s2.length-1)) + 1,
					stringDistance(s1.substring(0, s1.length-1), s2.substring(0, s2.length-1)) + cost);
}

function sortBlocksBasedOnX(arrayOfBlocks) {
	return arrayOfBlocks.sort(compareBlocksBasedOnX);
}

/**
 * Helper for sortBlocksBasedOnX()
 */
function compareBlocksBasedOnX(blockA, blockB) {
	if (blockA._midX < blockB._midX) {
		return -1;
	} else if (blockA._midX > blockB._midX) {
		return 1;
	} else {
		return 0
	}
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

			returnString += "\r\n"; // <br /> added to make displaying on webpage better
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


/**
 *  ############################### END HELPER METHODS ##################################
 */


// Is a test endpoint to see what we can do using the data that was
// received from a particular file (safeway_08_06_10.jpg)
router.get('/testUsing-safeway_08_06_10-contents', function(req, res, next) {
	debug("Beginning rendering");

	var fileData = fs.readFileSync("uploads/safeway_08_06_10.jpg.json");
	var dataToSend = processResponse(fileData);
	console.log(dataToSend);
	res.render('results' , { dataReceived : "Check console for data. " }, function(err, html) {
		if (err) {
			debug("ERROR: " + err);
		} else {
			debug("Done rendering");
			res.send(html);
		}
	});
});

module.exports = router;