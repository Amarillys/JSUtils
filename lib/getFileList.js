/* eslint-env node */
/* 180817 add file support and single run support
 * the script out of exports also will run.
 */
const fs = require('fs');
const path = require('path');

const getFileList = function (fpath, withBase, filter) {
    let filelist = [];
    let toQuery = [fpath];
    if (!fs.statSync(fpath).isDirectory())
        return toQuery;
    while (toQuery.length > 0) {
        let files = fs.readdirSync(toQuery[0]).map(file => path.join(toQuery[0], file));
        files.forEach(file => {
            if (fs.statSync(file).isDirectory())
                toQuery.push(file);
            else {
                file = file.replace(/\\/g, '/')
                if (!withBase) {
                    file = file.slice(fpath.length + 1)
                }
                if (filter && filter.length > 0) {
                    let extension = file.slice(file.lastIndexOf('.') + 1)
                    if (!file.includes('.')) {
                        extension = ''
                    }
                    if (filter.includes(extension)) {
                        filelist.push(file)
                    }
                } else {
                    filelist.push(file)
                }
            }
        });
        toQuery.splice(0, 1);
    }
    return filelist;
};

module.exports = getFileList;
if (path.parse(process.argv[1]).base === 'getFileList.js' && process.argv[2])
    console.log(getFileList(process.argv[2], false, process.argv.slice(3)));