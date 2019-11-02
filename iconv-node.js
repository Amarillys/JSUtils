/* eslint-env node */
const fs = require('fs')
const getFileList = require('./getFileList')
const iconvLite = require('iconv-lite')

if (process.argv.length < 3) {
  console.log(`usage: node iconv-node.js [inputPath] [srcEnconding] [dstEncoding] [outputFolder] [defaultChar] [filterExtensions]...
    example: node iconv-node.js z:/originalText SHIFT_JIS UTF-8 . h cpp
            node iconv-node.js data/Script SHIFT_JIS GBK/· data/ScriptCN txt
    . means overwrite inputFile, only available at target encoding
      encoding@defaultChar
    you can add bom header in output with specified encoding: utf-8_bom
  `)
  return
}

let argvIndex = 2
const inputPath = process.argv[argvIndex++]
const srcEnconding = process.argv[argvIndex++]
let dstEncodingString = process.argv[argvIndex++].split('/')
let dstEncoding = dstEncodingString[0]
let defaultChar = dstEncodingString[1]
if (defaultChar) {
  iconvLite.defaultCharSingleByte = defaultChar
}
let outputPath = process.argv[argvIndex++]
const filterExtensions = process.argv.slice(argvIndex)
const filesToConv = getFileList(inputPath, false, filterExtensions)
let outputWithBom = false

if (!fs.existsSync(outputPath))
  fs.mkdirSync(outputPath);

if (outputPath === '.') {
  outputPath = inputPath
}

if (dstEncoding === 'utf-8_bom') {
  dstEncoding = 'utf-8'
  outputWithBom = true
}

filesToConv.forEach(file => {
  fs.readFile(`${inputPath}/${file}`, (err, data) => {
    if (err) console.log(err)
    let beforeText = iconvLite.decode(data, srcEnconding)
    let afterText = iconvLite.encode(beforeText, dstEncoding, { addBOM: outputWithBom })
    let outputFilePath = `${outputPath}/${file}`

    fs.mkdir(outputFilePath.slice(0, outputFilePath.lastIndexOf('/')), err => {
      if (err && err.code !== 'EEXIST') {
        console.log(err)
        return
      }
      fs.writeFile(outputFilePath, afterText, err => err ? console.log(err) : null)
    })
  })
})
