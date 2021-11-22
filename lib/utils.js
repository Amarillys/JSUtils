const https = require('https')
const fs = require('fs')
const fsp = fs.promises
const colors = require('colors')

const LOG = {
  download: ' Download > '.bgBlue.yellow,
  saved   : ' Saved    √ '.bgGreen.white,
  exists  : ' Existed  ♪ '.bgWhite.red,
  failed  : ' Failed   × '.bgWhite.red,
  fetching: ' Fetching > '.bgBlue.white,
  fetched : ' Fetched  √ '.bgGreen.white,
  retry   : ' Re-try   > '.bgBlue.white,
  list: ' List Page '.bgBlue.yellow,
  post: ' Post Page '.bgBlue.yellow,
  file: ' File '.bgBlue.yellow
}

function fetch(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url,  {
      headers
    }, res => {
      let data = '';
      if (res.statusCode === 302) {
        resolve(res.headers.location)
        return
      }
      res.on('data', chunk =>  data += chunk );
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const fileExists = async path => !!(await fsp.stat(path).catch(() => false));

async function download(url, dest, reserveEmpty, options) {
  // Pre-Processing
  let path = dest.slice(0, dest.lastIndexOf('/'))
  let status = "init"
  if (!(await fileExists(path))) await fsp.mkdir(path, { recursive: true })
  if (await fileExists(dest)) {
    // exist, check size
    const localFileSize = (await fsp.stat(dest)).size
    if (localFileSize > 0) { 
      console.log(`${LOG.exists}  ${LOG.file}  ${url} skipped.`)
      status = await new Promise(resolve => {
        const checkFileReq = https.get(url, { ...options, method: 'HEAD' }, res => {
          resolve(+res.headers['content-length'] === localFileSize ? 'success' : 'init')
        })
        checkFileReq.on('error', () => status = 'failed')
      })
    } else {
      await fsp.unlink(dest)
    }
  }

  let fileStream = null
  if (status === 'init') {
    fileStream = fs.createWriteStream(dest);
    fileStream.on('error', err => {
      fileStream.close();
      console.log(`${LOG.failed}  ${LOG.file} ${err}, ${url} to ${dest}`)
      status = 'failed'
    });
    console.log(`${LOG.download}  ${LOG.file} ${url} to ${dest}`)
  }

  return new Promise((resolve, reject) => {
    if (status === 'success') return resolve(status)
    if (status === 'failed') return reject(`${status}: ${url}`)
    let rejectTimer = setTimeout(() => {
      if (fileStream.bytesWritten === 0) {
        fsp.unlink(dest, () => {})
        reject(`Time out: ${url}`)
      }
    }, 30000)

    https.get(url, options, function (response) {
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        if (response.statusCode === 404 || response.statusCode === 403) {
          fileStream.close();
          fsp.unlink(dest, () => {});
          console.log(`failed: ${url}`);
          reject(`failed: ${response.statusCode}, url: ${url}`)
          return;
        }
        fileStream.close();
        if (fileStream.bytesWritten === 0 && !reserveEmpty) {
          fsp.unlink(dest, () => {})
          console.log(`got empty file at ${dest}, deleted`)
        } else {
          console.log(`${LOG.saved}  ${url}`);
        }
        clearTimeout(rejectTimer)
        resolve(`succeed: ${url}`);
      });
    }).on('error', function (err) {
      console.log(`failed on ${url}: ${err}`);
      fsp.unlink(dest, () => {});
      reject(`error occurred: ${err}`)
    });
  })
}

function purifyName(filename) {
  return filename.replaceAll(':', '').replaceAll('/', '').replaceAll('\\', '').replaceAll('>', '').replaceAll('<', '')
      .replaceAll('*:', '').replaceAll('|', '').replaceAll('?', '').replaceAll('"', '')
}

module.exports = {
  download, fetch, delay, LOG, fileExists, purifyName
}