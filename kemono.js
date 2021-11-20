const fs = require('fs')
const cheerio = require('cheerio')
const ThreadPool = require('./lib/threadpool-mkz')
const { download, fetch, delay, LOG, fileExists }= require('./lib/utils')
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
  if (!url) return console.log('node kemono.js <url> [outputPath] [threads]')
  let dst = process.argv[3] || DL_Path
  const threads = process.argv[4] || 4
  headers.Cookie = process.argv[5] || headers.Cookie
  
  const pool = new ThreadPool(threads)
  pool.step = () => console.log(' Progress > '.bgBlue.white + '  ' + ` ${ pool.counter } / ${ pool.sum }  ${ pool.status() } `.bgMagenta.white)
  pool.finish(() => {
    console.log(' Finished '.bgGreen.white)
    if (errorLog.length > 0) {
      fs.writeFile('error.log', errorLog, () => {
        console.warn(' Error Occurred. Error Log Generated '.bgRed.white)
      })
    }
  })

  let index = 0
  let count = 0
  let init = false
  do {
    const pageInfo = await getPageInfo(url, index)
    const { posts, artistName } = pageInfo
    if (!init) {
      dst = `${dst}/${artistName}`
      count = count || pageInfo.count
    }
    init = true
    if (!(await fileExists(dst))) await fs.promises.mkdir(dst, { recursive: true })
    if (posts.length === 0) break

    for (let i = 0; i < posts.length; ++i) {
      let pageURL = `${url.split('?')[0]}/post/${posts[i]}`
      console.log(`${LOG.fetching}  ${LOG.post}  ${pageURL}`)
      let post = await fetch(pageURL, headers)
      while (!post.includes(url.split('kemono.part')[1])) {
        console.log(`${LOG.retry}  ${LOG.post} retry in 5 seconds:  ${pageURL}`)
        await delay(5000)
        post = await (await fetch(pageURL, headers))
      }
      console.log(`${LOG.fetched}  ${LOG.post}` + '  ' + ` ${i + 1} / ${count} `.bgBlue.white + '  ' + pageURL)

      const $ = cheerio.load(post)
      const titleNode = $('.post__title')
      const title = `${count - index - i}-` + titleNode.text().trim().slice(0, titleNode.text().trim().lastIndexOf('(') - 1)
      if (!(await fileExists(`${dst}/${title}`))) await fs.promises.mkdir(`${dst}/${title}`, { recursive: true })

      const content = $('.post__content').text()
      if (content.length > 0) fs.writeFile(`${dst}/${title}/content.txt`, content.trim(), () => {})

      Array.from($('.post__attachments li').map((i, attach) => ({
        filename: attach.childNodes[1].firstChild.data.trim().slice(9),
        url: attach.childNodes[1].attribs.href
      }))).forEach(attach => {
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
    }
    index += 25
    pool.run()
  } while (index < count)

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

main();
