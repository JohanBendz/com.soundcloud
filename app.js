'use strict';

const logger = require('homey-log').Log;

const Homey = require('homey');
const soundCloud = require('node-soundcloud');
const request = require('request');

module.exports = class App extends Homey.App {

	/**
	 * Initialize SoundCloud app with the necessary information:
	 * - client ID
	 * - client secret
	 * - redirect URI
	 *
	 * Once initialised respond to search, play and playlist request
	 * from the Homey Media Manager.
	 */
	onInit() {
		/*
		 * Initialize the SoundCloud client with a previously obtained accessToken whenever possible.
		 */
		const accessToken = Homey.ManagerSettings.get('accessToken');
		if (accessToken) {
			soundCloud.init({
				id: Homey.env.CLIENT_ID,
				secret: Homey.env.CLIENT_SECRET,
				uri: Homey.env.REDIRECT_URI,
				accessToken: accessToken,
			});
			// sends a request to the Homey Media component to refresh static playlists
			Homey.ManagerMedia.requestPlaylistsUpdate();
			this.startPollingForUpdates();
		} else {
			soundCloud.init({
				id: Homey.env.CLIENT_ID,
				secret: Homey.env.CLIENT_SECRET,
				uri: Homey.env.REDIRECT_URI,
			});
		}

		/*
		 * Respond to a search request by returning an array of parsed search results
		 */
		Homey.ManagerMedia.on('search', (queryObject, callback) => {
			const query = this.parseSearchQuery(queryObject);
			/*
			 * Execute a search using the soundCloud client.
			 * Since we are only interested in streamable results we apply filters.
			 */
			soundCloud.get('/tracks', query, (err, tracks) => {
				if (err) {
					this.log('soundcloud err', err);
					return callback(err);
				}
				if (tracks) {
					return callback(null, this.parseTracks(tracks));
				}
			});
		});

		/*
		 * Respond to a play request by returning a parsed track object.
		 * The request object contains a trackId and a codec property to indicate what specific
		 * resource and in what codec is wanted for playback.
		 */
		Homey.ManagerMedia.on('play', (track, callback) => {
			soundCloud.get(`/tracks/${track.trackId}`, (err, trackData) => {
				if (err) {
					return callback(err);
				}
				const result = this.parseTrack(trackData);
				result.stream_url = `${trackData.stream_url}?client_id=${Homey.env.CLIENT_ID}`;

				// Follow stream_url to redirect url to support speakers that do not follow redirect urls
				request(result.stream_url, { method: 'HEAD', timeout: 2000 }, (err, res) => {
					if (err) return callback(err);

					result.stream_url = res.request.uri.href;
					return callback(err, result);
				});
			});
		});

		/*
		 * Homey can periodically request static playlist that are available through
		 * the streaming API (when applicable)
		 */
		Homey.ManagerMedia.on('getPlaylists', (callback) => {
			if (!soundCloud.isAuthorized) {
				if (!Homey.ManagerSettings.get('accessToken')) {
					return callback(null, []);
				}
				return callback(new Error('not_authenticated'));
			}

			soundCloud.get('/me/playlists', { oauth_token: soundCloud.accessToken, streamable: true }, (err, playlists) => {
				if (!playlists) {
					return callback(null, []);
				}
				return callback(null, playlists.map((playlist) => ({
					type: 'playlist',
					id: playlist.id,
					title: playlist.title,
					// tracks: this.parseTracks(playlist.tracks) || false,
				})));
			});
		});

		/*
		 * Homey might request a specific playlist so it can be refreshed
		 */
		Homey.ManagerMedia.on('getPlaylist', (request, callback) => {
			if (!soundCloud.isAuthorized) {
				return callback(new Error('not_authenticated'));
			}

			soundCloud.get(`/me/playlists/${request.playlistId}`, {
				oauth_token: soundCloud.accessToken,
				streamable: true
			}, (err, playlist) => {
				if (err) {
					return callback(err);
				}

				const result = {
					type: 'playlist',
					id: playlist.id,
					title: playlist.title,
					tracks: this.parseTracks(playlist.tracks) || false,
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
	startOAuth2(callback) {
		// if the external oauth server requires an Authorization callback URL set it to https://callback.athom.com/oauth2/callback/
		// this is the app-specific authorize url
		new Homey.CloudOAuth2Callback(soundCloud.getConnectUrl())
			.on('url', url => {
				// this function is executed when we got the url to redirect the user to
				callback(null, url);
				callback = null;
			})
			.on('code', code => {
					// this function is executed when the authorization code is received (or failed to do so)
					soundCloud.authorize(code, (err, accessToken) => {
						if (err) {
							return this.error(err);
						}

						// store accessToken for future use
						Homey.ManagerSettings.set('accessToken', accessToken);
						Homey.ManagerSettings.set('authorized', true);
						Homey.ManagerApi.realtime('authorized', true);

						// Client is now authorized and able to make API calls
						soundCloud.get('/me/playlists', {
							oauth_token: soundCloud.accessToken,
							streamable: true
						}, (err, playlists) => {
							if (err) {
								return this.error(err);
							}

							if (playlists) {
								// sends a request to the Homey Media component to refresh static playlists
								Homey.ManagerMedia.requestPlaylistsUpdate();
								this.startPollingForUpdates();
							}
						});
					});
				}
			)
			.generate()
			.catch(err => {
				console.error('OAuth2 Error', err);
				if (callback) {
					callback(err);
				}
			});
	}

	/**
	 * We deauthorize this media app to use the account specific information
	 * it once had access to by resetting our token and notifying Homey Media
	 * the new status.
	 * @param callback
	 */
	deauthorize(callback) {
		soundCloud.isAuthorized = false;
		soundCloud.accessToken = undefined;
		Homey.ManagerSettings.unset('accessToken');
		Homey.ManagerSettings.set('authorized', false);

		Homey.ManagerMedia.requestPlaylistsUpdate();
		this.stopPollingForUpdates();
		return callback();
	}

	/**
	 * Fetches the user profile of the authenticated user.
	 *
	 * @param callback
	 */
	getProfile(callback) {
		if (!soundCloud.isAuthorized) {
			return callback(new Error('not_authenticated'));
		}

		soundCloud.get('/me', { oauth_token: soundCloud.accessToken }, (err, profile) => {
			if (err) {
				return callback(err);
			}

			const result = {
				type: 'profile',
				username: profile.username,
				avatar: profile.avatar_url,
				permalink_url: profile.permalink_url,
				country: profile.country || 'unknown',
				plan: profile.plan,
				playlist_count: profile.playlist_count,
				private_playlist_count: profile.private_playlist_count,
			};

			return callback(null, result);
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
	parseImage(artworkUrl) {
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
	 * @returns {queryObject}
	 */
	parseSearchQuery(parsedQuery) {
		let searchObject = { q: parsedQuery.searchQuery, streamable: true, limit: 10 };
		if (parsedQuery.genre) {
			searchObject.genres = parsedQuery.genre;
			if (parsedQuery.track) {
				searchObject.q = parsedQuery.track;
			} else {
				searchObject.q = '*';
			}
		}

		return searchObject;
	}

	/**
	 * Parses a raw track into a Homey readable format.
	 * Note that the format is slightly different for search queries and play requests.
	 *
	 * - The search format comes with a confidence property ranging between 0 and 1.0
	 *   that indicates how strong of a match the parsed Track is to the original search query.
	 *   When in doubt simply use 0.5 as a neutral rating.
	 * - The play codec has a stream_url property that contains the url that Homey
	 *   can use to stream the content.
	 *
	 * @param track to parse
	 * @returns {parsedTrack}
	 */
	parseTrack(track) {
		return {
			type: 'track',
			id: track.id.toString(),
			title: track.title,
			artist: [
				{
					name: track.user.username,
					type: 'artist',
				},
			],
			duration: track.duration,
			artwork: this.parseImage(track.artwork_url),
			genre: track.genre,
			release_date: `${track.release_year}-${track.release_month}-${track.release_day}`,
			codecs: ['homey:codec:mp3'],
			bpm: track.bpm,
		}
	}

	parseTracks(tracks) {
		const result = [];
		if (!tracks) {
			return result;
		}

		tracks.forEach((track) => {
			const parsedTrack = this.parseTrack(track);
			parsedTrack.confidence = 0.5;
			result.push(parsedTrack);
		});

		return result;
	}

	/**
	 * Polls SoundCloud for an update every two minutes
	 */
	startPollingForUpdates() {
		if (this.pollingInterval) return;
		this.pollingInterval = setInterval(() => {
			// Client is now authorized and able to make API calls
			soundCloud.get('/me/playlists', { oauth_token: soundCloud.accessToken, streamable: true }, (err, playlists) => {
				if (err) {
					return this.error(err);
				}

				if (playlists) {
					// sends a request to the Homey Media component to refresh static playlists
					Homey.ManagerMedia.requestPlaylistsUpdate();
				}
				this.log('soundcloud polled for updates');
			});
		}, 5 * 60 * 1000);

	}

	/**
	 * Stops asking SoundCloud for updates
	 */
	stopPollingForUpdates() {
		clearInterval(this.pollingInterval);
		this.pollingInterval = null;
	}
};
