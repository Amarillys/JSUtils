// @ts-check
/* author gwc0721*/
/* eslint-env node */

const fs = require('fs');
const { promisify } = require('util');

const args = Array.from(process.argv);
if (args.length > 0 && /node\.exe$/.test(args[0])) {
    args.shift();
}

if (args.length > 0 && /convert\.js$/.test(args[0])) {
    args.shift();
}

if (args.length === 0) {
    process.stderr.write('node convert.js <file>');
    process.exit(-1);
}

const filepath = args[0];
let output = null;
if (args[1]) {
    output = args[1];
}

(async function() {
    const data = await promisify(fs.readFile)(filepath);

    for (let i = 0; i < data.length; ++i) {
        data[i] ^= 73;
    }

    if (output) {
        await promisify(fs.writeFile)(output, data);
    } else {
        process.stdout.write(output);
    }
})();
