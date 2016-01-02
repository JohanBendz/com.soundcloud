"use strict";

var SC = require('node-soundcloud');

var self = module.exports = {

	init: function(){
		 
		// Initialize client
		SC.init({
			id		: Homey.env.CLIENT_ID,
			secret	: Homey.env.CLIENT_SECRET,
			uri		: Homey.env.REDIRECT_URI
		});
		
		Homey.manager('media').on('search', function( parsedQuery, callback ){
			
			console.log('parsedQuery', parsedQuery)
			
			var searchQuery = '';			
			
			if( parsedQuery.artist || parsedQuery.track || parsedQuery.album ) {
				if( parsedQuery.artist ) searchQuery += ' ' + parsedQuery.artist;				
				if( parsedQuery.track ) searchQuery += ' ' + parsedQuery.track;
				if( parsedQuery.album ) searchQuery += ' ' + parsedQuery.album;
				
				if( parsedQuery.fuzzyCategory.artist || parsedQuery.fuzzyCategory.album || parsedQuery.fuzzyCategory.track ) {
					searchQuery += ' ' + parsedQuery.fuzzy;
				}
			} else if( parsedQuery.genre ) {
				searchQuery = parsedQuery.genre;				
			} else {
				searchQuery = parsedQuery.query;
			}
								
			SC.get('/tracks', { q: searchQuery, limit: 50 }, function(err, tracks) {
				
				var result = [];
				
				tracks.forEach(function(track){
										
					if( !track.streamable ) return;
					
					result.push({
						type		: 'track',
						id			: track.id,
						title		: track.title,
						artist		: track.user.username,
						album		: false,
						duration	: track.duration,
						artwork		: track.artwork_url,
						confidence	: 0.5
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
					stream_url	: track.stream_url + '?client_id=' + Homey.env.CLIENT_ID
				});
				
				callback( null, true );
				
			});
			
		});
	
	}
	
}