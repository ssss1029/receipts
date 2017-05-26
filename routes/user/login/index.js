var express = require('express');
var router = express.Router();

router.use('/', function(req, res, next) {
	res.render("login");
});

module.exports = router;
