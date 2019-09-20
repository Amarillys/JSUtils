const ThreadPool = require('./lib/threadpool.js')
const download = require('./lib/download.js')
const getFileList = require('./lib/getFileList')
const MD5 = require('./lib/md5.js')
const fs = require('fs')

const pool = new ThreadPool(20);
let errorUrls = []
pool.step = () => console.log(`Running: ${ pool.running }, downloaded: ${ pool.counter } / ${ pool.sum }, ${ pool.status() }`)
pool.finish(() => {
  fs.writeFileSync('error.log', JSON.stringify(errorUrls))
  console.log('finished')
})

!(async function main() {
  const scenes = getFileList('hscene_r18', true)
  Promise.all(scenes.map(scene => {
    return new Promise(resolve => {
      fs.readFile(scene, 'utf-8', (err, text) =>{
        let messages = text.replace(/\r\n/g, '\n').split('\n')
        for (let i = 0; i < messages.length; ++i) {
          let words = messages[i].split(',')
          let type = 'voice'
          // remove blank messages
          if (words.length < 2) {
            continue
          }
          let fileToDownload = undefined
          switch (words[0]) {
            case 'mess':
              fileToDownload = words[3]
              break;
            case 'image':
              fileToDownload = words[1]
              type = 'cg'
              break;
            default:
              break;
          }
          if (fileToDownload) {
            let charaId = fileToDownload.split('/')[0]
            let file = fileToDownload.split('/')[1]
            if (type === 'voice') {
              pool.add(fn => {
                let url = `http://dugrqaqinbtcq.cloudfront.net/product/ynnFQcGDLfaUcGhp/assets/voice/c`
                  + `/${charaId}/${ MD5(file) }.mp3?2333`;
                return download(url, `./voice/${charaId}/${file}.mp3`, () => fn(pool)).catch(url => errorUrls.push(url));
              })
            } else {
              pool.add(fn => {
                let url = `http://dugrqaqinbtcq.cloudfront.net/product/ynnFQcGDLfaUcGhp/assets/ultra/images/hscene_r18`
                  + `/${ MD5(file) }.bin?2333`
                return download(url, `./images/hscene_r18/${file}.png`, () => fn(pool)).catch(url => errorUrls.push(url));
              })
            }
          }
          resolve()
        }
      })
    }).catch(err => console.log(err))
  })).then(() => pool.run())
})()
