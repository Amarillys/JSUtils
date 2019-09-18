/* eslint-env node */

const urlPrefixTW = 'http://img.wcproject.so-net.tw/assets/469/a';
const ThreadPool = require('./lib/threadpool');
const download = require('./lib/download');
const outputDir = 'output';
let pool = new ThreadPool(20);

(async function main() {
    await require('fs').mkdir(outputDir, () => {});
    const filesToDL = require('./tasks.json');
    const addToPool = filename =>
        pool.add(
            () => download(`${urlPrefixTW}/${filename}_txt.unity3d`, `${outputDir}/${filename}.txt`),
            () => pool.add(
                () => download(`${urlPrefixTW}/${filename}_v2_txt.unity3d`, `${outputDir}/${filename}_v2.txt`)
            )
        );
    filesToDL.forEach(index =>
        [1, 2, 3, 4, 5, 6, 7, 8].forEach(episode =>
            addToPool(`Event_talk_town_${index}_${episode}`)
        )
    );
    pool.step = () => console.log(`Progress: ${pool.status()}, Running:${pool.running}`);
    pool.finish(() => console.log('finished'));
    pool.run();
})();
