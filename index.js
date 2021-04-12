const MovieDB = require('node-themoviedb');
const { Telegraf } = require('telegraf')
const emoji = require('node-emoji')
require('dotenv').config()
const mdb = new MovieDB(process.env.TMD_TOKEN, {})
const bot = new Telegraf(process.env.TELEGRAM_TOKEN)

// Gets item image link
// Caveat: between '[' and ']' in the link U+200C zero-width character
let getItemImageLink = (item) => {
  return `[‌‌](http://image.tmdb.org/t/p/original${item.poster_path || item.profile_path})`
}

// Gets item production countries flags
let getProductionFlags = (item) => {
  return item.production_countries ? item.production_countries.map(c => emoji.get(`flag-${c.iso_3166_1.toLowerCase()}`)) : ''
}

// Gets link to a person
let getPersonLink = (person) => {
  return `[${person.name}](https://www.themoviedb.org/person/${person.id})`
}

// Parses a TMDB multi research item to get a markdown description
let tmdbMultiItemToMarkdown = async (item) => {
  if (item.media_type === 'tv') {
    let details = (await mdb.tv.getDetails({ pathParameters: { tv_id: item.id } })).data

    let result = getItemImageLink(item)
    result += `*${item.title || item.name}* ${getProductionFlags(details)}\n\n`

    result += `*Original title*: [${item.original_name || item.name}](https://www.themoviedb.org/tv/${item.id})\n`
    if (details.first_air_date) {
      result += ` (${details.first_air_date} - {${details.last_air_date || '?'}})`
    }
    result += "\n"
    if (details.created_by) {
      result += `*Created by*: ${details.created_by.map(p => getPersonLink(p))}\n`
    }
    if (details.number_of_seasons) {
      result += `*Seasons*: ${details.number_of_seasons}\n`
    }
    if (details.number_of_episodes) {
      result += `*Episodes*: ${details.number_of_episodes}\n`
    }

    result += `\n${item.overview}`
    return result
  }

  if (item.media_type === 'movie') {
    let details = (await mdb.movie.getDetails({ pathParameters: { movie_id: item.id }, query: { append_to_response: "credits" }})).data

    let result = getItemImageLink(item)
    result += `*${item.title}* ${getProductionFlags(details)}\n\n`

    result += `*Original title*: [${item.original_title || item.title}](https://www.themoviedb.org/movie/${item.id})`
    if (details.release_date) {
      result += ` (${details.release_date.substr(0, 4)})`
    }
    result += "\n"
    if (details.runtime) {
      result += `*Runtime*: ${details.runtime}mins\n`
    }

    if (details.credits && details.credits.crew) {
			let directors = [...new Set(details.credits.crew.filter(p => p.job === 'Director' || p.job === 'Co-Director' ))];
			let writers = [...new Set(details.credits.crew.filter(p => p.department === 'Writing'))]
			let cast = [...new Set(details.credits.cast.filter(p => p.order < 10))]
			
      result += `*Directed by*: ${directors.map(p => getPersonLink(p)).join(', ')}\n`
      result += `*Story by*: ${writers.map(p => getPersonLink(p)).join(', ')}\n`
      result += "\n"
      result += `*Cast*: ${cast.map(p => getPersonLink(p)).join(', ')}\n`
      result += "\n"
    }

    result += `*Other sites:* [Letterboxd](http://letterboxd.com/tmdb/${item.id})`
    if (details.imdb_id) {
      result += `, [IMDb](https://www.imdb.com/title/${details.imdb_id})`
    }
    result += "\n"

    result += `\n${item.overview}`
    return result
  }

  if (item.media_type === 'person') {
    let details = (await mdb.person.getDetails({ pathParameters: { person_id: item.id } })).data

    let result = getItemImageLink(item)
    result += `*${item.name}*\n\n`

    result += `[TMDB page](https://www.themoviedb.org/person/${item.id})\n\n`

    if (details.birthday) {
      result += `*Birth:* ${details.birthday}` + (details.place_of_birth ? ` (${details.place_of_birth})` : '') + "\n"
    }
    if (details.deathday) {
      result += `*Death:* ${details.deathday}\n`
    }

    if (details.imdb_id) {
      result += `Other sites: [IMDb](https://www.imdb.com/name/${details.imdb_id})`
    }

    result += `\n*Known for:* ${item.known_for.map(el => el.name || el.title).join(', ')}`

    return result
  }
}

// Parses TMDB data to get a Telegram inline query response
let tmdbSearchResultsToQueryResponse = (results) => results.map(result => (async () => {
  let message_text = await tmdbMultiItemToMarkdown(result)
  return {
    type: 'article',
    id: result.media_type + result.id,
    title: `[${result.media_type}] ${result.name || result.title}`,
    description: result.overview,
    thumb_url: `http://image.tmdb.org/t/p/w92${result.profile_path || result.poster_path}`,
    input_message_content: {
      'message_text': message_text,
      'parse_mode': 'Markdown'
    }
  }
})())

bot.on('inline_query', async (ctx) => {
  let response = [];
  if (ctx.inlineQuery.query) {
    let results = await mdb.search.multi({ query: { query: ctx.inlineQuery.query } });
    response = await Promise.all(tmdbSearchResultsToQueryResponse(results.data.results))
  }
  return await ctx.answerInlineQuery(response)
})

bot.launch()
