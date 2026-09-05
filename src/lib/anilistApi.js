const ENDPOINT = 'https://graphql.anilist.co';
const FIELDS = `id title { english romaji native } coverImage { large } description
  averageScore episodes status format duration genres startDate { year month day }
  nextAiringEpisode { episode } siteUrl`;

// Descriptions stay plain text: never insert upstream HTML into the document.
const normalize = (media) => ({
  id: media.id,
  anilistId: media.id,
  mediaType: 'anime',
  title: media.title?.english || media.title?.romaji || media.title?.native || 'Untitled anime',
  posterPath: media.coverImage?.large || null,
  overview: String(media.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  rating: Number.isFinite(media.averageScore) ? media.averageScore / 10 : null,
  ratingSource: 'AniList',
  episodes: Number.isSafeInteger(media.episodes) ? media.episodes : null,
  nextAiringEpisode: media.nextAiringEpisode?.episode || null,
  status: media.status,
  format: media.format,
  runtime: media.duration,
  releaseDate: media.startDate?.year ? String(media.startDate.year) : '',
  genres: (media.genres || []).map((name) => ({ id: name, name })),
  siteUrl: media.siteUrl,
});

export const createAnilistCatalogClient = ({ fetchImpl = globalThis.fetch } = {}) => {
  const request = async (query, variables, signal) => {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
      credentials: 'omit',
    });
    if (response.status === 429) throw new Error('AniList is busy. Wait a minute before searching again.');
    if (!response.ok) throw new Error(`AniList could not load (${response.status}). Try again later.`);
    const payload = await response.json();
    if (payload.errors?.length || !payload.data) throw new Error('AniList could not return this anime. Try again later.');
    return payload.data;
  };
  return {
    async search(search, page = 1, signal) {
      if (search.trim().length < 2) return { results: [], totalPages: 1 };
      const data = await request(`query ($search: String!, $page: Int!) {
        Page(page: $page, perPage: 20) {
          pageInfo { currentPage hasNextPage }
          media(search: $search, type: ANIME, isAdult: false) { ${FIELDS} }
        }
      }`, { search: search.trim(), page }, signal);
      if (!data.Page || !Array.isArray(data.Page.media)) throw new Error('AniList returned an invalid search response.');
      return {
        results: data.Page.media.filter((media) => Number.isSafeInteger(media?.id)).map(normalize),
        totalPages: page + (data.Page.pageInfo?.hasNextPage ? 1 : 0),
      };
    },
    async details(id, signal) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Choose a valid AniList title.');
      const data = await request(`query ($id: Int!) { Media(id: $id, type: ANIME) { ${FIELDS} } }`, { id }, signal);
      if (!data.Media || data.Media.id !== id) throw new Error('This anime was not found on AniList.');
      return normalize(data.Media);
    },
  };
};

export const anilistCatalog = createAnilistCatalogClient();
