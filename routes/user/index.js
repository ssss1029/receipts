var express = require('express');
var router = express.Router();

router.use('/login', require('./login/index'));
router.use('/logout', require('./logout/index'));

module.exports = router;