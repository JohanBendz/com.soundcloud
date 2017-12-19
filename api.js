'use strict';

const Homey = require('homey');

module.exports = [

	{
		method: 'GET',
		path: '/oauth2',
		fn: function (args, callback) {
			Homey.app.startOAuth2(callback);
		}
	},

	{
		method: 'POST',
		path: '/deauthorize',
		fn: function (args, callback) {
			Homey.app.deauthorize(callback);
		}
	},

	{
		method: 'GET',
		path: '/profile',
		fn: function (args, callback) {
			Homey.app.getProfile(callback);
		}
	}

];
