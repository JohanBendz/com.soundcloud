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
	
	Homey.manager('media').on('search', function( query, callback ){
	
		SC.get('/tracks', { q: query }, function(err, tracks) {
			
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
	
	Homey.manager('media').on('play', function( track_id, callback ){
		
		if( !track_id ) return;
		
		SC.get('/tracks/' + track_id, function(err, track) {
			
			Homey.manager('media').setTrack({
				id			: track.id,
				title		: track.title,
				artist		: track.user.username,
				album		: false,
				duration	: track.duration,
				artwork		: track.artwork_url
			});
			
			Homey.log(track)
			
			callback();
			
		});
		
		/*
		Homey.log( 'play', track_id )
		*/
	});
	
}