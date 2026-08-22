const TMDB_API_ORIGIN = 'https://api.themoviedb.org';
const TMDB_API_BASE = `${TMDB_API_ORIGIN}/3`;

const asInteger = (value, minimum = 1, maximum = 2_000_000_000) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error('Invalid catalog identifier.');
  }
  return number;
};

const normalizeItem = (item, forcedMediaType) => ({
  id: item?.id,
  mediaType: forcedMediaType || item?.media_type,
  title: item?.title || item?.name || '',
  originalTitle: item?.original_title || item?.original_name || '',
  overview: item?.overview || '',
  posterPath: item?.poster_path || null,
  backdropPath: item?.backdrop_path || null,
  releaseDate: item?.release_date || item?.first_air_date || null,
  rating: Number.isFinite(item?.vote_average) ? item.vote_average : null,
  voteCount: Number.isFinite(item?.vote_count) ? item.vote_count : 0,
});

const normalizeDetails = (item, mediaType) => ({
  ...normalizeItem(item, mediaType),
  runtime: Number.isFinite(item?.runtime) ? item.runtime : null,
  numberOfSeasons: Number.isFinite(item?.number_of_seasons) ? item.number_of_seasons : null,
  numberOfEpisodes: Number.isFinite(item?.number_of_episodes) ? item.number_of_episodes : null,
  status: item?.status || '',
  tagline: item?.tagline || '',
  genres: Array.isArray(item?.genres)
    ? item.genres.map(genre => ({ id: genre.id, name: genre.name || '' }))
    : [],
  seasons: Array.isArray(item?.seasons)
    ? item.seasons
      .filter(season => Number.isSafeInteger(season?.season_number) && season.season_number > 0)
      .map(season => ({
        id: season.id,
        title: season.name || `Season ${season.season_number}`,
        seasonNumber: season.season_number,
        episodeCount: season.episode_count || 0,
        airDate: season.air_date || null,
        posterPath: season.poster_path || null,
        overview: season.overview || '',
      }))
    : [],
});

const normalizeSeason = season => ({
  id: season?.id,
  title: season?.name || '',
  seasonNumber: season?.season_number,
  overview: season?.overview || '',
  airDate: season?.air_date || null,
  posterPath: season?.poster_path || null,
  episodes: Array.isArray(season?.episodes) ? season.episodes.map(episode => ({
    id: episode.id,
    title: episode.name || '',
    overview: episode.overview || '',
    episodeNumber: episode.episode_number,
    seasonNumber: episode.season_number,
    airDate: episode.air_date || null,
    stillPath: episode.still_path || null,
    rating: Number.isFinite(episode.vote_average) ? episode.vote_average : null,
    voteCount: Number.isFinite(episode.vote_count) ? episode.vote_count : 0,
    runtime: Number.isFinite(episode.runtime) ? episode.runtime : null,
  })) : [],
});

export const createTmdbCatalogClient = ({ token, fetchImpl = globalThis.fetch } = {}) => {
  const request = async (path, parameters = {}, signal) => {
    if (!token) {
      throw new Error('Catalog is not configured. Add VITE_TMDB_READ_ACCESS_TOKEN to the frontend environment.');
    }
    if (typeof fetchImpl !== 'function') throw new Error('Catalog requests are unavailable in this browser.');

    const url = new URL(`${TMDB_API_BASE}${path}`);
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await fetchImpl(url, {
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('TMDB rejected the configured catalog token.');
      if (response.status === 429) throw new Error('TMDB search is busy. Wait a moment and try again.');
      throw new Error('TMDB catalog is temporarily unavailable.');
    }
    return response.json();
  };

  return {
    async search(query, page = 1, signal) {
      const normalizedQuery = String(query || '').trim();
      if (normalizedQuery.length < 2 || normalizedQuery.length > 200) throw new Error('Enter at least two characters.');
      const normalizedPage = asInteger(page, 1, 500);
      const data = await request('/search/multi', {
        query: normalizedQuery,
        page: normalizedPage,
        include_adult: false,
      }, signal);
      return {
        page: data?.page || normalizedPage,
        totalPages: Math.min(Number(data?.total_pages) || 1, 500),
        totalResults: Number(data?.total_results) || 0,
        results: Array.isArray(data?.results)
          ? data.results
            .filter(item => item?.media_type === 'movie' || item?.media_type === 'tv')
            .map(item => normalizeItem(item))
          : [],
      };
    },

    async details(mediaType, id, signal) {
      if (mediaType !== 'movie' && mediaType !== 'tv') throw new Error('Unsupported catalog media type.');
      const normalizedId = asInteger(id);
      return normalizeDetails(await request(`/${mediaType}/${normalizedId}`, {}, signal), mediaType);
    },

    async season(id, seasonNumber, signal) {
      const normalizedId = asInteger(id);
      const normalizedSeason = asInteger(seasonNumber, 0, 1_000);
      return normalizeSeason(await request(`/tv/${normalizedId}/season/${normalizedSeason}`, {}, signal));
    },
  };
};

const environment = import.meta.env || {};
export const tmdbCatalog = createTmdbCatalogClient({ token: environment.VITE_TMDB_READ_ACCESS_TOKEN });

export { TMDB_API_ORIGIN };
