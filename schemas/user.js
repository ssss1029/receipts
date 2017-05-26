var mongoose = require('mongoose');
mongoose.Promise = require('bluebird');

var UserSchema = mongoose.Schema({
	username : String,
	password : String,
	firstName : String,
	lastName : String,
})

var User = mongoose.model('User', UserSchema);
module.exports = User;