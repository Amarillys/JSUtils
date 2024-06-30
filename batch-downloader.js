import { promises, existsSync, mkdirSync, createWriteStream, unlink } from "fs";
import ThreadPool from "./threadpool-es.js";
import https from 'https';

const poolImage = new ThreadPool(4);

const targetUrlTextFile = process.argv[2];
const outputPath = process.argv[3] || "output";

async function main() {
    !existsSync(outputPath) && mkdirSync(path, {
        recursive: true
    })
    const text = await promises.readFile(targetUrlTextFile, { encoding: 'utf-8' })
    const lines = text.split('\r\n');
    const prefix = lines[0];
    const suffix = lines[1];
    const targeUrls = lines.slice(2);
    targeUrls.forEach(item => {
        poolImage.add(() => {
            let url = `${prefix}${item}${suffix}`;
            console.log(`running: ${url}`);
            return download(url, `${outputPath}/${item}`)
        });
    });

    poolImage.step = () => console.log(`Running: ${ poolImage.running }, downloaded: ${ poolImage.counter } / ${ poolImage.sum }, ${ poolImage.status() }`)
    poolImage.finish(() => {
        console.log('okayed');
        // promises.writeFile('error.log', errorLog, () => {});
    });
    poolImage.run();
}

main()


function download(url, dest, reserveEmpty) {
    return new Promise((resolve, reject) => {
      let path = dest.slice(0, dest.lastIndexOf('/'))
      /*!fs.existsSync(path) && mkdirSync(path, {
        recursive: true
      })*/
      if (existsSync(dest)) {
        resolve('existed')
        return
      }
      let downloadType = url.startsWith('https:') ? https : http;
      let fileStream = createWriteStream(dest);
      fileStream.on('error', err => {
        fileStream.close();
        console.log(`error occurred: ${err}, ${url} to ${dest}`);
        reject(`failed to write file on ${dest}, url: ${url}`)
        return
      });
      console.log(`downloading: ${url} to ${dest}`);
      let rejectTimer = setTimeout(() => {
        unlink(dest, () => {});
        reject(`Time out: ${url}`)
      }, 10000);
      downloadType.get(url, function (response) {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          if (response.statusCode === 404 || response.statusCode === 403) {
            fileStream.close();
            unlink(dest, () => {});
            console.log(`failed: ${url}`);
            reject(`failed: ${response.statusCode}, url: ${url}`)
            return;
          }
          fileStream.close();
          if (fileStream.bytesWritten === 0 && !reserveEmpty) {
            unlink(dest, () => {})
            console.log(`got empty file at ${dest}, deleted`)
          } else {
            console.log(`downloaded: ${url}`);
          }
          clearTimeout(rejectTimer)
          resolve(`succeed: ${url}`);
        });
      }).on('error', function (err) {
        console.log(`failed on ${url}: ${err}`);
        unlink(dest, () => {});
        reject(`error occurred: ${err}`)
      });
    })
}
