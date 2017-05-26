var express = require('express');
var router = express.Router();

router.get('login', require('./login/index'));
router.get('logout', require('./logout/index'));

module.exports = router;