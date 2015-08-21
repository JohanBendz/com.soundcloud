"use strict";

var SC = require('node-soundcloud');

var self = module.exports = {

	init: function(){
		 
		// Initialize client
		SC.init({
			id		: Homey.env.client_id,
			secret	: Homey.env.client_secret,
			uri		: Homey.env.redirect_uri
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
			
			Homey.log('play', track_id)
			
			if( !track_id ) return;
			
			SC.get('/tracks/' + track_id, function(err, track) {
				
				Homey.manager('media').setTrack({
					id			: track.id,
					title		: track.title,
					artist		: track.user.username,
					album		: false,
					duration	: track.duration,
					artwork		: track.artwork_url,
					stream_url	: track.stream_url + '?client_id=' + Homey.env.client_id
				});
				
			});
			
		});
	
	}
	
}