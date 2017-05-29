# receipts

This is a test application that is meant to be a proof of concept for a future app that reads and processes receipts. 

// Currently in the works 

To run the server:

```
sudo mongod
```

```
npm install
node serve
```

You can also use nodemon to run the server, but ignoring the uploads directory

```
sudo mongod
```

```
nodemon serve --ignore uploads
```

There might be a problem with on app.js:

```
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  if (err) {
    console.log(err);
  }

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});
```

Errors are not displaying without the if case in the middle. Tried debugging, haven't figured out why its doing that yet (5/28/2017)
