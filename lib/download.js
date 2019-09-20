/* eslint-env node */
const fs = require('fs');
const https = require('https');
const http = require('http');

function download(url, dest) {
    return new Promise((resolve, reject) => {
        let path = dest.slice(0, dest.lastIndexOf('/'))
        !fs.existsSync(path) && fs.mkdirSync(path, { recursive: true })
        if (fs.existsSync(dest)) {
            resolve(`Has downloaded： ${url}`);
            return;
        }
        let downloadType = url.startsWith('https:') ? https : http;
        let fileStream = fs.createWriteStream(dest);
        fileStream.on('error', err => {
            fileStream.close();
            console.log(`error occurred: ${err}, ${url} to ${dest}`);
            reject(url);
        });
        console.log(`downloading: ${url} to ${dest}`);
        setTimeout(() => reject(`Time out: ${url}`), 10000);
        downloadType.get(url, function(response) {
            response.pipe(fileStream);
            fileStream.on('finish', () => {
                if (response.statusCode === 404 || response.statusCode === 403) {
                    fileStream.close();
                    fs.unlink(dest, () => {} );
                    console.log(`failed: ${url}`);
                    reject(url);
                    return;
                }
                fileStream.close();
                resolve(() => {
                    console.log(`downloaded: ${url}`);
                });
            });
        }).on('error', function(err) {
            console.log(`failed on ${url}: ${err}`);
            fs.unlink(dest, () => {} );
            reject(url);
        });
    })
}

module.exports = download;
