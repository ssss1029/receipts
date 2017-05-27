
/**
 * Everything on here is added to gloabl.environment on startup
 * only used for objects and dev things (i.e. not for deployment things that we prolly will need)
 */

module.exports =  {
	// If this field exists, these users are pre-populated into the database for development
	'TEST_USERS' : {
		"janeDoe" : {
			'username' : 'janeDoe',
			'password' : 'development',
			'firstName' : 'Jane',
			'lastName' : 'Doe'
		},

		"johnDoe" : {
			'username' : 'johnDoe',
			'password' : 'development',
			'firstName' : 'John',
			'lastName' : 'Doe'
		}
	},

	// If this is true, then set the value of global.outerDirName to the value of __dirname in the app.js file
	'SET_GLOBAL_OUTER_DIRNAME' : true

}