/* eslint-env node */
/** Maikz AdvHd wscript extractor */
/** 08151000 change output folder
 *  fix the begin position with blank 15.
 *  add begin position for options
 *  fix the write logic of option
 *  delete useless option index extraction
 */
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const getFileList = require('./getFileList');

/* 0x00 0x00 char 0x00 message signal */
const signalMessage = Buffer.from([0x00, 0x00, 0x63, 0x68, 0x61, 0x72, 0x00]);
const signalChar = Buffer.from([0x25, 0x4C, 0x46]);
const signalOptionIndex = Buffer.from([0x0F, 0x02]);
const signalStart = Buffer.from([0x15]);
const signalMsgStart = Buffer.from([0x00, 0x14]);
const signalOptionAEnd = Buffer.from([0x00, 0x00, 0x0b, 0x00, 0x06]);
const signalOptionBEnd = Buffer.from([0x00, 0x00, 0x0c, 0x00, 0x06]);

+function main() {
    if (process.argv.length < 4) {
        console.error('usage: node extract.js [options] [ws2folder] [originfolder]');
        console.error('usage: options: ext : extract texts from decrypted ws2 file.');
        console.error('usage: options: pak : repackage texts to decrypted ws2 file. Need origin ws2 folder.');
        console.error('usage: options: trn : transfrom texts from ahdprc texts. Need ahdprc texts folder.');
        return;
    }

    if (process.argv[2] === 'ext') {
        let filelist = getFileList(process.argv[3]);
        filelist.forEach(file => extract(file, process.argv[4]));
    }

    if (process.argv[2] === 'trn') {
        let filelist = getFileList(process.argv[3]);
        filelist.forEach(file => trans(file, process.argv[4]));
    }

    if (process.argv[2] === 'pak') {
        let filelist = getFileList(process.argv[3]);
        filelist.forEach(file => pack(file, process.argv[4]));
    }
    
    if (process.argv[2] === 'ror') {
        let filelist = getFileList(process.argv[3]);
        filelist.forEach(file => rorf(file, process.argv[4]));
    }
}();

function extract(file, encoding) {
    if (!fs.existsSync('json'))
        fs.mkdirSync('json');

    fs.readFile(file,  (err, buffer) => {
        if (err) throw err;
        /* Normal Message */
        encoding = encoding || 'shift-jis';
        let lastPos = 0;
        let pos = buffer.indexOf(signalMessage);
        let charPos = 0, charLen = 0;
        let outputArray = [];
        while (pos > -1) {
            charPos = buffer.indexOf(signalChar, lastPos);
            let message = {
                index: buffer.readInt16LE(pos - 2),
                type: 'message',
                char:  '',
                text:  iconv.decode(buffer.slice(pos + 7, buffer.indexOf('%', pos)), encoding),
                tran:  '',
                begp:  0
            };
            if (charPos > -1 && charPos < pos + 14)
                message.char = iconv.decode(buffer.slice(charPos + 3, (pos - 4 < 1 ? 1 : pos - 4)), encoding);
            charLen = message.char.length === 0 ? 5 : message.char.length * 2 + 8;
            if (buffer[pos - charLen] !== 0x15) {
                charLen = 0;
            }
            message.begp = buffer.slice(pos - charLen - 2, pos).indexOf(signalStart) + pos - charLen - 2;
            if (message.begp <= pos - 1 - charLen)
                message.tran = 'fuck';

            outputArray.push(message);
            lastPos = pos;
            pos = buffer.indexOf(signalMessage, pos + 8);
        }

        /* Option */
        lastPos = 0;
        let tempPos = 0;
        pos = buffer.indexOf(signalOptionAEnd);
        while (pos > -1) {
            tempPos = buffer.indexOf(signalOptionIndex, pos - 48);
            let optionsA = {
                index: buffer.readUInt16LE(tempPos + 2),
                type: 'optionA',
                char: buffer.readInt32LE(buffer.readInt32LE(pos + 5) + 1),
                tran: '',
                text: iconv.decode(buffer.slice(tempPos + 4, pos), encoding),
                begp: tempPos + 2
            };
            tempPos = buffer.indexOf(signalOptionBEnd, pos);
            let optionsB = {
                index: optionsA.index + 1,
                type: 'optionB',
                char: buffer.readInt32LE(buffer.readInt32LE(tempPos + 5) + 1),
                tran: '',
                text: iconv.decode(buffer.slice(pos + 11, tempPos), encoding),
                begp: pos + 9
            };
            outputArray.push(optionsA);
            outputArray.push(optionsB);
            lastPos = pos;
            pos = buffer.indexOf(signalOptionAEnd, pos + 8);
        }

        /* save the result */
        if (outputArray.length === 0) return;
        fs.writeFile(`json/${path.parse(file).name}.json`, Buffer.from(JSON.stringify(outputArray), 'utf-8'),
            () => console.log(`Save json/${path.parse(file).name}.json successfully.`));
    });
}

function trans(file, transFolder) {
    fs.readFile(file, 'utf-8', (err, data) => {
        if (err) throw err;
        let filename = path.parse(file).name;
        let tranText = fs.readFileSync(`${transFolder}/${filename}.txt`, 'utf-8');
        let textArray = tranText.split('\r\n');
        let dataArray = JSON.parse(data);
        let dataArrayText = dataArray.map( x => x.text );
        let pos = 0;

        for (let i = 2; i < textArray.length; i += 5) {
            pos = dataArrayText.indexOf(textArray[i]);
            if (pos > -1 && dataArray[pos].tran !== 'fuck')
                dataArray[pos].tran = textArray[i + 2];
        }
        dataArray.forEach( msg => msg.char = translate(msg.char) );
        fs.writeFile(file, Buffer.from(JSON.stringify(dataArray), 'utf-8'),
            () => console.log(`Save ${file} successfully.`));
    });
}

function pack(file, originFolder) {
    if (!fs.existsSync('newRio'))
        fs.mkdirSync('newRio');

    fs.readFile(file, 'utf-8', (err, data) => {
        let dataArray = JSON.parse(data);
        dataArray.sort(function(msga, msgb) {
            if (msga.index === msgb.index) return 0;
            return msga.index > msgb.index ? 1 : -1;
        });

        let oriPos = 0, newPos = 0;
        let optionPos = [], opos = 0;
        let oriWS = fs.readFileSync(`${originFolder}/${path.parse(file).name}.ws2`);
        let dstWS = Buffer.alloc(oriWS.length * 2);
        dstWS.writeBuf = writeBuf;

        for (let i = 0; i < dataArray.length; ++i) {
            if (dataArray[i].type === 'message') {
                /* write the last content to this beginning */
                newPos = dstWS.writeBuf(oriWS, newPos, oriPos, dataArray[i].begp);
                /* the position of selection to fix */
                if (optionPos.length > 0) {
                    opos = optionPos.map(x => x.index).indexOf(dataArray[i].index);
                    if (opos > -1) {
                        /* return to rewrite position, so dont move the pointer */
                        dstWS.writeInt32LE(newPos, optionPos[opos].pos - 4);
                        optionPos.splice(opos, 1);
                    }
                }
                /* have 15 singal */
                if (dataArray[i].tran !== 'fuck')
                    newPos = dstWS.writeBuf(signalStart, newPos);
                /* have character string */
                if (dataArray[i].char !== '') {
                    newPos = dstWS.writeBuf(signalChar, newPos);
                    newPos = dstWS.writeBuf(toFixGBK(dataArray[i].char), newPos);
                }
                newPos = dstWS.writeBuf(signalMsgStart, newPos);
                newPos = dstWS.writeInt16LE(dataArray[i].index, newPos);
                newPos = dstWS.writeBuf(signalMessage, newPos);
                newPos = dstWS.writeBuf(toFixGBK(dataArray[i].tran), newPos);
                oriPos = oriWS.indexOf('%', dataArray[i].begp + 5 + 2 * dataArray[i].char.length);
            } else {
                /* write options */
                if (dataArray[i].type === 'optionA') {
                    newPos = dstWS.writeBuf(oriWS, newPos, oriPos, dataArray[i].begp);
                    dstWS.writeInt32LE(newPos, newPos - 6);
                } else {
                    oriPos = dataArray[i].begp + dataArray[i].text.length * 2 + 2 + 5 + 4;
                }
                newPos = dstWS.writeInt16LE(dataArray[i].index, newPos);
                newPos = dstWS.writeBuf(toFixGBK(dataArray[i].tran), newPos);
                newPos = dstWS.writeBuf(dataArray[i].type === 'optionA' ? signalOptionAEnd : signalOptionBEnd, newPos);
                newPos = dstWS.writeInt32LE(2333333, newPos);
                optionPos.push({
                    pos: newPos,
                    index: dataArray[i].char
                });
            }
        }
        newPos = dstWS.writeBuf(oriWS, newPos, oriPos, oriWS.length);
        fs.writeFile(`newRio/${path.parse(file).name}.ws2`, dstWS.slice(0, newPos),
            () => console.log(`Save newRio/${path.parse(file).name}_n.ws2 successfully.`));
    });
}

function rorf(file, position) {
    fs.readFile(file, (err, buffer) => {
        position = parseInt(position);
        for (let m = 0; m < buffer.length; ++m)
            buffer[m] = ror(buffer[m], position);
        fs.writeFile(file, buffer, () => console.log(`Ror ${file} successfully.`));
    });
}

function ror(char, n) {
    return n > 0 ? (char << n & 255) | char >> (8 - n) : (char >> -n ) | char << (8 + n) & 255;
}

function translate(name) {
    let mapName = {
        'マリーカ': '玛莉卡',
        'エルヴィラ': '埃尔维拉',
        '花純': '花纯',
        '店長': '店长',
        'ユーリ': '尤里',
        'オリヴィア': '奥莉维亚'
    };
    return mapName[name] || name;
}

function toFixGBK(string) {
    let result = [];
    let tmp;
    if (string === 'fuck') return Buffer.from([]);
    for ( let i = 0; i < string.length; ++i) {
        tmp = iconv.encode(string[i], 'gbk');
        if (!tmp.equals(Buffer.from([0x3f])))
            result.push(tmp);
    }
    return Buffer.concat(result);
}

function writeBuf(bufToCopy, writeStart = 0, copyStart = 0, copyEnd = bufToCopy.length) {
    if (copyEnd - copyStart > this.length - writeStart)
        console.warn('The space of buffer to write is not enough.');
    return bufToCopy.copy(this, writeStart, copyStart, copyEnd) + writeStart;
}
