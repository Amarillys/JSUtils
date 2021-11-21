const fs = require('fs')
const cheerio = require('cheerio')
const ThreadPool = require('./threadpool-mkz')
const { download, fetch, delay, LOG, fileExists }= require('./utils')
const colors = require('colors')

const DL_Path = 'download'
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.85 YaBrowser/21.11.1.877 (beta) Yowser/2.5 Safari/537.36'
const headers = {
  'Cookie': '__ddgid=QMtberxZJMJjLR3J; __ddg2=XlTpOqpjHhIfmig7; __ddg1=8wY9YWl6GPUOImzSIf7a;',
  'User-Agent': userAgent
}

let errorLog = ''

async function main() {
  const url = process.argv[2]
  if (!url) return console.log('node kemono.js <url> [outputPath] [threads] [cookies]')
  let dst = process.argv[3] || DL_Path
  const threads = process.argv[4] || 4
  headers.Cookie = process.argv[5] || headers.Cookie
  let seq = parseInt(process.argv[6]) !== -1 ? true : false
  // const excludeExts = process.argv[6] || ''

  let poolIndex = 1
  let pool = initPool(threads, poolIndex)

  let index = 0
  let count = 0
  let init = false
  let isEnd = false
  do {
    if (index < 0) {
      index = 0;
      isEnd = true;
    }
    let pageInfo = ''
    try {
      pageInfo = await getPageInfo(url, index)
    } catch {
      continue
    }
    const { posts, artistName } = pageInfo
    if (!init) {
      dst = `${dst}/${artistName}`
      count = count || pageInfo.count
      init = true
      if (!seq) {
        index = count - 25
        continue
      }
    }
    
    if (!(await fileExists(dst))) await fs.promises.mkdir(dst, { recursive: true })
    if (posts.length === 0) break

    let postIndex = seq ? 0 : posts.length - 1
    do {
      let pageURL = `${url.split('?')[0]}/post/${posts[postIndex]}`
      console.log(`${LOG.fetching}  ${LOG.post}  ${pageURL}`)
      let post = ''
      try {
        post = await fetch(pageURL, headers)
        while (!post.includes(url.split('kemono.part')[1])) {
          console.log(`${LOG.retry}  ${LOG.post} retry in 5 seconds:  ${pageURL}`)
          await delay(5000)
          post = await (await fetch(pageURL, headers))
        }
      } catch {
        continue
      }
      let progressCount = seq ? (postIndex + 1) : (count - index - postIndex)
      console.log(`${LOG.fetched}  ${LOG.post}` + '  ' + ` ${progressCount} / ${count} `.bgBlue.white + '  ' + pageURL)

      const $ = cheerio.load(post)
      const titleNode = $('.post__title')
      let titleIndex = seq ? (count - index - postIndex) : (index + postIndex + 1)
      const title = `${titleIndex}-` + titleNode.text().trim().slice(0, titleNode.text().trim().lastIndexOf('(') - 1)
      if (!(await fileExists(`${dst}/${title}`))) await fs.promises.mkdir(`${dst}/${title}`, { recursive: true })

      const content = $('.post__content').text()
      if (content.length > 0) fs.writeFile(`${dst}/${title}/content.txt`, content.trim(), () => {})

      Array.from($('.post__attachments li').map((i, attach) => ({
        filename: attach.childNodes[1].firstChild.data.trim().slice(9),
        url: attach.childNodes[1].attribs.href
      }))).forEach(attach => {
        // if (excludeExts && excludeExts)
        if (pool.isFinished()) {
          pool = initPool(threads, ++poolIndex)
        }
        pool.add(async () => {
          let url = `https://kemono.party${attach.url}`
          let redirectLink = await fetch(url, headers)
          try {
            await download(redirectLink, `${dst}/${title}/${attach.filename}`, false, { headers })
          } catch (e) {
            errorLog += e
          }
        })
      })

      const files = $('.post__files .post__thumbnail')
      Array.from(files.map((i, file) => ({
        filename: file.childNodes[1].attribs.href.split('f=')[1],
        url: file.childNodes[1].attribs.href
      }))).forEach((file, index) => {
        if (pool.isFinished()) {
          pool = initPool(threads, ++poolIndex)
        }
        pool.add(async () => {
          let url = `https://kemono.party${file.url}`
          let redirectLink = await fetch(url, headers)
          try {
            await download(redirectLink, `${dst}/${title}/${index}-${file.filename}`, false, { headers })
          } catch (e) {
            errorLog += e
          }
        })
      })

      postIndex += seq ? 1 : -1
      if (seq && postIndex >= posts.length) break
      if (!seq && postIndex < 0) break
    } while (true)
    index += 25 * (seq ? 1 : -1)
    pool.run()
  } while (index < count && !isEnd)

  async function getPageInfo(url, index) {
    url = `${url}?o=${index}`
    let content = await (await fetch(url, headers))
    console.log(`${LOG.fetching}  ${LOG.list}  ${url}`)
    while (!content.includes('fancy-image')) {
      console.log(`${LOG.failed}  ${LOG.list}  retry in 9 seconds  ${url}`)
      await delay(5000)
      console.log(`${LOG.retry}  ${url}`)
      content = await (await fetch(url, headers))
    }
    console.log(`${LOG.fetched}  ${LOG.list}  ${url}`)
    const $ = cheerio.load(content)
    const posts = $('.card-list__items article.post-card')
    return {
      posts: posts.map((i, p) => p.attribs["data-id"]),
      artistName: $('meta[name="artist_name"]')[0].attribs.content,
      count: +$('#paginator-top small')[0].children[0].data.trim().split('of')[1].trim()
    }
  }
}

function initPool(threads, index) {
  const pool = new ThreadPool(threads)
  pool.step = () => console.log(` Pool ${index} `.bgBlue.white + ' Progress > '.bgBlue.white + '  ' + ` ${ pool.counter } / ${ pool.sum }  ${ pool.status() } `.bgMagenta.white)
  pool.finish(() => {
    console.log(` Pool ${index}  Finished `.bgGreen.white)
    if (errorLog.length > 0) {
      fs.writeFile('error.log', errorLog, () => {
        console.warn(' Error Occurred. Error Log Generated '.bgRed.white)
      })
    }
  })
  return pool
}

main();
