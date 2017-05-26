var express = require('express');
var router = express.Router();
var debug = require('debug')('receipt:results');

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

			var  fileData = "";

			file.on('data', function(data) {
        		debug("Data received from filename: " + filename + " from field: " + fieldname);
        		fileData = fileData + data.toString('utf8');
      		});
			
			file.on('end', function() {
		    	debug('File [' + fieldname + '] Finished');
		    	processFile(fileData, req, res, next);
		    });
		});
	}
});

function processFile(fileData, req, res, next) {
	res.render('results', {dataReceived : fileData});
}

module.exports = router;
