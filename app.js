var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var busboy = require('connect-busboy');
var app = express();
var debug = require('debug')("receipt:app.js");
var User = require('./schemas/user');


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(busboy({ immediate: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/process', require('./routes/process/index'));
app.use('/results', require('./routes/results/index'));
app.use('/user', require('./routes/user/index'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});



// Handle development settings
if (global.environment.TEST_USERS !== undefined) {
  // put in the users and passwords
  for (var user in global.environment.TEST_USERS) {
    var curr_user = new User(global.environment.TEST_USERS[user]);
    curr_user.save().then(function(curr_user) {
      debug("Created new user: " + curr_user.firstName + " " + curr_user.lastName);
    }).catch(function(err) {
      console.log(err);
    });
  }
}

if (global.environment.SET_GLOBAL_OUTER_DIRNAME === true) {
  global.environment.OUTER_DIRNAME = __dirname;
}

module.exports = app;
