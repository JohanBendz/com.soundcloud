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
		method: 'GET',
		path: '/profile',
		fn: function (callback, args) {
			Homey.app.getProfile(callback);
		}
	}

]