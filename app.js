"use strict";

var SC = require('node-soundcloud');
  
function App() 
{
	
}

module.exports = App;

App.prototype.init = function(){
	
	var config = require('./config.json');
 
	// Initialize client
	SC.init({
		id		: config.client_id,
		secret	: config.client_secret,
		uri		: config.redirect_uri
	});
	
	Homey.manager('media').on('search', function( args, callback ){
	
		SC.get('/tracks', { q: args.query }, function(err, tracks) {
			
			var result = [];
			
			tracks.forEach(function(track){
				result.push({
					type		: 'track',
					id			: track.id,
					title		: track.title,
					artist		: track.user.username,
					album		: false,
					duration	: track.duration,
					artwork		: track.artwork_url
				});
			});
			
			callback( result );
			
		});
		
	})
	
}