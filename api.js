'use strict';

module.exports = [

	{
		method: 'GET',
		path: '/oauth2',
		fn: function (callback, args) {
			Homey.app.startOAuth2(callback);
		}
	},

	{
		method: 'POST',
		path: '/deauthorize',
		fn: function (callback, args) {
			Homey.app.deauthorize(callback);
		}
	},

	{
		method: 'GET',
		path: '/profile',
		fn: function (callback, args) {
			Homey.app.getProfile(callback);
		}
	}

]