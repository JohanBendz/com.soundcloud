'use strict';

const soundCloud = require('node-soundcloud');

/**
 * Initialize SoundCloud app with the necessary information:
 * - client ID
 * - client secret
 * - redirect URI
 *
 * Once initialised respond to search, play and playlist request
 * from the Homey Media Manager.
 */
function init() {
	// Initialize the soundCloud client
	soundCloud.init({
		id: Homey.env.CLIENT_ID,
		secret: Homey.env.CLIENT_SECRET,
		uri: Homey.env.REDIRECT_URI,
	});

	/*
	 * Respond to a search request by returning an array of parsed search results
	 */
	Homey.manager('media').on('search', (parsedQuery, callback) => {
		// Perform our own selective parsing on the parsedQuery
		const searchQuery = parseSearchQuery(parsedQuery);
		/*
		 * Execute a search using the soundCloud client.
		 * Since we are only interested in streamable results we apply filters.
		 */
		soundCloud.get('/tracks', { q: searchQuery, streamable: true, limit: 10 }, (err, tracks) => {
			if (err) {
				Homey.log('soundcloud err', err);
				return callback(err);
			}
			if (tracks) {
				const result = parseTracks(tracks);
				callback(null, result);
			}
		});
	});

	/*
	 * Respond to a play request by returning a parsed track object
	 */
	Homey.manager('media').on('play', (track_id, callback) => {
		soundCloud.get(`/tracks/${track_id}`, (err, track) => {
			if (err) {
				return callback(err);
			}
			const result = parseTrack(track);
			callback(err, result);
		});
	});

	/*
	 * Homey can periodically request static playlist that are available through
	 * the streaming API (when applicable)
	 */
	Homey.manager('media').on('getPlaylists', (callback) => {
		if (!soundCloud.isAuthorized) {
			return callback(new Error('could not fetch playlist, user is not authenticated'));
		}
		const results = [];

		soundCloud.get('/me/playlists', { oauth_token: soundCloud.accessToken, streamable: true }, (err, playlists) => {
			if (!playlists) {
				callback(null, []);
			}
			playlists.forEach((playlist) => {
				results.push({
					type: 'playlist',
					id: playlist.id,
					title: playlist.title,
					tracks: parseTracks(playlist.tracks) || false,
				});
			});

			callback(null, results);
		});
	});

	/*
	 * Homey might alternatively request a specific playlist so it can be refreshed
	 */
	Homey.manager('media').on('getPlaylist', (request, callback) => {
		if (!soundCloud.isAuthorized) {
			return callback(new Error('could not fetch playlist, user is not authenticated'));
		}

		soundCloud.get(`/me/playlists/${request}`, { oauth_token: soundCloud.accessToken, streamable: true }, (err, playlist) => {
			if (err) {
				return callback(err);
			}

			const result = {
				type: 'playlist',
				id: playlist.id,
				title: playlist.title,
				tracks: parseTracks(playlist.tracks) || false,
			};

			return callback(null, result);
		});
	});
}

/* ====================================================== */

/**
 * Initiates OAuth for this media app, this is needed when retrieving information specific to a service account.
 * Some user content might only be available when the user is authenticated.
 *
 * @param callback
 */
function startOAuth2(callback) {
	Homey.manager('cloud').generateOAuth2Callback(
		// if the external oauth server requires an Authorization callback URL set it to https://callback.athom.com/oauth2/callback/
		// this is the app-specific authorize url
		soundCloud.getConnectUrl(),

		// this function is executed when we got the url to redirect the user to
		callback,

		// this function is executed when the authorization code is received (or failed to do so)
		(err, code) => {
			if (err) {
				return console.error(err);
			}

			soundCloud.authorize(code, (err, accessToken) => {
				if (err) {
					return console.error(err);
				}

				// Client is now authorized and able to make API calls
				soundCloud.get('/me/playlists', { oauth_token: soundCloud.accessToken, streamable: true }, (err, playlists) => {
					if (err) {
						return console.error(err);
					}

					if (playlists) {
						playlists.forEach((playlist) => {
							pushPlaylist(playlist);
						});
					}
				});
			});
		}
	);
}

/**
 * Fetches the user profile of the authenticated user.
 *
 * @param callback
 */
function getProfile(callback) {
	if (!soundCloud.isAuthorized) {
		return callback(new Error('could not fetch profile, user is not authenticated'));
	}

	soundCloud.get('/me', { oauth_token: soundCloud.accessToken }, (err, profile) => {
		if (err) {
			return callback(err);
		}

		const result = {
			type: 'profile',
			username: profile.username,
			avatar: parseImage(profile.avatar_url),
			country: profile.country,
			plan: profile.plan,
			playlist_count: profile.playlist_count,
			private_playlist_count: profile.private_playlist_count,
		};

		return callback(null, result);
	});
}

/**
 * Pushes a playlist to the Media Manager
 *
 * @param playlist
 */
function pushPlaylist(playlist) {
	Homey.manager('media').pushPlaylist({
		type: 'playlist',
		id: playlist.id,
		title: playlist.title,
		tracks: parseTracks(playlist.tracks) || false,
	});
}

/* ====================================================== */

/**
 * Fetches three different size images for the specified image url that most closely
 * resemble the artwork dimensions in the specification.
 *
 * @param artworkUrl
 * @returns {{small: (XML|string|void|*), medium: (XML|string|void|*), large: (XML|string|void|*)}}
 */
function parseImage(artworkUrl) {
	if (!artworkUrl) {
		return;
	}

	return {
		small: artworkUrl.replace('-large', '-t67x67'),
		medium: artworkUrl.replace('-large', '-t300x300'),
		large: artworkUrl.replace('-large', '-t500x500'),
	};
}

/**
 * Further parses the parsedQuery received from Homey. If no parse properties are found
 * the raw query is used instead.
 *
 * @param parsedQuery
 * @returns {queryString}
 */
function parseSearchQuery(parsedQuery) {
	let searchQuery = '';

	if (parsedQuery.artist || parsedQuery.track || parsedQuery.album) {
		if (parsedQuery.artist) {
			searchQuery += ` ${parsedQuery.artist}`;
		}
		if (parsedQuery.track) {
			searchQuery += ` ${parsedQuery.track}`;
		}
		if (parsedQuery.album) {
			searchQuery += ` ${parsedQuery.album}`;
		}
		if (parsedQuery.fuzzyCategory.artist || parsedQuery.fuzzyCategory.album || parsedQuery.fuzzyCategory.track) {
			searchQuery += ` ${parsedQuery.fuzzy}`;
		}
	} else if (parsedQuery.genre) {
		searchQuery = parsedQuery.genre;
	} else {
		searchQuery = parsedQuery.query;
	}

	return searchQuery;
}

/**
 * Parses a raw track into a Homey readable format.
 * Note that the format is slightly different for search queries and play requests.
 *
 * - The search format comes with a confidence property ranging between 0 and 1.0
 *   that indicates how strong of a match the parsed Track is to the original search query.
 *   When in doubt simply use 0.5 as a neutral rating.
 * - The play format has a stream_url property that contains the url that Homey
 *   can use to stream the content.
 *
 * @param track to parse
 * @returns {parsedTrack}
 */
function parseTrack(track) {
	const result = {
		type: 'track',
		id: track.id,
		title: track.title,
		artist: [
			{
				name: track.user.username,
				type: 'artist',
			},
		],
		duration: track.duration,
		artwork: parseImage(track.artwork_url),
		genre: track.genre,
		release_date: `${track.release_year}-${track.release_month}-${track.release_day}`,
		format: 'mp3',
		bpm: track.bpm,
	};

	if (typeof track.stream_url !== 'undefined') {
		result.stream_url = `${track.stream_url}?client_id=${Homey.env.CLIENT_ID}`;
	} else {
		result.confidence = 0.5;
	}

	return result;
}


function parseTracks(tracks) {
	const result = [];
	if (!tracks) {
		return result;
	}

	tracks.forEach((track) => {
		result.push(parseTrack(track));
	});

	return result;
}

/* ====================================================== */

module.exports = {
	init,
	startOAuth2,
	getProfile,
};
